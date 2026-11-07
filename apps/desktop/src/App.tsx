import { useState } from 'react';
import { RouterProvider } from '@tanstack/react-router';

import { TooltipProvider } from '@/components/ui/tooltip';
import { useAppearanceSettings } from '@/lib/settings/appearance';
import { useCoverTheme } from '@/lib/theme/coverTheme';

import { createAppRouter } from './app/router';

export function App() {
  const [router] = useState(createAppRouter);
  useAppearanceSettings();
  useCoverTheme();
  return (
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  );
}
