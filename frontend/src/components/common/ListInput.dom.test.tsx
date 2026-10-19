// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ListInput from './ListInput';

/**
 * The chip-list editor (#207): entries are added one keystroke, paste or blur
 * at a time, and an entry that fails validation stays in the box with the
 * reason shown rather than being silently dropped.
 */
describe('ListInput', () => {
  it('renders existing values as chips with a remove button each', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ListInput
        value={['10.0.0.0/8', '192.168.88.0/24']}
        onChange={onChange}
        ariaLabel="Allowed networks"
      />,
    );

    expect(screen.getByText('10.0.0.0/8')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove 192.168.88.0/24' }));
    expect(onChange).toHaveBeenCalledWith(['10.0.0.0/8']);
  });

  it('adds a typed entry on Enter and clears the box', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ListInput value={['a']} onChange={onChange} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'b{Enter}');
    expect(onChange).toHaveBeenCalledWith(['a', 'b']);
    expect(input).toHaveValue('');
  });

  it('adds on comma and space, without adding a stray separator', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ListInput value={[]} onChange={onChange} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'eth1,{space}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['eth1']);
  });

  it('splits a pasted list into entries', () => {
    const onChange = vi.fn();
    render(<ListInput value={[]} onChange={onChange} />);

    const input = screen.getByRole('textbox');
    // jsdom has no clipboard implementation; the shape matches the event's.
    fireEvent.paste(input, { clipboardData: { getData: () => 'a, b; c' } });
    expect(onChange).toHaveBeenCalledWith(['a', 'b', 'c']);
  });

  it('keeps an invalid entry in the box with its reason, and still keeps the valid ones', () => {
    const onChange = vi.fn();
    render(
      <ListInput
        value={[]}
        onChange={onChange}
        validate={(entry) => (entry.startsWith('10.') ? null : `${entry} is not in the lab range`)}
      />,
    );

    const input = screen.getByRole('textbox');
    fireEvent.paste(input, { clipboardData: { getData: () => '10.0.0.5 badhost' } });
    expect(onChange).toHaveBeenCalledWith(['10.0.0.5']);
    expect(screen.getByText('badhost is not in the lab range')).toBeInTheDocument();
    expect(input).toHaveValue('badhost');
  });

  it('does not add a duplicate entry', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ListInput value={['a']} onChange={onChange} />);

    await user.type(screen.getByRole('textbox'), 'a{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes the last entry with Backspace on an empty box', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ListInput value={['a', 'b']} onChange={onChange} />);

    const input = screen.getByRole('textbox');
    await user.click(input);
    await user.keyboard('{Backspace}');
    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  it('commits a half-typed entry on blur', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ListInput value={[]} onChange={onChange} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'leftopen');
    await user.tab(); // blur
    expect(onChange).toHaveBeenCalledWith(['leftopen']);
  });

  it('is inert when disabled: no remove buttons, input disabled', () => {
    render(<ListInput value={['a']} onChange={() => {}} disabled />);
    expect(screen.queryByRole('button', { name: 'Remove a' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeDisabled();
  });
});
