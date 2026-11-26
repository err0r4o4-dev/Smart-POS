import { createContext, useContext } from 'react';
import type { UiMessage } from '../../i18n';
import type { POSTerminal, POSShift, POSCart } from '../../lib/pos-api';

interface Workspace {
  org: string;
  user: string;
  branch: string;
  csrf: string;
  terminals: POSTerminal[];
  terminal: POSTerminal | undefined;
  setTerminal: (id: string) => void;
  shifts: POSShift[];
  shift: POSShift | undefined;
  cart: POSCart | undefined;
  setCart: (id: string) => void;
  busy: boolean;
  error: string;
  message: UiMessage;
  setMessage: (value: UiMessage) => void;
  mutate: <Result>(
    path: string,
    body: object,
    method?: string,
    key?: string,
  ) => Promise<Result | undefined>;
  refresh: () => Promise<void>;
  can: (permission: string) => boolean;
  loading: boolean;
}
export const WorkspaceContext = createContext<Workspace | null>(null);
export function usePOS() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('POS workspace required');
  return value;
}
