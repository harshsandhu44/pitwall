import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { nav } from "./nav";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => nav.params,
  usePathname: () => nav.pathname,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  nav.push.mockReset();
  nav.replace.mockReset();
  nav.params = new URLSearchParams();
  nav.pathname = "/";
});

// jsdom lacks these browser APIs used by Base UI / the sidebar.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }),
});
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
