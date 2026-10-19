import './index.css';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { actionErrorMessage, useActionErrorStore } from './store/actionErrorStore';
import { useAuthStore } from './store/authStore';
import { useSiteStore } from './store/siteStore';
import { initThemeFromStorage } from './store/themeStore';

// Initialize theme (light / dark / system + accent) from storage immediately,
// before the first paint — the same FOUC guard the light/dark toggle always
// had, extended to the system preference and the accent variables.
initThemeFromStorage();

function makeQueryClient() {
  return new QueryClient({
    // A failed action with no error handling of its own is reported, never
    // silent (outside review U5). Mutations that show their error inline mark
    // themselves with meta.inlineError.
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        if (mutation.options.onError || mutation.meta?.inlineError) return;
        useActionErrorStore.getState().report(actionErrorMessage(error));
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

/**
 * Scopes the whole React Query cache to the active site (issue #130).
 *
 * The obvious move -- queryClient.clear() on switch -- does not work, and the
 * reason is worth recording. clear() destroys each Query and drops it from the
 * cache, but a *mounted* observer keeps its own reference and last result, and
 * nothing re-subscribes it. Every already-rendered page therefore went on
 * displaying the previous site's data.
 *
 * Keying the provider on the site is what actually holds: a changed key
 * unmounts the entire subtree and remounts it against a brand-new, empty cache,
 * so every query refetches with the new X-Site-Id header. There is no path by
 * which one site's data can survive into another's view.
 *
 * The cost is a full remount on switch. That is the honest price of changing
 * context, and it only happens when the operator deliberately switches.
 */
function SiteScopedQueryProvider({ children }: { children: React.ReactNode }) {
  const siteId = useSiteStore((s) => s.currentSiteId);
  // A group is a scope too (#306): switching groups is switching context.
  const groupId = useSiteStore((s) => s.currentGroupId);
  // The signed-in user is part of the key too (outside review U1): logging
  // out, or someone else signing in on the same tab, starts an empty cache, so
  // nothing the previous user loaded (users, secret-bearing backups) can show.
  const userId = useAuthStore((s) => (s.isAuthenticated ? (s.user?.id ?? 'session') : 'anon'));
  const key = `${userId}:${siteId != null ? String(siteId) : groupId != null ? `g${groupId}` : 'all'}`;
  // A new cache per site; `key` is the dependency on purpose.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const client = React.useMemo(() => makeQueryClient(), [key]);
  return (
    <QueryClientProvider key={key} client={client}>
      {children}
    </QueryClientProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SiteScopedQueryProvider>
      <App />
    </SiteScopedQueryProvider>
  </React.StrictMode>,
);
