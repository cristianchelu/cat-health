import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';

import {
  HeartPulse,
  Settings,
  TabletSmartphone,
  Stethoscope,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';

import { cn } from '@/lib/utils';

import PetSelector from '@/components/navigation/PetSelector';
import { isPrimaryNavActive } from '@/components/navigation/isPrimaryNavActive';

import './Sidebar.css';

interface SidebarProps {
  isCollapsed?: boolean;
  onToggle?: () => void;
  showPetSelector?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed = false,
  onToggle,
  showPetSelector = false,
}) => {
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
    <aside className={cn('sidebar', isCollapsed && 'collapsed')}>
      <div className="content">
        <nav>
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
        {showPetSelector ? (
          <section>
            <h4 className="section-label">{t('navigation.pets')}</h4>
            <PetSelector />
          </section>
        ) : null}
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
          <span className="toggle-icon">
            {isCollapsed ? <ArrowRight size="1em" /> : <ArrowLeft size="1em" />}
          </span>
        </button>
      )}
    </aside>
  );
};

export default Sidebar;
