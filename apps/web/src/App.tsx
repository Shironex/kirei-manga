import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { ToastContainer } from './components/system/ToastContainer';
import { useAppearance } from './hooks/useAppearance';

export default function App() {
  // Subscribe the document root to settings.appearance.
  useAppearance();

  return (
    <>
      <RouterProvider router={router} />
      <ToastContainer />
    </>
  );
}
