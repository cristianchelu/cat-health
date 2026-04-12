import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Outlet, useMatches } from 'react-router';
import Sidebar from './components/layout/Sidebar';
import MobileNav from './components/navigation/MobileNav';
import PetSelector from './components/navigation/PetSelector';
import { PetProvider } from './contexts/PetProvider';
import { matchShowsPetSelector } from './router/routeHandle';

import './App.css';

const queryClient = new QueryClient();

if (import.meta.env.DEV) {
  window.__TANSTACK_QUERY_CLIENT__ = queryClient;
}

function App() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const showPetSelector = useMatches().some(matchShowsPetSelector);

  return (
    <QueryClientProvider client={queryClient}>
      <PetProvider>
        <div id="app">
          <Sidebar
            isCollapsed={isSidebarCollapsed}
            onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            showPetSelector={showPetSelector}
          />
          {showPetSelector ? <PetSelector variant="mobile" /> : null}
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
