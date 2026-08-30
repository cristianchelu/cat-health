import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { Plus, Smartphone } from 'lucide-react';
import type { ProviderPetLink } from 'shared';
import {
  useProviders,
  useProviderAccount,
  useUpdateProviderAccount,
  useDevices,
} from '@/hooks/queries/deviceQueries';
import { backState } from '@/lib/navigationBack';
import { isRecord } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/PageState';
import {
  FormCard,
  FormCardBody,
  FormCardHead,
  FormInput,
  FormShell,
  FormSwitch,
} from '@/components/ui/form';
import { LoadingState } from '@/components/ui/PageState';
import { AppHeader, AppHeaderBar } from '@/components/ui/AppHeader';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { useAppForm, useDraftForm, useUnsavedBlocker } from '@/hooks/form';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import {
  CardList,
  CardListContent,
  CardListItem,
} from '@/components/ui/CardList';
import ProviderPetLinksEditor from '../components/ProviderPetLinksEditor';
import {
  getProviderBrand,
  providerBrandLabel,
} from '../provider-wizard/flows/providerBrandRegistry.ts';
import {
  getAccountConfigModule,
  hasAccountConfigModule,
} from '../provider-wizard/flows/accountConfigRegistry.ts';
import type { ProviderAccountFormValues } from '../provider-wizard/flows/accountConfigTypes.ts';
import { ProviderBrandTile } from './components/ProviderBrandTile';
import { Callout } from '@/components/ui/Callout';
import './ProviderAccountPage.css';

const EMPTY_PET_LINKS: ProviderPetLink[] = [];

function isProviderPetLink(value: unknown): value is ProviderPetLink {
  return (
    isRecord(value) &&
    typeof value.external_pet_id === 'string' &&
    typeof value.pet_id === 'number'
  );
}

