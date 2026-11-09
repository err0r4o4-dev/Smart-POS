import {
  ArrowRight,
  ChevronRight,
  KeyRound,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Store,
  UserRound,
} from 'lucide-react';
import { useLanguage } from '../../app/language';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Loading, Tag } from '../../components/ui/primitives';
import { AuthLayout } from '../../layouts/AuthLayout';
import { LoginLayout } from '../../layouts/LoginLayout';
import { forgotPassword, register, resetPassword } from '../../lib/api';
import { useAuth } from '../../app/AuthProvider';
import { paths } from '../../app/routes';
import { ResendVerification } from './VerificationFlow';
import { GoogleAuth } from './GoogleAuth';

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
    <div className="auth-field-group">
      <label htmlFor="password">
        <Lock size={18} aria-hidden="true" />
        {t('auth.password')}
      </label>
      <div className="password-control auth-input-wrapper">
        <input
          id="password"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required
          minLength={autoComplete === 'current-password' ? undefined : 12}
          maxLength={128}
          placeholder={t('auth.password')}
        />
        <button
          type="button"
          className="auth-password-toggle"
          onClick={() => setVisible(!visible)}
          aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          <span>{visible ? t('auth.hide') : t('auth.show')}</span>
        </button>
      </div>
    </div>
  );
}

export function safeReturnTo(value: string | null) {
  return value === paths.setup ? value : paths.workspace;
}

export function LoginPage() {
  const { t, localize } = useLanguage();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { signIn, signInWithGoogleLink } = useAuth();
  const linkingGoogle = params.get('google') === 'link_required';
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setError('');
    setPending(true);
    try {
      if (linkingGoogle) await signInWithGoogleLink(email, password);
      else await signIn(email, password);
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
    <LoginLayout>
      <div className="auth-header-card">
        <Tag tone="amber">
          <Store size={17} aria-hidden="true" />
          {t('auth.accountAccess')}
        </Tag>
        <h2 id="login-title">{t('auth.welcomeBack')}</h2>
        <p>{t('auth.signInForStoreOwnersManagersAnd')}</p>
      </div>
      {params.has('registered') && (
        <p role="status" className="auth-status-banner">
          {t('auth.accountCreatedSignInToContinue')}
        </p>
      )}
      {params.has('verified') && (
        <p role="status" className="auth-status-banner">
          {t('auth.verificationSuccess')}
        </p>
      )}
      {params.has('google') && (
        <p role="status" className="auth-status-banner">
          {t(
            linkingGoogle
              ? 'auth.googleLinkRequired'
              : params.get('google') === 'cancelled'
                ? 'auth.googleCancelled'
                : 'auth.googleFailed',
          )}
        </p>
      )}
      <form onSubmit={submit} className="auth-form-body">
        <fieldset disabled={pending}>
          <div className="auth-field-group">
            <label htmlFor="email">
              <Mail size={18} aria-hidden="true" />
              {t('auth.emailAddress')}
            </label>
            <div className="auth-input-wrapper">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                required
                maxLength={254}
                placeholder="name@company.com"
              />
            </div>
          </div>
          <PasswordField value={password} onChange={setPassword} />
          <ErrorMessage message={localize(error ?? '')} />
          <Button type="submit" className="auth-submit-btn">
            {pending ? (
              <>
                <Loading /> {t('auth.signingIn')}
              </>
            ) : (
              <>
                {t(linkingGoogle ? 'auth.googleLinkAction' : 'auth.signIn')}
                <ArrowRight size={22} aria-hidden="true" />
              </>
            )}
          </Button>
        </fieldset>
      </form>
      {!linkingGoogle && (
        <GoogleAuth
          disabled={pending}
          returnTo={safeReturnTo(params.get('returnTo'))}
        />
      )}
      <div className="auth-links">
        <Link to="/forgot-password" className="auth-link-subtle">
          {t('auth.forgotPassword')}
        </Link>
        <div className="auth-link-register-prompt">
          <span>Don't have an account? </span>
          <Link to="/register">
            {t('auth.createAccount')}
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </LoginLayout>
  );
}

