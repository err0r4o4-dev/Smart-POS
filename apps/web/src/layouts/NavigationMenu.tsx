import { useLanguage } from '../app/language';
import { useEffect, useId, useSyncExternalStore } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  Briefcase,
  ChevronDown,
  Contact,
  FileText,
  House,
  LayoutDashboard,
  LayoutGrid,
  Play,
  Receipt,
  ReceiptText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Terminal,
  type LucideIcon,
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

const pathIcons: Record<string, LucideIcon> = {
  '/manage/dashboard': House,
  '/manage/products': LayoutGrid,
  '/manage/pos': Play,
  '/manage/online-orders': ShoppingCart,
  '/manage/sales': FileText,
  '/manage/receipts': Receipt,
};

const groupIcons: Record<string, LucideIcon> = {
  sales: ShoppingCart,
  menu: ReceiptText,
  inventory: Briefcase,
  customers: Contact,
  reports: BarChart3,
  settings: Settings,
};

const STORAGE_PREFIX = 'smartpos.nav.collapsed:';
const navListeners = new Set<() => void>();
const memoryFallback = new Map<string, string>();

interface StoredNavState {
  collapsed: string[];
  lastPathname?: string;
}

function notifyNavListeners() {
  for (const listener of navListeners) listener();
}

function subscribeNavState(listener: () => void) {
  navListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    navListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function readRawNavState(homePath: string): string {
  const key = STORAGE_PREFIX + homePath;
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return memoryFallback.get(key) ?? '';
  }
}

function parseStoredNavState(raw: string): StoredNavState {
  if (!raw) return { collapsed: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return {
        collapsed: parsed.filter((id): id is string => typeof id === 'string'),
      };
    }
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      const collapsed = Array.isArray(record.collapsed)
        ? record.collapsed.filter((id): id is string => typeof id === 'string')
        : [];
      const lastPathname =
        typeof record.lastPathname === 'string'
          ? record.lastPathname
          : undefined;
      return { collapsed, lastPathname };
    }
  } catch {
    /* Fall back to default all-open state if stored data is malformed. */
  }
  return { collapsed: [] };
}

function writeStoredNavState(homePath: string, state: StoredNavState) {
  const key = STORAGE_PREFIX + homePath;
  const serialized = JSON.stringify(state);
  try {
    localStorage.setItem(key, serialized);
  } catch {
    memoryFallback.set(key, serialized);
  }
  notifyNavListeners();
}

interface NavigationMenuProps {
  items: NavigationItem[];
  access: Session;
  groups?: NavigationGroup[];
  homePath?: string;
  onNavigate?: () => void;
}

export function NavigationMenu({
  items,
  access,
  onNavigate,
  groups = navigationGroups,
  homePath = paths.dashboard,
}: NavigationMenuProps) {
  const { pathname } = useLocation();
  const { localize } = useLanguage();
  const panelPrefix = useId();

  const rawState = useSyncExternalStore(
    subscribeNavState,
    () => readRawNavState(homePath),
    () => '',
  );
  const stored = parseStoredNavState(rawState);

  const visibleItems = items.filter((item) =>
    canAccess(access, item.permission, item.roles),
  );
  const activeItem = visibleItems
    .filter(
      (item) => pathname === item.to || pathname.startsWith(item.to + '/'),
    )
    .sort((left, right) => right.to.length - left.to.length)[0];
  const activeGroupId = groups.find(
    (group) => activeItem && group.paths.includes(activeItem.to),
  )?.id;
  const hasVisibleGroups = groups.some((group) =>
    group.paths.some((path) => visibleItems.some((item) => item.to === path)),
  );

  const shouldAutoExpandActive =
    hasVisibleGroups &&
    Boolean(activeGroupId) &&
    stored.lastPathname !== pathname;

  const effectiveCollapsed = new Set(stored.collapsed);
  if (shouldAutoExpandActive && activeGroupId) {
    effectiveCollapsed.delete(activeGroupId);
  }

  useEffect(() => {
    if (!hasVisibleGroups) return;
    const current = parseStoredNavState(readRawNavState(homePath));
    if (current.lastPathname === pathname) return;
    const nextCollapsed =
      activeGroupId && current.collapsed.includes(activeGroupId)
        ? current.collapsed.filter((id) => id !== activeGroupId)
        : current.collapsed;
    writeStoredNavState(homePath, {
      collapsed: nextCollapsed,
      lastPathname: pathname,
    });
  }, [activeGroupId, hasVisibleGroups, homePath, pathname]);

  const renderLink = (item: NavigationItem) => {
    const Icon = pathIcons[item.to] ?? icons[item.icon];
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={activeItem?.to !== item.to}
        className={({ isActive }) => 'nav-item ' + (isActive ? 'active' : '')}
        onClick={onNavigate}
      >
        <Icon size={19} aria-hidden="true" />
        <span>{localize(item.label ?? '')}</span>
      </NavLink>
    );
  };

  const ungroupedTopItems = visibleItems.filter((item) => item.to === homePath);
  const ungroupedBottomItems = visibleItems.filter(
    (item) =>
      item.to !== homePath &&
      !groups.some((group) => group.paths.includes(item.to)),
  );

  return (
    <>
      {ungroupedTopItems.map(renderLink)}
      {groups.map((group) => {
        const groupItems = group.paths.flatMap((path) =>
          visibleItems.filter((item) => item.to === path),
        );
        if (!groupItems.length) return null;
        const isExpanded = !effectiveCollapsed.has(group.id);
        const isActive = groupItems.some((item) => item.to === activeItem?.to);
        const panelID = panelPrefix + '-' + group.id;
        const GroupIcon = groupIcons[group.id];
        return (
          <div className="nav-group" key={group.id}>
            <button
              type="button"
              className={'nav-group-toggle ' + (isActive ? 'active' : '')}
              aria-expanded={isExpanded}
              aria-controls={panelID}
              onClick={() => {
                const next = new Set(effectiveCollapsed);
                if (next.has(group.id)) next.delete(group.id);
                else next.add(group.id);
                writeStoredNavState(homePath, {
                  collapsed: [...next],
                  lastPathname: pathname,
                });
              }}
            >
              <span className="nav-group-label">
                {GroupIcon && <GroupIcon size={18} aria-hidden="true" />}
                <span>{localize(group.label ?? '')}</span>
              </span>
              <ChevronDown size={15} aria-hidden="true" />
            </button>
            <div id={panelID} className="nav-group-items" hidden={!isExpanded}>
              {groupItems.map(renderLink)}
            </div>
          </div>
        );
      })}
      {ungroupedBottomItems.map(renderLink)}
    </>
  );
}
