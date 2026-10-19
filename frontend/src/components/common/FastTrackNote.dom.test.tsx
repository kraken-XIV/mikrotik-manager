// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FastTrackNote from './FastTrackNote';
import { devicesApi } from '../../services/api';
import { ok } from '../../test/axiosResponse';

/**
 * The queue warning (#280): shown wherever a simple queue is created on a
 * device that FastTracks connections, because FastTracked traffic skips
 * queues and the limit would quietly do nothing for most traffic.
 */
vi.mock('../../services/api', () => ({
  devicesApi: { getFirewall: vi.fn() },
}));

const getFirewall = vi.mocked(devicesApi.getFirewall);

function renderNote({ compact = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FastTrackNote deviceId={7} compact={compact} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getFirewall.mockReset();
});

describe('FastTrackNote', () => {
  it('stays quiet when the filter table has no FastTrack rule', async () => {
    getFirewall.mockResolvedValue(ok([{ action: 'accept', chain: 'forward' }]));
    const { container } = renderNote();
    await waitFor(() => expect(getFirewall).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('warns when connections are FastTracked', async () => {
    getFirewall.mockResolvedValue(ok([{ action: 'fasttrack-connection', chain: 'forward' }]));
    renderNote();
    await screen.findByText(/FastTracked traffic skips queues/);
    expect(screen.getByText(/exclude it from FastTrack/)).toBeInTheDocument();
  });

  it('stays quiet when the FastTrack rule is disabled', async () => {
    getFirewall.mockResolvedValue(ok([{ action: 'fasttrack-connection', disabled: 'true' }]));
    const { container } = renderNote();
    await waitFor(() => expect(getFirewall).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
