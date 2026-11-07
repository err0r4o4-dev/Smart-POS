import { useId } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  CookingPot,
  Globe,
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
  '/manage/dashboard': House,
  '/manage/pos': Play,
  '/manage/online-orders': ShoppingCart,
  '/manage/restaurant/queue': CookingPot,
  '/manage/products': Utensils,
  '/manage/sales': BarChart3,
  '/manage/receipts': Receipt,
  '/manage/sales/refunds': RotateCcw,
  '/manage/settings': Settings,
  '/manage/settings/storefront': Globe,
  '/manage/help': BookOpen,
  '/help': BookOpen,
};

const groupIcons: Record<string, LucideIcon> = {
  operations: ShoppingCart,
  management: Utensils,
  settings: Settings,
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
  const sectionPrefix = useId();

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

  const ungroupedTopItems = visibleItems.filter((item) => item.to === homePath);
  const renderedGroups = groups
    .map((group) => ({
      group,
      groupItems: group.paths.flatMap((path) =>
        visibleItems.filter((item) => item.to === path),
      ),
    }))
    .filter(({ groupItems }) => groupItems.length > 0);
  const ungroupedBottomItems = visibleItems.filter(
    (item) =>
      item.to !== homePath &&
      !groups.some((group) => group.paths.includes(item.to)),
  );

  return (
    <>
      {ungroupedTopItems.map(renderLink)}
      {renderedGroups.map(({ group, groupItems }) => {
        const isActive = groupItems.some((item) => item.to === activeItem?.to);
        const titleID = sectionPrefix + '-' + group.id;
        const GroupIcon = groupIcons[group.id];
        return (
          <div
            className="nav-section"
            key={group.id}
            role="group"
            aria-labelledby={titleID}
          >
            <div
              id={titleID}
              className={'nav-section-title' + (isActive ? ' active' : '')}
            >
              {GroupIcon && <GroupIcon size={14} aria-hidden="true" />}
              <span>{localize(group.label ?? '')}</span>
            </div>
            <div className="nav-section-items">
              {groupItems.map(renderLink)}
            </div>
          </div>
        );
      })}
      {ungroupedBottomItems.length > 0 &&
        (renderedGroups.length > 0 ? (
          <div className="nav-section nav-section-footer">
            <div className="nav-section-items">
              {ungroupedBottomItems.map(renderLink)}
            </div>
          </div>
        ) : (
          ungroupedBottomItems.map(renderLink)
        ))}
    </>
  );
}
