import React from 'react';
import { Activity, HeartPulse, Settings, TabletSmartphone } from 'lucide-react';
import { NavLink } from 'react-router';

import { cn } from '@/lib/utils';

import './MobileNav.css';

const navigationItems = [
  { path: '/', label: 'Overview', icon: <Activity /> },
  { path: '/health', label: 'Health', icon: <HeartPulse /> },
  { path: '/devices', label: 'Devices', icon: <TabletSmartphone /> },
  { path: '/settings', label: 'Settings', icon: <Settings /> },
];

const MobileNav: React.FC = () => {
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
