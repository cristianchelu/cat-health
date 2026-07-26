import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { AlertTriangle, Info, Plus, Smartphone } from 'lucide-react';
import type { ProviderPetLink } from 'shared';
import {
  useProviders,
  useProviderAccount,
  useUpdateProviderAccount,
  useDevices,
} from '@/hooks/queries/deviceQueries';
import { Button } from '@/components/ui/Button';
import { FormInput, FormShell, FormSwitch } from '@/components/ui/form';
import { LoadingState } from '@/components/ui/PageState';
import { PageBackLink } from '@/components/ui/PageBackLink';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { useAppForm, useDraftForm, useUnsavedBlocker } from '@/hooks/form';
import {
  CardList,
  CardListContent,
  CardListItem,
} from '../components/CardList';
import ProviderPetLinksEditor from '../components/ProviderPetLinksEditor';
import { getProviderBrand } from '../provider-wizard/flows/providerBrandRegistry.ts';
import {
  getAccountConfigModule,
  hasAccountConfigModule,
} from '../provider-wizard/flows/accountConfigRegistry.ts';
import type { ProviderAccountFormValues } from '../provider-wizard/flows/accountConfigTypes.ts';
import { ProviderBrandTile } from './components/ProviderBrandTile';
import '../providerForm.css';
import './ProviderAccountPage.css';

const EMPTY_PET_LINKS: ProviderPetLink[] = [];

const ProviderAccountPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const accountId = Number.parseInt(id ?? '0', 10);

  const { data: providers = [] } = useProviders();
  const { data: devices = [] } = useDevices();
  const {
    data: account,
    isLoading,
    error: loadError,
  } = useProviderAccount(accountId, true);
  const updateAccount = useUpdateProviderAccount(accountId);

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
  const petLinksBaseline = React.useMemo(() => {
    if (!supportsPetLinking || !accountConfig) return EMPTY_PET_LINKS;
    const config = accountConfig as { pet_links?: ProviderPetLink[] };
    return Array.isArray(config.pet_links) ? config.pet_links : EMPTY_PET_LINKS;
  }, [accountConfig, supportsPetLinking]);

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
  const { blockerOpen, onConfirmLeave, onCancelLeave } =
    useUnsavedBlocker(dirty);

  const accountDevices = devices.filter(
    (device) => device.provider_account_id === accountId,
  );

  const onSubmit = async (values: ProviderAccountFormValues) => {
    setServerError(undefined);

    const config = configModule.toConfig(values.config);
    if (supportsPetLinking) {
      config.pet_links = petLinks;
    }

    try {
      await updateAccount.mutateAsync({
        name: values.name,
        enabled: values.enabled,
        // Providers on the generic fallback own no config, so omit the field
        // entirely rather than overwriting theirs with an empty object.
        ...(hasAccountConfigModule(provider) ? { config } : {}),
      });
      void navigate('/settings/providers');
    } catch (err) {
      console.error(err);
      setServerError(t('settings.update_provider_error'));
    }
  };

  if (isLoading) {
    return (
      <div className="provider-account-page">
        <PageBackLink
          to="/settings/providers"
          label={t('settings.providers')}
        />
        <LoadingState message={t('settings.loading_provider_data')} />
      </div>
    );
  }

  if (loadError || !account) {
    return (
      <div className="provider-account-page">
        <PageBackLink
          to="/settings/providers"
          label={t('settings.providers')}
        />
        <div className="provider-account-error">
          <p>{t('settings.error_loading_provider')}</p>
          <Button onClick={() => void navigate('/settings/providers')}>
            {t('settings.back')}
          </Button>
        </div>
      </div>
    );
  }

  const identity = brand.accountIdentity?.(account.config);
  const Fields = configModule.Fields;

  return (
    <div className="provider-account-page">
      <PageBackLink
        to="/settings/providers"
        label={t('settings.providers')}
        mobileTitle={account.name}
      />

      <div className="provider-formcard">
        <header className="provider-brandhead">
          <ProviderBrandTile provider={provider} size="lg" />
          <div className="provider-brandhead-text">
            <h1>{brand.label}</h1>
            {identity && <p>{identity}</p>}
          </div>
        </header>

        <FormShell
          onSubmit={handleSubmit(onSubmit)}
          error={serverError}
          actions={{
            onCancel: () => void navigate('/settings/providers'),
            cancelLabel: t('settings.cancel'),
            submitLabel: updateAccount.isPending
              ? t('settings.saving')
              : t('settings.save_changes'),
            isSubmitting: updateAccount.isPending,
            submitDisabled: !dirty,
          }}
        >
          <FormInput
            name="name"
            control={control}
            label={t('settings.account_name_label')}
            placeholder={t('settings.account_name_placeholder')}
            rules={{ required: true }}
          />

          <Fields control={control} mode="edit" />

          {configModule.note && (
            <p className={`provider-note ${configModule.note.variant}`}>
              {configModule.note.variant === 'warn' ? (
                <AlertTriangle size={18} aria-hidden="true" />
              ) : (
                <Info size={18} aria-hidden="true" />
              )}
              <span>{t(configModule.note.i18nKey)}</span>
            </p>
          )}

          <FormSwitch
            name="enabled"
            control={control}
            label={t('settings.enabled')}
          />
        </FormShell>
      </div>

      {supportsPetLinking && accountId > 0 && (
        <ProviderPetLinksEditor
          key={`${accountId}:${petLinksBaselineKey}`}
          accountId={accountId}
          initialLinks={petLinksBaseline}
          onChange={setPetLinks}
        />
      )}

      <section className="provider-account-devices">
        <h2>{t('settings.devices')}</h2>
        <CardList>
          {accountDevices.map((device) => (
            <CardListItem
              key={device.id}
              icon={<Smartphone size="1em" />}
              to={`/settings/devices/${device.id}`}
            >
              <CardListContent title={device.name} description={device.type} />
            </CardListItem>
          ))}
          <CardListItem
            icon={
              <div className="add-item-icon">
                <Plus size="0.5em" />
              </div>
            }
            to="/settings/devices/new"
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
