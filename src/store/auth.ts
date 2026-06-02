/**
 * Auth store (zustand).
 *
 * Boots from the persisted Supabase session, subscribes to auth-state
 * changes, and resolves the caller's profile row (role) so the panel can
 * gate admin-only routes.
 */

import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { AdminRole, Profile } from '@/lib/types';

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;

  init: () => void;
  refreshProfile: () => Promise<void>;

  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (input: SignUpInput) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  resetPassword: (email: string, redirectTo?: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
};

export type AuthResult = { ok: true } | { ok: false; error: string };

export type SignUpInput = {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  /** Self-service roles only — `admin` is granted out-of-band via SQL. */
  role?: Exclude<AdminRole, 'admin'>;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AdminRole | null;
};

let subscribed = false;

export const useAuth = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  loading: true,
  isAdmin: false,

  init: () => {
    if (subscribed) return;
    subscribed = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        set({ session: data.session });
        return get().refreshProfile();
      })
      .finally(() => set({ loading: false }));

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session });
      get().refreshProfile();
    });
  },

  refreshProfile: async () => {
    const session = get().session;
    if (!session?.user) {
      set({ profile: null, isAdmin: false });
      return;
    }
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, email, full_name, role')
        .eq('id', session.user.id)
        .maybeSingle();

      const row = data as ProfileRow | null;
      const profile: Profile | null = row
        ? {
            id: row.id,
            email: row.email,
            fullName: row.full_name,
            role: row.role ?? 'learner',
          }
        : {
            id: session.user.id,
            email: session.user.email ?? null,
            fullName: (session.user.user_metadata as any)?.full_name ?? null,
            role: 'learner',
          };

      set({ profile, isAdmin: profile.role === 'admin' });
    } catch {
      set({ profile: null, isAdmin: false });
    }
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return { ok: false, error: error.message };
    await get().refreshProfile();
    return { ok: true };
  },

  signUp: async ({ email, password, firstName, lastName, role }) => {
    const fullName = `${firstName ?? ''} ${lastName ?? ''}`.trim() || undefined;
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName,
          // role is stored in metadata; an admin can promote later. Public
          // signups never get 'admin'.
          requested_role: role ?? 'ux',
        },
      },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  signOut: async () => {
    await supabase.auth.signOut().catch(() => {});
    set({ session: null, profile: null, isAdmin: false });
  },

  resetPassword: async (email, redirectTo) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  updatePassword: async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },
}));
