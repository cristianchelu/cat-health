import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Outlet, Link } from 'react-router';
import { Button } from './components/ui/Button';
import { RefreshCw } from 'lucide-react';
import { postMigrate } from './api/scripts';

import './app.css';
import '@/components/ui/layout.css';

function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [isMigrating, setIsMigrating] = useState(false);

  const handleMigrate = async () => {
    setIsMigrating(true);
    try {
      const response = await postMigrate();

      if (!response.ok) {
        throw new Error('Migration failed');
      }
      
      console.log('Migration completed successfully');
    } catch (error) {
      console.error('Migration failed:', error);
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app-layout">
        <header className="app-header">
          <div className="logo">
            <Link to="/">Pet Health Dashboard</Link>
          </div>
          <nav className="main-nav">
            <Link to="/" className="nav-link">Pets</Link>
            <Link to="/devices" className="nav-link">Devices</Link>
          </nav>
          <div className="user-menu">
            <Button 
              variant="ghost" 
              onClick={handleMigrate} 
              disabled={isMigrating}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <RefreshCw size={16} className={isMigrating ? 'animate-spin' : ''} />
              {isMigrating ? 'Syncing...' : 'Sync'}
            </Button>
            <Button variant="ghost">Settings</Button>
          </div>
        </header>
        
        <main className="app-main">
          <div className="container">
            <Outlet />
          </div>
        </main>
        
        <footer className="app-footer">
          <div className="container">
            <p className="copyright">&copy; {new Date().getFullYear()} Pet Health Dashboard</p>
          </div>
        </footer>
      </div>
    </QueryClientProvider>
  );
}

export default App;