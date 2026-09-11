"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Light is the default; "dark" toggles the `.dark` class that globals.css keys on.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
