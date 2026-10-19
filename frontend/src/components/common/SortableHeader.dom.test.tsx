// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SortableHeader from './SortableHeader';

/** Column headers on Devices and elsewhere: click to sort, arrow to show how. */
describe('SortableHeader', () => {
  it('clicking the header asks for a sort', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <table>
        <thead>
          <tr>
            <th>
              <SortableHeader label="Name" active={false} dir="asc" onClick={onClick} />
            </th>
          </tr>
        </thead>
      </table>,
    );

    await user.click(screen.getByRole('button', { name: 'Name' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows a neutral double arrow when inactive', () => {
    const { container } = render(
      <SortableHeader label="Name" active={false} dir="asc" onClick={() => {}} />,
    );
    expect(container.querySelector('svg.lucide-arrow-up-down')).toBeInTheDocument();
    expect(container.querySelector('svg.lucide-arrow-up')).not.toBeInTheDocument();
  });

  it('shows the direction arrow while active', () => {
    const asc = render(<SortableHeader label="Name" active dir="asc" onClick={() => {}} />);
    expect(asc.container.querySelector('svg.lucide-arrow-up')).toBeInTheDocument();

    const desc = render(<SortableHeader label="Name" active dir="desc" onClick={() => {}} />);
    expect(desc.container.querySelector('svg.lucide-arrow-down')).toBeInTheDocument();
  });

  it('titles the button for discovery', () => {
    render(<SortableHeader label="Traffic" active={false} dir="asc" onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Traffic' })).toHaveAttribute(
      'title',
      'Sort by Traffic',
    );
  });
});
