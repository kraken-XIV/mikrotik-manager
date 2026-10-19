// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DevicePicker from './DevicePicker';
import { type PickerDevice } from '../../utils/devicePicker';

/**
 * The searchable device drop-down (#304): filter-as-you-type, full keyboard
 * walking, an optional "nothing" choice, and rows that are offered but not
 * selectable, with the reason shown.
 */
function device(overrides: Partial<PickerDevice> & { id: number }): PickerDevice {
  return { name: `dev-${overrides.id}`, site_name: 'HQ', ...overrides };
}

const DEVICES: PickerDevice[] = [
  device({ id: 1, name: 'core-crs', ip_address: '10.0.0.1' }),
  device({ id: 2, name: 'edge-hEX', ip_address: '10.0.0.2', site_name: 'Branch' }),
  device({ id: 3, name: 'wap-ac', ip_address: '10.0.0.3', status: 'offline' }),
];

function renderPicker(props: Partial<Parameters<typeof DevicePicker>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onChange = vi.fn();
  const rendered = render(
    <QueryClientProvider client={client}>
      <DevicePicker
        devices={DEVICES}
        value={null}
        onChange={onChange}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onChange, ...rendered };
}

describe('DevicePicker', () => {
  it('shows the placeholder when nothing is chosen', () => {
    renderPicker();
    expect(screen.getByRole('button', { name: /Choose a device/ })).toBeInTheDocument();
  });

  it('shows the chosen device with its address', () => {
    renderPicker({ value: 1 });
    expect(screen.getByRole('button', { name: /core-crs \(10\.0\.0\.1\)/ })).toBeInTheDocument();
  });

  it('opens a listbox of options and picks one on click', async () => {
    const { onChange } = renderPicker();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Choose a device/ }));

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);

    await user.click(screen.getByRole('option', { name: /edge-hEX/ }));
    expect(onChange).toHaveBeenCalledWith(2, expect.objectContaining({ name: 'edge-hEX' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('filters as you type and admits defeat honestly', async () => {
    renderPicker();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Choose a device/ }));

    const search = screen.getByRole('combobox', { name: 'Search devices' });
    await user.type(search, '10.0.0.');
    expect(screen.getAllByRole('option')).toHaveLength(3);

    await user.clear(search);
    await user.type(search, 'core');
    expect(screen.getAllByRole('option')).toHaveLength(1);

    await user.clear(search);
    await user.type(search, 'nothing matches this');
    expect(screen.getByText(/No device matches/)).toBeInTheDocument();
  });

  it('opens with a search pre-filled when a letter is typed on the closed picker', async () => {
    renderPicker();
    const user = userEvent.setup();
    await user.type(screen.getByRole('button', { name: /Choose a device/ }), 'w');

    const search = screen.getByRole('combobox', { name: 'Search devices' });
    expect(search).toHaveValue('w');
    expect(screen.getAllByRole('option')).toHaveLength(1); // wap-ac
  });

  it('walks the options with the keyboard and picks with Enter', async () => {
    const { onChange } = renderPicker();
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: /Choose a device/ });
    await user.click(button);

    const search = screen.getByRole('combobox', { name: 'Search devices' });
    const second = screen.getAllByRole('option')[1];
    await user.type(search, '{ArrowDown}');
    expect(search).toHaveAttribute('aria-activedescendant', second.id);

    await user.type(search, '{Enter}');
    expect(onChange).toHaveBeenCalledWith(2, expect.objectContaining({ name: 'edge-hEX' }));
  });

  it('closes on Escape and puts focus back on the button', async () => {
    renderPicker();
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: /Choose a device/ });
    await user.click(button);

    const search = screen.getByRole('combobox', { name: 'Search devices' });
    await user.type(search, '{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('offers the "nothing" choice first when emptyLabel is given', async () => {
    const { onChange } = renderPicker({ emptyLabel: 'All devices' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /All devices/ }));

    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveTextContent('All devices');
    await user.click(options[0]);
    expect(onChange).toHaveBeenCalledWith(null, null);
  });

  it('lists unavailable devices but refuses to choose them', async () => {
    const { onChange } = renderPicker({
      unavailable: (d) => (d.status === 'offline' ? 'Device is offline' : null),
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Choose a device/ }));

    const offline = screen.getByRole('option', { name: /wap-ac/ });
    expect(offline).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Device is offline')).toBeInTheDocument();

    await user.click(offline);
    expect(onChange).not.toHaveBeenCalled();
  });
});
