import {
  useLocation,
  useNavigate,
  type NavigateFunction,
  type NavigateOptions,
  type To,
} from 'react-router-dom';
import { businessArea, workspacePath } from './workspace-paths';
import { useCallback } from 'react';

export function useWorkspaceNavigate(): NavigateFunction {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const area = businessArea(pathname);
  return useCallback(
    (to: To | number, options?: NavigateOptions) => {
      if (typeof to === 'number') return navigate(to);
      const destination =
        typeof to === 'string'
          ? workspacePath(to, area)
          : {
              ...to,
              pathname: to.pathname
                ? workspacePath(to.pathname, area)
                : to.pathname,
            };
      return navigate(destination, options);
    },
    [navigate, area],
  ) as NavigateFunction;
}
