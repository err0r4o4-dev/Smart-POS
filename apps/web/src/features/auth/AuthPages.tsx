import { useLanguage } from '../../app/language';
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
  const { localize } = useLanguage();

  return message ? (
    <p role="alert" className="auth-error">
      {localize(message ?? '')}
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
  const { t } = useLanguage();

  const [visible, setVisible] = useState(false);
  return (
    <>
      <label htmlFor="password">{t('auth.password')}</label>
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
          aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
        >
          {visible ? t('auth.hide') : t('auth.show')}
        </button>
      </div>
    </>
  );
}

export function safeReturnTo(value: string | null) {
  return value === '/account' ? value : paths.workspace;
}

export function LoginPage() {
  const { t, localize } = useLanguage();

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
        failure instanceof Error
          ? failure.message
          : t('auth.signInUnavailable'),
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <AuthLayout>
      <Tag tone="amber">{t('auth.accountAccess')}</Tag>
      <h2>{t('auth.welcomeBack')}</h2>
      <p>{t('auth.signInForStoreOwnersManagersAnd')}</p>
      {params.has('registered') && (
        <p role="status">{t('auth.accountCreatedSignInToContinue')}</p>
      )}
      <form onSubmit={submit}>
        <fieldset disabled={pending}>
          <label htmlFor="email">{t('auth.emailAddress')}</label>
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
          <ErrorMessage message={localize(error ?? '')} />
          <Button type="submit">
            {pending ? t('auth.signingIn') : t('auth.signIn')}
          </Button>
        </fieldset>
      </form>
      <p className="auth-links">
        <Link to="/forgot-password">{t('auth.forgotPassword')}</Link>
        <Link to="/register">{t('auth.createAccount')}</Link>
      </p>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { t, localize } = useLanguage();

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
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }
    setError('');
    setPending(true);
    try {
      await register(email, password, name);
      navigate('/login?registered=1', { replace: true });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t('auth.registrationUnavailable'),
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <AuthLayout>
      <Tag tone="amber">{t('auth.createAccount2')}</Tag>
      <h2>{t('auth.getStarted')}</h2>
      <p>{t('auth.organizationSetupFollowsInAFuturePhase')}</p>
      <form onSubmit={submit}>
        <fieldset disabled={pending}>
          <label htmlFor="display-name">{t('auth.displayName')}</label>
          <input
            id="display-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            required
            maxLength={100}
          />
          <label htmlFor="email">{t('auth.emailAddress')}</label>
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
          <small>{t('auth.useAtLeast12CharactersMaximum128')}</small>
          <label htmlFor="confirm-password">{t('auth.confirmPassword')}</label>
          <input
            id="confirm-password"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            required
          />
          <ErrorMessage message={localize(error ?? '')} />
          <Button type="submit">
            {pending ? t('auth.creatingAccount') : t('auth.createAccount')}
          </Button>
        </fieldset>
      </form>
      <p className="auth-links">
        <Link to="/login">{t('auth.alreadyHaveAnAccountSignIn')}</Link>
      </p>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const { t, localize } = useLanguage();

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
          : t('auth.resetRequestUnavailable'),
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <AuthLayout>
      <Tag tone="amber">{t('auth.accountRecovery')}</Tag>
      <h2>{t('auth.resetYourPassword')}</h2>
      <p>{t('auth.enterYourEmailIfAnEligibleAccount')}</p>
      <form onSubmit={submit}>
        <fieldset disabled={pending}>
          <label htmlFor="email">{t('auth.emailAddress')}</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            maxLength={254}
          />
          <ErrorMessage message={localize(error ?? '')} />
          <Button type="submit">
            {pending ? t('auth.sending') : t('auth.requestResetLink')}
          </Button>
        </fieldset>
      </form>
      {message && <p role="status">{localize(message)}</p>}
      <p className="auth-links">
        <Link to="/login">{t('auth.backToSignIn')}</Link>
      </p>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const { t, localize } = useLanguage();

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
      setError(t('auth.passwordsDoNotMatch'));
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
          : t('auth.passwordResetUnavailable'),
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <AuthLayout>
      <Tag tone="amber">{t('auth.secureReset')}</Tag>
      <h2>{t('auth.chooseANewPassword')}</h2>
      {done ? (
        <p role="status">
          {t('auth.passwordChangedExistingSessionsWereRevoked')}{' '}
          <Link to="/login">{t('auth.signInAgain')}</Link>.
        </p>
      ) : (
        <>
          {!token && (
            <p role="alert">{t('auth.thisResetLinkIsMissingAToken')}</p>
          )}
          <form onSubmit={submit}>
            <fieldset disabled={pending || !token}>
              <PasswordField
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
              />
              <small>{t('auth.useAtLeast12CharactersMaximum128')}</small>
              <label htmlFor="confirm-password">
                {t('auth.confirmPassword')}
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                required
              />
              <ErrorMessage message={localize(error ?? '')} />
              <Button type="submit">
                {pending ? t('auth.resetting') : t('auth.changePassword')}
              </Button>
            </fieldset>
          </form>
        </>
      )}
      <p className="auth-links">
        <Link to="/login">{t('auth.backToSignIn')}</Link>
      </p>
    </AuthLayout>
  );
}

export function AccountPage() {
  const { t, localize, labelCode } = useLanguage();

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
        failure instanceof Error
          ? failure.message
          : t('auth.logoutUnavailable'),
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <div>
      <section className="card account-card">
        <Tag tone="amber">{t('auth.account')}</Tag>
        <h1>{t('auth.yourAccount')}</h1>
        <dl>
          <dt>{t('auth.displayName')}</dt>
          <dd>{state.session.user.display_name}</dd>
          <dt>{t('auth.email')}</dt>
          <dd>{state.session.user.email}</dd>
          <dt>{t('auth.status')}</dt>
          <dd>{labelCode(state.session.user.status)}</dd>
        </dl>
        <p>
          <Link to={paths.workspace}>
            {t('auth.openYourRoleBasedWorkspace')}
          </Link>{' '}
          ·{' '}
          <Link to="/setup">
            {t('auth.selectOrganizationSetUpStoreAcceptInvitation')}
          </Link>
          {tenant.context &&
            isManagementRole(tenant.context.membership.role) && (
              <>
                {' '}
                ·{' '}
                <Link to="/manage/settings/store">
                  {t('auth.manageOrganizationAndBranches')}
                </Link>
              </>
            )}
        </p>
        <ErrorMessage message={localize(error ?? '')} />
        <Button onClick={() => void logout()} disabled={pending}>
          {pending ? t('auth.signingOut') : t('auth.signOut')}
        </Button>
      </section>
    </div>
  );
}
