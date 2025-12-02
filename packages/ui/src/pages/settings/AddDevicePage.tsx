import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  useProviderAccounts,
  useDiscoverDevices,
  useAddDevice,
  useDevices,
} from '@/hooks/queries/deviceQueries';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select } from '@/components/ui/form';
import Stepper from '@/components/ui/Stepper';
import { Smartphone, Search, Check, Loader2 } from 'lucide-react';
import type { DiscoveredDeviceDTO } from 'shared';
import './AddDevicePage.css';

const AddDevicePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: accounts = [] } = useProviderAccounts();

  const STEPS = [
    { label: t('settings.step_select_account') },
    { label: t('settings.step_discover_devices') },
    { label: t('settings.step_register_device') },
  ];
  const { data: existingDevices = [] } = useDevices();
  const addDevice = useAddDevice();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(
    null,
  );
  const [selectedDevice, setSelectedDevice] =
    useState<DiscoveredDeviceDTO | null>(null);
  const [deviceName, setDeviceName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [snapshotUrl, setSnapshotUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Discovery query
  const {
    data: devices,
    isLoading,
    isRefetching,
    refetch: scanDevices,
  } = useDiscoverDevices(selectedAccountId);

  const isDiscovering = isLoading || isRefetching;

  const handleAccountSelect = (accountId: string) => {
    setSelectedAccountId(Number(accountId));
  };

  const handleScan = async () => {
    if (!selectedAccountId) return;
    setStep(2);
    // The query will automatically run because selectedAccountId is set
    // But we might want to force refetch if we go back and forth
    // Actually useDiscoverDevices is enabled when selectedAccountId is set.
    // So it will fetch.
  };

  const handleDeviceSelect = (device: DiscoveredDeviceDTO) => {
    setSelectedDevice(device);
    setDeviceName(device.name);
    setStep(3);
  };

  const handleManualSetup = () => {
    setDeviceName('');
    setSnapshotUrl('');
    setStep(4);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId || !selectedDevice) return;

    try {
      const config = {
        ...(selectedDevice.config as Record<string, unknown>),
        encryptionKey: apiKey || undefined,
      };

      await addDevice.mutateAsync({
        provider_account_id: selectedAccountId,
        external_id: selectedDevice.externalId,
        name: deviceName,
        type: selectedDevice.type,
        config,
      });
      navigate('/settings');
    } catch (err) {
      console.error(err);
      setError(t('settings.register_device_error'));
    }
  };

  const handleManualRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId) return;

    try {
      const config = {
        snapshotUrl,
      };

      // Generate a random external ID for manual devices
      const externalId = `manual_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      await addDevice.mutateAsync({
        provider_account_id: selectedAccountId,
        external_id: externalId,
        name: deviceName,
        type: 'camera',
        config,
      });
      navigate('/settings');
    } catch (err) {
      console.error(err);
      setError(t('settings.register_device_error'));
    }
  };

  return (
    <div className="add-device-page">
      <SectionHeader icon={<Smartphone size="1em" />}>
        {t('settings.add_device_title')}
      </SectionHeader>

      <Stepper steps={STEPS} currentStep={step} />

      {/* Step 1: Select Account */}
      {step === 1 && (
        <div className="step-container">
          <div className="settings-form">
            <FormField label={t('settings.provider_account_label')}>
              <Select
                value={selectedAccountId?.toString() || ''}
                onChange={(e) => handleAccountSelect(e.target.value)}
                placeholder={t('settings.select_account_placeholder')}
                options={accounts.map((acc) => ({
                  value: acc.id.toString(),
                  label: `${acc.name} (${acc.provider})`,
                }))}
              />
            </FormField>

            <div className="form-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate('/settings')}
              >
                {t('settings.cancel')}
              </Button>
              <Button onClick={handleScan} disabled={!selectedAccountId}>
                <Search size="1em" />
                {t('settings.scan_devices')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Discover Devices */}
      {step === 2 && (
        <div className="step-container">
          {isDiscovering ? (
            <div className="loading-state">
              <Loader2 className="animate-spin" size={32} />
              <p>{t('settings.scanning')}</p>
            </div>
          ) : (
            <div className="device-list">
              {devices && devices.length > 0 ? (
                devices.map((device) => {
                  const isAlreadyAdded = existingDevices.some(
                    (d) =>
                      d.external_id === device.externalId &&
                      d.provider_account_id === selectedAccountId,
                  );

                  return (
                    <div
                      key={device.externalId}
                      className={`device-item ${isAlreadyAdded ? 'disabled' : ''}`}
                      onClick={() =>
                        !isAlreadyAdded && handleDeviceSelect(device)
                      }
                    >
                      <div className="device-info">
                        <span className="device-name">{device.name}</span>
                        <span className="device-type">
                          {t(`device_types.${device.type}`)}
                        </span>
                        <span className="device-id">{device.externalId}</span>
                      </div>
                      {isAlreadyAdded ? (
                        <span className="device-status">
                          {t('settings.already_added')}
                        </span>
                      ) : (
                        <Button size="sm" variant="secondary">
                          {t('settings.select')}
                        </Button>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="empty-state">
                  <p>{t('settings.no_devices_found')}</p>
                </div>
              )}
            </div>
          )}

          <div className="form-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep(1)}
            >
              {t('settings.back')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleManualSetup}
            >
              {t('settings.add_manually')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => scanDevices()}
              disabled={isDiscovering}
            >
              {t('settings.rescan')}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Register Device */}
      {step === 3 && selectedDevice && (
        <div className="step-container">
          <p className="step-description">
            {t('settings.confirm_device_details')}
          </p>

          <form onSubmit={handleRegister} className="settings-form">
            <FormField label={t('settings.device_name_label')}>
              <Input
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                required
              />
            </FormField>

            {/* Show API Key field for ESPHome devices (or all for now as we don't have a clear way to distinguish auth requirement) */}
            <FormField label={t('settings.api_key_label')}>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={t('settings.api_key_placeholder')}
              />
            </FormField>

            <div className="device-summary">
              <div className="summary-item">
                <span className="label">{t('settings.type_label')}</span>
                <span className="value">
                  {t(`device_types.${selectedDevice.type}`)}
                </span>
              </div>
              <div className="summary-item">
                <span className="label">{t('settings.external_id_label')}</span>
                <span className="value">{selectedDevice.externalId}</span>
              </div>
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="form-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep(2)}
              >
                {t('settings.back')}
              </Button>
              <Button type="submit" disabled={addDevice.isPending}>
                <Check size="1em" />
                {addDevice.isPending
                  ? t('settings.registering')
                  : t('settings.register_device')}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Step 4: Manual Setup */}
      {step === 4 && (
        <div className="step-container">
          <p className="step-description">{t('settings.manual_setup_desc')}</p>

          <form onSubmit={handleManualRegister} className="settings-form">
            <FormField label={t('settings.device_name_label')}>
              <Input
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                required
                placeholder={t('settings.device_name_placeholder')}
              />
            </FormField>

            <FormField label={t('settings.snapshot_url_label')}>
              <Input
                value={snapshotUrl}
                onChange={(e) => setSnapshotUrl(e.target.value)}
                required
                placeholder="http://camera-ip/snapshot.jpg"
              />
              <p className="help-text">{t('settings.snapshot_url_help')}</p>
            </FormField>

            {error && <div className="error-message">{error}</div>}

            <div className="form-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep(2)}
              >
                {t('settings.back')}
              </Button>
              <Button type="submit" disabled={addDevice.isPending}>
                <Check size="1em" />
                {addDevice.isPending
                  ? t('settings.registering')
                  : t('settings.register_device')}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AddDevicePage;
