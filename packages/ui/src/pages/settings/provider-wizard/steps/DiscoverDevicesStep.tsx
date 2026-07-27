import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  /** An import is in flight: the selection it is walking must not change. */
  locked: boolean;
  onToggle: () => void;
  onSelect: () => void;
}> = ({ candidate, selectionMode, selected, locked, onToggle, onSelect }) => {
  const { t } = useTranslation();
  const { device, disabledReason } = candidate;
  const switchId = React.useId();

  // Only a multi-select row has something to activate, so only it gets the
  // whole-row hit target. Single-select rows are read-only until the button.
  const togglable = selectionMode === 'multi' && !disabledReason;

  const info = (
    <>
      <span className="device-name">{device.name}</span>
      <span className="device-type">{t(`device_types.${device.type}`)}</span>
      <span className="device-id">{device.externalId}</span>
    </>
  );

  return (
    <div className={cn('device-item', disabledReason && 'disabled')}>
      {/*
       * A second <label> for the same checkbox — valid, and it makes the name,
       * type and id a real touch target without a click handler that would
       * double-toggle against the Switch's own label.
       */}
      {togglable ? (
        <label className="device-info discover-row-hit" htmlFor={switchId}>
          {info}
        </label>
      ) : (
        <div className="device-info">{info}</div>
      )}

      {disabledReason === 'already-added' && (
        <StatusPill variant="off">{t('settings.already_added')}</StatusPill>
      )}
      {disabledReason === 'unsupported' && (
        <StatusPill variant="off">{t('settings.unsupported')}</StatusPill>
      )}

      {!disabledReason &&
        (selectionMode === 'multi' ? (
          <Switch
            id={switchId}
            checked={selected}
            disabled={locked}
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

  const importable = React.useMemo(
    () => candidates.filter((c) => !c.disabledReason),
    [candidates],
  );

  /*
   * Drop selections for devices the latest scan no longer offers. Without this
   * a device that drops off the network and comes back later returns silently
   * pre-selected, because the id lingered in state the whole time.
   */
  React.useEffect(() => {
    setSelectedIds((previous) => {
      if (previous.size === 0) return previous;
      const available = new Set(importable.map((c) => c.device.externalId));
      const next = new Set([...previous].filter((id) => available.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [importable]);

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
    <div
      className="discover-devices-step"
      data-importing={isImporting || undefined}
    >
      {isDiscovering ? (
        <div className="loading-state">
          <Loader2 className="animate-spin" size={32} />
          <p>{t('settings.scanning')}</p>
        </div>
      ) : (
        <div className="device-list" aria-busy={isImporting || undefined}>
          {candidates.length > 0 ? (
            candidates.map((candidate) => (
              <CandidateRow
                key={candidate.device.externalId}
                candidate={candidate}
                selectionMode={selectionMode}
                selected={selectedIds.has(candidate.device.externalId)}
                locked={isImporting}
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

      {/*
       * Everything here locks while an import runs. The import POSTs one device
       * at a time and cannot be cancelled, so leaving the step would keep the
       * loop going with the user watching an unrelated screen.
       */}
      <div className="form-actions discover-actions">
        {/*
         * `isImporting` keeps the line alive to the end: each POST invalidates
         * the devices query, so rows flip to "already added" and `importable`
         * can empty out while the loop is still running.
         */}
        {selectionMode === 'multi' &&
          (importable.length > 0 || isImporting) && (
            <span className="discover-status" role="status">
              {isImporting ? (
                <>
                  <Loader2
                    className="animate-spin"
                    size={16}
                    aria-hidden="true"
                  />
                  {t('settings.importing')}
                </>
              ) : (
                t('settings.selected_count', {
                  selected: selectedDevices.length,
                  total: importable.length,
                })
              )}
            </span>
          )}

        <Button
          type="button"
          variant="secondary"
          onClick={onBack}
          disabled={isImporting}
        >
          {t('settings.back')}
        </Button>
        {onSkip && (
          <Button
            type="button"
            variant="ghost"
            onClick={onSkip}
            disabled={isImporting}
          >
            {t('settings.skip_for_now')}
          </Button>
        )}
        {allowsDirectRegistration && (
          <Button
            type="button"
            variant="secondary"
            onClick={onDirectRegister}
            disabled={isImporting}
          >
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
            {t('settings.import_and_continue')}
          </Button>
        )}
      </div>
    </div>
  );
};
