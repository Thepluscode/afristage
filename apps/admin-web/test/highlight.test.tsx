import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRowHighlight } from '../app/highlight';

function Harness({ renderRow = true }: { renderRow?: boolean }) {
  const id = useRowHighlight(1);
  return (
    <div>
      <span data-testid="id">{id ?? 'none'}</span>
      {id && renderRow ? <div id={`row-${id}`}>row</div> : null}
    </div>
  );
}

afterEach(() => {
  (window.location as any).search = '';
});

describe('useRowHighlight', () => {
  it('returns null and does not scroll when there is no ?id=', () => {
    const scroll = vi.spyOn(window.HTMLElement.prototype, 'scrollIntoView');
    const { getByTestId } = render(<Harness />);
    expect(getByTestId('id').textContent).toBe('none');
    expect(scroll).not.toHaveBeenCalled();
  });

  it('reads ?id= and scrolls the matching row into view', () => {
    (window.location as any).search = '?id=abc';
    const scroll = vi.spyOn(window.HTMLElement.prototype, 'scrollIntoView');
    const { getByTestId } = render(<Harness />);
    expect(getByTestId('id').textContent).toBe('abc');
    expect(scroll).toHaveBeenCalledWith({ block: 'center' });
  });

  it('does not scroll when the id has no matching row element', () => {
    (window.location as any).search = '?id=orphan';
    const scroll = vi.spyOn(window.HTMLElement.prototype, 'scrollIntoView');
    const { getByTestId } = render(<Harness renderRow={false} />);
    expect(getByTestId('id').textContent).toBe('orphan');
    expect(scroll).not.toHaveBeenCalled();
  });
});