export function RegisterPage() {
  const { t, localize, language } = useLanguage();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [verificationEmailSent, setVerificationEmailSent] = useState(true);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    if (password !== confirm) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }
    setError('');
    setPending(true);
    try {
      const result = await register(email, password, name);
      setVerificationEmailSent(result.verification_email_sent !== false);
      setRegistered(true);
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
  if (registered)
    return (
      <LoginLayout titleId="verify-title" story="verify">
        <div className="auth-header-card">
          <Tag tone="amber">{t('auth.createAccount2')}</Tag>
          <h2 id="verify-title">
            {language === 'en' ? 'Verify your email' : 'ยืนยันอีเมล'}
          </h2>
          <p>
            {language === 'en'
              ? 'Your account was created. Verify your email before setting up your store.'
              : 'สร้างบัญชีแล้ว กรุณายืนยันอีเมลก่อนตั้งค่าร้าน'}
          </p>
        </div>
        <div className="auth-form-body">
          {!verificationEmailSent && (
            <p role="alert" className="auth-error">
              {t('auth.verificationDeliveryFailed')}
            </p>
          )}
          <p className="auth-status-banner">{t('auth.checkInbox')}</p>
          <ResendVerification initialEmail={email} />
        </div>
        <div className="auth-links auth-links-single">
          <Link to="/login">{t('auth.alreadyHaveAnAccountSignIn')}</Link>
        </div>
      </LoginLayout>
    );
  return (
    <LoginLayout titleId="register-title" story="register">
      <div className="auth-header-card">
        <Tag tone="amber">
          <Store size={17} aria-hidden="true" />
          {t('auth.createAccount2')}
        </Tag>
        <h2 id="register-title">{t('auth.getStarted')}</h2>
        <p>
          {language === 'en'
            ? 'Create an account and verify your email to set up your store.'
            : 'สร้างบัญชีและยืนยันอีเมลเพื่อตั้งค่าร้าน'}
        </p>
      </div>
      <form onSubmit={submit} className="auth-form-body">
        <fieldset disabled={pending}>
          <div className="auth-field-group">
            <label htmlFor="display-name">
              <UserRound size={18} aria-hidden="true" />
              {t('auth.displayName')}
            </label>
            <div className="auth-input-wrapper">
              <input
                id="display-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
                maxLength={100}
                placeholder={t('auth.displayName')}
              />
            </div>
          </div>
          <div className="auth-field-group">
            <label htmlFor="email">
              <Mail size={18} aria-hidden="true" />
              {t('auth.emailAddress')}
            </label>
            <div className="auth-input-wrapper">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                maxLength={254}
                placeholder="name@company.com"
              />
            </div>
          </div>
          <PasswordField
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />
          <small className="auth-password-hint">
            {t('auth.useAtLeast12CharactersMaximum128')}
          </small>
          <div className="auth-field-group">
            <label htmlFor="confirm-password">
              <Lock size={18} aria-hidden="true" />
              {t('auth.confirmPassword')}
            </label>
            <div className="auth-input-wrapper">
              <input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                required
                placeholder={t('auth.confirmPassword')}
              />
            </div>
          </div>
          <ErrorMessage message={localize(error ?? '')} />
          <Button type="submit" className="auth-submit-btn">
            {pending ? (
              <>
                <Loading /> {t('auth.creatingAccount')}
              </>
            ) : (
              <>
                {t('auth.createAccount')}
                <ArrowRight size={22} aria-hidden="true" />
              </>
            )}
          </Button>
        </fieldset>
      </form>
      <GoogleAuth mode="register" disabled={pending} returnTo="/setup" />
      <div className="auth-links auth-links-single">
        <div className="auth-link-register-prompt">
          <Link to="/login">{t('auth.alreadyHaveAnAccountSignIn')}</Link>
        </div>
        <Link to={paths.verifyEmail}>{t('auth.verificationRecovery')}</Link>
      </div>
    </LoginLayout>
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
    if (pending) return;
    setError('');
    setMessage('');
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
    <AuthLayout titleId="forgot-title" story="recover">
      <div className="auth-header-card">
        <Tag tone="amber">
          <KeyRound size={17} aria-hidden="true" />
          {t('auth.accountRecovery')}
        </Tag>
        <h2 id="forgot-title">{t('auth.resetYourPassword')}</h2>
        <p>{t('auth.enterYourEmailIfAnEligibleAccount')}</p>
      </div>
      <form onSubmit={submit} className="auth-form-body">
        <fieldset disabled={pending}>
          <div className="auth-field-group">
            <label htmlFor="email">
              <Mail size={18} aria-hidden="true" />
              {t('auth.emailAddress')}
            </label>
            <div className="auth-input-wrapper">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                maxLength={254}
                placeholder="name@company.com"
              />
            </div>
          </div>
          <ErrorMessage message={localize(error ?? '')} />
          <Button type="submit" className="auth-submit-btn">
            {pending ? (
              t('auth.sending')
            ) : (
              <>
                {t('auth.requestResetLink')}
                <ArrowRight size={22} aria-hidden="true" />
              </>
            )}
          </Button>
        </fieldset>
      </form>
      {message && (
        <p role="status" className="auth-status-banner">
          {localize(message)}
        </p>
      )}
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
    if (pending || !token) return;
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
    <AuthLayout titleId="reset-title" story="reset">
      <div className="auth-header-card">
        <Tag tone="amber">{t('auth.secureReset')}</Tag>
        <h2 id="reset-title">{t('auth.chooseANewPassword')}</h2>
      </div>
      {done ? (
        <p role="status" className="auth-status-banner">
          {t('auth.passwordChangedExistingSessionsWereRevoked')}{' '}
          <Link to="/login">{t('auth.signInAgain')}</Link>.
        </p>
      ) : (
        <>
          {!token && (
            <p role="alert">{t('auth.thisResetLinkIsMissingAToken')}</p>
          )}
          <form onSubmit={submit} className="auth-form-body">
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
              <Button type="submit" className="auth-submit-btn">
                {pending ? t('auth.resetting') : t('auth.changePassword')}
              </Button>
            </fieldset>
          </form>
          <Link className="auth-recovery-link" to="/forgot-password">
            {t('auth.requestAnotherReset')}
          </Link>
        </>
      )}
      <p className="auth-links">
        <Link to="/login">{t('auth.backToSignIn')}</Link>
      </p>
    </AuthLayout>
  );
}
