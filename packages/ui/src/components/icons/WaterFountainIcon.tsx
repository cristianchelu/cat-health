import React from 'react';
import { cn } from '@/lib/utils';

export interface WaterFountainIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

const WaterFountainIcon = React.forwardRef<
  SVGSVGElement,
  WaterFountainIconProps
>(({ size = 24, className, strokeWidth = 2, ...props }, ref) => {
  const dimension = size;
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
      className={cn('water-fountain-icon', className)}
      aria-label="Water fountain icon"
      role="img"
      {...props}
    >
      <path d="m 2,16 a 4,4 0 0 0 4,4 h 12 a 4,4 0 0 0 4,-4 z" />
      <path d="M 6,7 C 6,5.343146 7.3431458,4 9,4 v 0 c 1.656854,0 3,1.343146 3,3 v 5" />
      <circle cx="6" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="18" cy="10" r="1" fill="currentColor" stroke="none" />
      <path d="M 18,7 C 18,5.343146 16.656854,4 15,4 v 0 c -1.656854,0 -3,1.343146 -3,3 v 5" />
    </svg>
  );
});

WaterFountainIcon.displayName = 'WaterFountainIcon';

export { WaterFountainIcon };
export default WaterFountainIcon;
