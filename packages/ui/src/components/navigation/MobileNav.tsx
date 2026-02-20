import React from 'react';
import { useTranslation } from 'react-i18next';
import { HeartPulse, Settings, TabletSmartphone, Stethoscope } from 'lucide-react';
import { NavLink } from 'react-router';

import { cn } from '@/lib/utils';

import './MobileNav.css';

const MobileNav: React.FC = () => {
  const { t } = useTranslation();

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
        {navigationItems.map((item) => (
          <li key={item.path}>
            <NavLink
              to={item.path}
              className={({ isActive }) => cn({ active: isActive })}
              title={item.label}
              end={item.path === '/'}
            >
              <span>{item.icon}</span>
              <label>{item.label}</label>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default MobileNav;
