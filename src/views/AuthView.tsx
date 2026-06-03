import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import styles from './AuthView.module.css';

type Mode = 'login' | 'forgot' | 'reset';
type Alert = { msg: string; type: 'error' | 'success' } | null;

function pwStrength(v: string): { pct: number; color: string } {
  let score = 0;
  if (v.length >= 8) score++;
  if (/[A-Z]/.test(v)) score++;
  if (/[0-9]/.test(v)) score++;
  if (/[^A-Za-z0-9]/.test(v)) score++;
  const pct = [0, 25, 50, 75, 100][score];
  const color =
    score <= 1 ? 'var(--red)' : score === 2 ? 'var(--gold)' : score === 3 ? 'var(--blue)' : 'var(--green)';
  return { pct, color };
}

/**
 * Admin login. No public registration — admin accounts are provisioned by
 * an existing administrator (Supabase dashboard + role grant). Supports the
 * forgot-password request and the reset-password completion flow (when the
 * user arrives from a recovery email).
 */
export default function AuthView() {
  const navigate = useNavigate();
  const { signIn, resetPassword, updatePassword } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [alert, setAlert] = useState<Alert>(null);
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const [newPw, setNewPw] = useState('');
  const [newPwConfirm, setNewPwConfirm] = useState('');

  const strength = useMemo(() => pwStrength(newPw), [newPw]);
  const pwMismatch = newPwConfirm.length > 0 && newPwConfirm !== newPw;

  // Detect arrival from a password-recovery email → switch to reset mode.
  useEffect(() => {
    const url = new URL(window.location.href);
    const isRecovery =
      url.searchParams.get('reset') === '1' ||
      window.location.hash.includes('type=recovery');
    if (isRecovery) setMode('reset');

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('reset');
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAlert(null);
    if (!email || !password) {
      setAlert({ msg: 'Please fill in all fields.', type: 'error' });
      return;
    }
    setBusy(true);
    const res = await signIn(email, password);
    setBusy(false);
    if (!res.ok) {
      setAlert({ msg: res.error, type: 'error' });
      return;
    }
    navigate('/explore', { replace: true });
  };

  const onForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setAlert(null);
    if (!email) {
      setAlert({ msg: 'Enter your email to receive a reset link.', type: 'error' });
      return;
    }
    setBusy(true);
    const redirectTo = `${window.location.origin}/auth?reset=1`;
    const res = await resetPassword(email, redirectTo);
    setBusy(false);
    setAlert(
      res.ok
        ? { msg: `If an account exists for ${email}, a reset link is on its way.`, type: 'success' }
        : { msg: res.error, type: 'error' }
    );
  };

  const onReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setAlert(null);
    if (newPw.length < 8) {
      setAlert({ msg: 'Password must be at least 8 characters.', type: 'error' });
      return;
    }
    if (newPw !== newPwConfirm) {
      setAlert({ msg: 'Passwords do not match.', type: 'error' });
      return;
    }
    setBusy(true);
    const res = await updatePassword(newPw);
    setBusy(false);
    if (!res.ok) {
      setAlert({ msg: res.error, type: 'error' });
      return;
    }
    setAlert({ msg: 'Password updated. Redirecting…', type: 'success' });
    setTimeout(() => navigate('/explore', { replace: true }), 1200);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.logo}>
        <div className={styles.logoTitle}>TACTIC</div>
        <div className={styles.logoSub}>Corpus Builder — Admin</div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <div className={styles.cardTitle}>
            {mode === 'login'
              ? 'Sign in'
              : mode === 'forgot'
              ? 'Reset password'
              : 'Set a new password'}
          </div>
          <div className={styles.cardSub}>
            {mode === 'login'
              ? 'Administrator access only.'
              : mode === 'forgot'
              ? "We'll email you a secure reset link."
              : 'Choose a new password for your account.'}
          </div>
        </div>

        {alert ? (
          <div className={`${styles.alert} ${styles[alert.type]}`}>{alert.msg}</div>
        ) : null}

        {mode === 'login' ? (
          <form className={styles.form} onSubmit={onLogin}>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>Email address</label>
              <input
                className={styles.input}
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>
                Password
                <button
                  type="button"
                  className={styles.forgot}
                  onClick={() => {
                    setAlert(null);
                    setMode('forgot');
                  }}
                >
                  Forgot password?
                </button>
              </label>
              <div className={styles.pwWrap}>
                <input
                  className={styles.input}
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className={styles.pwToggle}
                  onClick={() => setShowPw((v) => !v)}
                >
                  {showPw ? '🙈' : '👁'}
                </button>
              </div>
            </div>
            <button type="submit" className={styles.submit} disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : mode === 'forgot' ? (
          <form className={styles.form} onSubmit={onForgot}>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>Email address</label>
              <input
                className={styles.input}
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <button type="submit" className={styles.submit} disabled={busy}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => {
                setAlert(null);
                setMode('login');
              }}
            >
              ← Back to sign in
            </button>
          </form>
        ) : (
          <form className={styles.form} onSubmit={onReset}>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>New password</label>
              <div className={styles.pwWrap}>
                <input
                  className={styles.input}
                  type={showPw ? 'text' : 'password'}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className={styles.pwToggle}
                  onClick={() => setShowPw((v) => !v)}
                >
                  {showPw ? '🙈' : '👁'}
                </button>
              </div>
              <div className={styles.strength}>
                <div
                  className={styles.strengthBar}
                  style={{ width: `${strength.pct}%`, background: strength.color }}
                />
              </div>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>Confirm new password</label>
              <input
                className={`${styles.input} ${pwMismatch ? styles.inputError : ''}`}
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="new-password"
                value={newPwConfirm}
                onChange={(e) => setNewPwConfirm(e.target.value)}
                required
              />
              {pwMismatch ? (
                <div className={styles.fieldError}>Passwords do not match.</div>
              ) : null}
            </div>
            <button type="submit" className={styles.submit} disabled={busy}>
              {busy ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>

      <div className={styles.note}>
        Need access? Ask an existing administrator to create your account.
      </div>
    </div>
  );
}
