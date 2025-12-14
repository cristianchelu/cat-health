import React from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';

import { Activity, HeartPulse, Settings, TabletSmartphone } from 'lucide-react';

import { cn } from '@/lib/utils';

import PetSelector from '@/components/navigation/PetSelector';

import './Sidebar.css';

interface SidebarProps {
  isCollapsed?: boolean;
  onToggle?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isCollapsed = false, onToggle }) => {
  const { t } = useTranslation();

  const navigationItems = [
    { path: '/', label: t('navigation.overview'), icon: <Activity /> },
    { path: '/health', label: t('navigation.health'), icon: <HeartPulse /> },
    {
      path: '/devices',
      label: t('navigation.devices'),
      icon: <TabletSmartphone />,
    },
    { path: '/settings', label: t('navigation.settings'), icon: <Settings /> },
  ];

  return (
    <aside className={cn('sidebar', isCollapsed && 'collapsed')}>
      <div className="content">
        <nav>
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
        <section>
          <h4>{t('navigation.pets')}</h4>
          <PetSelector />
        </section>
      </div>

      {/* Collapse Toggle Button */}
      {onToggle && (
        <button
          className="toggle"
          onClick={onToggle}
          title={
            isCollapsed
              ? t('navigation.expand_sidebar')
              : t('navigation.collapse_sidebar')
          }
        >
          <span className="toggle-icon">{isCollapsed ? '→' : '←'}</span>
        </button>
      )}
    </aside>
  );
};

export default Sidebar;
