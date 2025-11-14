import React from 'react';
import { cn } from '@/lib/utils';

export interface LitterboxIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string; // Accept number (px) or string (e.g. '1em')
}

const LitterboxIcon = React.forwardRef<SVGSVGElement, LitterboxIconProps>(
  ({ size = 24, className, strokeWidth = 2, ...props }, ref) => {
    const dimension = typeof size === 'number' ? size : size;
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={dimension}
        height={dimension}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn('litterbox-icon', className)}
        aria-label="Litterbox icon"
        role="img"
        {...props}
      >
        <path d="M2 9.5h20" />
        <path d="M3.5 9.5 5.5 18.5h13l2-9" />
        <path d="M6 18.5h12" />
        <path d="M9.5 14.5c.5-1 1.5-1.5 2.5-1.5s2 .5 2.5 1.5" />
      </svg>
    );
  },
);

LitterboxIcon.displayName = 'LitterboxIcon';

export { LitterboxIcon };
export default LitterboxIcon;
