import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Globe } from 'lucide-react';
import { SettingsFormPage } from '@/components/ui/SettingsFormPage';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { FormField, FormShell, Select } from '@/components/ui/form';
import {
  useSettings,
  useUpdateSettings,
} from '@/hooks/queries/settingsQueries';
import { useDraftForm, useUnsavedBlocker } from '@/hooks/form';
import {
  getTimezoneSelectOptions,
  timezoneApiValueToSelect,
  timezoneSelectValueToApi,
} from '@/lib/timezones';
import type {
  DateFormatDTO,
  FirstWeekdayDTO,
  NumberFormatDTO,
  SupportedLanguageDTO,
  TimeFormatDTO,
} from 'shared';

import './LanguageRegionPage.css';

interface LanguageRegionDraft {
  language: SupportedLanguageDTO;
  timezoneSelect: string;
  time_format: TimeFormatDTO;
  date_format: DateFormatDTO;
  first_weekday: FirstWeekdayDTO;
  number_format: NumberFormatDTO;
}

const LanguageRegionPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  const baseline = React.useMemo<LanguageRegionDraft | null>(() => {
    if (!settings) return null;
    return {
      language: settings.language,
      timezoneSelect: timezoneApiValueToSelect(settings.timezone),
      time_format: settings.time_format,
      date_format: settings.date_format,
      first_weekday: settings.first_weekday,
      number_format: settings.number_format,
    };
  }, [settings]);

  const { draft, patchDraft, isDirty } = useDraftForm(
    baseline ?? {
      language: 'en' as SupportedLanguageDTO,
      timezoneSelect: '',
      time_format: 'language' as TimeFormatDTO,
      date_format: 'language' as DateFormatDTO,
      first_weekday: 'language' as FirstWeekdayDTO,
      number_format: 'language' as NumberFormatDTO,
    },
    {
      baselineKey: settings
        ? `${settings.language}|${settings.timezone}|${settings.time_format}|${settings.date_format}|${settings.first_weekday}|${settings.number_format}`
        : 'loading',
    },
  );

  const { blockerOpen, onConfirmLeave, onCancelLeave, markSaved } =
    useUnsavedBlocker(isDirty && Boolean(settings));

  const timezoneOptions = React.useMemo(() => {
    const options = getTimezoneSelectOptions();
    return options.map((option) =>
      option.value === ''
        ? { ...option, label: t('settings.timezone_system') }
        : option,
    );
  }, [t]);

  const isSaving = updateSettings.isPending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!settings || !isDirty) return;
    updateSettings.mutate(
      {
        language: draft.language,
        timezone: timezoneSelectValueToApi(draft.timezoneSelect),
        time_format: draft.time_format,
        date_format: draft.date_format,
        first_weekday: draft.first_weekday,
        number_format: draft.number_format,
      },
      {
        onSuccess: () => {
          markSaved();
          navigate('/settings');
        },
      },
    );
  };

  return (
    <SettingsFormPage
      className="language-region-page"
      title={t('settings.language_region')}
      icon={<Globe size="1em" />}
      isLoading={!settings}
      loadingMessage={t('common.loading')}
    >
      <FormShell
        onSubmit={handleSubmit}
        error={
          updateSettings.isError
            ? t('settings.language_region_save_error')
            : null
        }
        actions={{
          onCancel: () => navigate('/settings'),
          cancelLabel: t('settings.cancel'),
          submitLabel: isSaving
            ? t('settings.saving')
            : t('settings.save_changes'),
          isSubmitting: isSaving,
          submitDisabled: !isDirty,
        }}
      >
        <FormField label={t('settings.language_label')}>
          <Select
            value={draft.language}
            disabled={isSaving}
            options={[
              { value: 'en', label: t('settings.language_en') },
              { value: 'ro', label: t('settings.language_ro') },
            ]}
            onChange={(event) =>
              patchDraft({
                language: event.target.value as SupportedLanguageDTO,
              })
            }
          />
        </FormField>

        <FormField label={t('settings.timezone_label')}>
          <Select
            value={draft.timezoneSelect}
            disabled={isSaving}
            options={timezoneOptions}
            onChange={(event) =>
              patchDraft({ timezoneSelect: event.target.value })
            }
          />
        </FormField>

        <FormField label={t('settings.time_format_label')}>
          <Select
            value={draft.time_format}
            disabled={isSaving}
            options={[
              { value: 'language', label: t('settings.format_language') },
              { value: 'system', label: t('settings.format_system') },
              { value: 'h12', label: t('settings.time_format_h12') },
              { value: 'h24', label: t('settings.time_format_h24') },
            ]}
            onChange={(event) =>
              patchDraft({
                time_format: event.target.value as TimeFormatDTO,
              })
            }
          />
        </FormField>

        <FormField label={t('settings.date_format_label')}>
          <Select
            value={draft.date_format}
            disabled={isSaving}
            options={[
              { value: 'language', label: t('settings.format_language') },
              { value: 'system', label: t('settings.format_system') },
              { value: 'DMY', label: t('settings.date_format_dmy') },
              { value: 'MDY', label: t('settings.date_format_mdy') },
              { value: 'YMD', label: t('settings.date_format_ymd') },
            ]}
            onChange={(event) =>
              patchDraft({
                date_format: event.target.value as DateFormatDTO,
              })
            }
          />
        </FormField>

        <FormField label={t('settings.first_weekday_label')}>
          <Select
            value={draft.first_weekday}
            disabled={isSaving}
            options={[
              { value: 'language', label: t('settings.format_language') },
              { value: 'monday', label: t('settings.first_weekday_monday') },
              { value: 'sunday', label: t('settings.first_weekday_sunday') },
            ]}
            onChange={(event) =>
              patchDraft({
                first_weekday: event.target.value as FirstWeekdayDTO,
              })
            }
          />
        </FormField>

        <FormField label={t('settings.number_format_label')}>
          <Select
            value={draft.number_format}
            disabled={isSaving}
            options={[
              { value: 'language', label: t('settings.format_language') },
              { value: 'system', label: t('settings.format_system') },
              {
                value: 'comma_decimal',
                label: t('settings.number_format_comma_decimal'),
              },
              {
                value: 'decimal_comma',
                label: t('settings.number_format_decimal_comma'),
              },
            ]}
            onChange={(event) =>
              patchDraft({
                number_format: event.target.value as NumberFormatDTO,
              })
            }
          />
        </FormField>
      </FormShell>

      <DiscardUnsavedDialog
        open={blockerOpen}
        onConfirm={onConfirmLeave}
        onCancel={onCancelLeave}
      />
    </SettingsFormPage>
  );
};

export default LanguageRegionPage;
