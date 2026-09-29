"use client";

import * as React from "react";
import { Moon, Sun, Laptop } from "lucide-react";
import { useTheme } from "next-themes";

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  if (!mounted) {
    return (
      <div className="w-8 h-8 rounded-lg flex items-center justify-center opacity-50 border border-[var(--border-primary)]">
        <div className="w-4 h-4" />
      </div>
    );
  }

  const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Laptop;

  return (
    <button
      onClick={() => setTheme(nextTheme)}
      className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--bg-hover)] border border-[var(--border-primary)] text-[var(--text-secondary)]"
      title={`Current theme: ${theme}. Click to switch.`}
    >
      <Icon className="w-4 h-4" />
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}
