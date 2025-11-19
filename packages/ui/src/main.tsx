import './pwa-register';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';

import App from './App.tsx';

import Overview from './pages/overview/Overview.tsx';
import Health from './pages/health/Health.tsx';
import Devices from './pages/devices/Devices.tsx';
import Settings from './pages/settings/Settings.tsx';
import AddEditPetPage from './pages/settings/AddEditPetPage.tsx';

import './index.css';

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <App />,
      children: [
        { path: '/', element: <Overview /> },
        { path: '/health', element: <Health /> },
        { path: '/devices', element: <Devices /> },
        { path: '/settings', element: <Settings /> },
        { path: '/settings/pets/new', element: <AddEditPetPage /> },
        { path: '/settings/pets/:id', element: <AddEditPetPage /> },
      ],
    },
  ],
  {
    basename: window.baseUrl,
  },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
