import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Link, useBeforeUnload, useBlocker } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../app/AuthProvider';
import { useLanguage } from '../../app/language';
import { paths } from '../../app/routes';
import { Button, Loading } from '../../components/ui/primitives';
import { LoginLayout } from '../../layouts/LoginLayout';
import { ApiError } from '../../lib/api';
import {
  beginMFAEnrollment,
  beginMFARecovery,
  confirmMFAEnrollment,
  confirmMFARecovery,
  getMFAStatus,
  verifyMFA,
  type MFAEnrollment,
  type MFAStatus,
} from './mfa-api';
import './mfa.css';

type Flow =
  | { kind: 'loading' | 'unavailable' | 'uncertain' | 'expired' }
  | { kind: 'status'; value: MFAStatus }
  | { kind: 'recovery-input' }
  | { kind: 'enrollment' | 'replacement'; value: MFAEnrollment }
  | { kind: 'codes'; value: string[]; replaced?: boolean }
  | { kind: 'relogin'; uncertain: boolean };

export function MFASettingsPage() {
  const { state, clear } = useAuth();
  if (state.status !== 'authenticated') return null;
  return (
    <MFAFlow
      key={`${state.session.user.id}:${state.session.csrf_token}`}
      csrf={state.session.csrf_token}
      invalidSession={clear}
    />
  );
}

