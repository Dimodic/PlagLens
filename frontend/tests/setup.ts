import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

// Match the runtime setup in main.tsx so pages that call
// `dayjs(...).fromNow()` work in unit tests too.
dayjs.extend(relativeTime);

// jsdom doesn't implement matchMedia
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// Stub ResizeObserver/IntersectionObserver used by Mantine
class _Stub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
const g = globalThis as unknown as {
  ResizeObserver?: typeof _Stub;
  IntersectionObserver?: typeof _Stub;
};
if (!g.ResizeObserver) g.ResizeObserver = _Stub;
if (!g.IntersectionObserver) g.IntersectionObserver = _Stub;

// Default env for tests
vi.stubEnv('VITE_API_BASE_URL', '/api/v1');

afterEach(() => {
  cleanup();
});
