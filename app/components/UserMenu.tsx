import { LogIn, LogOut } from "lucide-react";
import Image from "next/image";
import { auth, signIn, signOut } from "@/auth";

export async function UserMenu() {
  const session = await auth();

  if (!session?.user) {
    return (
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
        >
          <LogIn className="h-4 w-4" />
          Sign in
        </button>
      </form>
    );
  }

  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
      className="flex items-center gap-2"
    >
      {session.user.image ? (
        <Image
          src={session.user.image}
          alt={session.user.name ?? "you"}
          width={28}
          height={28}
          className="rounded-full"
          unoptimized
        />
      ) : (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-700">
          {(session.user.name ?? session.user.email ?? "?")[0]?.toUpperCase()}
        </span>
      )}
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-md p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
        title="Sign out"
        aria-label="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </form>
  );
}
