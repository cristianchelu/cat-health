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
        <path d="M4 19.5c0-2.6 2.1-4.6 4.7-4.6h6.6c2.6 0 4.7 2 4.7 4.6" />
        <path d="M6.5 15.2c0-2.2 1.8-4 4.1-4h2.8c2.3 0 4.1 1.8 4.1 4" />
        <path d="M9.5 11.2c0-1.9 1.6-3.4 3.5-3.4 1.4 0 2.7.7 3.2 2" />
        <path d="M12.5 7c-.9-.6-1.3-1.8-.7-2.7.4-.7 1.1-1.2 2-1.2.5 0 1 .1 1.5.4" />
        <path d="M4 19.5h16" />
      </svg>
    );
  },
);

PoopIcon.displayName = 'PoopIcon';

export { PoopIcon };
export default PoopIcon;
