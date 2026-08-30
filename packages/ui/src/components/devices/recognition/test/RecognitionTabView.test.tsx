import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type { ReactElement } from 'react';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  RecognitionTabView,
  type RecognitionTabViewProps,
} from '../RecognitionTabView.tsx';
import type { TrainedPetRow } from '../TrainedPetsEditor.tsx';
import { renderWithProviders } from '@/test/render.tsx';

const queryClients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  for (const client of queryClients.splice(0)) {
    client.clear();
  }
});

function makeQueryClient() {
  /* gcTime stays non-zero so seeded, observer-less cache entries survive
     until the dialog that reads them mounts; afterEach clears each client. */
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  queryClients.push(client);
  return client;
}

/** TestRecognitionModal mounts whenever recognition is saved and needs RQ. */
function withQueryClient(ui: ReactElement, client = makeQueryClient()) {
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

function baseProps(
  overrides: Partial<RecognitionTabViewProps> = {},
): RecognitionTabViewProps {
  return {
    copy: {
      lockedTitle: 'Recognition needs a camera',
      lockedCta: 'Set up camera',
      providerHint: 'No AI provider yet.',
      providerCta: 'Connect a provider',
      noAccountTitle: 'No AI provider connected yet.',
      noAccountCta: 'Connect a provider',
      autoIdentifyLabel: 'Auto-identify',
      autoIdentifyHint: 'Automatically attribute visits to the recognized pet.',
      accountTitle: 'Provider account',
      accountSubtitle: 'Which account pays for recognition here',
      accountNoneSelected: 'No account selected',
      accountChangeLabel: 'Change',
      accountPickerTitle: 'Choose an account',
      accountPickerEmpty: 'No accounts available.',
      accountNoneLabel: 'None',
      modelLabel: 'Model',
      modelPlaceholder: 'e.g. google/gemma-4-31b-it',
      modelHint:
        "Leave empty to use the app's default (google/gemma-4-31b-it).",
      promptLabel: 'Scene prompt',
      promptHint: 'Scene context sent with every frame.',
      promptPlaceholder:
        'Example: This camera watches a pet water fountain in a hallway.',
      trainedPetsTitle: 'Known cats',
      trainedPetsSubtitle:
        'Reference images. Exclude pets that never use this device.',
      trainedPetsEmpty: 'No cats yet.',
      testRecognitionLabel: 'Test Recognition',
      cancelLabel: 'Cancel',
      saveLabel: 'Save',
      saveError: 'Could not save recognition settings.',
    },
    gate: 'needs_camera',
    onGoToCamera: () => {},
    showProviderHint: false,
    onGoToProvider: () => {},
    deviceId: 1,
    accountOptions: [],
    selectedAccountId: null,
    selectedAccountName: undefined,
    onSelectAccount: () => {},
    hasSavedRecognition: false,
    model: '',
    onModelChange: () => {},
    promptTemplate: '',
    onPromptTemplateChange: () => {},
    autoIdentify: false,
    onToggleAutoIdentify: () => {},
    pets: [],
    onToggleWatched: () => {},
    onConfirmAddImages: () => {},
    onRemoveImage: () => {},
    onSubmit: () => {},
    onCancel: () => {},
    isDirty: false,
    isSaving: false,
    saveFailed: false,
    discardConfirm: { open: false, onConfirm: () => {}, onCancel: () => {} },
    ...overrides,
  };
}

function readyProps(
  overrides: Partial<RecognitionTabViewProps> = {},
): RecognitionTabViewProps {
  return baseProps({
    gate: 'ready',
    selectedAccountId: 10,
    selectedAccountName: 'OpenRouter',
    hasSavedRecognition: true,
    accountOptions: [
      { id: 10, name: 'OpenRouter', description: 'Inference' },
      { id: 20, name: 'Spare key', description: 'Inference' },
    ],
    promptTemplate: 'the hallway fountain',
    ...overrides,
  });
}

function petRow(overrides: Partial<TrainedPetRow> = {}): TrainedPetRow {
  return {
    id: 1,
    name: 'Miso',
    isWatched: true,
    watchAriaLabel: 'Look for Miso on this camera',
    statusLabel: '2 reference images',
    thumbs: [
      { id: 10, url: 'api/media/a.jpg', alt: 'Reference for Miso' },
      { id: 11, url: 'api/media/b.jpg', alt: 'Reference for Miso' },
    ],
    referenceImageIds: [10, 11],
    expandLabel: 'Reference images for Miso',
    addImagesLabel: 'Add from events',
    removeImageLabel: 'Remove image',
    ...overrides,
  };
}

describe('RecognitionTabView', () => {
  it('shows the locked state with a Set up camera CTA when there is no camera link', async () => {
    await renderWithProviders(
      <RecognitionTabView {...baseProps({ gate: 'needs_camera' })} />,
    );

    assert.ok(screen.getByText('Recognition needs a camera'));
    assert.ok(screen.getByRole('button', { name: 'Set up camera' }));
  });

  it('calls onGoToCamera when the locked-state CTA is clicked', async () => {
    const user = userEvent.setup();
    let clicked = false;

    await renderWithProviders(
      <RecognitionTabView
        {...baseProps({
          gate: 'needs_camera',
          onGoToCamera: () => {
            clicked = true;
          },
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Set up camera' }));
    assert.equal(clicked, true);
  });

  it('shows the provider hint only when showProviderHint is true', async () => {
    const { rerender } = await renderWithProviders(
      <RecognitionTabView
        {...baseProps({ gate: 'needs_camera', showProviderHint: false })}
      />,
    );
    assert.equal(screen.queryByText('No AI provider yet.'), null);

    rerender(
      <RecognitionTabView
        {...baseProps({ gate: 'needs_camera', showProviderHint: true })}
      />,
    );
    assert.ok(screen.getByText('No AI provider yet.'));
  });

  it('calls onGoToProvider from the provider-hint CTA', async () => {
    const user = userEvent.setup();
    let clicked = false;

    await renderWithProviders(
      <RecognitionTabView
        {...baseProps({
          gate: 'needs_camera',
          showProviderHint: true,
          onGoToProvider: () => {
            clicked = true;
          },
        })}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Connect a provider' }),
    );
    assert.equal(clicked, true);
  });

  it('shows the no-account state with a connect CTA when nothing can pay for a call', async () => {
    await renderWithProviders(
      <RecognitionTabView {...baseProps({ gate: 'no_account' })} />,
    );

    assert.ok(screen.getByText('No AI provider connected yet.'));
    assert.ok(screen.getByRole('button', { name: 'Connect a provider' }));
  });

  it('calls onGoToProvider from the no-account CTA', async () => {
    const user = userEvent.setup();
    let clicked = false;

    await renderWithProviders(
      <RecognitionTabView
        {...baseProps({
          gate: 'no_account',
          onGoToProvider: () => {
            clicked = true;
          },
        })}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Connect a provider' }),
    );
    assert.equal(clicked, true);
  });

  it('does not show the locked or no-account state once an account is picked', async () => {
    await renderWithProviders(
      withQueryClient(
        <RecognitionTabView
          {...readyProps({ selectedAccountName: 'Kitchen key' })}
        />,
      ),
    );

    assert.equal(screen.queryByText('Recognition needs a camera'), null);
    assert.equal(screen.queryByText('No AI provider connected yet.'), null);
    assert.ok(screen.getByText('Kitchen key'));
  });

  it('opens the account picker from Change', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      withQueryClient(<RecognitionTabView {...readyProps()} />),
    );

    await user.click(screen.getByRole('button', { name: 'Change' }));
    assert.ok(screen.getByText('Choose an account'));
    assert.ok(screen.getByText('Spare key'));
  });

  it('forwards the picked account id and closes the picker', async () => {
    const user = userEvent.setup();
    let selectedId: number | null | undefined;

    await renderWithProviders(
      withQueryClient(
        <RecognitionTabView
          {...readyProps({
            onSelectAccount: (id) => {
              selectedId = id;
            },
          })}
        />,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Change' }));
    await user.click(screen.getByRole('radio', { name: /Spare key/ }));

    assert.equal(selectedId, 20);
    await waitFor(() =>
      assert.equal(screen.queryByText('Choose an account'), null),
    );
  });

  it('offers no settings pencil — the account is edited under Providers', async () => {
    await renderWithProviders(
      withQueryClient(<RecognitionTabView {...readyProps()} />),
    );

    assert.equal(screen.queryByRole('button', { name: /settings/i }), null);
  });

  it('edits the model and the scene prompt', async () => {
    const user = userEvent.setup();
    const models: string[] = [];
    const prompts: string[] = [];

    await renderWithProviders(
      withQueryClient(
        <RecognitionTabView
          {...readyProps({
            model: '',
            promptTemplate: '',
            onModelChange: (value) => models.push(value),
            onPromptTemplateChange: (value) => prompts.push(value),
          })}
        />,
      ),
    );

    // Empty is not blank: the field names the default it will fall back to.
    const modelInput = screen.getByLabelText('Model');
    assert.equal(
      modelInput.getAttribute('placeholder'),
      'e.g. google/gemma-4-31b-it',
    );

    await user.type(modelInput, 'x');
    assert.deepEqual(models, ['x']);

    await user.type(screen.getByLabelText('Scene prompt'), 'y');
    assert.deepEqual(prompts, ['y']);
  });

  it('renders the ready-but-unlinked state with a none-selected row and only the picker path', async () => {
    await renderWithProviders(
      <RecognitionTabView
        {...baseProps({
          gate: 'ready',
          accountOptions: [{ id: 20, name: 'Spare key' }],
        })}
      />,
    );

    assert.ok(screen.getByText('No account selected'));
    assert.ok(screen.getByRole('button', { name: 'Change' }));
    assert.equal(
      screen.queryByRole('checkbox', { name: 'Auto-identify' }),
      null,
    );
    assert.equal(screen.queryByLabelText('Model'), null);
    assert.equal(screen.queryByText('Known cats'), null);
    assert.equal(
      screen.queryByRole('button', { name: 'Test Recognition' }),
      null,
    );
  });

  it('lets the unlinked state pick an account through the picker', async () => {
    const user = userEvent.setup();
    let selectedId: number | null | undefined;

    await renderWithProviders(
      <RecognitionTabView
        {...baseProps({
          gate: 'ready',
          accountOptions: [{ id: 20, name: 'Spare key' }],
          onSelectAccount: (id) => {
            selectedId = id;
          },
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change' }));
    await user.click(screen.getByRole('radio', { name: /Spare key/ }));
    assert.equal(selectedId, 20);
  });

  it('offers Test Recognition only once the attachment is saved', async () => {
    const client = makeQueryClient();
    const { rerender } = await renderWithProviders(
      withQueryClient(
        <RecognitionTabView {...readyProps({ hasSavedRecognition: false })} />,
        client,
      ),
    );
    // A drafted account has nothing on the server to run the test against.
    assert.equal(
      screen.queryByRole('button', { name: 'Test Recognition' }),
      null,
    );

    rerender(
      withQueryClient(
        <RecognitionTabView {...readyProps({ hasSavedRecognition: true })} />,
        client,
      ),
    );
    assert.ok(screen.getByRole('button', { name: 'Test Recognition' }));
  });

  it('forwards the auto-identify toggle', async () => {
    const user = userEvent.setup();
    let toggled: boolean | undefined;

    await renderWithProviders(
      withQueryClient(
        <RecognitionTabView
          {...readyProps({
            autoIdentify: false,
            onToggleAutoIdentify: (checked) => {
              toggled = checked;
            },
          })}
        />,
      ),
    );

    await user.click(screen.getByRole('checkbox', { name: 'Auto-identify' }));
    assert.equal(toggled, true);
  });

  it('renders a row per pet with its status', async () => {
    await renderWithProviders(
      withQueryClient(
        <RecognitionTabView
          {...readyProps({
            pets: [
              petRow(),
              petRow({
                id: 2,
                name: 'Bagheera',
                isWatched: false,
                watchAriaLabel: 'Look for Bagheera on this camera',
                statusLabel: 'Not on this camera',
                thumbs: [],
                referenceImageIds: [],
                expandLabel: 'Reference images for Bagheera',
              }),
            ],
          })}
        />,
      ),
    );

    assert.ok(screen.getByText('Miso'));
    assert.ok(screen.getByText('2 reference images'));
    assert.ok(screen.getByText('Bagheera'));
    assert.ok(screen.getByText('Not on this camera'));
  });

  it('shows an empty message when there are no pets', async () => {
    await renderWithProviders(
      withQueryClient(<RecognitionTabView {...readyProps({ pets: [] })} />),
    );

    assert.ok(screen.getByText('No cats yet.'));
  });

  it('forwards the watch toggle for a pet', async () => {
    const user = userEvent.setup();
    let toggle: { petId: number; watched: boolean } | undefined;

    await renderWithProviders(
      withQueryClient(
        <RecognitionTabView
          {...readyProps({
            pets: [petRow()],
            onToggleWatched: (petId, watched) => {
              toggle = { petId, watched };
            },
          })}
        />,
      ),
    );

    await user.click(
      screen.getByRole('checkbox', { name: 'Look for Miso on this camera' }),
    );
    assert.deepEqual(toggle, { petId: 1, watched: false });
  });

  it('expands and collapses a pet row, wiring aria-controls to the detail region', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      withQueryClient(
        <RecognitionTabView {...readyProps({ pets: [petRow()] })} />,
      ),
    );

    const expander = screen.getByRole('button', {
      name: 'Reference images for Miso',
    });
    assert.equal(expander.getAttribute('aria-expanded'), 'false');
    assert.equal(screen.queryAllByAltText('Reference for Miso').length, 0);

    await user.click(expander);
    assert.equal(expander.getAttribute('aria-expanded'), 'true');
    assert.equal(screen.getAllByAltText('Reference for Miso').length, 2);

    const controlsId = expander.getAttribute('aria-controls');
    assert.ok(controlsId);
    assert.ok(document.getElementById(controlsId));

    await user.click(expander);
    assert.equal(expander.getAttribute('aria-expanded'), 'false');
    assert.equal(screen.queryAllByAltText('Reference for Miso').length, 0);
  });

  it('forwards a thumbnail removal', async () => {
    const user = userEvent.setup();
    let removed: { petId: number; mediaId: number } | undefined;

    await renderWithProviders(
      withQueryClient(
        <RecognitionTabView
          {...readyProps({
            pets: [petRow()],
            onRemoveImage: (petId, mediaId) => {
              removed = { petId, mediaId };
            },
          })}
        />,
      ),
    );

    await user.click(
      screen.getByRole('button', { name: 'Reference images for Miso' }),
    );
    const removeButtons = screen.getAllByRole('button', {
      name: 'Remove image',
    });
    await user.click(removeButtons[0]!);
    assert.deepEqual(removed, { petId: 1, mediaId: 10 });
  });

  it('adds images through the picker, hiding already-referenced media, and closes it', async () => {
    const user = userEvent.setup();
    let confirmed: { petId: number; mediaIds: number[] } | undefined;

    const client = makeQueryClient();
    client.setQueryData(['pet', 1], { id: 1, name: 'Miso' });
    client.setQueryData(
      ['verifiedEventMedia', 1, 1],
      [
        { id: 10, file_path: 'events/10.jpg', mime_type: 'image/jpeg' },
        { id: 30, file_path: 'events/30.jpg', mime_type: 'image/jpeg' },
      ],
    );

    await renderWithProviders(
      withQueryClient(
        <RecognitionTabView
          {...readyProps({
            pets: [petRow()],
            onConfirmAddImages: (petId, mediaIds) => {
              confirmed = { petId, mediaIds };
            },
          })}
        />,
        client,
      ),
    );

    await user.click(
      screen.getByRole('button', { name: 'Reference images for Miso' }),
    );
    await user.click(screen.getByRole('button', { name: 'Add from events' }));

    // Media id 10 is already referenced by the pet, so only id 30 is offered.
    const candidates = await screen.findAllByAltText('Event snapshot');
    assert.equal(candidates.length, 1);

    await user.click(candidates[0]!);
    await user.click(screen.getByRole('button', { name: 'Add 1 image' }));

    assert.deepEqual(confirmed, { petId: 1, mediaIds: [30] });
    await waitFor(() =>
      assert.equal(
        screen.queryByText('Select Reference Images for Miso'),
        null,
      ),
    );
  });

  it('disables Save unless the draft is dirty and no save is in flight', async () => {
    const client = makeQueryClient();
    const { rerender } = await renderWithProviders(
      withQueryClient(
        <RecognitionTabView {...readyProps({ isDirty: false })} />,
        client,
      ),
    );
    assert.ok(
      screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled'),
    );

    rerender(
      withQueryClient(
        <RecognitionTabView {...readyProps({ isDirty: true })} />,
        client,
      ),
    );
    assert.equal(
      screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled'),
      false,
    );

    rerender(
      withQueryClient(
        <RecognitionTabView
          {...readyProps({ isDirty: true, isSaving: true })}
        />,
        client,
      ),
    );
    assert.ok(
      screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled'),
    );
  });

  it('renders the save error when saveFailed is set', async () => {
    await renderWithProviders(
      withQueryClient(
        <RecognitionTabView {...readyProps({ saveFailed: true })} />,
      ),
    );

    assert.ok(screen.getByText('Could not save recognition settings.'));
  });
});
