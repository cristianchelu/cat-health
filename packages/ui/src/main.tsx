import './pwa-register';
import './i18n';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';

import App from './App.tsx';

import Overview from './pages/overview/Overview.tsx';
import Health from './pages/health/Health.tsx';
import Devices from './pages/devices/Devices.tsx';
import DeviceDetails from './pages/devices/DeviceDetails.tsx';
import Settings from './pages/settings/Settings.tsx';
import AddEditPetPage from './pages/settings/AddEditPetPage.tsx';
import AddEditProviderPage from './pages/settings/AddEditProviderPage.tsx';
import AddDevicePage from './pages/settings/AddDevicePage.tsx';
import AddEditFoodPage from './pages/settings/AddEditFoodPage.tsx';

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
        { path: '/devices/:id', element: <DeviceDetails /> },
        { path: '/settings', element: <Settings /> },
        { path: '/settings/pets/new', element: <AddEditPetPage /> },
        { path: '/settings/pets/:id', element: <AddEditPetPage /> },
        { path: '/settings/providers/new', element: <AddEditProviderPage /> },
        { path: '/settings/providers/:id', element: <AddEditProviderPage /> },
        { path: '/settings/devices/new', element: <AddDevicePage /> },
        { path: '/settings/foods/new', element: <AddEditFoodPage /> },
        { path: '/settings/foods/:id', element: <AddEditFoodPage /> },
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
