import Link from "next/link";
import { Bell, CalendarRange, Library, Users } from "lucide-react";
import { AvatarMenu } from "./AvatarMenu";
import { InboxBadge } from "./InboxBadge";

export function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-stone-300 bg-stone-50/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-serif text-[17px] font-medium tracking-tight text-stone-900"
        >
          <span
            aria-hidden
            className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] bg-stone-900 text-[18px] leading-none text-stone-50"
          >
            ◔
          </span>
          Recipe Guide
        </Link>
        <nav className="flex items-center gap-1">
          <HeaderTab href="/plan" label="Plan" Icon={CalendarRange} />
          <HeaderTab href="/library" label="Library" Icon={Library} />
          <HeaderTab href="/settings" label="Families" Icon={Users} />
          <Link
            href="/inbox"
            aria-label="Inbox"
            className="relative inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
          >
            <Bell className="h-3.5 w-3.5" />
            <InboxBadge />
          </Link>
          <AvatarMenu />
        </nav>
      </div>
    </header>
  );
}

function HeaderTab({
  href,
  label,
  Icon,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
