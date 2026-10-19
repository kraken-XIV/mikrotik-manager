// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { siteGroupsApi, sitesApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { useSiteStore } from '../../store/siteStore';
import { ok } from '../../test/axiosResponse';
import SiteSelector from './SiteSelector';

/**
 * The site picker (issue #130, #306, P1-7). The rules worth pinning: a
 * single-site install never learns the word "site"; the all-sites choice
 * changes scope, not page; what a site-limited account can change follows
 * its roles.
 */
vi.mock('../../services/api', () => ({
  sitesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
  siteGroupsApi: { list: vi.fn() },
}));

const sitesList = vi.mocked(sitesApi.list);
const sitesUpdate = vi.mocked(sitesApi.update);
const groupsList = vi.mocked(siteGroupsApi.list);

function site(id: number, name: string) {
  return {
    id,
    name,
    address: null,
    location_lat: null,
    location_lng: null,
    notes: null,
    is_default: id === 1,
    device_count: 2,
    online_count: 1,
  };
}

function renderSelector(onNavigate?: () => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SiteSelector isCollapsed={false} onNavigate={onNavigate} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  useAuthStore.getState().logout();
  useSiteStore.getState().setCurrentSite(null);
  useSiteStore.getState().setCurrentGroup(null);
  sitesList.mockReset().mockResolvedValue(ok([site(1, 'Site A'), site(2, 'Site B')]));
  groupsList.mockReset().mockResolvedValue(ok([]));
  sitesUpdate.mockReset();
});

describe('SiteSelector', () => {
  it('is hidden entirely while the site list is empty', async () => {
    sitesList.mockResolvedValue(ok([]));
    const { container } = renderSelector();
    await waitFor(() => expect(sitesList).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('names the one site instead of teaching a single-network install the concept', async () => {
    sitesList.mockResolvedValue(ok([site(1, 'Only Net')]));
    renderSelector();
    await screen.findByTitle('Only Net');

    await userEvent.setup().click(screen.getByTitle('Only Net'));
    // One site: nothing to choose between, so no "All sites" row either.
    expect(screen.queryByRole('button', { name: 'All sites' })).not.toBeInTheDocument();
  });

  it('switches to a site from the list and reports the navigation', async () => {
    // A viewer: no rename pencils beside the rows, so the row button is the
    // only match for its name.
    useAuthStore.getState().setAuth('t', { id: 8, username: 'watch', role: 'viewer' });
    const onNavigate = vi.fn();
    renderSelector(onNavigate);
    await screen.findByTitle('All sites');

    const user = userEvent.setup();
    await user.click(screen.getByTitle('All sites'));
    await user.click(screen.getByRole('button', { name: /Site B/ }));

    expect(useSiteStore.getState().currentSiteId).toBe(2);
    expect(onNavigate).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'All sites' })).not.toBeInTheDocument();
  });

  it('returns to the all-sites view without leaving the page', async () => {
    useSiteStore.getState().setCurrentSite(2);
    renderSelector();
    await screen.findByTitle('Site B');

    const user = userEvent.setup();
    await user.click(screen.getByTitle('Site B'));
    await user.click(screen.getByRole('button', { name: 'All sites' }));

    expect(useSiteStore.getState().currentSiteId).toBeNull();
  });

  it('says "All my sites" for an account limited to particular sites', async () => {
    useAuthStore.getState().setAuth('t', {
      id: 5,
      username: 'op',
      role: 'operator',
      siteRoles: { 1: 'operator', 2: 'viewer' },
    });
    renderSelector();
    await screen.findByTitle('All my sites');
  });

  it('hides site management from a viewer', async () => {
    useAuthStore.getState().setAuth('t', { id: 6, username: 'watcher', role: 'viewer' });
    renderSelector();
    await screen.findByTitle('All sites');

    const user = userEvent.setup();
    await user.click(screen.getByTitle('All sites'));
    expect(screen.queryByRole('button', { name: 'New site' })).not.toBeInTheDocument();
    expect(screen.queryByTitle('Rename Site A')).not.toBeInTheDocument();
  });

  it('renames a site as an admin', async () => {
    useAuthStore.getState().setAuth('t', { id: 7, username: 'boss', role: 'admin' });
    sitesUpdate.mockResolvedValue(ok(site(1, 'Site A renamed')));
    renderSelector();
    await screen.findByTitle('All sites');

    const user = userEvent.setup();
    await user.click(screen.getByTitle('All sites'));
    await user.click(screen.getByTitle('Rename Site A'));

    const name = screen.getByPlaceholderText('Site name');
    await user.clear(name);
    await user.type(name, 'Site A renamed');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(sitesUpdate).toHaveBeenCalledWith(1, { name: 'Site A renamed', address: '' }),
    );
    // The form closes once the rename is saved.
    await waitFor(() => expect(screen.queryByPlaceholderText('Site name')).not.toBeInTheDocument());
  });
});
