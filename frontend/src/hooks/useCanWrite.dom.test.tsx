// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '../store/authStore';
import { useSiteStore } from '../store/siteStore';
import { useCanWrite, useIsSiteScoped } from './useCanWrite';

/**
 * Write-control visibility (P1-7). The server enforces the real rule per
 * device; this hook decides whether controls are offered at all, and it must
 * agree with the server: an operator in one site is a reader in another.
 */
describe('useCanWrite', () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
    act(() => {
      useSiteStore.getState().setCurrentSite(null);
      useSiteStore.getState().setCurrentGroup(null);
    });
  });

  it('does not offer writes to an anonymous user', () => {
    expect(renderHook(() => useCanWrite()).result.current).toBe(false);
  });

  it('lets a fleet-wide admin write', () => {
    act(() => useAuthStore.getState().setAuth('t', { id: 1, username: 'a', role: 'admin' }));
    expect(renderHook(() => useCanWrite()).result.current).toBe(true);
  });

  it('a viewer never sees write controls', () => {
    act(() => useAuthStore.getState().setAuth('t', { id: 2, username: 'v', role: 'viewer' }));
    expect(renderHook(() => useCanWrite()).result.current).toBe(false);
  });

  it('a site-limited operator writes only in a site they operate', () => {
    act(() =>
      useAuthStore.getState().setAuth('t', {
        id: 3,
        username: 'op',
        role: 'operator',
        siteRoles: { 2: 'operator', 3: 'viewer' },
      }),
    );
    const { result } = renderHook(() => useCanWrite());

    act(() => useSiteStore.getState().setCurrentSite(2));
    expect(result.current).toBe(true);

    act(() => useSiteStore.getState().setCurrentSite(3));
    expect(result.current).toBe(false);
  });

  it('falls back to the interface role in the all-sites view', () => {
    // Two sites: reconcile leaves the account on the all-sites view, where
    // no per-site role applies and the interface role decides.
    act(() =>
      useAuthStore.getState().setAuth('t', {
        id: 3,
        username: 'op',
        role: 'operator',
        siteRoles: { 2: 'operator', 3: 'viewer' },
      }),
    );
    expect(useSiteStore.getState().currentSiteId).toBeNull();
    expect(renderHook(() => useCanWrite()).result.current).toBe(true);
  });
});

describe('useIsSiteScoped', () => {
  it('is true exactly when the account is limited to sites', () => {
    act(() =>
      useAuthStore
        .getState()
        .setAuth('t', { id: 4, username: 'op', role: 'operator', siteRoles: { 2: 'operator' } }),
    );
    expect(renderHook(() => useIsSiteScoped()).result.current).toBe(true);

    act(() => useAuthStore.getState().setAuth('t', { id: 5, username: 'fleet', role: 'admin' }));
    expect(renderHook(() => useIsSiteScoped()).result.current).toBe(false);
  });
});
