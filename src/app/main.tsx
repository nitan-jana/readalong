import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { Shell, Home, Project } from './App';
import { PlayerPage } from '../features/player/ui/PlayerPage';
import './app.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'r/:id', element: <Project /> },
    ],
  },
  // the player is a full screen of its own (it's also what a phone sees through "Share to phone")
  { path: '/r/:id/play', element: <PlayerPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
]);

createRoot(document.getElementById('root')!).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
