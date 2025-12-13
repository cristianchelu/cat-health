import * as React from 'react';
import { cn } from '@/lib/utils';
import './Tabs.css';

interface TabsProps extends React.ComponentProps<'div'> {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface TabsListProps extends React.ComponentProps<'div'> {}

interface TabsTriggerProps extends React.ComponentProps<'button'> {
  value: string;
}

interface TabsContentProps extends React.ComponentProps<'div'> {
  value: string;
}

const TabsContext = React.createContext<{
  value: string;
  onValueChange: (value: string) => void;
} | null>(null);

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  (
    { className, defaultValue, value, onValueChange, children, ...props },
    ref,
  ) => {
    const [internalValue, setInternalValue] = React.useState(
      defaultValue || '',
    );

    const currentValue = value !== undefined ? value : internalValue;
    const handleValueChange = React.useCallback(
      (newValue: string) => {
        if (value === undefined) {
          setInternalValue(newValue);
        }
        onValueChange?.(newValue);
      },
      [value, onValueChange],
    );

    return (
      <TabsContext.Provider
        value={{ value: currentValue, onValueChange: handleValueChange }}
      >
        <div className={cn('tabs', className)} ref={ref} {...props}>
          {children}
        </div>
      </TabsContext.Provider>
    );
  },
);

const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className={cn('tabs-list', className)} ref={ref} {...props}>
        {children}
      </div>
    );
  },
);

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, children, ...props }, ref) => {
    const context = React.useContext(TabsContext);
    if (!context) {
      throw new Error('TabsTrigger must be used within Tabs');
    }

    const isActive = context.value === value;

    return (
      <button
        className={cn(
          'tabs-trigger',
          isActive && 'tabs-trigger-active',
          className,
        )}
        onClick={() => context.onValueChange(value)}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    );
  },
);

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, children, ...props }, ref) => {
    const context = React.useContext(TabsContext);
    if (!context) {
      throw new Error('TabsContent must be used within Tabs');
    }

    if (context.value !== value) {
      return null;
    }

    return (
      <div className={cn('tabs-content', className)} ref={ref} {...props}>
        {children}
      </div>
    );
  },
);

Tabs.displayName = 'Tabs';
TabsList.displayName = 'TabsList';
TabsTrigger.displayName = 'TabsTrigger';
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsList, TabsTrigger, TabsContent };
export type { TabsProps, TabsListProps, TabsTriggerProps, TabsContentProps };
