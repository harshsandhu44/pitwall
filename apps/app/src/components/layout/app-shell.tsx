"use client";

import { CalendarDaysIcon, CloudSunRainIcon, GaugeIcon, HistoryIcon, HouseIcon, RadioTowerIcon, TrophyIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { FreshnessIndicator } from "./freshness-indicator";
import { LocalClock } from "./local-clock";
import { NextRaceIndicator } from "./next-race-indicator";
import { SeasonSelector } from "./season-selector";
import { ThemeToggle } from "./theme-toggle";

export const NAV = [
  { href: "/", label: "Overview", icon: HouseIcon },
  { href: "/calendar", label: "Calendar", icon: CalendarDaysIcon },
  { href: "/standings", label: "Standings", icon: TrophyIcon },
  { href: "/weather", label: "Weather", icon: CloudSunRainIcon },
  { href: "/replay", label: "Replay", icon: HistoryIcon },
  { href: "/live", label: "Live", icon: RadioTowerIcon },
] as const;

function NavLinks() {
  const pathname = usePathname();
  const season = useSearchParams().get("season");
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenu>
      {NAV.map((item) => (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton
            isActive={pathname === item.href}
            tooltip={item.label}
            render={
              <Link
                href={season ? `${item.href}?season=${season}` : item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                onClick={() => setOpenMobile(false)}
              />
            }
          >
            <item.icon aria-hidden />
            <span>{item.label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" aria-label="Main">
        <SidebarHeader>
          <Link href="/" className="flex items-center gap-2 px-2 py-1.5 font-mono text-sm font-semibold tracking-tight">
            <GaugeIcon aria-hidden className="size-4 shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">PITWALL</span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <Suspense>
                <NavLinks />
              </Suspense>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="px-3 pb-3 text-[10px] leading-relaxed text-muted-foreground group-data-[collapsible=icon]:hidden">
          Unofficial. Not associated with Formula 1 companies. Data: Jolpica F1, OpenF1, Open-Meteo (CC BY 4.0), RainViewer. Maps: OpenFreeMap, © OpenStreetMap. Circuit layouts: F1DB (CC BY 4.0).
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur">
          <SidebarTrigger aria-label="Toggle navigation" />
          <Separator orientation="vertical" className="h-4" />
          <Suspense>
            <SeasonSelector />
            <NextRaceIndicator />
          </Suspense>
          <div className="ml-auto flex items-center gap-3">
            <FreshnessIndicator />
            <LocalClock />
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-3 sm:p-5">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
