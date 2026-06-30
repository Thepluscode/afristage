import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Sparkline } from '../app/Sparkline';

describe('Sparkline', () => {
  it('renders a polyline for a multi-point series', () => {
    const { container } = render(
      <Sparkline values={[1, 5, 3, 8]} label="New users" />
    );
    expect(screen.getByText('New users')).toBeInTheDocument();
    expect(container.querySelector('polyline')).toBeInTheDocument();
    expect(screen.getByText(/17 total · 8 today/)).toBeInTheDocument();
  });

  it('omits the polyline for a single-point series', () => {
    const { container } = render(<Sparkline values={[4]} label="One" />);
    expect(container.querySelector('polyline')).toBeNull();
    expect(screen.getByText(/4 total · 4 today/)).toBeInTheDocument();
  });

  it('handles an empty series without dividing by zero', () => {
    const { container } = render(<Sparkline values={[]} label="Empty" />);
    expect(container.querySelector('polyline')).toBeNull();
    expect(screen.getByText(/0 total · 0 today/)).toBeInTheDocument();
  });
});
