import {
  CalendarClock,
  CalendarDays,
  FolderTree,
  HardDrive,
  Home,
  Images,
  Link2,
  MapPin,
  PackageCheck,
  Send,
  UserRound,
  UsersRound,
  type LucideProps,
} from "lucide-react";
import type { NavIcon as NavIconName } from "@/lib/nav";

const ICONS: Record<NavIconName, React.ComponentType<LucideProps>> = {
  home: Home,
  services: CalendarDays,
  gallery: Images,
  handoffs: PackageCheck,
  people: UserRound,
  teams: UsersRound,
  categories: FolderTree,
  schedule: CalendarClock,
  drive: HardDrive,
  telegram: Send,
  share: Link2,
  regions: MapPin,
};

export function NavIcon({ name, ...props }: { name: NavIconName } & LucideProps) {
  const Icon = ICONS[name];
  return <Icon aria-hidden strokeWidth={2} {...props} />;
}
