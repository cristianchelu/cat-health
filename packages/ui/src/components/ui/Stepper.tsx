import * as React from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import './Stepper.css';

interface Step {
  label: string;
  description?: string;
}

interface StepperProps extends React.ComponentProps<'div'> {
  steps: Step[];
  currentStep: number;
}

const Stepper = React.forwardRef<HTMLDivElement, StepperProps>(
  ({ className, steps, currentStep, ...props }, ref) => {
    return (
      <div className={cn('stepper', className)} ref={ref} {...props}>
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;

          return (
            <div
              key={index}
              className={cn('step-item', {
                completed: isCompleted,
                current: isCurrent,
              })}
            >
              <div className="step-indicator">
                {isCompleted ? <Check size={16} /> : stepNumber}
              </div>
              <div className="step-label">{step.label}</div>
              <div className="step-connector" />
            </div>
          );
        })}
      </div>
    );
  },
);

Stepper.displayName = 'Stepper';

export { type Step, type StepperProps };
export default Stepper;
