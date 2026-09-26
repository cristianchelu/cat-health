import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { ActionControl } from 'shared';
import { apiErrorMessage } from '@/api/apiClient';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useRunDeviceAction } from '@/hooks/queries/deviceQueries';
import { controlLabel } from '@/lib/deviceControlLabels';
import { DashboardTile } from '@/components/layout/DashboardTile';
import { ActionTile } from './ActionTile';

interface DeviceActionsProps {
  deviceId: number;
  actions: ActionControl[];
}

/**
 * Runs a device's actions, asking first for the ones the device marks. Draws
 * one tile per action, for a grid the caller owns.
 */
const DeviceActions: React.FC<DeviceActionsProps> = ({ deviceId, actions }) => {
  const { t } = useTranslation();
  const run = useRunDeviceAction(deviceId);
  const [confirming, setConfirming] = React.useState<ActionControl | null>(
    null,
  );
  const [runningKey, setRunningKey] = React.useState<string | null>(null);
  const [requestError, setRequestError] = React.useState<{
    key: string;
    message: string;
  } | null>(null);

  const start = (key: string) => {
    setRunningKey(key);
    setRequestError(null);
    run
      .mutateAsync(key)
      .catch((error: unknown) =>
        setRequestError({
          key,
          message: apiErrorMessage(error, t('devices.controls.run_failed')),
        }),
      )
      .finally(() =>
        setRunningKey((current) => (current === key ? null : current)),
      );
  };

  const handleRun = (key: string) => {
    const action = actions.find((candidate) => candidate.key === key);
    if (!action) return;
    if (action.confirm) setConfirming(action);
    else start(key);
  };

  return (
    <>
      {actions.map((action) => (
        <DashboardTile key={action.key}>
          <ActionTile
            label={controlLabel(action.label, t)}
            runLabel={t('devices.controls.run')}
            onRun={() => handleRun(action.key)}
            disabled={!action.available}
            busyLabel={
              runningKey === action.key || action.pending
                ? t('devices.controls.running')
                : undefined
            }
            error={
              requestError?.key === action.key
                ? requestError.message
                : action.failed
                  ? t(`devices.controls.failed.${action.failed.reason}`)
                  : undefined
            }
          />
        </DashboardTile>
      ))}
      <ConfirmDialog
        open={confirming !== null}
        title={t('devices.controls.confirm_action', {
          name: confirming ? controlLabel(confirming.label, t) : '',
        })}
        confirmLabel={t('devices.controls.run')}
        variant="danger"
        onConfirm={() => {
          if (confirming) start(confirming.key);
          setConfirming(null);
        }}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
};

export { DeviceActions, type DeviceActionsProps };
