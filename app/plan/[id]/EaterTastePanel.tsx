import {
  Baby,
  ChevronDown,
  FlaskConical,
  Heart,
  Sparkles,
  UsersRound,
  XCircle,
} from "lucide-react";
import { Sprite } from "@/app/components/Sprite";
import {
  groupPreferences,
  recencyLabel,
  sourceLabel,
  tasteSummary,
  type TastePref,
} from "@/app/lib/planner/taste-panel";

function confirmedLabel(thenMs: number): string {
  return recencyLabel(thenMs, Date.now());
}

export type EaterProfile = {
  id: string;
  name: string;
  kind: "ADULT" | "KID";
  preferences: TastePref[];
};

export function EaterTastePanel({ profiles }: { profiles: EaterProfile[] }) {
  const allPrefs = profiles.flatMap((p) => p.preferences);
  const summary = tasteSummary(allPrefs);

  return (
    <details className="group mb-6 rounded-xl border border-stone-200 bg-white open:shadow-sm">
      <summary className="flex cursor-pointer list-none select-none items-center justify-between gap-3 rounded-xl px-4 py-3 hover:bg-stone-50 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-stone-800">
          <UsersRound className="h-4 w-4 text-stone-500" />
          What the planner knows about your eaters
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-stone-500">
          {summary && <span className="hidden sm:inline">{summary}</span>}
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>

      <div className="border-t border-stone-100 px-4 pb-4 pt-3">
        {allPrefs.length === 0 ? (
          <p className="py-2 text-sm text-stone-500">
            Nothing learned yet. Tastes show up here after an intake chat, and
            sharpen each time you record how a meal landed.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {profiles.map((p) => (
              <ProfileCard key={p.id} profile={p} />
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-stone-400">
          Updates automatically from intake chats and post-meal check-ins —
          nothing to edit here.
        </p>
      </div>
    </details>
  );
}

function ProfileCard({ profile }: { profile: EaterProfile }) {
  const b = groupPreferences(profile.preferences);
  const empty = profile.preferences.length === 0;

  return (
    <section className="rounded-lg border border-stone-100 bg-stone-50/60 p-3">
      <header className="flex items-center gap-2">
        <span
          className={`inline-flex h-7 w-7 flex-none items-center justify-center rounded-full ${
            profile.kind === "KID"
              ? "bg-amber-100 text-amber-700"
              : "bg-stone-200 text-stone-600"
          }`}
        >
          {profile.kind === "KID" ? (
            <Baby className="h-4 w-4" />
          ) : (
            <UsersRound className="h-4 w-4" />
          )}
        </span>
        <span className="text-sm font-semibold text-stone-800">
          {profile.name}
        </span>
      </header>

      {empty ? (
        <p className="mt-2 text-xs text-stone-500">Nothing learned yet.</p>
      ) : (
        <>
          <Bucket
            label="Reliable hits"
            icon={<Heart className="h-3 w-3" />}
            headerClass="text-emerald-700"
            chipClass="border-emerald-200 bg-emerald-50 text-emerald-900"
            prefs={b.reliable}
          />
          <Bucket
            label="Experimenting"
            icon={<FlaskConical className="h-3 w-3" />}
            headerClass="text-amber-700"
            chipClass="border-amber-200 bg-amber-50 text-amber-900"
            prefs={b.experimenting}
          />
          <Bucket
            label="Hard nos"
            icon={<XCircle className="h-3 w-3" />}
            headerClass="text-rose-700"
            chipClass="border-rose-200 bg-rose-50 text-rose-900"
            prefs={b.hardNos}
          />
          <Bucket
            label="Wants to try"
            icon={<Sparkles className="h-3 w-3" />}
            headerClass="text-indigo-700"
            chipClass="border-indigo-200 bg-indigo-50 text-indigo-900"
            prefs={b.aspirations}
            titleCase={false}
          />
        </>
      )}
    </section>
  );
}

function Bucket({
  label,
  icon,
  headerClass,
  chipClass,
  prefs,
  titleCase = true,
}: {
  label: string;
  icon: React.ReactNode;
  headerClass: string;
  chipClass: string;
  prefs: TastePref[];
  titleCase?: boolean;
}) {
  if (prefs.length === 0) return null;
  return (
    <div className="mt-2.5">
      <p
        className={`mb-1.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${headerClass}`}
      >
        {icon}
        {label}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {prefs.map((p) => (
          <li
            key={p.id}
            title={`${sourceLabel(p.source)} · confirmed ${confirmedLabel(p.lastConfirmedAt)}`}
            className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-1.5 pr-2.5 text-xs ${chipClass}`}
          >
            <Sprite name={p.slug ?? p.display} size={18} />
            <span className={titleCase ? "capitalize" : undefined}>
              {p.display}
            </span>
            {p.evidenceCount > 1 && (
              <span className="text-[10px] opacity-60">
                ×{p.evidenceCount}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
