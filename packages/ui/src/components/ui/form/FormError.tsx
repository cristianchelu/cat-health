import * as React from 'react';
import { Callout, type CalloutProps } from '@/components/ui/Callout';

type FormErrorProps = Omit<CalloutProps, 'tone'>;

/**
 * A form's mutation error.
 *
 * A `Callout` under the name the form kit already uses — thirty-odd call sites
 * say `FormError`, and what they mean by it is the error tone.
 */
const FormError = React.forwardRef<HTMLDivElement, FormErrorProps>(
  (props, ref) => <Callout tone="error" ref={ref} {...props} />,
);

FormError.displayName = 'FormError';

export { FormError, type FormErrorProps };
