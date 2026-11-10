import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLanguage } from '../../app/language';
import { ApiError, resendVerification, verifyEmail } from '../../lib/api';
import { LoginLayout } from '../../layouts/LoginLayout';
import {
  accountFailure,
  dismissSuccessFeedback,
  successFeedback,
} from '../../components/feedback/feedback';

// Called before the browser router is created, so the token is absent from rendered routes.
export function captureVerificationLink(): string | null {
  if (typeof window === 'undefined' || window.location.pathname !== '/setup')
    return null;
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const hasToken = url.searchParams.has('verify') || fragment.has('verify');
  if (!hasToken) return null;
  const token = url.searchParams.get('verify') ?? fragment.get('verify') ?? '';
  url.searchParams.delete('verify');
  if (fragment.has('verify')) {
    fragment.delete('verify');
    url.hash = fragment.toString();
  }
  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${url.search}${url.hash}`,
  );
  return token;
}

export function ResendVerification({
  initialEmail = '',
}: {
  initialEmail?: string;
}) {
  const { language } = useLanguage();
  const en = language === 'en';
  const [email, setEmail] = useState(initialEmail);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const submitting = useRef(false);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((cooldown - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) setCooldown(0);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);
  function wait(seconds: number) {
    setRemaining(seconds);
    setCooldown(seconds ? Date.now() + seconds * 1000 : 0);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || cooldown) return;
    submitting.current = true;
    dismissSuccessFeedback();
    setPending(true);
    setError('');
    setMessage('');
    try {
      await resendVerification(email);
      wait(60);
      successFeedback(
        en ? 'Request received' : 'รับคำขอแล้ว',
        en ? 'Close notification' : 'ปิดการแจ้งเตือน',
        en
          ? 'If an eligible account exists, check your email for verification instructions.'
          : 'หากบัญชีมีสิทธิ์ โปรดตรวจสอบอีเมลเพื่อยืนยันบัญชี',
      );
      setMessage(
        en
          ? 'If an eligible account exists, check your email for verification instructions.'
          : 'หากบัญชีมีสิทธิ์ โปรดตรวจสอบอีเมลเพื่อยืนยันบัญชี',
      );
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 429) {
        wait(failure.retryAfterSeconds ?? 60);
        setError(accountFailure(failure, en));
      } else {
        setError(
          en
            ? 'Could not request a verification email. The result is unconfirmed. Check your connection and inbox before trying again.'
            : 'ยังยืนยันผลคำขอส่งอีเมลไม่ได้ กรุณาตรวจสอบการเชื่อมต่อและกล่องอีเมลก่อนลองอีกครั้ง',
        );
      }
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="auth-form-body">
      <fieldset disabled={pending}>
        <label htmlFor="verification-email">
          {en ? 'Email address' : 'อีเมล'}
        </label>
        <input
          id="verification-email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button
          type="submit"
          className="button auth-submit-btn"
          disabled={cooldown > 0}
        >
          {pending
            ? en
              ? 'Sending…'
              : 'กำลังส่ง…'
            : cooldown
              ? en
                ? `Resend: suggested wait before retrying: ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
                : `แนะนำให้รอก่อนลองอีกครั้ง: ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
              : en
                ? 'Resend verification email'
                : 'ส่งอีเมลยืนยันอีกครั้ง'}
        </button>
      </fieldset>
      {message && <p className="auth-status-banner">{message}</p>}
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
    </form>
  );
}

export function VerificationFlow({
  token,
  onComplete,
  onContinue,
}: {
  token: string;
  onComplete: (userId: string) => Promise<void>;
  onContinue?: () => void;
}) {
  const { language, t } = useLanguage();
  const en = language === 'en';
  const request = useRef<Promise<{
    verified: boolean;
    user: { id: string };
  }> | null>(null);
  const [status, setStatus] = useState<
    'loading' | 'verified' | 'invalid' | 'error' | 'refreshError'
  >(token ? 'loading' : 'invalid');
  const [verifiedId, setVerifiedId] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    if (!token) return;
    if (!request.current) request.current = verifyEmail(token);
    request.current
      .then(async (result) => {
        if (!result.verified || !result.user?.id)
          throw new Error('Invalid verification response');
        if (!active) return;
        setVerifiedId(result.user.id);
        try {
          await onComplete(result.user.id);
          if (active) setStatus('verified');
        } catch {
          if (active) setStatus('refreshError');
        }
      })
      .catch((error: unknown) => {
        if (active)
          setStatus(
            error instanceof ApiError && error.status === 400
              ? 'invalid'
              : 'error',
          );
      });
    return () => {
      active = false;
    };
  }, [token, onComplete, attempt]);
  async function retryRefresh() {
    setStatus('loading');
    try {
      await onComplete(verifiedId);
      setStatus('verified');
    } catch {
      setStatus('refreshError');
    }
  }
  return (
    <LoginLayout titleId="verification-title" story="verify">
      <div className="auth-header-card">
        <h2 id="verification-title">
          {en ? 'Verify your email' : 'ยืนยันอีเมล'}
        </h2>
      </div>
      {status === 'verified' ? (
        <>
          <p role="status" className="auth-status-banner">
            {t('auth.verificationSuccess')}
          </p>
          {onContinue && (
            <button
              type="button"
              className="button auth-submit-btn"
              onClick={onContinue}
            >
              {t('auth.verificationContinue')}
            </button>
          )}
          <p className="auth-links auth-links-single">
            <a href="/login?verified=1&returnTo=%2Fsetup">
              {en ? 'Sign in' : 'เข้าสู่ระบบ'}
            </a>
          </p>
        </>
      ) : status === 'loading' ? (
        <p role="status">
          {en ? 'Verifying your email…' : 'กำลังยืนยันอีเมล…'}
        </p>
      ) : (
        <>
          <p role="alert">
            {status === 'invalid'
              ? en
                ? 'This link is invalid or expired.'
                : 'ลิงก์ไม่ถูกต้องหรือหมดอายุ'
              : status === 'refreshError'
                ? en
                  ? 'Email verified, but the session could not be refreshed. Sign in to the verified account and try again.'
                  : 'ยืนยันอีเมลแล้ว แต่โหลดเซสชันไม่สำเร็จ กรุณาเข้าสู่ระบบด้วยบัญชีที่ยืนยัน'
                : en
                  ? 'Verification could not be completed. The link may be invalid or expired, or the service may be unavailable.'
                  : 'ไม่สามารถยืนยันได้ ลิงก์อาจหมดอายุหรือระบบไม่พร้อมใช้งาน'}
          </p>
          {status === 'refreshError' ? (
            <button
              className="button auth-submit-btn"
              onClick={() => void retryRefresh()}
            >
              {en ? 'Retry session' : 'ลองโหลดเซสชันอีกครั้ง'}
            </button>
          ) : (
            <>
              {status === 'error' && (
                <button
                  className="button auth-submit-btn"
                  onClick={() => {
                    request.current = null;
                    setStatus('loading');
                    setAttempt((value) => value + 1);
                  }}
                >
                  {en ? 'Retry verification' : 'ลองยืนยันอีกครั้ง'}
                </button>
              )}
              <ResendVerification />
            </>
          )}
          <p className="auth-links auth-links-single">
            <a href="/login?returnTo=%2Fsetup">
              {en ? 'Sign in' : 'เข้าสู่ระบบ'}
            </a>
          </p>
        </>
      )}
    </LoginLayout>
  );
}
