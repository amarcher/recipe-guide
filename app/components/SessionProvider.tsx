"use client";

import { SessionProvider } from "next-auth/react";
import { SessionGate } from "./SessionGate";

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SessionGate />
      {children}
    </SessionProvider>
  );
}
