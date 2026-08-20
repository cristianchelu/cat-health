import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  HeartPulse,
  Settings,
  TabletSmartphone,
  Stethoscope,
} from 'lucide-react';
import { Link, useLocation } from 'react-router';

import { cn } from '@/lib/utils';

import { isPrimaryNavActive } from '@/components/navigation/isPrimaryNavActive';

import './MobileNav.css';

const MobileNav: React.FC = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  const navigationItems = [
    { path: '/', label: t('navigation.overview'), icon: <HeartPulse /> },
    { path: '/health', label: t('navigation.health'), icon: <Stethoscope /> },
    {
      path: '/devices',
      label: t('navigation.devices'),
      icon: <TabletSmartphone />,
    },
    { path: '/settings', label: t('navigation.settings'), icon: <Settings /> },
  ];

  return (
    <nav className="mobile-nav">
      <ul>
        {navigationItems.map((item) => {
          const isActive = isPrimaryNavActive(item.path, pathname);
          return (
            <li key={item.path}>
              <Link
                to={item.path}
                className={cn({ active: isActive })}
                title={item.label}
                aria-current={isActive ? 'page' : undefined}
              >
                <span>{item.icon}</span>
                <label>{item.label}</label>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default MobileNav;
