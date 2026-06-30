import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// jsdom doesn't implement navigation; stub it so code that sets
// window.location.href in tests doesn't throw "not implemented".
Object.defineProperty(window, 'location', {
  configurable: true,
  value: { ...window.location, href: 'http://localhost/', assign: vi.fn() }
});
