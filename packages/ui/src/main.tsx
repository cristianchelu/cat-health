import './pwa-register';
import './i18n';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';

import App from './App.tsx';

import Overview from './pages/overview/Overview.tsx';
import LitterboxDetails from './pages/overview/LitterboxDetails.tsx';
import Health from './pages/health/Health.tsx';
import Devices from './pages/devices/Devices.tsx';
import DeviceDetails from './pages/devices/DeviceDetails.tsx';
import DeviceAnnotationPage from './pages/devices/DeviceAnnotationPage.tsx';
import Settings from './pages/settings/Settings.tsx';
import LanguageRegionPage from './pages/settings/LanguageRegionPage.tsx';
import AddEditPetPage from './pages/settings/AddEditPetPage.tsx';
import ProviderWizardPage from './pages/settings/provider-wizard/ProviderWizardPage';
import ProvidersPage from './pages/settings/providers/ProvidersPage';
import ProviderAccountPage from './pages/settings/providers/ProviderAccountPage';
import AddEditFoodPage from './pages/settings/AddEditFoodPage.tsx';
import EditDevicePage from './pages/settings/EditDevicePage.tsx';

import { petSelectorRouteHandle } from './router/routeHandle';

import './index.css';

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <App />,
      children: [
        { path: '/', element: <Overview />, handle: petSelectorRouteHandle },
        {
          path: '/overview/litterbox',
          element: <LitterboxDetails />,
          handle: petSelectorRouteHandle,
        },
        {
          path: '/health',
          element: <Health />,
          handle: petSelectorRouteHandle,
        },
        { path: '/devices', element: <Devices /> },
        { path: '/devices/:id/annotate', element: <DeviceAnnotationPage /> },
        { path: '/devices/:id', element: <DeviceDetails /> },
        { path: '/settings', element: <Settings /> },
        { path: '/settings/language-region', element: <LanguageRegionPage /> },
        { path: '/settings/pets/new', element: <AddEditPetPage /> },
        { path: '/settings/pets/:id', element: <AddEditPetPage /> },
        { path: '/settings/providers', element: <ProvidersPage /> },
        {
          path: '/settings/providers/new',
          element: <ProviderWizardPage entry="connect" />,
        },
        { path: '/settings/providers/:id', element: <ProviderAccountPage /> },
        {
          path: '/settings/devices/new',
          element: <ProviderWizardPage entry="add-device" />,
        },
        { path: '/settings/devices/:id', element: <EditDevicePage /> },
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
