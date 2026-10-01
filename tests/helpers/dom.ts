import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { vi } from 'vitest';

// Component interaction helpers for files that run under `// @vitest-environment jsdom`.
// Tests stay `.ts` (the Vitest glob), so elements are built with React.createElement.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export async function render(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | null = null;
  await act(async () => {
    root = createRoot(container);
    root.render(element);
  });
  await settle();
  return {
    container,
    async unmount() {
      await act(async () => root?.unmount());
      container.remove();
    },
  };
}

/** Lets pending fetch promises, lazy chunks and state updates finish. */
export async function settle(rounds = 5) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** Waits (inside act) until the check passes; lazy chunks need real time to load. */
export async function waitFor<T>(check: () => T, timeoutMs = 3000): Promise<NonNullable<T>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = check();
    if (value) return value as NonNullable<T>;
    if (Date.now() > deadline) throw new Error('waitFor: condition not met in time.');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

export async function click(element: Element | null | undefined) {
  if (!element) throw new Error('Element to click not found.');
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
}

/** Types into a React-controlled input (the native setter, then an input event). */
export async function typeInto(input: Element | null | undefined, value: string) {
  if (!(input instanceof HTMLInputElement)) throw new Error('Input not found.');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

export function buttonByText(root: ParentNode, text: string | RegExp) {
  return Array.from(root.querySelectorAll('button')).find((button) =>
    typeof text === 'string'
      ? button.textContent?.trim() === text
      : text.test(button.textContent ?? '')
  );
}

type Route = (init: RequestInit | undefined) => unknown;
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * A fetch stub answering `METHOD /path` keys. A list answers in order and repeats its
 * last entry; a route may return `{ status, body }` for a non-200 answer.
 */
export function stubApi(routes: Record<string, Route | Route[]>) {
  const used: Record<string, number> = {};
  const calls: Array<{ key: string; body: unknown }> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${(init?.method || 'GET').toUpperCase()} ${new URL(url, 'http://localhost').pathname}`;
    calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const route = routes[key];
    if (!route) return json({ basarili: false, hata: `unrouted ${key}` }, 599);
    const list = Array.isArray(route) ? route : [route];
    const index = Math.min(used[key] ?? 0, list.length - 1);
    used[key] = (used[key] ?? 0) + 1;
    const answer = list[index](init) as { status?: number; body?: unknown } | undefined;
    if (answer && typeof answer === 'object' && 'status' in answer && 'body' in answer)
      return json(answer.body, answer.status);
    return json(answer);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}
