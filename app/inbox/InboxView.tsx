"use client";

import { useState } from "react";
import {
  Bell,
  Camera,
  Check,
  ChefHat,
  Globe,
  ShoppingBasket,
  ThumbsUp,
  UtensilsCrossed,
  Send,
} from "lucide-react";

type Notification = {
  id: string;
  type: string;
  payload: unknown;
  readAt: number | null;
  createdAt: number;
  actor: { id: string; name: string | null; image: string | null } | null;
};

const ICON_FOR: Record<string, React.ComponentType<{ className?: string }>> = {
  "menu.published": Globe,
  "meal.outcome.recorded": ThumbsUp,
  "cook.photo.uploaded": Camera,
  "recipe.share.created": Send,
  "grocery.share.created": ShoppingBasket,
  "meal.committed": UtensilsCrossed,
  "meal.cooked": ChefHat,
};

function summarize(n: Notification): { headline: string; href?: string } {
  const actor = n.actor?.name ?? "Someone";
  const payload =
    n.payload && typeof n.payload === "object"
      ? (n.payload as Record<string, unknown>)
      : {};

  switch (n.type) {
    case "menu.published":
      return {
        headline: `${actor} published the week's menu.`,
        href: typeof payload.slug === "string" ? `/menu/${payload.slug}` : undefined,
      };
    case "meal.outcome.recorded":
      return {
        headline: `${actor} logged how a meal went.`,
        href:
          typeof payload.planId === "string" ? `/plan/${payload.planId}` : undefined,
      };
    case "cook.photo.uploaded":
      return {
        headline: `${actor} added a photo from a cook.`,
        href:
          typeof payload.savedRecipeId === "string"
            ? `/recipe/${payload.savedRecipeId}`
            : undefined,
      };
    case "recipe.share.created":
      return {
        headline: `Your share link for a recipe is live.`,
        href:
          typeof payload.token === "string" ? `/r/${payload.token}` : undefined,
      };
    case "grocery.share.created":
      return {
        headline: `${actor} shared the grocery list.`,
        href:
          typeof payload.token === "string"
            ? `/grocery/${payload.token}`
            : undefined,
      };
    case "meal.committed":
      return {
        headline: `${actor} committed to ${
          typeof payload.title === "string" ? payload.title : "a meal"
        }.`,
        href:
          typeof payload.planId === "string" ? `/plan/${payload.planId}` : undefined,
      };
    case "meal.cooked":
      return {
        headline: `${actor} cooked something tonight.`,
        href:
          typeof payload.savedRecipeId === "string"
            ? `/recipe/${payload.savedRecipeId}`
            : undefined,
      };
    default:
      return { headline: `${n.type}` };
  }
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function InboxView({ initial }: { initial: Notification[] }) {
  const [items, setItems] = useState(initial);
  const unread = items.filter((i) => i.readAt === null).length;

  async function markAllRead() {
    if (unread === 0) return;
    setItems((prev) =>
      prev.map((it) => (it.readAt === null ? { ...it, readAt: Date.now() } : it)),
    );
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center">
        <Bell className="mx-auto mb-2 h-5 w-5 text-stone-400" />
        <p className="text-sm text-stone-600">
          Nothing here yet. New plans, photos, and shares will land here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="text-stone-500">
          {unread > 0 ? `${unread} unread` : "all caught up"}
        </span>
        {unread > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex items-center gap-1 rounded-md border border-stone-300 bg-white px-2 py-1 font-medium text-stone-700 hover:border-stone-500"
          >
            <Check className="h-3 w-3" />
            Mark all read
          </button>
        )}
      </div>
      <ul className="space-y-1.5">
        {items.map((n) => {
          const summary = summarize(n);
          const Icon = ICON_FOR[n.type] ?? Bell;
          const unreadStyle =
            n.readAt === null
              ? "border-stone-200 bg-white"
              : "border-stone-100 bg-stone-50/60";
          const content = (
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  n.readAt === null ? "bg-amber-100 text-amber-900" : "bg-stone-200 text-stone-600"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm leading-snug ${
                    n.readAt === null ? "font-medium text-stone-900" : "text-stone-600"
                  }`}
                >
                  {summary.headline}
                </p>
                <p className="mt-0.5 text-[11px] text-stone-400">
                  {formatRelative(n.createdAt)}
                </p>
              </div>
            </div>
          );
          return (
            <li
              key={n.id}
              className={`rounded-lg border p-3 transition ${unreadStyle}`}
            >
              {summary.href ? (
                <a href={summary.href} className="block">
                  {content}
                </a>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