function MFAFlow({
  csrf,
  invalidSession,
}: {
  csrf: string;
  invalidSession: () => void;
}) {
  const { t, formatDateTime } = useLanguage();
  const [flow, setFlow] = useState<Flow>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [error, setError] = useState<'invalid' | 'limited' | 'unknown' | null>(
    null,
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [missingRecoveryCodes, setMissingRecoveryCodes] = useState(false);
  const [invalidate] = useState(() => invalidSession);
  const activeRequest = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const codeHeading = useRef<HTMLHeadingElement>(null);
  const protectCodes = flow.kind === 'codes';
  const confirmationPending =
    busy && (flow.kind === 'enrollment' || flow.kind === 'replacement');
  const protectNavigation = protectCodes || confirmationPending;
  const blocker = useBlocker(protectNavigation);
  useBeforeUnload(
    useCallback(
      (event) => {
        if (protectNavigation) {
          event.preventDefault();
          event.returnValue = '';
        }
      },
      [protectNavigation],
    ),
  );

  useEffect(() => {
    const controller = new AbortController();
    activeRequest.current = controller;
    getMFAStatus(controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setFlow({ kind: 'status', value });
      },
      (failure) => {
        if (controller.signal.aborted) return;
        if (
          failure instanceof ApiError &&
          (failure.status === 401 || failure.status === 403)
        ) {
          setFlow({ kind: 'expired' });
          invalidate();
        } else setFlow({ kind: 'unavailable' });
      },
    );
    return () => activeRequest.current?.abort();
  }, [invalidate]);
  useEffect(() => {
    if (protectCodes) codeHeading.current?.focus();
  }, [protectCodes]);
  useEffect(() => {
    if (!protectNavigation && blocker.state === 'blocked') blocker.reset();
  }, [protectNavigation, blocker]);

  async function perform<T>(
    work: (signal: AbortSignal) => Promise<T>,
    accept: (value: T) => void,
    mutation = false,
  ) {
    if (busyRef.current) return;
    busyRef.current = true;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    setError(null);
    try {
      const value = await work(controller.signal);
      if (!controller.signal.aborted) accept(value);
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (
        mutation &&
        flow.kind === 'replacement' &&
        !(
          failure instanceof ApiError &&
          [400, 403, 429].includes(failure.status)
        )
      ) {
        setCode('');
        setFlow({ kind: 'relogin', uncertain: true });
        return;
      }
      if (
        failure instanceof ApiError &&
        (failure.status === 401 || failure.status === 403)
      ) {
        setCode('');
        setRecoveryCode('');
        setFlow({ kind: 'expired' });
        invalidate();
      } else if (
        failure instanceof ApiError &&
        (failure.status === 400 || failure.status === 429)
      ) {
        setError(failure.status === 429 ? 'limited' : 'invalid');
      } else {
        if (mutation && flow.kind === 'enrollment')
          setMissingRecoveryCodes(true);
        setError(mutation ? 'unknown' : null);
        setCode('');
        setRecoveryCode('');
        setFlow({ kind: mutation ? 'uncertain' : 'unavailable' });
      }
    } finally {
      if (!controller.signal.aborted) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  const checkStatus = () =>
    void perform(
      (signal) => getMFAStatus(signal),
      (value) => setFlow({ kind: 'status', value }),
    );
  const startRecovery = (event: FormEvent) => {
    event.preventDefault();
    if (!/^[A-Z2-7]{25}[AEIMQUY4]$/.test(recoveryCode)) return;
    void perform(
      (signal) => beginMFARecovery(recoveryCode, csrf, signal),
      (value) => {
        setRecoveryCode('');
        setFlow({ kind: 'replacement', value });
      },
      true,
    );
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (
      !/^[0-9]{6}$/.test(code) ||
      (flow.kind !== 'enrollment' &&
        flow.kind !== 'replacement' &&
        flow.kind !== 'status')
    )
      return;
    if (flow.kind === 'enrollment' || flow.kind === 'replacement') {
      const replaced = flow.kind === 'replacement';
      const factorId = flow.value.factor_id;
      void perform(
        (signal) =>
          replaced
            ? confirmMFARecovery(factorId, code, csrf, signal)
            : confirmMFAEnrollment(code, csrf, signal),
        (result) => {
          setCode('');
          setAcknowledged(false);
          setMissingRecoveryCodes(false);
          setFlow({ kind: 'codes', value: result.recovery_codes, replaced });
        },
        true,
      );
    } else {
      void perform(
        (signal) => verifyMFA(code, csrf, signal),
        () => {
          setCode('');
          setFlow({
            kind: 'status',
            value: { enabled: true, session_verified: true },
          });
        },
        true,
      );
    }
  };
  const needsCode =
    flow.kind === 'enrollment' ||
    flow.kind === 'replacement' ||
    (flow.kind === 'status' &&
      flow.value.enabled &&
      !flow.value.session_verified);

  return (
    <LoginLayout titleId="mfa-title" story="security">
      <div className="mfa-panel">
        <div className="auth-header-card">
          <ShieldCheck size={28} aria-hidden="true" />
          <h2 id="mfa-title">{t('mfa.title')}</h2>
          <p>{t('mfa.intro')}</p>
        </div>
        {flow.kind === 'loading' && <Loading>{t('mfa.checking')}</Loading>}
        {flow.kind === 'unavailable' && (
          <p role="alert">{t('mfa.unavailable')}</p>
        )}
        {flow.kind === 'status' && (
          <p role="status">
            {t(flow.value.enabled ? 'mfa.enabled' : 'mfa.disabled')}
          </p>
        )}
        {flow.kind === 'status' && flow.value.session_verified && (
          <p role="status">{t('mfa.verified')}</p>
        )}
        {flow.kind === 'status' && !flow.value.enabled && (
          <Button
            disabled={busy}
            onClick={() =>
              void perform(
                (signal) => beginMFAEnrollment(csrf, signal),
                (value) => setFlow({ kind: 'enrollment', value }),
                true,
              )
            }
          >
            {t(busy ? 'mfa.pending' : 'mfa.begin')}
          </Button>
        )}
        {flow.kind === 'status' && flow.value.enabled && (
          <Button
            disabled={busy}
            onClick={() => {
              setCode('');
              setError(null);
              setFlow({ kind: 'recovery-input' });
            }}
          >
            {t('mfa.startRecovery')}
          </Button>
        )}
        {flow.kind === 'recovery-input' && (
          <form className="auth-form-body" onSubmit={startRecovery}>
            <fieldset disabled={busy}>
              <p id="mfa-recovery-help">{t('mfa.recoveryHelp')}</p>
              <div className="auth-field-group">
                <label htmlFor="mfa-recovery-code">
                  {t('mfa.recoveryCode')}
                </label>
                <input
                  id="mfa-recovery-code"
                  type="text"
                  value={recoveryCode}
                  onChange={(event) =>
                    setRecoveryCode(event.target.value.toUpperCase().trim())
                  }
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="characters"
                  pattern="[A-Z2-7]{25}[AEIMQUY4]"
                  maxLength={26}
                  required
                  aria-describedby={
                    error ? 'mfa-recovery-help mfa-error' : 'mfa-recovery-help'
                  }
                />
              </div>
              <Button type="submit">
                {t(busy ? 'mfa.pending' : 'mfa.stageReplacement')}
              </Button>
            </fieldset>
          </form>
        )}
        {(flow.kind === 'recovery-input' || flow.kind === 'replacement') && (
          <Button
            disabled={busy}
            onClick={() => {
              setCode('');
              setRecoveryCode('');
              setFlow({ kind: 'loading' });
              checkStatus();
            }}
          >
            {t('mfa.cancelRecovery')}
          </Button>
        )}
        {(flow.kind === 'enrollment' || flow.kind === 'replacement') && (
          <div className="mfa-enrollment">
            <label htmlFor="mfa-key">{t('mfa.key')}</label>
            <p id="mfa-key-help">{t('mfa.keyHelp')}</p>
            <textarea
              id="mfa-key"
              readOnly
              value={flow.value.secret}
              rows={2}
              spellCheck={false}
              autoComplete="off"
              aria-describedby="mfa-key-help"
            />
            <p>
              {t('mfa.expiry')}{' '}
              <time dateTime={flow.value.expires_at}>
                {formatDateTime(flow.value.expires_at)}
              </time>
            </p>
          </div>
        )}
        {needsCode && (
          <form className="auth-form-body" onSubmit={submit}>
            <fieldset disabled={busy}>
              {flow.kind === 'status' && <p>{t('mfa.challenge')}</p>}
              {flow.kind === 'replacement' && <p>{t('mfa.replacementHelp')}</p>}
              <div className="auth-field-group">
                <label htmlFor="mfa-code">{t('mfa.code')}</label>
                <input
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  minLength={6}
                  maxLength={6}
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  aria-describedby={error ? 'mfa-error' : undefined}
                />
              </div>
              <Button type="submit">
                {t(
                  busy
                    ? 'mfa.pending'
                    : flow.kind === 'enrollment'
                      ? 'mfa.enable'
                      : flow.kind === 'replacement'
                        ? 'mfa.replace'
                        : 'mfa.verify',
                )}
              </Button>
            </fieldset>
          </form>
        )}
        {error && (
          <p id="mfa-error" role="alert" className="auth-error">
            {t(`mfa.${error}`)}
          </p>
        )}
        {missingRecoveryCodes && <p>{t('mfa.missingCodes')}</p>}
        {(flow.kind === 'unavailable' || flow.kind === 'uncertain') && (
          <Button disabled={busy} onClick={checkStatus}>
            {t(busy ? 'mfa.pending' : 'mfa.retry')}
          </Button>
        )}
        {flow.kind === 'codes' && (
          <section aria-labelledby="mfa-codes-title">
            <h3 id="mfa-codes-title" tabIndex={-1} ref={codeHeading}>
              {t('mfa.codesTitle')}
            </h3>
            <p>{t('mfa.codesHelp')}</p>
            {flow.replaced && <p>{t('mfa.replaced')}</p>}
            <ul className="mfa-recovery-codes">
              {flow.value.map((value) => (
                <li key={value}>
                  <code>{value}</code>
                </li>
              ))}
            </ul>
            <label className="mfa-acknowledge">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              <span>{t('mfa.acknowledged')}</span>
            </label>
            <Button
              disabled={!acknowledged}
              onClick={() => {
                if (blocker.state === 'blocked') blocker.reset();
                if (flow.replaced) {
                  setFlow({ kind: 'relogin', uncertain: false });
                  return;
                }
                setFlow({
                  kind: 'status',
                  value: { enabled: true, session_verified: true },
                });
              }}
            >
              {t('mfa.done')}
            </Button>
          </section>
        )}
        {blocker.state === 'blocked' && (
          <section role="alert" className="mfa-navigation-warning">
            <h3>
              {t(
                confirmationPending
                  ? 'mfa.pendingLeaveTitle'
                  : 'mfa.leaveTitle',
              )}
            </h3>
            <p>
              {t(
                confirmationPending
                  ? flow.kind === 'replacement'
                    ? 'mfa.replacementLeaveHelp'
                    : 'mfa.pendingLeaveHelp'
                  : 'mfa.leaveHelp',
              )}
            </p>
            <Button onClick={() => blocker.reset()}>{t('mfa.stay')}</Button>
            <Button onClick={() => blocker.proceed()}>
              {t(confirmationPending ? 'mfa.pendingLeave' : 'mfa.leave')}
            </Button>
          </section>
        )}
        {flow.kind === 'relogin' && (
          <div>
            <p role={flow.uncertain ? 'alert' : 'status'}>
              {t(flow.uncertain ? 'mfa.replacementUnknown' : 'mfa.replaced')}
            </p>
            <Link
              to={`${paths.login}?returnTo=${encodeURIComponent(paths.security)}`}
              onClick={invalidate}
            >
              {t('mfa.signinAgain')}
            </Link>
          </div>
        )}
        {flow.kind !== 'codes' && flow.kind !== 'relogin' && (
          <p className="mfa-signin-help">{t('mfa.signinHelp')}</p>
        )}
        {flow.kind !== 'relogin' && (
          <div className="auth-links auth-links-single">
            <Link to={paths.login}>{t('mfa.signin')}</Link>
            <Link to={paths.workspace}>{t('mfa.workspace')}</Link>
          </div>
        )}
      </div>
    </LoginLayout>
  );
}
