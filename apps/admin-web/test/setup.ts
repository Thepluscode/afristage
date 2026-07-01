import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  (window.location as any).search = ''; // reset any ?id= a test set
});

// jsdom doesn't implement navigation; stub it so code that sets
// window.location.href in tests doesn't throw "not implemented".
Object.defineProperty(window, 'location', {
  configurable: true,
  value: { ...window.location, href: 'http://localhost/', search: '', assign: vi.fn() }
});

// jsdom doesn't implement scrollIntoView; stub so row-highlight scrolling is a no-op.
window.HTMLElement.prototype.scrollIntoView = vi.fn();
