import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import {
  useDevice,
  useUpdateDevice,
  useDevices,
} from '@/hooks/queries/deviceQueries';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Textarea } from '@/components/ui/form';
import { Switch } from '@/components/ui/Switch';
import { Select } from '@/components/ui/form';
import { Smartphone, Check } from 'lucide-react';
import './EditDevicePage.css';

const EditDevicePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const deviceId = parseInt(id || '0', 10);

  const { data: device, isLoading, error } = useDevice(deviceId, !!id, {
    refetchInterval: false,
  });
  const { data: allDevices = [] } = useDevices();
  const updateDevice = useUpdateDevice(deviceId);

  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Camera fields
  const [snapshotUrl, setSnapshotUrl] = useState('');

  // Pet recognizer fields
  const [model, setModel] = useState('');
  const [sourceDeviceId, setSourceDeviceId] = useState<number | null>(null);
  const [promptTemplate, setPromptTemplate] = useState('');
  const [autoIdentify, setAutoIdentify] = useState(true);

  useEffect(() => {
    if (!device) return;
    setName(device.name);
    setEnabled(device.enabled);

    const cfg = device.config as Record<string, unknown> | undefined;
    if (!cfg) return;

    if (device.type === 'camera') {
      setSnapshotUrl((cfg.snapshotUrl as string) || '');
    }

    if (device.type === 'pet_recognizer') {
      setModel((cfg.model as string) || '');
      setSourceDeviceId((cfg.source_device_id as number) || null);
      setPromptTemplate((cfg.prompt_template as string) || '');
      setAutoIdentify(cfg.auto_identify !== false);
    }
  }, [device]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!device) return;

    try {
      const existingConfig = (device.config as Record<string, unknown>) || {};
      let config: Record<string, unknown> | undefined;

      if (device.type === 'camera') {
        config = { ...existingConfig, snapshotUrl };
      } else if (device.type === 'pet_recognizer') {
        config = {
          ...existingConfig,
          model,
          source_device_id: sourceDeviceId,
          prompt_template: promptTemplate,
          auto_identify: autoIdentify,
        };
      }

      await updateDevice.mutateAsync({
        name,
        enabled,
        ...(config !== undefined && { config }),
      });
      navigate('/settings');
    } catch (err) {
      console.error(err);
      setSubmitError(t('settings.edit_device_error'));
    }
  };

  if (isLoading) {
    return (
      <div className="edit-device-page">
        <div className="loading-state">{t('settings.loading_device_data')}</div>
      </div>
    );
  }

  if (error || !device) {
    return (
      <div className="edit-device-page">
        <div className="error-state">
          <p>{t('devices.error_loading_device')}</p>
          <Button onClick={() => navigate('/settings')}>{t('settings.back')}</Button>
        </div>
      </div>
    );
  }

  const sourceDeviceOptions = allDevices
    .filter((d) => d.type !== 'pet_recognizer' && d.id !== deviceId)
    .map((d) => ({ value: d.id.toString(), label: `${d.name} (${d.type})` }));

  return (
    <div className="edit-device-page">
      <SectionHeader icon={<Smartphone size="1em" />}>
        {t('settings.edit_device_title')}
      </SectionHeader>

      <form onSubmit={handleSubmit} className="settings-form">
        <FormField label={t('settings.device_name_label')}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </FormField>

        <FormField label={t('settings.enabled')}>
          <div className="switch-row">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <span>{enabled ? t('settings.enabled') : t('settings.disabled')}</span>
          </div>
        </FormField>

        <div className="device-summary">
          <div className="summary-item">
            <span className="label">{t('settings.type_label')}</span>
            <span className="value">{t(`device_types.${device.type}`)}</span>
          </div>
          <div className="summary-item">
            <span className="label">{t('settings.external_id_label')}</span>
            <span className="value">{device.external_id}</span>
          </div>
        </div>

        {device.type === 'camera' && (
          <FormField label={t('settings.snapshot_url_label')}>
            <Input
              value={snapshotUrl}
              onChange={(e) => setSnapshotUrl(e.target.value)}
              placeholder={t('settings.snapshot_url_placeholder')}
            />
            <p className="help-text">{t('settings.snapshot_url_help')}</p>
          </FormField>
        )}

        {device.type === 'pet_recognizer' && (
          <>
            <FormField label={t('settings.source_device_label')}>
              <Select
                value={sourceDeviceId?.toString() || ''}
                onChange={(e) => setSourceDeviceId(Number(e.target.value))}
                required
                placeholder={t('settings.source_device_placeholder')}
                options={sourceDeviceOptions}
              />
            </FormField>

            <FormField label={t('settings.model_label')}>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={t('settings.model_placeholder')}
                required
              />
            </FormField>

            <FormField label={t('settings.prompt_template_label')}>
              <Textarea
                value={promptTemplate}
                onChange={(e) => setPromptTemplate(e.target.value)}
                rows={6}
                required
              />
            </FormField>

            <FormField label={t('settings.auto_identify_label')}>
              <div className="switch-row">
                <Switch checked={autoIdentify} onCheckedChange={setAutoIdentify} />
                <span>{autoIdentify ? t('settings.enabled') : t('settings.disabled')}</span>
              </div>
            </FormField>
          </>
        )}

        {submitError && <div className="error-message">{submitError}</div>}

        <div className="form-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate('/settings')}
          >
            {t('settings.cancel')}
          </Button>
          <Button type="submit" disabled={updateDevice.isPending}>
            <Check size="1em" />
            {updateDevice.isPending
              ? t('settings.saving')
              : t('settings.save_changes')}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default EditDevicePage;
