import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { ActionControl, RunDeviceActionRequestDTO } from 'shared';
import { deviceWriteErrorMessage } from '@/lib/deviceControlErrors';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PickerList } from '@/components/ui/PickerList';
import { PickerSheet } from '@/components/ui/PickerSheet';
import { useRunDeviceAction } from '@/hooks/queries/deviceQueries';
import { controlLabel } from '@/lib/deviceControlLabels';
import { DashboardTile } from '@/components/layout/DashboardTile';
import { ActionTile } from './ActionTile';
import { actionInput } from './actionInput';

interface DeviceActionsProps {
  deviceId: number;
  actions: ActionControl[];
}

interface PendingRun {
  action: ActionControl;
  args: RunDeviceActionRequestDTO;
}

/**
 * Runs a device's actions: picks the one choice an action asks for, then
 * asks first for the ones the device marks. Draws one tile per action, for a
 * grid the caller owns.
 */
const DeviceActions: React.FC<DeviceActionsProps> = ({ deviceId, actions }) => {
  const { t } = useTranslation();
  const run = useRunDeviceAction(deviceId);
  const [choosing, setChoosing] = React.useState<ActionControl | null>(null);
  const [confirming, setConfirming] = React.useState<PendingRun | null>(null);
  const [runningKey, setRunningKey] = React.useState<string | null>(null);
  const [requestError, setRequestError] = React.useState<{
    key: string;
    message: string;
  } | null>(null);

  const start = ({ action: { key }, args }: PendingRun) => {
    setRunningKey(key);
    setRequestError(null);
    run
      .mutateAsync({ key, args })
      .catch((error: unknown) =>
        setRequestError({
          key,
          message: deviceWriteErrorMessage(
            error,
            t,
            t('devices.controls.run_failed'),
          ),
        }),
      )
      .finally(() =>
        setRunningKey((current) => (current === key ? null : current)),
      );
  };

  const proceed = (pending: PendingRun) => {
    if (pending.action.confirm) setConfirming(pending);
    else start(pending);
  };

  const handleRun = (action: ActionControl) => {
    if (actionInput(action).kind === 'choice') setChoosing(action);
    else proceed({ action, args: {} });
  };

  const choice = choosing ? actionInput(choosing) : null;

  return (
    <>
      {actions.map((action) => (
        <DashboardTile key={action.key}>
          <ActionTile
            label={controlLabel(action.label, t)}
            runLabel={t('devices.controls.run')}
            onRun={() => handleRun(action)}
            disabled={
              !action.available || actionInput(action).kind === 'unsupported'
            }
            busyLabel={
              runningKey === action.key
                ? t('devices.controls.running')
                : undefined
            }
            error={
              requestError?.key === action.key
                ? requestError.message
                : undefined
            }
          />
        </DashboardTile>
      ))}
      <PickerSheet
        open={choosing !== null}
        onOpenChange={(open) => {
          if (!open) setChoosing(null);
        }}
        onBack={() => setChoosing(null)}
        title={choosing ? controlLabel(choosing.label, t) : ''}
      >
        {choosing && choice?.kind === 'choice' ? (
          <PickerList
            options={choice.options.map((option) => ({
              value: option.value,
              label: controlLabel(option.label, t),
            }))}
            onSelect={(value) => {
              setChoosing(null);
              proceed({ action: choosing, args: { [choice.arg]: value } });
            }}
          />
        ) : null}
      </PickerSheet>
      <ConfirmDialog
        open={confirming !== null}
        title={t('devices.controls.confirm_action', {
          name: confirming ? controlLabel(confirming.action.label, t) : '',
        })}
        confirmLabel={t('devices.controls.run')}
        variant="danger"
        onConfirm={() => {
          if (confirming) start(confirming);
          setConfirming(null);
        }}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
};

export { DeviceActions, type DeviceActionsProps };
