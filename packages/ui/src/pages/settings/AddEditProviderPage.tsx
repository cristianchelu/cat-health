import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import type { ProviderPetLink } from 'shared';
import {
  useProviders,
  useProviderAccount,
  useCreateProviderAccount,
  useUpdateProviderAccount,
} from '@/hooks/queries/deviceQueries';
import { Button } from '@/components/ui/Button';
import {
  FormField,
  FormShell,
  FormSwitch,
  Input,
  Select,
  Textarea,
} from '@/components/ui/form';
import { SettingsFormPage } from '@/components/ui/SettingsFormPage';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { useAppForm, useDraftForm, useUnsavedBlocker } from '@/hooks/form';
import ProviderPetLinksEditor from './components/ProviderPetLinksEditor';
import { Server } from 'lucide-react';
import './AddEditProviderPage.css';

interface ProviderFormValues {
  provider: string;
  name: string;
  enabled: boolean;
  config: string;
}

const EMPTY_PET_LINKS: ProviderPetLink[] = [];

const DEFAULT_FORM_VALUES: ProviderFormValues = {
  provider: '',
  name: '',
  enabled: true,
  config: '{}',
};

function configToJson(
  config: unknown,
  options?: { omitPetLinks?: boolean },
): string {
  if (typeof config !== 'object' || config === null) {
    return '{}';
  }
  if (options?.omitPetLinks) {
    const rest = { ...(config as Record<string, unknown>) };
    delete rest.pet_links;
    return JSON.stringify(rest, null, 2);
  }
  return JSON.stringify(config, null, 2);
}

function accountToFormValues(
  account: {
    provider: string;
    name: string;
    enabled: boolean;
    config?: unknown;
  },
  omitPetLinks: boolean,
): ProviderFormValues {
  return {
    provider: account.provider,
    name: account.name,
    enabled: account.enabled,
    config: configToJson(account.config, { omitPetLinks }),
  };
}

const AddEditProviderPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const accountId = parseInt(id || '0', 10);

  const { data: providers = [] } = useProviders();
  const {
    data: account,
    isLoading,
    error: loadError,
  } = useProviderAccount(accountId, isEditing);
  const createAccount = useCreateProviderAccount();
  const updateAccount = useUpdateProviderAccount(accountId);

  const providerOptions = providers
    .filter((p) => !p.internal)
    .map((p) => ({ value: p.name, label: p.name }));

  const effectiveProvider = account?.provider;
  const providerMeta = effectiveProvider
    ? providers.find((p) => p.name === effectiveProvider)
    : undefined;
  const supportsPetLinking =
    providerMeta?.capabilities.supports_pet_linking ?? false;

  const {
    register,
    handleSubmit,
    watch,
    control,
    setError,
    formState: { errors, isDirty },
  } = useAppForm<ProviderFormValues>({
    defaultValues: DEFAULT_FORM_VALUES,
    values:
      account && isEditing
        ? accountToFormValues(account, supportsPetLinking)
        : undefined,
  });

  const [error, setErrorState] = useState<string | undefined>(undefined);

  const petLinksBaseline = useMemo(() => {
    if (!supportsPetLinking || !account?.config) return EMPTY_PET_LINKS;
    const cfg = account.config as { pet_links?: ProviderPetLink[] };
    return Array.isArray(cfg.pet_links) ? cfg.pet_links : EMPTY_PET_LINKS;
  }, [account?.config, supportsPetLinking]);

  const petLinksBaselineKey = useMemo(
    () => JSON.stringify(petLinksBaseline),
    [petLinksBaseline],
  );

  const {
    draft: petLinks,
    setDraft: setPetLinks,
    isDirty: petLinksDirty,
  } = useDraftForm(petLinksBaseline, {
    baselineKey: petLinksBaselineKey,
  });

  const { blockerOpen, onConfirmLeave, onCancelLeave } = useUnsavedBlocker(
    isDirty || (supportsPetLinking && petLinksDirty),
  );

  const selectedProvider = watch('provider');
  const createProviderMeta = providers.find((p) => p.name === selectedProvider);

  const handlePetLinksChange = useCallback(
    (links: ProviderPetLink[]) => {
      setPetLinks(links);
    },
    [setPetLinks],
  );

  const showPetLinking = isEditing && accountId > 0 && supportsPetLinking;

  const onFormSubmit = async (data: ProviderFormValues) => {
    setErrorState(undefined);
    setError('config', { message: '' });

    let parsedConfig: Record<string, unknown>;
    try {
      parsedConfig = JSON.parse(data.config) as Record<string, unknown>;
    } catch {
      setError('config', { message: t('settings.invalid_json') });
      return;
    }

    if (showPetLinking) {
      parsedConfig.pet_links = petLinks;
    }

    try {
      if (isEditing) {
        await updateAccount.mutateAsync({
          name: data.name,
          config: parsedConfig,
          enabled: data.enabled,
        });
      } else {
        await createAccount.mutateAsync({
          provider: data.provider,
          name: data.name,
          config: parsedConfig,
        });
      }

      navigate('/settings');
    } catch (err) {
      console.error(err);
      setErrorState(
        isEditing
          ? t('settings.update_provider_error')
          : t('settings.create_provider_error'),
      );
    }
  };

  if (isEditing && isLoading) {
    return (
      <SettingsFormPage
        className="add-edit-provider-page"
        title={t('settings.edit_provider_title')}
        icon={<Server size="1em" />}
        isLoading
        loadingMessage={t('settings.loading_provider_data')}
      />
    );
  }

  if (isEditing && (loadError || !account)) {
    return (
      <SettingsFormPage
        className="add-edit-provider-page"
        title={t('settings.edit_provider_title')}
        icon={<Server size="1em" />}
      >
        <div className="error-state">
          <p>{t('settings.error_loading_provider')}</p>
          <Button onClick={() => navigate('/settings')}>
            {t('settings.back')}
          </Button>
        </div>
      </SettingsFormPage>
    );
  }

  return (
    <SettingsFormPage
      className="add-edit-provider-page"
      title={
        isEditing
          ? t('settings.edit_provider_title')
          : t('settings.add_provider_title')
      }
      icon={<Server size="1em" />}
    >
      <FormShell
        onSubmit={handleSubmit(onFormSubmit)}
        error={error}
        actions={{
          onCancel: () => navigate('/settings'),
          cancelLabel: t('settings.cancel'),
          submitLabel: isEditing
            ? updateAccount.isPending
              ? t('settings.saving')
              : t('settings.save_changes')
            : createAccount.isPending
              ? t('settings.creating')
              : t('settings.create_account'),
          isSubmitting: createAccount.isPending || updateAccount.isPending,
          submitDisabled: !(isDirty || (supportsPetLinking && petLinksDirty)),
        }}
      >
        <FormField label={t('settings.provider_label')}>
          <Select
            {...register('provider', { required: true })}
            placeholder={t('settings.provider_placeholder')}
            options={providerOptions}
            disabled={isEditing}
          />
        </FormField>

        <FormField label={t('settings.account_name_label')}>
          <Input
            {...register('name', { required: true })}
            placeholder={t('settings.account_name_placeholder')}
          />
        </FormField>

        {isEditing && (
          <FormSwitch
            name="enabled"
            control={control}
            label={t('settings.enabled')}
          />
        )}

        <FormField
          label={t('settings.config_label')}
          error={errors.config?.message}
        >
          <Textarea
            {...register('config')}
            rows={8}
            className="font-mono"
            variant={errors.config ? 'error' : 'default'}
          />
        </FormField>

        {!isEditing &&
          createProviderMeta?.capabilities.supports_pet_linking && (
            <p className="help-text">
              {t('settings.pet_linking_after_create_hint')}
            </p>
          )}

        {showPetLinking && (
          <ProviderPetLinksEditor
            key={`${accountId}:${petLinksBaselineKey}`}
            accountId={accountId}
            initialLinks={petLinksBaseline}
            onChange={handlePetLinksChange}
          />
        )}
      </FormShell>
      <DiscardUnsavedDialog
        open={blockerOpen}
        onConfirm={onConfirmLeave}
        onCancel={onCancelLeave}
      />
    </SettingsFormPage>
  );
};

export default AddEditProviderPage;
