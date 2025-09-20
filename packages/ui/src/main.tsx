import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import PetList from './pages/PetList';
import PetDetail from './pages/PetDetail';
import DeviceList from './pages/DeviceList';
import DeviceDetail from './pages/DeviceDetail';
import { createBrowserRouter, RouterProvider } from 'react-router';

import './index.css';

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <App />,
      children: [
        { path: '/', element: <PetList /> },
        { path: '/pets/:id', element: <PetDetail /> },
        { path: '/devices', element: <DeviceList /> },
        { path: '/devices/:id', element: <DeviceDetail /> },
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
