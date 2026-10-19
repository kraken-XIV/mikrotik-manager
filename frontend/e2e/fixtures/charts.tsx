import '../../src/index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GraphsTab from '../../src/components/device-detail/GraphsTab';
import ThemeMenu from '../../src/components/common/ThemeMenu';
import { initThemeFromStorage } from '../../src/store/themeStore';

initThemeFromStorage();
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <div style={{ maxWidth: 900, margin: '40px auto' }}>
      <ThemeMenu />
      <GraphsTab deviceId={1} />
    </div>
  </QueryClientProvider>,
);
