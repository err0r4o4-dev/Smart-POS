import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Loading, Tag } from '../../components/ui/primitives';
import { AuthLayout } from '../../layouts/AuthLayout';
import { forgotPassword, register, resetPassword } from '../../lib/api';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { isManagementRole } from '../../app/access';
import { paths } from '../../app/routes';

function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <p role="alert" className="auth-error">
      {message}
    </p>
  ) : null;
}

function PasswordField({
  value,
  onChange,
  autoComplete = 'current-password',
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <label htmlFor="password">Password</label>
      <div className="password-control">
        <input
          id="password"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required
          minLength={autoComplete === 'current-password' ? undefined : 12}
          maxLength={128}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </>
  );
}

export function safeReturnTo(value: string | null) {
  return value === '/account' ? value : paths.workspace;
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      await signIn(email, password);
      navigate(safeReturnTo(params.get('returnTo')), { replace: true });
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Sign in unavailable',
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <AuthLayout>
      <Tag tone="amber">ACCOUNT ACCESS</Tag>
      <h2>Welcome back.</h2>
      <p>
        เข้าสู่ระบบสำหรับเจ้าของร้าน ผู้จัดการ และพนักงาน
        ไม่ใช่บัญชีผู้ซื้อออนไลน์
      </p>
      {params.has('registered') && (
        <p role="status">Account created. Sign in to continue.</p>
      )}
      <form onSubmit={submit}>
        <fieldset disabled={pending}>
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
            maxLength={254}
          />
          <PasswordField value={password} onChange={setPassword} />
          <ErrorMessage message={error} />
          <Button type="submit">{pending ? 'Signing in…' : 'Sign in'}</Button>
        </fieldset>
      </form>
      <p className="auth-links">
        <Link to="/forgot-password">Forgot password?</Link>
        <Link to="/register">Create account</Link>
      </p>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    setPending(true);
    try {
      await register(email, password, name);
      navigate('/login?registered=1', { replace: true });
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Registration unavailable',
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <AuthLayout>
      <Tag tone="amber">CREATE ACCOUNT</Tag>
      <h2>Get started.</h2>
      <p>
        Organization setup follows in a future phase. No store access is granted
        yet.
      </p>
      <form onSubmit={submit}>
        <fieldset disabled={pending}>
          <label htmlFor="display-name">Display name</label>
          <input
            id="display-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            required
            maxLength={100}
          />
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            maxLength={254}
          />
          <PasswordField
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />
          <small>Use at least 12 characters; maximum 128 bytes.</small>
          <label htmlFor="confirm-password">Confirm password</label>
          <input
            id="confirm-password"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            required
          />
          <ErrorMessage message={error} />
          <Button type="submit">
            {pending ? 'Creating account…' : 'Create account'}
          </Button>
        </fieldset>
      </form>
      <p className="auth-links">
        <Link to="/login">Already have an account? Sign in</Link>
      </p>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      setMessage((await forgotPassword(email)).message);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Reset request unavailable',
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <AuthLayout>
      <Tag tone="amber">ACCOUNT RECOVERY</Tag>
      <h2>Reset your password.</h2>
      <p>
        Enter your email. If an eligible account exists, we will send a reset
        link.
      </p>
      <form onSubmit={submit}>
        <fieldset disabled={pending}>
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            maxLength={254}
          />
          <ErrorMessage message={error} />
          <Button type="submit">
            {pending ? 'Sending…' : 'Request reset link'}
          </Button>
        </fieldset>
      </form>
      {message && <p role="status">{message}</p>}
      <p className="auth-links">
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [token] = useState(() => params.get('token') || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const { clear } = useAuth();
  useEffect(() => {
    if (token)
      window.history.replaceState(window.history.state, '', '/reset-password');
  }, [token]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    setPending(true);
    try {
      await resetPassword(token, password);
      clear();
      setDone(true);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Password reset unavailable',
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <AuthLayout>
      <Tag tone="amber">SECURE RESET</Tag>
      <h2>Choose a new password.</h2>
      {done ? (
        <p role="status">
          Password changed. Existing sessions were revoked.{' '}
          <Link to="/login">Sign in again</Link>.
        </p>
      ) : (
        <>
          {!token && <p role="alert">This reset link is missing a token.</p>}
          <form onSubmit={submit}>
            <fieldset disabled={pending || !token}>
              <PasswordField
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
              />
              <small>Use at least 12 characters; maximum 128 bytes.</small>
              <label htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                required
              />
              <ErrorMessage message={error} />
              <Button type="submit">
                {pending ? 'Resetting…' : 'Change password'}
              </Button>
            </fieldset>
          </form>
        </>
      )}
      <p className="auth-links">
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthLayout>
  );
}

export function AccountPage() {
  const tenant = useOrganization();
  const { state, signOut } = useAuth();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();
  if (state.status !== 'authenticated') return <Loading />;
  const logout = async () => {
    setPending(true);
    setError('');
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Logout unavailable',
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <div>
      <section className="card account-card">
        <Tag tone="amber">ACCOUNT</Tag>
        <h1>Your account</h1>
        <dl>
          <dt>Display name</dt>
          <dd>{state.session.user.display_name}</dd>
          <dt>Email</dt>
          <dd>{state.session.user.email}</dd>
          <dt>Status</dt>
          <dd>{state.session.user.status}</dd>
        </dl>
        <p>
          <Link to={paths.workspace}>เข้าสู่พื้นที่ทำงานตามบทบาท</Link> ·{' '}
          <Link to="/setup">เลือกองค์กร / ตั้งค่าร้าน / รับคำเชิญ</Link>
          {tenant.context &&
            isManagementRole(tenant.context.membership.role) && (
              <>
                {' '}
                · <Link to="/settings/store">จัดการองค์กรและสาขา</Link>
              </>
            )}
        </p>
        <ErrorMessage message={error} />
        <Button onClick={() => void logout()} disabled={pending}>
          {pending ? 'Signing out…' : 'Sign out'}
        </Button>
      </section>
    </div>
  );
}
