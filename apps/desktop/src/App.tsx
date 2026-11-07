import { useState } from 'react';
import { RouterProvider } from '@tanstack/react-router';

import { TooltipProvider } from '@/components/ui/tooltip';

import { createAppRouter } from './app/router';

export function App() {
  const [router] = useState(createAppRouter);
  return (
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  );
}
