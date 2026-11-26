import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  getSession,
  login,
  linkGoogle,
  logout,
  type AuthSession,
} from '../lib/api';
import {
  captureVerificationLink,
  VerificationFlow,
} from '../features/auth/VerificationFlow';

let initialVerificationToken = captureVerificationLink();

type AuthState =
  | { status: 'loading' | 'error' | 'anonymous'; session: null }
  | { status: 'authenticated'; session: AuthSession };

interface AuthContextValue {
  state: AuthState;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogleLink: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clear: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const generation = useRef(0);
  const [verificationToken, setVerificationToken] = useState(
    initialVerificationToken,
  );
  const verificationAtStartup = useRef(verificationToken !== null);
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    session: null,
  });
  const refresh = async () => {
    const current = ++generation.current;
    setState({ status: 'loading', session: null });
    try {
      const session = await getSession();
      if (current === generation.current)
        setState(
          session
            ? { status: 'authenticated', session }
            : { status: 'anonymous', session: null },
        );
    } catch {
      if (current === generation.current)
        setState({ status: 'error', session: null });
    }
  };
  useEffect(() => {
    let active = true;
    if (verificationAtStartup.current) return;
    const current = generation.current;
    getSession()
      .then((session) => {
        if (active && current === generation.current)
          setState(
            session
              ? { status: 'authenticated', session }
              : { status: 'anonymous', session: null },
          );
      })
      .catch(() => {
        if (active && current === generation.current)
          setState({ status: 'error', session: null });
      });
    return () => {
      active = false;
    };
  }, []);
  const completeVerification = useCallback(async (userId: string) => {
    const current = ++generation.current;
    const session = await getSession();
    if (current !== generation.current) throw new Error('Session changed');
    if (
      session &&
      (session.user.id !== userId || session.user.email_verified !== true)
    )
      throw new Error('Sign in to the verified account');
    setState(
      session
        ? { status: 'authenticated', session }
        : { status: 'anonymous', session: null },
    );
  }, []);
  const signIn = async (email: string, password: string) => {
    const current = ++generation.current;
    const session = await login(email, password);
    if (current === generation.current)
      setState({ status: 'authenticated', session });
  };
  const signOut = async () => {
    if (state.status !== 'authenticated') return;
    const current = ++generation.current;
    await logout(state.session.csrf_token);
    if (current === generation.current)
      setState({ status: 'anonymous', session: null });
  };
  const signInWithGoogleLink = async (email: string, password: string) => {
    const current = ++generation.current;
    const session = await linkGoogle(email, password);
    if (current === generation.current)
      setState({ status: 'authenticated', session });
  };
  return (
    <AuthContext.Provider
      value={{
        state,
        refresh,
        signIn,
        signInWithGoogleLink,
        signOut,
        clear: () => {
          ++generation.current;
          setState({ status: 'anonymous', session: null });
        },
      }}
    >
      {verificationToken !== null ? (
        <VerificationFlow
          token={verificationToken}
          onComplete={completeVerification}
          onContinue={
            state.status === 'authenticated'
              ? () => {
                  initialVerificationToken = null;
                  setVerificationToken(null);
                }
              : undefined
          }
        />
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider is required');
  return context;
}
