import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { StatusPill } from '@/components/ui/StatusPill';
import type {
  DeviceType,
  DiscoveredDeviceDTO,
  GetDeviceResponseDTO,
} from 'shared';
import {
  describeCandidates,
  type DiscoveryCandidate,
} from '../importSelection';
import './DiscoverDevicesStep.css';

interface DiscoverDevicesStepProps {
  accountId: number;
  isDiscovering: boolean;
  discoveredDevices: DiscoveredDeviceDTO[] | undefined;
  existingDevices: GetDeviceResponseDTO[];
  supportedTypes: readonly DeviceType[];
  allowsDirectRegistration: boolean;
  /**
   * `multi` imports the whole selection at once; `single` hands one candidate
   * to the provider's registration form.
   */
  selectionMode: 'single' | 'multi';
  isImporting?: boolean;
  importError?: string | null;
  onSelect: (device: DiscoveredDeviceDTO) => void;
  onImport?: (devices: DiscoveredDeviceDTO[]) => void;
  onDirectRegister: () => void;
  onRescan: () => void;
  onBack: () => void;
  /** Offered when importing now is optional (the connect flow). */
  onSkip?: () => void;
}

const CandidateRow: React.FC<{
  candidate: DiscoveryCandidate;
  selectionMode: 'single' | 'multi';
  selected: boolean;
  onToggle: () => void;
  onSelect: () => void;
}> = ({ candidate, selectionMode, selected, onToggle, onSelect }) => {
  const { t } = useTranslation();
  const { device, disabledReason } = candidate;

  return (
    <div className={`device-item${disabledReason ? ' disabled' : ''}`}>
      <div className="device-info">
        <span className="device-name">{device.name}</span>
        <span className="device-type">{t(`device_types.${device.type}`)}</span>
        <span className="device-id">{device.externalId}</span>
      </div>

      {disabledReason === 'already-added' && (
        <StatusPill variant="off">{t('settings.already_added')}</StatusPill>
      )}
      {disabledReason === 'unsupported' && (
        <StatusPill variant="off">{t('settings.unsupported')}</StatusPill>
      )}

      {!disabledReason &&
        (selectionMode === 'multi' ? (
          <Switch
            checked={selected}
            onCheckedChange={onToggle}
            // Switch renders a bare checkbox with no text, so each row has to
            // carry its own accessible name.
            aria-label={t('settings.import_device', { name: device.name })}
          />
        ) : (
          <Button size="sm" variant="secondary" onClick={onSelect}>
            {t('settings.select')}
          </Button>
        ))}
    </div>
  );
};

export const DiscoverDevicesStep: React.FC<DiscoverDevicesStepProps> = ({
  accountId,
  isDiscovering,
  discoveredDevices,
  existingDevices,
  supportedTypes,
  allowsDirectRegistration,
  selectionMode,
  isImporting = false,
  importError,
  onSelect,
  onImport,
  onDirectRegister,
  onRescan,
  onBack,
  onSkip,
}) => {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  const candidates = React.useMemo(
    () =>
      describeCandidates(
        discoveredDevices ?? [],
        existingDevices,
        accountId,
        supportedTypes,
      ),
    [discoveredDevices, existingDevices, accountId, supportedTypes],
  );

  const importable = candidates.filter((c) => !c.disabledReason);

  const toggle = (externalId: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(externalId)) next.delete(externalId);
      else next.add(externalId);
      return next;
    });
  };

  const selectedDevices = importable
    .filter((c) => selectedIds.has(c.device.externalId))
    .map((c) => c.device);

  return (
    <>
      {isDiscovering ? (
        <div className="loading-state">
          <Loader2 className="animate-spin" size={32} />
          <p>{t('settings.scanning')}</p>
        </div>
      ) : (
        <div className="device-list">
          {candidates.length > 0 ? (
            candidates.map((candidate) => (
              <CandidateRow
                key={candidate.device.externalId}
                candidate={candidate}
                selectionMode={selectionMode}
                selected={selectedIds.has(candidate.device.externalId)}
                onToggle={() => toggle(candidate.device.externalId)}
                onSelect={() => onSelect(candidate.device)}
              />
            ))
          ) : (
            <div className="empty-state">
              <p>{t('settings.no_devices_found')}</p>
            </div>
          )}
        </div>
      )}

      {importError && (
        <p className="discover-import-error" role="alert">
          {importError}
        </p>
      )}

      <div className="form-actions discover-actions">
        {selectionMode === 'multi' && importable.length > 0 && (
          <span className="discover-selected-count">
            {t('settings.selected_count', {
              selected: selectedDevices.length,
              total: importable.length,
            })}
          </span>
        )}

        <Button type="button" variant="secondary" onClick={onBack}>
          {t('settings.back')}
        </Button>
        {onSkip && (
          <Button type="button" variant="ghost" onClick={onSkip}>
            {t('settings.skip_for_now')}
          </Button>
        )}
        {allowsDirectRegistration && (
          <Button type="button" variant="secondary" onClick={onDirectRegister}>
            {t('settings.add_manually')}
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          onClick={onRescan}
          disabled={isDiscovering || isImporting}
        >
          {t('settings.rescan')}
        </Button>
        {selectionMode === 'multi' && (
          <Button
            type="button"
            onClick={() => onImport?.(selectedDevices)}
            disabled={selectedDevices.length === 0 || isImporting}
          >
            {isImporting
              ? t('settings.importing')
              : t('settings.import_and_continue')}
          </Button>
        )}
      </div>
    </>
  );
};