const ProviderAccountPage: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const parsedId = Number.parseInt(id ?? '', 10);
  const accountId = Number.isInteger(parsedId) && parsedId > 0 ? parsedId : 0;
  const back = useBackNavigation({
    to: '/settings/providers',
    label: t('settings.providers'),
  });

  const { data: providers = [], isLoading: providersLoading } = useProviders();
  const { data: devices = [] } = useDevices();
  const {
    data: account,
    isLoading: accountLoading,
    error: loadError,
  } = useProviderAccount(accountId, accountId > 0);
  const updateAccount = useUpdateProviderAccount(accountId);

  /*
   * Both queries gate the render. `supports_pet_linking` comes from `providers`,
   * and saving replaces `config` wholesale — so rendering the form before that
   * query lands would let a save drop every pet link on the account.
   */
  const isLoading = accountLoading || providersLoading;

  const [serverError, setServerError] = React.useState<string | undefined>();

  const provider = account?.provider ?? '';
  const brand = getProviderBrand(provider);
  const configModule = getAccountConfigModule(provider);
  const supportsPetLinking =
    providers.find((p) => p.name === provider)?.capabilities
      .supports_pet_linking ?? false;

  /*
   * RHF treats `values` as reset-triggering, so this must be referentially
   * stable across renders — otherwise every render resets the form and the
   * user's in-progress edits vanish.
   */
  const formValues = React.useMemo<ProviderAccountFormValues | undefined>(
    () =>
      account
        ? {
            name: account.name,
            enabled: account.enabled,
            config: configModule.toFormValues(account.config),
          }
        : undefined,
    [account, configModule],
  );

  const {
    control,
    handleSubmit,
    formState: { isDirty },
  } = useAppForm<ProviderAccountFormValues>({
    defaultValues: { name: '', enabled: true, config: {} },
    values: formValues,
  });

  const accountConfig = account?.config;
  const storedPetLinks = React.useMemo(() => {
    if (!supportsPetLinking || !isRecord(accountConfig)) return EMPTY_PET_LINKS;
    const stored = accountConfig.pet_links;
    return Array.isArray(stored)
      ? stored.filter(isProviderPetLink)
      : EMPTY_PET_LINKS;
  }, [accountConfig, supportsPetLinking]);

  /*
   * The editor auto-matches cloud pets onto local profiles and renders those
   * matches pre-selected, so the screen shows more than `storedPetLinks`. Track
   * what it resolved and treat that as the baseline, so a save persists what the
   * user was actually looking at and dirtiness isn't tripped on mount.
   */
  const [resolvedPetLinks, setResolvedPetLinks] = React.useState<
    ProviderPetLink[] | null
  >(null);
  const petLinksBaseline = resolvedPetLinks ?? storedPetLinks;

  const petLinksBaselineKey = React.useMemo(
    () => JSON.stringify(petLinksBaseline),
    [petLinksBaseline],
  );

  const {
    draft: petLinks,
    setDraft: setPetLinks,
    isDirty: petLinksDirty,
  } = useDraftForm(petLinksBaseline, { baselineKey: petLinksBaselineKey });

  const dirty = isDirty || (supportsPetLinking && petLinksDirty);
  const { blockerOpen, onConfirmLeave, onCancelLeave, markSaved } =
    useUnsavedBlocker(dirty);

  const accountDevices = devices.filter(
    (device) => device.provider_account_id === accountId,
  );

  const onSubmit = async (values: ProviderAccountFormValues) => {
    setServerError(undefined);

    const hasConfigModule = hasAccountConfigModule(provider);
    /*
     * A provider on the generic fallback owns no editable config, so its stored
     * config is carried through rather than flattened to an empty object — it
     * may still hold pet links, and PATCH replaces config wholesale.
     */
    const config = hasConfigModule
      ? configModule.toConfig(values.config)
      : { ...(isRecord(account?.config) ? account.config : {}) };
    if (supportsPetLinking) {
      config.pet_links = petLinks;
    }

    try {
      await updateAccount.mutateAsync({
        name: values.name,
        enabled: values.enabled,
        // Omit entirely only when there is nothing of ours to write, so we never
        // overwrite a provider's config with an empty object.
        ...(hasConfigModule || supportsPetLinking ? { config } : {}),
      });
      markSaved();
      back.go();
    } catch (err) {
      console.error(err);
      setServerError(t('settings.update_provider_error'));
    }
  };

  /*
   * The account's name is the page title once it loads; until then the page can
   * only say which page it is, so the mobile bar has something to show either
   * way.
   */
  const header = (title: React.ReactNode) => (
    <AppHeader>
      <AppHeaderBar
        back={{ to: back.to, label: back.label, onNavigate: back.go }}
        title={title}
      />
    </AppHeader>
  );

  if (isLoading) {
    return (
      <div className="page-shell-narrow page-provider-account">
        {header(t('settings.edit_provider_title'))}
        <LoadingState message={t('settings.loading_provider_data')} />
      </div>
    );
  }

  if (loadError || !account) {
    return (
      <div className="page-shell-narrow page-provider-account">
        {header(t('settings.edit_provider_title'))}
        <EmptyState tone="error">
          <p>{t('settings.error_loading_provider')}</p>
          <Button onClick={back.go}>{t('settings.back')}</Button>
        </EmptyState>
      </div>
    );
  }

  const identity = brand.accountIdentity?.(account.config);
  const Fields = configModule.Fields;

  return (
    <div className="page-shell-narrow page-provider-account">
      {header(account.name)}

      <FormShell
        onSubmit={handleSubmit(onSubmit)}
        error={serverError}
        actions={{
          onCancel: back.go,
          cancelLabel: t('settings.cancel'),
          submitLabel: updateAccount.isPending
            ? t('settings.saving')
            : t('settings.save_changes'),
          isSubmitting: updateAccount.isPending,
          submitDisabled: !dirty,
        }}
      >
        <FormCard>
          <FormCardHead
            tile={<ProviderBrandTile provider={provider} size="lg" />}
            title={providerBrandLabel(brand, t)}
            titleAs="h2"
            subtitle={identity}
          />

          <FormCardBody>
            <FormInput
              name="name"
              control={control}
              label={t('settings.account_name_label')}
              placeholder={t('settings.account_name_placeholder')}
              rules={{ required: true }}
            />

            <Fields control={control} mode="edit" />

            {configModule.note && (
              <Callout tone={configModule.note.tone}>
                {t(configModule.note.i18nKey)}
              </Callout>
            )}

            <FormSwitch
              name="enabled"
              control={control}
              label={t('settings.enabled')}
            />
          </FormCardBody>
        </FormCard>
      </FormShell>

      {supportsPetLinking && accountId > 0 && (
        <ProviderPetLinksEditor
          accountId={accountId}
          initialLinks={storedPetLinks}
          onChange={setPetLinks}
          onBaselineResolved={setResolvedPetLinks}
        />
      )}

      <section className="provider-account-devices">
        <h2 className="section-label">{t('settings.devices')}</h2>
        <CardList>
          {accountDevices.map((device) => (
            <CardListItem
              key={device.id}
              icon={<Smartphone size="1em" />}
              to={`/settings/devices/${device.id}`}
              state={backState(
                `/settings/providers/${accountId}`,
                account.name,
              )}
            >
              <CardListContent title={device.name} description={device.type} />
            </CardListItem>
          ))}
          {/*
           * Naming the account carries this page's answer to "which provider?"
           * into the wizard, so it opens on discovery instead of asking again.
           */}
          <CardListItem
            icon={
              <div className="add-item-icon">
                <Plus size="0.5em" />
              </div>
            }
            to={`/settings/devices/new?account=${accountId}`}
            state={backState(`/settings/providers/${accountId}`, account.name)}
          >
            <CardListContent
              title={t('settings.add_device')}
              description={t('settings.add_device_desc')}
            />
          </CardListItem>
        </CardList>
      </section>

      <DiscardUnsavedDialog
        open={blockerOpen}
        onConfirm={onConfirmLeave}
        onCancel={onCancelLeave}
      />
    </div>
  );
};

export default ProviderAccountPage;
