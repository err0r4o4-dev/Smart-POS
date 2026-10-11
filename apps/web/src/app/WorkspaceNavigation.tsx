import { Link, useLocation, type LinkProps } from 'react-router-dom';
import { businessArea, workspacePath } from './workspace-paths';

export function WorkspaceLink({ to, ...props }: LinkProps) {
  const { pathname } = useLocation();
  const area = businessArea(pathname);
  const destination =
    typeof to === 'string'
      ? workspacePath(to, area)
      : {
          ...to,
          pathname: to.pathname
            ? workspacePath(to.pathname, area)
            : to.pathname,
        };
  return <Link {...props} to={destination} />;
}
