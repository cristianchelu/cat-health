import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Button } from '@/components/ui/Button';
import { FormField, Select } from '@/components/ui/form';
import {
  useSettings,
  useUpdateSettings,
} from '@/hooks/queries/settingsQueries';
import {
  getTimezoneSelectOptions,
  timezoneApiValueToSelect,
  timezoneSelectValueToApi,
} from '@/lib/timezones';
import { Globe } from 'lucide-react';
import type {
  DateFormatDTO,
  FirstWeekdayDTO,
  NumberFormatDTO,
  PatchSettingsRequestDTO,
  SupportedLanguageDTO,
  TimeFormatDTO,
} from 'shared';

import './LanguageRegionPage.css';

const LanguageRegionPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  const timezoneOptions = React.useMemo(() => {
    const options = getTimezoneSelectOptions();
    return options.map((option) =>
      option.value === ''
        ? { ...option, label: t('settings.timezone_system') }
        : option,
    );
  }, [t]);

  const patch = (body: PatchSettingsRequestDTO) => {
    updateSettings.mutate(body);
  };

  const isSaving = updateSettings.isPending;

  if (!settings) {
    return (
      <div className="language-region-page">
        <div className="loading-state">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="language-region-page">
      <SectionHeader icon={<Globe size="1em" />}>
        {t('settings.language_region')}
      </SectionHeader>

      <div className="settings-form">
        <FormField label={t('settings.language_label')}>
          <Select
            value={settings.language}
            disabled={isSaving}
            options={[
              { value: 'en', label: t('settings.language_en') },
              { value: 'ro', label: t('settings.language_ro') },
            ]}
            onChange={(event) =>
              patch({ language: event.target.value as SupportedLanguageDTO })
            }
          />
        </FormField>

        <FormField label={t('settings.timezone_label')}>
          <Select
            value={timezoneApiValueToSelect(settings.timezone)}
            disabled={isSaving}
            options={timezoneOptions}
            onChange={(event) =>
              patch({ timezone: timezoneSelectValueToApi(event.target.value) })
            }
          />
        </FormField>

        <FormField label={t('settings.time_format_label')}>
          <Select
            value={settings.time_format}
            disabled={isSaving}
            options={[
              { value: 'language', label: t('settings.format_language') },
              { value: 'system', label: t('settings.format_system') },
              { value: 'h12', label: t('settings.time_format_h12') },
              { value: 'h24', label: t('settings.time_format_h24') },
            ]}
            onChange={(event) =>
              patch({ time_format: event.target.value as TimeFormatDTO })
            }
          />
        </FormField>

        <FormField label={t('settings.date_format_label')}>
          <Select
            value={settings.date_format}
            disabled={isSaving}
            options={[
              { value: 'language', label: t('settings.format_language') },
              { value: 'system', label: t('settings.format_system') },
              { value: 'DMY', label: t('settings.date_format_dmy') },
              { value: 'MDY', label: t('settings.date_format_mdy') },
              { value: 'YMD', label: t('settings.date_format_ymd') },
            ]}
            onChange={(event) =>
              patch({ date_format: event.target.value as DateFormatDTO })
            }
          />
        </FormField>

        <FormField label={t('settings.first_weekday_label')}>
          <Select
            value={settings.first_weekday}
            disabled={isSaving}
            options={[
              { value: 'language', label: t('settings.format_language') },
              { value: 'monday', label: t('settings.first_weekday_monday') },
              { value: 'sunday', label: t('settings.first_weekday_sunday') },
            ]}
            onChange={(event) =>
              patch({ first_weekday: event.target.value as FirstWeekdayDTO })
            }
          />
        </FormField>

        <FormField label={t('settings.number_format_label')}>
          <Select
            value={settings.number_format}
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
              patch({ number_format: event.target.value as NumberFormatDTO })
            }
          />
        </FormField>

        {updateSettings.isError ? (
          <div className="error-message" role="alert">
            {t('settings.language_region_save_error')}
          </div>
        ) : null}

        <div className="form-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate('/settings')}
          >
            {t('settings.cancel')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LanguageRegionPage;
