"use client";

import { nextSession } from "@pitwall/shared";
import { CalendarDaysIcon, HistoryIcon, HouseIcon, RadioTowerIcon, TrophyIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { ErrorState } from "@/components/data/query-state";
import { useCalendar, useNow, useSeasons } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { FreshnessIndicator } from "./freshness-indicator";
import { LocalClock } from "./local-clock";
import { NextRaceIndicator } from "./next-race-indicator";
import { SeasonSelector } from "./season-selector";
import { ThemeToggle } from "./theme-toggle";

export const NAV = [
  { href: "/live", label: "Live", icon: RadioTowerIcon },
  { href: "/", label: "Home", icon: HouseIcon },
  { href: "/calendar", label: "Calendar", icon: CalendarDaysIcon },
  { href: "/standings", label: "Standings", icon: TrophyIcon },
  { href: "/replay", label: "Replay", icon: HistoryIcon },
] as const;

/** A session is in its scheduled slot, judged from the calendar the header already loads: no extra requests. */
function useSessionInWindow() {
  const calendar = useCalendar(useSeasons().data?.data?.[0] ?? null);
  const now = useNow();
  return now !== null && !!calendar.data?.data && nextSession(calendar.data.data, now)?.state === "in_window";
}

function NavLinks({ variant }: { variant: "bar" | "tabs" }) {
  const pathname = usePathname();
  const season = useSearchParams().get("season");
  const inWindow = useSessionInWindow();
  return NAV.map((item) => {
    const dot = item.href === "/live" && inWindow;
    return (
      <Link
        key={item.href}
        href={season && item.href !== "/live" ? `${item.href}?season=${season}` : item.href}
        aria-current={pathname === item.href ? "page" : undefined}
        className={cn(
          "flex items-center gap-1.5 font-semibold tracking-wide uppercase transition-colors outline-none focus-visible:bg-muted",
          variant === "bar"
            ? "h-14 border-b-2 border-transparent px-3 text-xs text-muted-foreground hover:text-foreground aria-[current=page]:border-live aria-[current=page]:text-foreground"
            : "flex-1 flex-col justify-center gap-0.5 border-t-2 border-transparent py-1.5 text-xs text-muted-foreground aria-[current=page]:border-live aria-[current=page]:text-foreground",
        )}
      >
        <span className="relative">
          <item.icon aria-hidden className={variant === "bar" ? "size-3.5" : "size-5"} />
          {dot && <span aria-hidden className="absolute -top-0.5 -right-1 size-2 rounded-full bg-live motion-safe:animate-live-pulse" />}
        </span>
        {item.label}
        {dot && <span className="sr-only"> (a session is scheduled now)</span>}
      </Link>
    );
  });
}

/** Every season-dependent query waits on /api/seasons; without this a failure leaves pages blank. */
function SeasonsError() {
  const seasons = useSeasons();
  if (!seasons.isError) return null;
  return (
    <div className="mb-4">
      <ErrorState error={seasons.error} onRetry={() => seasons.refetch()} />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#main" className="sr-only bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b bg-background/92 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-2 px-3 sm:px-5">
          <Link href="/" className="mr-2 flex items-center gap-1.5 font-display text-base font-black tracking-tight uppercase">
            <span aria-hidden className="h-4 w-1.5 bg-live" />
            Pitwall
          </Link>
          <nav aria-label="Main" className="hidden items-stretch md:flex">
            <Suspense>
              <NavLinks variant="bar" />
            </Suspense>
          </nav>
          <Suspense>
            <SeasonSelector />
            <NextRaceIndicator />
          </Suspense>
          <div className="ml-auto flex items-center gap-3">
            <FreshnessIndicator />
            <LocalClock />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1600px] flex-1 p-3 sm:p-5">
        <SeasonsError />
        {children}
      </main>
      {/* Bottom padding on phones clears the tab bar. */}
      <footer className="mx-auto w-full max-w-[1600px] px-3 pt-2 pb-24 text-xs leading-relaxed text-muted-foreground sm:px-5 md:pb-6">
        Unofficial. Not associated with Formula 1 companies. Data: Jolpica F1, OpenF1, Open-Meteo (CC BY 4.0), RainViewer. Maps: OpenFreeMap, © OpenStreetMap.
        Circuit layouts: F1DB (CC BY 4.0).
      </footer>
      <nav
        aria-label="Main (tabs)"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <Suspense>
          <NavLinks variant="tabs" />
        </Suspense>
      </nav>
    </>
  );
}
