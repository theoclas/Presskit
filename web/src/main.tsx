import '@fontsource-variable/inter/wght.css';
import 'virtual:palettes.css';
import './public/styles/base.css';
import './public/dj/dj-template.css';
import './public/dj/dj-additions.css';
import './public/index/index.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { createQueryClient } from './app/queryClient';
import { applyPalette } from './lib/palette';
import { forgetInitialScroll } from './lib/scroll';
import { routes } from './routes';

// El servidor ya escribió data-palette en <html> (shell SEO): se aplica antes del primer render.
applyPalette(document.documentElement.dataset.palette);

forgetInitialScroll();

const queryClient = createQueryClient();
const router = createBrowserRouter(routes);

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
}
