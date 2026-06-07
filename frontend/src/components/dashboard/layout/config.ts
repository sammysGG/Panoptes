import type { NavItemConfig } from '@/types/nav';
import { paths } from '@/paths';

export const navItems = [
  { key: 'overview', title: 'Overview', href: paths.dashboard.overview, icon: 'chart-pie' },
  { key: 'scan', title: 'Scan', href: paths.dashboard.scan, icon: 'radar' },
  { key: 'systems', title: 'Systems', href: paths.dashboard.systems, icon: 'desktop' },
  { key: 'definitions', title: 'System Definitions', href: paths.dashboard.definitions, icon: 'shield' },
  { key: 'modules', title: 'Modules', href: paths.dashboard.modules, icon: 'puzzle' },
  { key: 'settings', title: 'Settings', href: paths.dashboard.settings, icon: 'gear-six' },
  { key: 'account', title: 'Account', href: paths.dashboard.account, icon: 'user' },
] satisfies NavItemConfig[];
