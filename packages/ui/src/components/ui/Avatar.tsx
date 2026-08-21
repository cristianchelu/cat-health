import * as React from 'react';
import { cn } from '@/lib/utils';
import { Cat } from 'lucide-react';
import { FallbackImage } from './FallbackImage';

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
    return (
      <div
        ref={ref}
        className={cn('avatar', size, shape, className)}
        aria-label={alt}
        {...props}
      >
        <FallbackImage
          src={src}
          alt={alt ?? ''}
          imgClassName="avatar-img"
          fallbackClassName="avatar-fallback"
          fallback={
            fallbackIcon ?? (
              <Cat size={size === 'sm' ? 20 : size === 'md' ? 24 : 32} />
            )
          }
        />
      </div>
    );
  },
);

Avatar.displayName = 'Avatar';

export { Avatar };
export default Avatar;
