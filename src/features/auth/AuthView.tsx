import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Languages } from 'lucide-react';
import { supabase, takeInitialAuthHash } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { LANGUAGES } from '@/i18n';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Notice } from '@/components/ui/feedback';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu';
import { cn } from '@/lib/utils';

type Mode = 'login' | 'forgot' | 'code' | 'reset';
type Alert = { msg: string; tone: 'danger' | 'info' } | null;

function strengthOf(v: string): 0 | 1 | 2 | 3 | 4 {
  let s = 0;
  if (v.length >= 8) s++;
  if (/[A-Z]/.test(v)) s++;
  if (/[0-9]/.test(v)) s++;
  if (/[^A-Za-z0-9]/.test(v)) s++;
  return s as 0 | 1 | 2 | 3 | 4;
}

/** Decorative candlestick chart drawn for the brand panel. */
function Candles() {
  // Open/close/high/low on a 0–100 scale, a rising trend with pullbacks.
  const data = [
    [62, 55, 66, 52], [55, 58, 61, 51], [58, 50, 60, 47], [50, 54, 57, 46], [54, 47, 56, 44],
    [47, 52, 55, 45], [52, 44, 53, 40], [44, 46, 49, 40], [46, 38, 47, 35], [38, 41, 44, 34],
    [41, 33, 42, 30], [33, 36, 39, 29], [36, 28, 37, 25], [28, 30, 33, 24], [30, 22, 31, 19],
    [22, 25, 28, 18], [25, 17, 26, 14], [17, 19, 22, 13], [19, 12, 20, 9],
  ];
  const w = 22;
  const lo = 5;
  const hi = 70;
  const y = (v: number) => ((v - lo) / (hi - lo)) * 160 + 10; // map to a 180-high box
  return (
    <svg viewBox={`0 0 ${data.length * w + 8} 180`} className="h-auto w-full" aria-hidden>
      {data.map(([o, c, h, l], i) => {
        const x = 4 + i * w + w / 2;
        const up = c < o; // lower value = higher on screen
        return (
          <g key={i} opacity={0.3 + (i / data.length) * 0.7}>
            <line x1={x} x2={x} y1={y(l)} y2={y(h)} stroke="rgb(var(--c-brand))" strokeWidth={1.5} />
            <rect
              x={x - 6}
              y={y(Math.min(o, c))}
              width={12}
              height={Math.max(3, y(Math.max(o, c)) - y(Math.min(o, c)))}
              rx={2}
              fill={up ? 'rgb(var(--c-brand))' : 'rgb(var(--c-surface))'}
              stroke="rgb(var(--c-brand))"
              strokeWidth={1.5}
            />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Sign-in, forgotten password, and set-password (from a recovery or invite
 * link). No public sign-up: accounts are invited by an administrator.
 */
export default function AuthView() {
  const { t, i18n } = useTranslation('auth');
  const navigate = useNavigate();
  const { signIn, resetPassword, updatePassword, verifyRecoveryCode } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [invited, setInvited] = useState(false);
  const [alert, setAlert] = useState<Alert>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [code, setCode] = useState('');

  const strength = useMemo(() => strengthOf(newPw), [newPw]);
  const mismatch = newPw2.length > 0 && newPw2 !== newPw;

  // The set-password form opens only from a recovery or invite email link.
  useEffect(() => {
    const hash = takeInitialAuthHash();
    if (hash.includes('type=recovery')) setMode('reset');
    if (hash.includes('type=invite')) {
      setInvited(true);
      setMode('reset');
    }
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('reset');
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const switchMode = (m: Mode) => {
    setAlert(null);
    setMode(m);
  };

  const onLogin = async (e: FormEvent) => {
    e.preventDefault();
    setAlert(null);
    if (!email || !password) return setAlert({ msg: t('errors.required'), tone: 'danger' });
    setBusy(true);
    const res = await signIn(email, password);
    setBusy(false);
    if (!res.ok) return setAlert({ msg: res.error, tone: 'danger' });
    navigate('/', { replace: true });
  };

  const onForgot = async (e: FormEvent) => {
    e.preventDefault();
    setAlert(null);
    if (!email) return setAlert({ msg: t('errors.emailRequired'), tone: 'danger' });
    setBusy(true);
    const res = await resetPassword(email, `${window.location.origin}/auth`);
    setBusy(false);
    if (!res.ok) return setAlert({ msg: res.error, tone: 'danger' });
    // The e-mail contains either a link or a code (the project is shared with
    // the mobile app, whose template may send a code). Offer the code form.
    setCode('');
    setMode('code');
    setAlert({ msg: t('forgot.sent', { email }), tone: 'info' });
  };

  const onCode = async (e: FormEvent) => {
    e.preventDefault();
    setAlert(null);
    if (!code.trim()) return setAlert({ msg: t('errors.codeRequired'), tone: 'danger' });
    if (newPw.length < 8) return setAlert({ msg: t('errors.tooShort'), tone: 'danger' });
    if (newPw !== newPw2) return setAlert({ msg: t('errors.mismatch'), tone: 'danger' });
    setBusy(true);
    const verified = await verifyRecoveryCode(email, code);
    if (!verified.ok) {
      setBusy(false);
      return setAlert({ msg: t('errors.badCode'), tone: 'danger' });
    }
    const res = await updatePassword(newPw);
    setBusy(false);
    if (!res.ok) return setAlert({ msg: res.error, tone: 'danger' });
    setAlert({ msg: t('reset.done'), tone: 'info' });
    setTimeout(() => navigate('/', { replace: true }), 1200);
  };

  const onReset = async (e: FormEvent) => {
    e.preventDefault();
    setAlert(null);
    if (newPw.length < 8) return setAlert({ msg: t('errors.tooShort'), tone: 'danger' });
    if (newPw !== newPw2) return setAlert({ msg: t('errors.mismatch'), tone: 'danger' });
    setBusy(true);
    const res = await updatePassword(newPw);
    setBusy(false);
    if (!res.ok) return setAlert({ msg: res.error, tone: 'danger' });
    setAlert({ msg: t('reset.done'), tone: 'info' });
    setTimeout(() => navigate('/', { replace: true }), 1200);
  };

  const head =
    mode === 'login'
      ? { title: t('login.title'), sub: t('login.subtitle') }
      : mode === 'forgot'
        ? { title: t('forgot.title'), sub: t('forgot.subtitle') }
        : mode === 'code'
          ? { title: t('code.title'), sub: t('code.subtitle', { email }) }
        : invited
          ? { title: t('invite.title'), sub: t('invite.subtitle') }
          : { title: t('reset.title'), sub: t('reset.subtitle') };

  const strengthLabel = [t('strength.weak'), t('strength.weak'), t('strength.fair'), t('strength.good'), t('strength.strong')][strength];

  const pwToggle = (
    <IconButton
      size="icon-sm"
      className="absolute right-1 top-1/2 -translate-y-1/2"
      label={showPw ? t('fields.hide') : t('fields.show')}
      icon={showPw ? <EyeOff /> : <Eye />}
      onClick={() => setShowPw((v) => !v)}
    />
  );

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-6 py-6 sm:px-12">
        <div className="flex items-center justify-between">
          <span className="font-brand text-xl text-brand">TACTIC</span>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <Languages aria-hidden />
                {i18n.language?.startsWith('en') ? 'English' : 'Français'}
              </Button>
            </MenuTrigger>
            <MenuContent>
              {LANGUAGES.map((l) => (
                <MenuItem key={l.code} onSelect={() => void i18n.changeLanguage(l.code)}>
                  {l.label}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="text-2xl font-semibold tracking-tight">{head.title}</h1>
          <p className="mt-1.5 text-base text-muted">{head.sub}</p>

          {alert ? (
            <Notice tone={alert.tone} className="mt-6">
              {alert.msg}
            </Notice>
          ) : null}

          {mode === 'login' ? (
            <form onSubmit={onLogin} className="mt-6 flex flex-col gap-4" noValidate>
              <Field label={t('fields.email')}>
                <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <div className="flex flex-col gap-1.5">
                <Field label={t('fields.password')}>
                  <div className="relative">
                    <Input
                      type={showPw ? 'text' : 'password'}
                      autoComplete="current-password"
                      className="pr-10"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    {pwToggle}
                  </div>
                </Field>
                <button type="button" className="self-end text-sm text-brand hover:underline" onClick={() => switchMode('forgot')}>
                  {t('login.forgot')}
                </button>
              </div>
              <Button type="submit" variant="primary" size="lg" loading={busy} className="mt-2">
                {t('login.submit')}
              </Button>
              <p className="text-sm text-muted">{t('noSignup')}</p>
            </form>
          ) : null}

          {mode === 'forgot' ? (
            <form onSubmit={onForgot} className="mt-6 flex flex-col gap-4" noValidate>
              <Field label={t('fields.email')}>
                <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Button type="submit" variant="primary" size="lg" loading={busy}>
                {t('forgot.submit')}
              </Button>
              <Button variant="ghost" onClick={() => switchMode('login')}>
                {t('forgot.back')}
              </Button>
            </form>
          ) : null}

          {mode === 'code' ? (
            <form onSubmit={onCode} className="mt-6 flex flex-col gap-4" noValidate>
              <Field label={t('fields.code')} hint={t('code.hint')}>
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={12}
                  className="tracking-[0.3em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </Field>
              <Field label={t('fields.newPassword')} hint={t('strength.hint')}>
                <div className="relative">
                  <Input
                    type={showPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    className="pr-10"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                  />
                  {pwToggle}
                </div>
              </Field>
              <Field label={t('fields.confirm')} error={mismatch ? t('errors.mismatch') : undefined}>
                <Input
                  type={showPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPw2}
                  onChange={(e) => setNewPw2(e.target.value)}
                />
              </Field>
              <Button type="submit" variant="primary" size="lg" loading={busy}>
                {t('reset.submit')}
              </Button>
              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="ghost" onClick={() => switchMode('forgot')}>
                  {t('code.resend')}
                </Button>
                <Button variant="ghost" onClick={() => switchMode('login')}>
                  {t('forgot.back')}
                </Button>
              </div>
            </form>
          ) : null}

          {mode === 'reset' ? (
            <form onSubmit={onReset} className="mt-6 flex flex-col gap-4" noValidate>
              <Field label={t('fields.newPassword')} hint={t('strength.hint')}>
                <div className="relative">
                  <Input
                    type={showPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    className="pr-10"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                  />
                  {pwToggle}
                </div>
              </Field>
              {newPw ? (
                <div className="flex items-center gap-3" aria-live="polite">
                  <div className="flex flex-1 gap-1" aria-hidden>
                    {[1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className={cn(
                          'h-1 flex-1 rounded-full bg-surface-2',
                          i <= strength && (strength <= 1 ? 'bg-danger' : strength === 2 ? 'bg-warning' : 'bg-success')
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-sm text-muted">
                    {t('strength.label')} : {strengthLabel}
                  </span>
                </div>
              ) : null}
              <Field label={t('fields.confirm')} error={mismatch ? t('errors.mismatch') : undefined}>
                <Input
                  type={showPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPw2}
                  onChange={(e) => setNewPw2(e.target.value)}
                />
              </Field>
              <Button type="submit" variant="primary" size="lg" loading={busy}>
                {t('reset.submit')}
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden border-l border-border bg-surface lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="max-w-md">
          <p className="font-brand text-3xl leading-tight text-foreground">
            {t('aside.title')}
          </p>
          <ul className="mt-6 flex flex-col gap-3 text-md text-muted">
            {(t('aside.points', { returnObjects: true }) as string[]).map((p) => (
              <li key={p} className="flex gap-3">
                <span aria-hidden className="mt-2 h-px w-4 shrink-0 bg-brand" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="-mx-4 mt-12">
          <Candles />
        </div>
      </aside>
    </div>
  );
}
