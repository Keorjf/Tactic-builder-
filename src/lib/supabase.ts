/**
 * Browser Supabase client for the Corpus Builder admin panel.
 *
 * Shares the same Supabase project as the mobile app
 * (twjyajjfndsquhctxgvm). Credentials come from Vite env vars
 * (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

export const isSupabaseConfigured =
  !!SUPABASE_URL &&
  !!SUPABASE_ANON_KEY &&
  !SUPABASE_URL.startsWith('YOUR_') &&
  !SUPABASE_ANON_KEY.startsWith('YOUR_');

if (!isSupabaseConfigured && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env.local and fill in the values.'
  );
}

/**
 * Browser localStorage key used to persist the session.
 *
 * supabase-js stores the JWT + refresh token here. With `persistSession`
 * + `autoRefreshToken` enabled, the short-lived JWT (default ~1 h) is
 * silently swapped for a fresh one using the longer-lived refresh token
 * (default 30 days). So the admin stays signed in across reloads/days
 * without re-entering credentials.
 */
export const AUTH_STORAGE_KEY = 'tactic-builder.auth';

export const supabase = createClient(
  SUPABASE_URL ?? 'http://localhost',
  SUPABASE_ANON_KEY ?? 'public-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // true so the password-reset email redirect can pick up the session.
      detectSessionInUrl: true,
      storageKey: AUTH_STORAGE_KEY,
      // Explicit so it's visible / auditable instead of relying on the
      // library's implicit default. Falls back to an in-memory store on
      // platforms without localStorage (very old browsers, SSR).
      storage:
        typeof window !== 'undefined' && window.localStorage
          ? window.localStorage
          : undefined,
    },
  }
);
