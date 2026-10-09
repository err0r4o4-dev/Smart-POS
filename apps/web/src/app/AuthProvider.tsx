import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getSession, login, logout, type AuthSession } from '../lib/api';

type AuthState =
  | { status: 'loading' | 'error' | 'anonymous'; session: null }
  | { status: 'authenticated'; session: AuthSession };

interface AuthContextValue {
  state: AuthState;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clear: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const generation = useRef(0);
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
  return (
    <AuthContext.Provider
      value={{
        state,
        refresh,
        signIn,
        signOut,
        clear: () => {
          ++generation.current;
          setState({ status: 'anonymous', session: null });
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider is required');
  return context;
}
