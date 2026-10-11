import { useId, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  BookOpen,
  ChevronDown,
  LayoutDashboard,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { canAccess, type Session } from '../app/access';
import {
  navigationGroups,
  paths,
  type NavigationItem,
  type NavigationGroup,
} from '../app/routes';

const icons = {
  dashboard: LayoutDashboard,
  pos: Terminal,
  auth: ShieldCheck,
  help: BookOpen,
};

interface NavigationMenuProps {
  items: NavigationItem[];
  access: Session;
  groups?: NavigationGroup[];
  homePath?: string;
  onNavigate?: () => void;
}

export function NavigationMenu(props: NavigationMenuProps) {
  const { pathname } = useLocation();
  const accessKey = props.access.authenticated
    ? props.access.role + ':' + props.access.permissions.join(',')
    : 'anonymous';
  return (
    <GroupedMenu
      key={pathname + ':' + accessKey + ':' + props.homePath}
      {...props}
      pathname={pathname}
    />
  );
}

function GroupedMenu({
  items,
  access,
  onNavigate,
  pathname,
  groups = navigationGroups,
  homePath = paths.dashboard,
}: NavigationMenuProps & { pathname: string }) {
  const panelPrefix = useId();
  const visibleItems = items.filter((item) =>
    canAccess(access, item.permission, item.roles),
  );
  const activeItem = visibleItems
    .filter(
      (item) => pathname === item.to || pathname.startsWith(item.to + '/'),
    )
    .sort((left, right) => right.to.length - left.to.length)[0];
  const [expanded, setExpanded] = useState(
    () =>
      new Set(
        groups
          .filter((group) => activeItem && group.paths.includes(activeItem.to))
          .map((group) => group.id),
      ),
  );
  const renderLink = (item: NavigationItem) => {
    const Icon = icons[item.icon];
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={activeItem?.to !== item.to}
        className={({ isActive }) => 'nav-item ' + (isActive ? 'active' : '')}
        onClick={onNavigate}
      >
        <Icon size={20} aria-hidden="true" />
        <span>{item.label}</span>
      </NavLink>
    );
  };
  return (
    <>
      {visibleItems.filter((item) => item.to === homePath).map(renderLink)}
      {groups.map((group) => {
        const groupItems = group.paths.flatMap((path) =>
          visibleItems.filter((item) => item.to === path),
        );
        if (!groupItems.length) return null;
        const isExpanded = expanded.has(group.id);
        const isActive = groupItems.some((item) => item.to === activeItem?.to);
        const panelID = panelPrefix + '-' + group.id;
        return (
          <div className="nav-group" key={group.id}>
            <button
              type="button"
              className={'nav-group-toggle ' + (isActive ? 'active' : '')}
              aria-expanded={isExpanded}
              aria-controls={panelID}
              onClick={() =>
                setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(group.id)) next.delete(group.id);
                  else next.add(group.id);
                  return next;
                })
              }
            >
              <span>{group.label}</span>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            <div id={panelID} className="nav-group-items" hidden={!isExpanded}>
              {groupItems.map(renderLink)}
            </div>
          </div>
        );
      })}
      {visibleItems
        .filter(
          (item) =>
            item.to !== homePath &&
            !groups.some((group) => group.paths.includes(item.to)),
        )
        .map(renderLink)}
    </>
  );
}
