import Link from "next/link";
import { ChefHat, Library, Users } from "lucide-react";
import { SettingsButton } from "./SettingsButton";
import { UserMenu } from "./UserMenu";

export function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold text-stone-900"
        >
          <ChefHat className="h-4 w-4" />
          Recipe Guide
        </Link>
        <nav className="flex items-center gap-1">
          <Link
            href="/library"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900"
          >
            <Library className="h-4 w-4" />
            <span className="hidden sm:inline">Library</span>
          </Link>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900"
          >
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Families</span>
          </Link>
          <SettingsButton />
          <UserMenu />
        </nav>
      </div>
    </header>
  );
}
