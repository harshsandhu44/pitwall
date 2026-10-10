import { vi } from "vitest";

/** Mutable stand-in for next/navigation, mocked in setup.ts. */
export const nav = { push: vi.fn(), replace: vi.fn(), params: new URLSearchParams(), pathname: "/" };
