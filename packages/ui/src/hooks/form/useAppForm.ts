import {
  useForm,
  type FieldValues,
  type UseFormProps,
  type UseFormReturn,
} from 'react-hook-form';
import * as React from 'react';

interface UseAppFormResult<
  TFieldValues extends FieldValues,
> extends UseFormReturn<TFieldValues> {
  /** If dirty, opens discard confirm; otherwise runs `onProceed`. */
  requestDiscard: (onProceed: () => void) => void;
  /** If dirty, opens discard confirm then resets; if clean, no-op. */
  requestReset: () => void;
  discardConfirm: {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  };
}

function useAppForm<TFieldValues extends FieldValues = FieldValues>(
  props?: UseFormProps<TFieldValues>,
): UseAppFormResult<TFieldValues> {
  const form = useForm<TFieldValues>({
    mode: 'onChange',
    ...props,
  });

  const [discardOpen, setDiscardOpen] = React.useState(false);
  const pendingProceedRef = React.useRef<(() => void) | null>(null);
  const valuesBaselineRef = React.useRef(props?.values);

  React.useEffect(() => {
    valuesBaselineRef.current = props?.values;
  }, [props?.values]);

  const onCancelDiscard = React.useCallback(() => {
    pendingProceedRef.current = null;
    setDiscardOpen(false);
  }, []);

  const onConfirmDiscard = React.useCallback(() => {
    const proceed = pendingProceedRef.current;
    pendingProceedRef.current = null;
    setDiscardOpen(false);
    form.reset(valuesBaselineRef.current);
    proceed?.();
  }, [form]);

  const requestDiscard = React.useCallback(
    (onProceed: () => void) => {
      if (!form.formState.isDirty) {
        onProceed();
        return;
      }
      pendingProceedRef.current = onProceed;
      setDiscardOpen(true);
    },
    [form.formState.isDirty],
  );

  const requestReset = React.useCallback(() => {
    requestDiscard(() => undefined);
  }, [requestDiscard]);

  const discardConfirm = React.useMemo(
    () => ({
      open: discardOpen,
      onConfirm: onConfirmDiscard,
      onCancel: onCancelDiscard,
    }),
    [discardOpen, onCancelDiscard, onConfirmDiscard],
  );

  return {
    ...form,
    requestDiscard,
    requestReset,
    discardConfirm,
  };
}

export { useAppForm, type UseAppFormResult };
