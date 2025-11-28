import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Outlet } from 'react-router';
import Sidebar from './components/layout/Sidebar';
import MobileNav from './components/navigation/MobileNav';
import PetSelector from './components/navigation/PetSelector';
import { PetProvider } from './contexts/PetProvider';

import './App.css';

function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <PetProvider>
        <div id="app">
          <Sidebar
            isCollapsed={isSidebarCollapsed}
            onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          />
          <PetSelector variant="mobile" />
          <main>
            <div id="content">
              <Outlet />
            </div>
          </main>
          <MobileNav />
        </div>
      </PetProvider>
    </QueryClientProvider>
  );
}

export default App;
