"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/theme-provider";
import { SessionCacheClearer } from "@/components/SessionCacheClearer";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <ThemeProvider>
      <SessionProvider>
        <QueryClientProvider client={queryClient}>
          {/* Clears the query cache on login/logout/user-switch so no
              account's data can leak into another session. */}
          <SessionCacheClearer />
          {children}
        </QueryClientProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
