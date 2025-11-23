import React, { useState } from 'react';
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

const STEPS = [
  { label: 'Select Account' },
  { label: 'Discover Devices' },
  { label: 'Register Device' },
];

const AddDevicePage: React.FC = () => {
  const navigate = useNavigate();
  const { data: accounts = [] } = useProviderAccounts();
  const { data: existingDevices = [] } = useDevices();
  const addDevice = useAddDevice();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(
    null,
  );
  const [selectedDevice, setSelectedDevice] =
    useState<DiscoveredDeviceDTO | null>(null);
  const [deviceName, setDeviceName] = useState('');
  const [apiKey, setApiKey] = useState('');
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
      setError('Failed to register device. Please check the API key.');
    }
  };

  return (
    <div className="add-device-page">
      <SectionHeader icon={<Smartphone size="1em" />}>
        Add New Device
      </SectionHeader>

      <Stepper steps={STEPS} currentStep={step} />

      {/* Step 1: Select Account */}
      {step === 1 && (
        <div className="step-container">
          <div className="settings-form">
            <FormField label="Provider Account">
              <Select
                value={selectedAccountId?.toString() || ''}
                onChange={(e) => handleAccountSelect(e.target.value)}
                placeholder="Select an account"
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
                Cancel
              </Button>
              <Button onClick={handleScan} disabled={!selectedAccountId}>
                <Search size="1em" />
                Scan for Devices
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
              <p>Scanning...</p>
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
                        <span className="device-type">{device.type}</span>
                        <span className="device-id">{device.externalId}</span>
                      </div>
                      {isAlreadyAdded ? (
                        <span className="device-status">Already Added</span>
                      ) : (
                        <Button size="sm" variant="secondary">
                          Select
                        </Button>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="empty-state">
                  <p>No devices found.</p>
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
              Back
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => scanDevices()}
              disabled={isDiscovering}
            >
              Rescan
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Register Device */}
      {step === 3 && selectedDevice && (
        <div className="step-container">
          <p className="step-description">
            Confirm device details to add it to your system.
          </p>

          <form onSubmit={handleRegister} className="settings-form">
            <FormField label="Device Name">
              <Input
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                required
              />
            </FormField>

            {/* Show API Key field for ESPHome devices (or all for now as we don't have a clear way to distinguish auth requirement) */}
            <FormField label="API Key (Encryption Key)">
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Optional if not configured"
              />
            </FormField>

            <div className="device-summary">
              <div className="summary-item">
                <span className="label">Type:</span>
                <span className="value">{selectedDevice.type}</span>
              </div>
              <div className="summary-item">
                <span className="label">External ID:</span>
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
                Back
              </Button>
              <Button type="submit" disabled={addDevice.isPending}>
                <Check size="1em" />
                {addDevice.isPending ? 'Registering...' : 'Register Device'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AddDevicePage;
