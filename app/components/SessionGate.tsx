"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { setSignedIn } from "@/app/lib/storage";

// Mirrors useSession()'s signed-in state into the storage module so imperative
// callers (saveRecipe, deleteRecipe, etc.) know whether to hit the server.
// Renders nothing.
export function SessionGate() {
  const session = useSession();
  useEffect(() => {
    setSignedIn(session.status === "authenticated");
  }, [session.status]);
  return null;
}
