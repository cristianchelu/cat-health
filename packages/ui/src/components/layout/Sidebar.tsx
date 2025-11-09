import React from 'react';
import { NavLink } from 'react-router';

import { Activity, HeartPulse, Settings, TabletSmartphone } from 'lucide-react';

import { cn } from '@/lib/utils';

import PetSelector from '@/components/navigation/PetSelector';

import './Sidebar.css';

interface SidebarProps {
  isCollapsed?: boolean;
  onToggle?: () => void;
}

const navigationItems = [
  { path: '/', label: 'Overview', icon: <Activity /> },
  { path: '/health', label: 'Health', icon: <HeartPulse /> },
  { path: '/devices', label: 'Devices', icon: <TabletSmartphone /> },
  { path: '/settings', label: 'Settings', icon: <Settings /> },
];

const Sidebar: React.FC<SidebarProps> = ({ isCollapsed = false, onToggle }) => {
  return (
    <aside className={cn('sidebar', isCollapsed && 'collapsed')}>
      <div className="content">
        <section>
          <h4>Pets</h4>
          <PetSelector />
        </section>
        <nav>
          <h4>Navigation</h4>
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
      </div>

      {/* Collapse Toggle Button */}
      {onToggle && (
        <button
          className="toggle"
          onClick={onToggle}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className="toggle-icon">{isCollapsed ? '→' : '←'}</span>
        </button>
      )}
    </aside>
  );
};

export default Sidebar;
