"use client";

import { SessionProvider } from "next-auth/react";

export const Providers = ({ children }: { children: React.ReactNode }) => (
  <SessionProvider>{children}</SessionProvider>
);
