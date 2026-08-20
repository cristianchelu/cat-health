import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Outlet, useMatches } from 'react-router';
import Sidebar from './components/layout/Sidebar';
import MobileNav from './components/navigation/MobileNav';
import { PetProvider } from './contexts/PetProvider';
import RegionalPreferencesProvider from './contexts/RegionalPreferencesProvider';
import { TooltipProvider } from './components/ui/Tooltip';
import { PageAddFabSlot } from './components/ui/PageAddAction';
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
        <RegionalPreferencesProvider>
          <TooltipProvider delayDuration={300}>
            <div id="app">
              <Sidebar
                isCollapsed={isSidebarCollapsed}
                onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                showPetSelector={showPetSelector}
              />
              <main>
                <div id="content">
                  <Outlet />
                </div>
              </main>
              {/* Sits between the scroll area and the nav on purpose — that
                  seam is what the mobile FAB anchors to. */}
              <PageAddFabSlot />
              <MobileNav />
            </div>
          </TooltipProvider>
        </RegionalPreferencesProvider>
      </PetProvider>
    </QueryClientProvider>
  );
}

export default App;
