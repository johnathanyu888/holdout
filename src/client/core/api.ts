// Client API layer. RedditApi talks to the Devvit server's /api routes; MockApi
// answers locally (in memory + localStorage) so the game runs in a plain browser
// tab with `npm run dev`, with no Reddit needed.

import type { ApiMode, InitResponse } from '@shared/types/api';

export interface ApiClient {
  readonly mode: ApiMode;
  init(): Promise<InitResponse>;
}

class RedditApi implements ApiClient {
  readonly mode = 'reddit' as const;

  async init(): Promise<InitResponse> {
    return getJson<InitResponse>('/api/init');
  }
}

class MockApi implements ApiClient {
  readonly mode = 'mock' as const;

  async init(): Promise<InitResponse> {
    return { userName: 'mock-user', postId: null };
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Picks the API: `?api=mock` or `?api=reddit` forces one; otherwise the dev server
 * uses the mock and a production build (what Devvit serves) uses the real one.
 */
export function createApi(): ApiClient {
  const forced = new URLSearchParams(location.search).get('api');
  if (forced === 'mock') return new MockApi();
  if (forced === 'reddit') return new RedditApi();
  return import.meta.env.DEV ? new MockApi() : new RedditApi();
}

/** Small typed localStorage helpers for mock-mode persistence. */
export const local = {
  load<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(`holdout:${key}`);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  save(key: string, value: unknown): void {
    try {
      localStorage.setItem(`holdout:${key}`, JSON.stringify(value));
    } catch {
      // Storage full or blocked (private mode): persistence is best-effort.
    }
  },
};
