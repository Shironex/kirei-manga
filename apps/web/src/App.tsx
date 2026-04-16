import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { ToastContainer } from './components/system/ToastContainer';

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <ToastContainer />
    </>
  );
}
