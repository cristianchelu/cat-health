import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Outlet } from 'react-router';
import { postMigrate } from './api/scripts';
import Header from './components/layout/Header';

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
        <Header isMigrating={isMigrating} onMigrate={handleMigrate} />
        
        <main className="app-main">
          <div className="container">
            <Outlet />
          </div>
        </main>
      </div>
    </QueryClientProvider>
  );
}

export default App;