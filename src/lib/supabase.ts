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

export const supabase = createClient(
  SUPABASE_URL ?? 'http://localhost',
  SUPABASE_ANON_KEY ?? 'public-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // true so the password-reset email redirect can pick up the session.
      detectSessionInUrl: true,
    },
  }
);
