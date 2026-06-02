import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import type { AdminRole } from '@/lib/types';
import styles from './AuthView.module.css';

type Tab = 'login' | 'register';
type Alert = { msg: string; type: 'error' | 'success' } | null;

/** Self-service roles (admin is granted out-of-band via SQL). */
const ROLES: { value: Exclude<AdminRole, 'admin' | 'learner'>; label: string; sub: string }[] = [
  { value: 'ux', label: 'UX Designer', sub: 'Learner experience' },
  { value: 'ped', label: 'Instructional Designer', sub: 'Content design' },
  { value: 'data', label: 'Data Analyst', sub: 'Analytics & KPIs' },
];

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

export default function AuthView() {
  const navigate = useNavigate();
  const { signIn, signUp, resetPassword } = useAuth();

  const [tab, setTab] = useState<Tab>('login');
  const [alert, setAlert] = useState<Alert>(null);
  const [busy, setBusy] = useState(false);

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPw, setLoginPw] = useState('');
  const [showLoginPw, setShowLoginPw] = useState(false);

  // Register fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPw, setRegPw] = useState('');
  const [regPwConfirm, setRegPwConfirm] = useState('');
  const [showRegPw, setShowRegPw] = useState(false);
  const [role, setRole] = useState<(typeof ROLES)[number]['value']>('ux');
  const [terms, setTerms] = useState(false);

  const strength = useMemo(() => pwStrength(regPw), [regPw]);
  const pwMismatch = regPwConfirm.length > 0 && regPwConfirm !== regPw;

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAlert(null);
    if (!loginEmail || !loginPw) {
      setAlert({ msg: 'Please fill in all fields.', type: 'error' });
      return;
    }
    setBusy(true);
    const res = await signIn(loginEmail, loginPw);
    setBusy(false);
    if (!res.ok) {
      setAlert({ msg: res.error, type: 'error' });
      return;
    }
    navigate('/explore', { replace: true });
  };

  const onRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAlert(null);
    if (regPw !== regPwConfirm) {
      setAlert({ msg: 'Passwords do not match.', type: 'error' });
      return;
    }
    if (regPw.length < 8) {
      setAlert({ msg: 'Password must be at least 8 characters.', type: 'error' });
      return;
    }
    if (!terms) {
      setAlert({ msg: 'Please accept the terms of service.', type: 'error' });
      return;
    }
    setBusy(true);
    const res = await signUp({ email: regEmail, password: regPw, firstName, lastName, role });
    setBusy(false);
    if (!res.ok) {
      setAlert({ msg: res.error, type: 'error' });
      return;
    }
    setAlert({
      msg: 'Account created. Check your inbox to confirm, then sign in.',
      type: 'success',
    });
    setTab('login');
  };

  const onForgot = async () => {
    setAlert(null);
    if (!loginEmail) {
      setAlert({ msg: 'Enter your email to reset your password.', type: 'error' });
      return;
    }
    const redirectTo = `${window.location.origin}/auth?reset=1`;
    const res = await resetPassword(loginEmail, redirectTo);
    setAlert(
      res.ok
        ? { msg: `Reset link sent to ${loginEmail}.`, type: 'success' }
        : { msg: res.error, type: 'error' }
    );
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.logo}>
        <div className={styles.logoTitle}>TACTIC</div>
        <div className={styles.logoSub}>Corpus Builder — Admin</div>
      </div>

      <div className={styles.card}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'login' ? styles.tabActive : ''}`}
            onClick={() => {
              setTab('login');
              setAlert(null);
            }}
          >
            Sign in
          </button>
          <button
            className={`${styles.tab} ${tab === 'register' ? styles.tabActive : ''}`}
            onClick={() => {
              setTab('register');
              setAlert(null);
            }}
          >
            Register
          </button>
        </div>

        {alert ? (
          <div className={`${styles.alert} ${styles[alert.type]}`}>{alert.msg}</div>
        ) : null}

        {tab === 'login' ? (
          <form className={styles.form} onSubmit={onLogin}>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>Email address</label>
              <input
                className={styles.input}
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label}>
                Password
                <button type="button" className={styles.forgot} onClick={onForgot}>
                  Forgot password?
                </button>
              </label>
              <div className={styles.pwWrap}>
                <input
                  className={styles.input}
                  type={showLoginPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={loginPw}
                  onChange={(e) => setLoginPw(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className={styles.pwToggle}
                  onClick={() => setShowLoginPw((v) => !v)}
                >
                  {showLoginPw ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <button type="submit" className={styles.submit} disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form className={styles.form} onSubmit={onRegister}>
            <div className={styles.fieldRow}>
              <div>
                <label className={styles.label}>First name</label>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="Marie"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className={styles.label}>Last name</label>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="Dupont"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label}>Email address</label>
              <input
                className={styles.input}
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                required
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label}>Password</label>
              <div className={styles.pwWrap}>
                <input
                  className={styles.input}
                  type={showRegPw ? 'text' : 'password'}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  value={regPw}
                  onChange={(e) => setRegPw(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className={styles.pwToggle}
                  onClick={() => setShowRegPw((v) => !v)}
                >
                  {showRegPw ? '🙈' : '👁'}
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
              <label className={styles.label}>Confirm password</label>
              <div className={styles.pwWrap}>
                <input
                  className={`${styles.input} ${pwMismatch ? styles.inputError : ''}`}
                  type={showRegPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  value={regPwConfirm}
                  onChange={(e) => setRegPwConfirm(e.target.value)}
                  required
                />
              </div>
              {pwMismatch ? (
                <div className={styles.fieldError}>Passwords do not match.</div>
              ) : null}
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label} style={{ marginBottom: '0.55rem' }}>
                Role
              </label>
              <div className={styles.roleGrid}>
                {ROLES.map((r) => (
                  <label
                    key={r.value}
                    className={`${styles.roleCard} ${role === r.value ? styles.roleSelected : ''}`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={r.value}
                      checked={role === r.value}
                      onChange={() => setRole(r.value)}
                    />
                    <div>
                      <div className={styles.roleLabel}>{r.label}</div>
                      <div className={styles.roleSub}>{r.sub}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.fieldGroup} style={{ marginBottom: '1.4rem' }}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={terms}
                  onChange={(e) => setTerms(e.target.checked)}
                  required
                />
                <span>
                  I accept the <a href="#">terms of service</a> and{' '}
                  <a href="#">privacy policy</a>.
                </span>
              </label>
            </div>

            <button type="submit" className={styles.submit} disabled={busy}>
              {busy ? 'Creating…' : 'Create my account'}
            </button>
          </form>
        )}

        <div className={styles.switch}>
          {tab === 'login' ? (
            <>
              No account yet?{' '}
              <button onClick={() => setTab('register')}>Register</button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button onClick={() => setTab('login')}>Sign in</button>
            </>
          )}
        </div>
      </div>

      <div className={styles.note}>Admin access is granted by an existing administrator.</div>
    </div>
  );
}
