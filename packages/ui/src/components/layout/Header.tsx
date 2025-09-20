import * as React from 'react';
import { Link } from 'react-router';
import { Menu, RefreshCw, X } from 'lucide-react';
import { useMigrateMutation } from '@/hooks/queries/scriptQueries';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

import './Header.css';

const Header: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const {mutate: migrate, isPending: isMigrating} = useMigrateMutation();

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <header className="app-header">
      <div className="logo">
        <Link to="/">Pet Assistant</Link>
      </div>

      {/* Desktop Menu */}
      <div className="desktop-menu">
        <nav className="main-nav">
          <Link to="/" className="nav-link">Pets</Link>
          <Link to="/devices" className="nav-link">Devices</Link>
        </nav>
        <div className="user-menu">
          <Button
            variant="ghost"
            onClick={() => migrate()}
            disabled={isMigrating}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <RefreshCw size={16} className={isMigrating ? 'animate-spin' : ''} />
            {isMigrating ? 'Syncing...' : 'Sync'}
          </Button>
          <Button variant="ghost">Settings</Button>
        </div>
      </div>

      {/* Mobile Menu Toggle */}
      <div className="mobile-menu-toggle">
        <Button variant="ghost" onClick={toggleMenu} aria-label="Toggle menu">
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </Button>
      </div>

      {/* Mobile Menu */}
      <div className={cn('mobile-menu', { 'is-open': isMenuOpen })}>
        <nav className="main-nav">
          <Link to="/" className="nav-link" onClick={() => setIsMenuOpen(false)}>Pets</Link>
          <Link to="/devices" className="nav-link" onClick={() => setIsMenuOpen(false)}>Devices</Link>
        </nav>
        <div className="user-menu">
          <Button
            variant="ghost"
            onClick={() => { migrate(); setIsMenuOpen(false); }}
            disabled={isMigrating}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <RefreshCw size={16} className={isMigrating ? 'animate-spin' : ''} />
            {isMigrating ? 'Syncing...' : 'Sync'}
          </Button>
          <Button variant="ghost" onClick={() => setIsMenuOpen(false)}>Settings</Button>
        </div>
      </div>
    </header>
  );
};

export default Header;
