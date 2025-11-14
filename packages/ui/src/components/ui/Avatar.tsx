import * as React from 'react';
import { cn } from '@/lib/utils';
import { Cat } from 'lucide-react';

import './Avatar.css';

export interface AvatarProps extends React.ComponentProps<'div'> {
  /** Image source URL */
  src?: string;
  /** Accessible alt text (pet name, user name, etc.) */
  alt?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Optional fallback icon to render if image fails or src missing */
  fallbackIcon?: React.ReactNode;
  /** Shape variant */
  shape?: 'circle' | 'rounded';
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  (
    {
      src,
      alt,
      size = 'md',
      fallbackIcon,
      shape = 'circle',
      className,
      ...props
    },
    ref,
  ) => {
    const [failed, setFailed] = React.useState(false);
    const shouldShowImg = src && !failed;
    return (
      <div
        ref={ref}
        className={cn('avatar', size, shape, className)}
        aria-label={alt}
        {...props}
      >
        {shouldShowImg ? (
          <img
            src={src}
            alt={alt}
            className={cn('avatar-img')}
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="avatar-fallback">
            {fallbackIcon || (
              <Cat size={size === 'sm' ? 20 : size === 'md' ? 24 : 32} />
            )}
          </div>
        )}
      </div>
    );
  },
);

Avatar.displayName = 'Avatar';

export { Avatar };
export default Avatar;
