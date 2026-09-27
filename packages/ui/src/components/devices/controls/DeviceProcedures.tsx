import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { ProcedureDescriptor } from 'shared';
import { DashboardTile } from '@/components/layout/DashboardTile';
import { useRunProcedureStep } from '@/hooks/queries/deviceQueries';
import { deviceWriteErrorMessage } from '@/lib/deviceControlErrors';
import { controlLabel } from '@/lib/deviceControlLabels';
import { ActionTile } from './ActionTile';
import { ProcedureWizardDialog } from './ProcedureWizardDialog';
import { isProcedureRunnable, parseStepInputs } from './procedureInputs';

interface DeviceProceduresProps {
  deviceId: number;
  procedures: ProcedureDescriptor[];
}

interface Run {
  procedure: ProcedureDescriptor;
  stepIndex: number;
  drafts: Record<string, string>;
  error?: string;
}

/**
 * A tile per procedure, and the wizard that walks one step at a time. Each
 * step answers once the device is done with it; a refused step stays on
 * screen with the device's reason, so the person can fix it and try again.
 */
const DeviceProcedures: React.FC<DeviceProceduresProps> = ({
  deviceId,
  procedures,
}) => {
  const { t } = useTranslation();
  const runStep = useRunProcedureStep(deviceId);
  const [run, setRun] = React.useState<Run | null>(null);

  const step = run?.procedure.steps[run.stepIndex];
  const isLast = run ? run.stepIndex === run.procedure.steps.length - 1 : false;

  const submit = () => {
    if (!run || !step) return;
    const inputs = parseStepInputs(step, run.drafts);
    if (!inputs) {
      setRun({ ...run, error: t('devices.controls.invalid_value') });
      return;
    }
    setRun({ ...run, error: undefined });
    runStep
      .mutateAsync({ key: run.procedure.key, step: step.key, inputs })
      .then(() =>
        setRun(
          isLast
            ? null
            : { ...run, stepIndex: run.stepIndex + 1, error: undefined },
        ),
      )
      .catch((error: unknown) =>
        setRun({
          ...run,
          error: deviceWriteErrorMessage(
            error,
            t,
            t('devices.controls.run_failed'),
          ),
        }),
      );
  };

  return (
    <>
      {procedures.map((procedure) => (
        <DashboardTile key={procedure.key}>
          <ActionTile
            label={controlLabel(procedure.label, t)}
            runLabel={t('devices.controls.start')}
            onRun={() => setRun({ procedure, stepIndex: 0, drafts: {} })}
            disabled={!procedure.available || !isProcedureRunnable(procedure)}
          />
        </DashboardTile>
      ))}
      {run && step ? (
        <ProcedureWizardDialog
          open
          title={controlLabel(run.procedure.label, t)}
          progress={t('devices.controls.step_progress', {
            current: run.stepIndex + 1,
            total: run.procedure.steps.length,
          })}
          instruction={controlLabel(step.instruction, t)}
          inputs={step.inputs.map((input) => ({
            key: input.key,
            label: controlLabel(input.label, t),
            value: run.drafts[input.key] ?? '',
            ...(input.type.kind === 'number'
              ? {
                  unit: input.type.unit,
                  min: input.type.min,
                  max: input.type.max,
                  step: input.type.step,
                }
              : {}),
          }))}
          onInputChange={(key, value) =>
            setRun({ ...run, drafts: { ...run.drafts, [key]: value } })
          }
          error={run.error}
          busy={runStep.isPending}
          cancelLabel={t('common.cancel')}
          submitLabel={
            isLast
              ? t('devices.controls.finish')
              : t('devices.controls.continue')
          }
          onCancel={() => setRun(null)}
          onSubmit={submit}
        />
      ) : null}
    </>
  );
};

export { DeviceProcedures, type DeviceProceduresProps };
