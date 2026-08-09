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

/** TestRecognitionModal mounts whenever a recognizer is selected and needs RQ. */
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
      emptyTitle: 'No recognizer set up for this camera yet.',
      emptyCta: 'Add device',
      autoIdentifyLabel: 'Auto-identify',
      autoIdentifyHint: 'Automatically attribute visits to the recognized pet.',
      modelTitle: 'Model',
      modelSubtitle: 'Recognizer running on this camera',
      modelNoneTitle: 'No recognizer selected',
      modelChangeLabel: 'Change',
      modelSettingsLabel: 'Recognizer settings',
      pickerTitle: 'Choose a recognizer',
      pickerEmpty: 'No other recognizers available.',
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
    onAddDevice: () => {},
    sourceDeviceId: 1,
    selectedRecognizerId: undefined,
    selectedRecognizerName: undefined,
    selectedRecognizerModel: undefined,
    recognizerOptions: [],
    onSelectRecognizer: () => {},
    onOpenRecognizerSettings: () => {},
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
    selectedRecognizerId: 10,
    selectedRecognizerName: 'Living Room',
    selectedRecognizerModel: 'google/gemma-3-27b-it',
    recognizerOptions: [
      { id: 10, name: 'Living Room', model: 'google/gemma-3-27b-it' },
      { id: 20, name: 'Spare Room Recognizer', model: 'google/gemma-4-31b-it' },
    ],
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

  it('shows the empty state with an add-device CTA when there are no recognizers', async () => {
    await renderWithProviders(
      <RecognitionTabView {...baseProps({ gate: 'empty' })} />,
    );

    assert.ok(screen.getByText('No recognizer set up for this camera yet.'));
    assert.ok(screen.getByRole('button', { name: 'Add device' }));
  });

  it('calls onAddDevice from the empty-state CTA', async () => {
    const user = userEvent.setup();
    let clicked = false;

    await renderWithProviders(
      <RecognitionTabView
        {...baseProps({
          gate: 'empty',
          onAddDevice: () => {
            clicked = true;
          },
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add device' }));
    assert.equal(clicked, true);
  });

  it('does not show the locked or empty state once a recognizer is configured', async () => {
    await renderWithProviders(
      withQueryClient(
        <RecognitionTabView
          {...readyProps({ selectedRecognizerName: 'Kitchen Recognizer' })}
        />,
      ),
    );

    assert.equal(screen.queryByText('Recognition needs a camera'), null);
    assert.equal(
      screen.queryByText('No recognizer set up for this camera yet.'),
      null,
    );
    assert.ok(screen.getByText('Kitchen Recognizer'));
  });

  it('shows Change when multiple recognizers exist, even if only one is linked', async () => {
    await renderWithProviders(
      withQueryClient(<RecognitionTabView {...readyProps()} />),
    );

    assert.ok(screen.getByRole('button', { name: 'Change' }));
    assert.ok(screen.getByRole('button', { name: 'Recognizer settings' }));
  });

  it('hides Change when only one recognizer exists, but still offers settings', async () => {
    await renderWithProviders(
      withQueryClient(
        <RecognitionTabView
          {...readyProps({
            recognizerOptions: [
              { id: 10, name: 'Living Room', model: 'google/gemma-3-27b-it' },
            ],
          })}
        />,
      ),
    );

    assert.equal(screen.queryByRole('button', { name: 'Change' }), null);
    assert.ok(screen.getByRole('button', { name: 'Recognizer settings' }));
  });

  it('opens the recognizer picker from Change', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      withQueryClient(<RecognitionTabView {...readyProps()} />),
    );

    await user.click(screen.getByRole('button', { name: 'Change' }));
    assert.ok(screen.getByText('Choose a recognizer'));
    assert.ok(screen.getByText('Spare Room Recognizer'));
  });

  it('forwards the picked recognizer id and closes the picker', async () => {
    const user = userEvent.setup();
    let selectedId: number | undefined;

    await renderWithProviders(
      withQueryClient(
        <RecognitionTabView
          {...readyProps({
            onSelectRecognizer: (id) => {
              selectedId = id;
            },
          })}
        />,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Change' }));
    await user.click(
      screen.getByRole('button', { name: /Spare Room Recognizer/ }),
    );

    assert.equal(selectedId, 20);
    await waitFor(() =>
      assert.equal(screen.queryByText('Choose a recognizer'), null),
    );
  });

  it('calls onOpenRecognizerSettings for the linked recognizer', async () => {
    const user = userEvent.setup();
    let openedId: number | undefined;

    await renderWithProviders(
      withQueryClient(
        <RecognitionTabView
          {...readyProps({
            onOpenRecognizerSettings: (id) => {
              openedId = id;
            },
          })}
        />,
      ),
    );

    await user.click(
      screen.getByRole('button', { name: 'Recognizer settings' }),
    );
    assert.equal(openedId, 10);
  });

  it('renders the ready-but-unlinked state with a none-selected row and only the picker path', async () => {
    await renderWithProviders(
      <RecognitionTabView
        {...baseProps({
          gate: 'ready',
          recognizerOptions: [
            {
              id: 20,
              name: 'Spare Room Recognizer',
              model: 'google/gemma-4-31b-it',
            },
          ],
        })}
      />,
    );

    assert.ok(screen.getByText('No recognizer selected'));
    assert.ok(screen.getByRole('button', { name: 'Change' }));
    assert.equal(
      screen.queryByRole('button', { name: 'Recognizer settings' }),
      null,
    );
    assert.equal(
      screen.queryByRole('checkbox', { name: 'Auto-identify' }),
      null,
    );
    assert.equal(screen.queryByText('Known cats'), null);
    assert.equal(screen.queryByRole('button', { name: 'Save' }), null);
    assert.equal(
      screen.queryByRole('button', { name: 'Test Recognition' }),
      null,
    );
  });

  it('lets the unlinked state assign a recognizer through the picker', async () => {
    const user = userEvent.setup();
    let selectedId: number | undefined;

    await renderWithProviders(
      <RecognitionTabView
        {...baseProps({
          gate: 'ready',
          recognizerOptions: [
            {
              id: 20,
              name: 'Spare Room Recognizer',
              model: 'google/gemma-4-31b-it',
            },
          ],
          onSelectRecognizer: (id) => {
            selectedId = id;
          },
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change' }));
    await user.click(
      screen.getByRole('button', { name: /Spare Room Recognizer/ }),
    );
    assert.equal(selectedId, 20);
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
