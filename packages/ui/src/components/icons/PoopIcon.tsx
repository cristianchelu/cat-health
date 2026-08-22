import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface PoopIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

const PoopIcon = React.forwardRef<SVGSVGElement, PoopIconProps>(
  ({ size = 24, className, strokeWidth = 2, ...props }, ref) => {
    const { t } = useTranslation();
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
        className={cn('poop-icon', className)}
        aria-label={t('common.poop_icon_alt')}
        role="img"
        {...props}
      >
        <path d="M10 3.5c2.8.4 3.2 2.6 1.9 4.1h1.4a3 3 0 0 1 .6 6h1.2a3.2 3.2 0 0 1 0 6.4H7a3.2 3.2 0 0 1 0-6.4h1.2a3 3 0 0 1 .6-6" />
      </svg>
    );
  },
);

PoopIcon.displayName = 'PoopIcon';

export { PoopIcon };
export default PoopIcon;
