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
  const targetPath =
    typeof destination === 'string'
      ? destination.split(/[?#]/)[0]
      : (destination.pathname ?? '');
  const isActive = Boolean(targetPath) && pathname === targetPath;
  return (
    <Link
      data-active={isActive ? 'true' : undefined}
      {...props}
      to={destination}
    />
  );
}
