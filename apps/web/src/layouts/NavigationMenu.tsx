import { NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  CookingPot,
  House,
  LayoutDashboard,
  Play,
  Receipt,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Terminal,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import { useLanguage } from '../app/language';
import { canAccess, type Session } from '../app/access';
import {
  navigationGroups,
  paths,
  type NavigationGroup,
  type NavigationItem,
} from '../app/routes';

const icons = {
  dashboard: LayoutDashboard,
  pos: Terminal,
  auth: ShieldCheck,
  help: BookOpen,
};

const pathIcons: Record<string, LucideIcon> = {
  '/dashboard': House,
  '/pos': Play,
  '/orders': ShoppingCart,
  '/kitchen': CookingPot,
  '/menu': Utensils,
  '/sales': BarChart3,
  '/receipts': Receipt,
  '/refunds': RotateCcw,
  '/settings': Settings,
  '/help': BookOpen,
};

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

  const visibleItems = items.filter((item) =>
    canAccess(access, item.permission, item.roles),
  );
  const activeItem = visibleItems
    .filter(
      (item) => pathname === item.to || pathname.startsWith(item.to + '/'),
    )
    .sort((left, right) => right.to.length - left.to.length)[0];

  const renderLink = (item: NavigationItem) => {
    const Icon = pathIcons[item.to] ?? icons[item.icon];
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={activeItem?.to !== item.to}
        className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
        onClick={onNavigate}
      >
        <Icon size={19} aria-hidden="true" />
        <span>{localize(item.label ?? '')}</span>
      </NavLink>
    );
  };

  if (groups.length === 0) {
    return <>{visibleItems.map(renderLink)}</>;
  }

  const ungroupedTopItems = visibleItems.filter((item) => item.to === homePath);
  const ungroupedBottomItems = visibleItems.filter(
    (item) =>
      item.to !== homePath &&
      !groups.some((group) => group.paths.includes(item.to)),
  );

  const nonSettingsGroups = groups.filter((group) => group.id !== 'settings');
  const settingsGroup = groups.find((group) => group.id === 'settings');
  const settingsItems = settingsGroup
    ? settingsGroup.paths.flatMap((path) =>
        visibleItems.filter((item) => item.to === path),
      )
    : [];

  const zones = [
    ...nonSettingsGroups.map((group, index) => {
      const groupItems = group.paths.flatMap((path) =>
        visibleItems.filter((item) => item.to === path),
      );
      return {
        id: group.id,
        items: index === 0 ? [...ungroupedTopItems, ...groupItems] : groupItems,
      };
    }),
    {
      id: 'settings-and-support',
      items: [...settingsItems, ...ungroupedBottomItems],
    },
  ].filter((zone) => zone.items.length > 0);

  return (
    <>
      {zones.map((zone) => (
        <div className="nav-zone" key={zone.id}>
          {zone.items.map(renderLink)}
        </div>
      ))}
    </>
  );
}
