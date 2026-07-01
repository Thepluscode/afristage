import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(nav.search) }));

import { RowHighlightNotice, useRowHighlight } from '../app/highlight';

function Harness({ rows, renderRow = true }: { rows: { id: string }[]; renderRow?: boolean }) {
  const { id, missing } = useRowHighlight(rows);
  return (
    <div>
      <span data-testid="id">{id ?? 'none'}</span>
      <span data-testid="missing">{String(missing)}</span>
      {id && renderRow ? <div id={`row-${id}`}>row</div> : null}
      <RowHighlightNotice missing={missing} />
    </div>
  );
}

afterEach(() => {
  nav.search = '';
});

describe('useRowHighlight', () => {
  it('returns null / not-missing and does not scroll when there is no ?id=', () => {
    const scroll = vi.spyOn(window.HTMLElement.prototype, 'scrollIntoView');
    const { getByTestId, queryByText } = render(<Harness rows={[{ id: 'a' }]} />);
    expect(getByTestId('id').textContent).toBe('none');
    expect(getByTestId('missing').textContent).toBe('false');
    expect(scroll).not.toHaveBeenCalled();
    expect(queryByText(/isn’t in this list/)).toBeNull(); // notice hidden
  });

  it('scrolls the matching row into view and is not missing', () => {
    nav.search = 'id=abc';
    const scroll = vi.spyOn(window.HTMLElement.prototype, 'scrollIntoView');
    const { getByTestId } = render(<Harness rows={[{ id: 'abc' }]} />);
    expect(getByTestId('id').textContent).toBe('abc');
    expect(getByTestId('missing').textContent).toBe('false');
    expect(scroll).toHaveBeenCalledWith({ block: 'center' });
  });

  it('reports missing and shows the notice when the id is not among loaded rows', () => {
    nav.search = 'id=zzz';
    const scroll = vi.spyOn(window.HTMLElement.prototype, 'scrollIntoView');
    const { getByTestId, getByText } = render(<Harness rows={[{ id: 'a' }, { id: 'b' }]} renderRow={false} />);
    expect(getByTestId('missing').textContent).toBe('true');
    expect(getByText(/isn’t in this list/)).toBeInTheDocument();
    expect(scroll).not.toHaveBeenCalled(); // no matching element to scroll to
  });

  it('is not missing while rows are still empty (loading)', () => {
    nav.search = 'id=zzz';
    const { getByTestId } = render(<Harness rows={[]} />);
    expect(getByTestId('missing').textContent).toBe('false');
  });
});
