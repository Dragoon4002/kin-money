import {
  ArrowDownLeft, ArrowUpRight, BadgeCheck, Briefcase, CalendarClock, ChartPie, Check, ChevronRight, CircleDollarSign,
  Coins, Copy, FileText, Gift, GraduationCap, HandCoins, HeartHandshake, House, Link2, ListChecks, Lock, type LucideIcon,
  Palette, PartyPopper, PiggyBank, Plane, QrCode, Receipt, RefreshCcw, Share2, Shapes, ShoppingBag, ShoppingBasket,
  Siren, Smile, Sparkles, Split, Sprout, SunMoon, Trash2, UserPlus, Users, Utensils, Wallet, LayoutGrid,
  AlignLeft, Plus, X, Clock, ShieldCheck, Undo2, Delete,
} from "lucide-react";

/**
 * Kin's single icon vocabulary (Lucide). Screens import from here — never emoji or ad-hoc SVG
 * for UI icons — so every feature looks the same everywhere. Render with <IconTile> or <Ico>.
 */
export const ICON = {
  // features
  allowance: Sprout,
  emergency: Siren,
  jars: PiggyBank,
  pot: House,
  circle: RefreshCcw,
  chores: ListChecks,
  bill: Receipt,
  gift: Gift,
  invoice: Briefcase,
  split: Split,
  kinko: Smile,
  invite: UserPlus,
  spends: ChartPie,
  people: Users,
  money: Wallet,
  explore: LayoutGrid,
  home: House,
  activity: AlignLeft,
  // actions
  send: ArrowUpRight,
  request: ArrowDownLeft,
  add: Plus,
  close: X,
  backspace: Delete,
  qr: QrCode,
  link: Link2,
  share: Share2,
  copy: Copy,
  check: Check,
  verified: BadgeCheck,
  lock: Lock,
  appearance: SunMoon,
  currency: Coins,
  customize: Palette,
  celebrate: PartyPopper,
  sparkle: Sparkles,
  chevron: ChevronRight,
  remove: Trash2,
  schedule: CalendarClock,
  pending: Clock,
  safe: ShieldCheck,
  takeBack: Undo2,
  dollar: CircleDollarSign,
  together: HeartHandshake,
  payout: HandCoins,
  doc: FileText,
  // spend categories
  food: Utensils,
  groceries: ShoppingBasket,
  bills: Receipt,
  rent: House,
  family: HeartHandshake,
  education: GraduationCap,
  travel: Plane,
  shopping: ShoppingBag,
  gifts: Gift,
  other: Shapes,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICON;
