// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoadError from './LoadError';

/**
 * The read-failed state (outside review U5): it must never look like an empty
 * or "all clear" view, and the server's reason is shown when there is one.
 */
describe('LoadError', () => {
  it('says what failed to load, without inventing a detail', () => {
    render(<LoadError what="device health" />);
    expect(screen.getByText(/Couldn't load device health/)).toBeInTheDocument();
    expect(screen.getByText(/so this isn't showing the real state/)).toBeInTheDocument();
  });

  it('carries the API error message from an axios-style error', () => {
    const error = { response: { data: { error: 'Device unreachable' } } };
    render(<LoadError what="interfaces" error={error} />);
    expect(screen.getByText(/\(Device unreachable\)/)).toBeInTheDocument();
  });

  it('falls back to the error message thrown locally', () => {
    render(<LoadError what="switch ports" error={new Error('aborted')} />);
    expect(screen.getByText(/\(aborted\)/)).toBeInTheDocument();
  });
});
