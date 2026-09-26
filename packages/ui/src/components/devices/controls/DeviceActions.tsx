import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { ActionControl } from 'shared';
import { apiErrorMessage } from '@/api/apiClient';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useRunDeviceAction } from '@/hooks/queries/deviceQueries';
import { ActionButtonRow } from './ActionButtonRow';

interface DeviceActionsProps {
  deviceId: number;
  actions: ActionControl[];
  className?: string;
}

/** Runs a device's actions, asking first for the ones the device marks. */
const DeviceActions: React.FC<DeviceActionsProps> = ({
  deviceId,
  actions,
  className,
}) => {
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
    run.mutate(key, {
      onError: (error) =>
        setRequestError({
          key,
          message: apiErrorMessage(error, t('devices.controls.run_failed')),
        }),
      onSettled: () => setRunningKey(null),
    });
  };

  const handleRun = (key: string) => {
    const action = actions.find((candidate) => candidate.key === key);
    if (!action) return;
    if (action.confirm) setConfirming(action);
    else start(key);
  };

  return (
    <>
      <ActionButtonRow
        className={className}
        actions={actions.map((action) => ({
          key: action.key,
          label: action.label.text,
          disabled: !action.available,
          running: runningKey === action.key || Boolean(action.pending),
          error:
            requestError?.key === action.key
              ? requestError.message
              : action.failed
                ? t(`devices.controls.failed.${action.failed.reason}`)
                : undefined,
        }))}
        onRun={handleRun}
      />
      <ConfirmDialog
        open={confirming !== null}
        title={t('devices.controls.confirm_action', {
          name: confirming?.label.text ?? '',
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
