"use client";

import type { PositionWindow, ReplayDriver, SessionReplay, TimingRow } from "@pitwall/shared";
import { LayoutDashboardIcon, MaximizeIcon, MinimizeIcon } from "lucide-react";
import Link from "next/link";
import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { webgl } from "@/components/racing/circuit-scene";
import { typing } from "@/components/replay/playback-controls";
import { battlesOf, TrackCanvas } from "@/components/replay/track-canvas";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { SceneState, View } from "@/lib/race-scene";
import { cn } from "@/lib/utils";

type SceneProps = {
  track: SessionReplay["track"];
  drivers: ReplayDriver[];
  /** Session time to draw (epoch ms); called every frame. */
  time: () => number;
  getWindow: (t: number) => PositionWindow | null;
  rows: TimingRow[];
  /** Races and sprints: link battles. */
  race: boolean;
  selected: number | null;
  onSelect: (n: number) => void;
};

/** The 3D circuit, or the 2D map where it can't run (no outline, no WebGL, a failed load). */
function RaceScene({ track, drivers, time, getWindow, rows, race, selected, onSelect, view }: SceneProps & { view: View }) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const battles = race ? battlesOf(rows) : [];
  // The scene reads these every frame, so new props never restart it.
  const state = useRef<SceneState>({ selected, battles, order: [], view });
  const select = useRef(onSelect);
  useLayoutEffect(() => {
    Object.assign(state.current, { selected, battles, order: rows.map((r) => r.driver), view });
    select.current = onSelect;
  });

  useEffect(() => {
    const el = host.current;
    if (!track || !el) return;
    let scene: { dispose: () => void } | null = null;
    let gone = false;
    void (async () => {
      if (!webgl()) throw new Error("no WebGL");
      const { createRaceScene } = await import("@/lib/race-scene");
      if (gone) return;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      scene = createRaceScene(el, { track, drivers, time, getWindow, state: state.current, onSelect: (n) => select.current(n), still });
    })().catch(() => !gone && setFailed(true));
    return () => {
      gone = true;
      scene?.dispose();
    };
  }, [track, drivers, time, getWindow]);

  if (!track || failed) {
    return (
      <div className="size-full p-3">
        <TrackCanvas track={track} drivers={drivers} time={time} getWindow={getWindow} selected={selected} follow={false} interpolate battles={battles} onSelect={onSelect} />
      </div>
    );
  }
  return (
    <div
      ref={host}
      role="img"
      aria-label="3D circuit with every car. Drag to orbit, scroll to zoom, select a car to focus it. The timing tower lists the same cars as text."
      className="relative size-full overflow-hidden"
    />
  );
}

function Panel({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card size="sm" className={cn("min-h-0", className)}>
      <CardHeader className="flex items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="min-h-0 overflow-y-auto">{children}</CardContent>
    </Card>
  );
}

const IDLE_MS = 3_000;

/**
 * TV mode: browser fullscreen on the stage, or "theater" (the stage covers the app chrome) where elements
 * can't go fullscreen (iPhone Safari). F toggles, Esc leaves. `idle` turns true after a few still seconds.
 */
function useTvMode(root: RefObject<HTMLDivElement | null>) {
  const [native, setNative] = useState(false);
  const [theater, setTheater] = useState(false);
  const [idle, setIdle] = useState(false);
  const full = native || theater;

  const toggle = () => {
    setIdle(false);
    if (native) return void document.exitFullscreen().catch(() => {});
    if (theater) return setTheater(false);
    const el = root.current;
    if (!el?.requestFullscreen || !document.fullscreenEnabled) return setTheater(true);
    el.requestFullscreen()
      .then(() => {
        // Phones turn sideways where the browser allows it; the lock lifts itself on exit.
        const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        if (!matchMedia("(min-width: 48rem)").matches) o.lock?.("landscape").catch(() => {});
      })
      .catch(() => setTheater(true));
  };
  const toggleRef = useRef(toggle);
  useLayoutEffect(() => {
    toggleRef.current = toggle;
  });

  useEffect(() => {
    const onChange = () => setNative(!!root.current && document.fullscreenElement === root.current);
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (e.key === "f" || e.key === "F") toggleRef.current();
      else if (e.key === "Escape") setTheater(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("keydown", onKey);
    };
  }, [root]);

  useEffect(() => {
    if (!full) return;
    let timer = 0;
    const arm = () => {
      clearTimeout(timer);
      timer = window.setTimeout(function sleep() {
        // Controls under a mouse or holding keyboard focus stay up. Touch screens leave :hover stuck, so not there.
        const held = `${matchMedia("(hover: hover)").matches ? "[data-chrome]:hover, " : ""}[data-chrome] :focus-visible`;
        if (root.current?.querySelector(held)) timer = window.setTimeout(sleep, IDLE_MS);
        else setIdle(true);
      }, IDLE_MS);
    };
    const wake = () => {
      setIdle(false);
      arm();
    };
    const events = ["pointermove", "pointerdown", "keydown", "wheel"] as const;
    for (const e of events) window.addEventListener(e, wake, { passive: true });
    arm();
    return () => {
      clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, wake);
    };
  }, [full, root]);

  return { full, theater, idle: full && idle, toggle };
}

/**
 * A full-screen 3D race: the circuit fills the page with the panels standing around it, as in Pitwall's
 * "spatial" mock-up. Phones get the circuit on top and the panels stacked below.
 */
export function RaceStage3D({
  title,
  description,
  badge,
  dashboard,
  tower,
  focus,
  feed,
  playback,
  paused = false,
  ...scene
}: SceneProps & {
  title: string;
  description: string;
  badge: ReactNode;
  /** The 2D dashboard for the same session. */
  dashboard: string;
  tower: ReactNode;
  focus: ReactNode;
  feed: ReactNode;
  playback?: ReactNode;
  /** A paused replay keeps its controls up in fullscreen, as a video player does. */
  paused?: boolean;
}) {
  const [view, setView] = useState<View>("overview");
  const root = useRef<HTMLDivElement>(null);
  const tv = useTvMode(root);
  // In fullscreen the controls fade when nobody's touching anything; the title and badge stay as the corner bug.
  const off = tv.idle && !paused;
  const fade = cn("transition-opacity duration-300 motion-reduce:transition-none", off && "pointer-events-none opacity-0");
  // Header controls also leave the layout, so the badge settles under the title.
  const tuck = cn("transition-[opacity,display] transition-discrete duration-300 starting:opacity-0 motion-reduce:transition-none", off && "hidden opacity-0");
  return (
    <div
      ref={root}
      className={cn(
        "fixed inset-x-0 top-[calc(3.5rem+1px)] bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 bg-background md:bottom-0",
        tv.theater && "inset-0 z-40",
        off && "cursor-none",
      )}
    >
      <div
        className={cn(
          "relative flex h-full flex-col overflow-y-auto md:pointer-events-none md:grid md:grid-cols-[18.5rem_minmax(0,1fr)_21.5rem] md:grid-rows-[auto_minmax(0,1fr)_auto] md:gap-3 md:overflow-hidden md:p-4 md:perspective-[2000px] md:*:pointer-events-auto",
          tv.full && "justify-between overflow-hidden",
        )}
      >
        <div className={cn("order-2 h-[45dvh] shrink-0 border-y md:absolute md:inset-0 md:h-auto md:border-0", tv.full && "absolute inset-0 h-auto border-0")}>
          <RaceScene {...scene} view={view} />
        </div>
        <header
          data-chrome
          className="z-10 order-1 flex flex-wrap items-center gap-x-3 gap-y-1 p-3 md:col-start-2 md:row-start-1 md:justify-center md:self-start md:p-0 md:text-center"
        >
          <div className="min-w-0 basis-full">
            <h1 className="truncate font-display text-lg leading-tight font-black tracking-tight uppercase italic">{title}</h1>
            <p className={cn("truncate text-xs text-muted-foreground", tuck)}>{description}</p>
          </div>
          {badge}
          <ToggleGroup
            value={[view]}
            onValueChange={(v: string[]) => v[0] && setView(v[0] as View)}
            aria-label="Camera"
            variant="outline"
            size="sm"
            className={cn("bg-card", tuck)}
          >
            <ToggleGroupItem value="overview">Overview</ToggleGroupItem>
            <ToggleGroupItem value="follow">Follow</ToggleGroupItem>
          </ToggleGroup>
          <Link href={dashboard} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "bg-card", tuck)}>
            <LayoutDashboardIcon aria-hidden /> Dashboard
          </Link>
          <Button variant="outline" size="sm" onClick={tv.toggle} aria-keyshortcuts="F" className={cn("bg-card", tuck)}>
            {tv.full ? <MinimizeIcon aria-hidden /> : <MaximizeIcon aria-hidden />} {tv.full ? "Exit fullscreen" : "Fullscreen"}
          </Button>
        </header>
        {playback && (
          <div data-chrome className={cn(fade, "sticky bottom-0 z-10 order-3 border-b bg-background/95 p-3 backdrop-blur md:static md:col-start-2 md:row-start-3 md:self-end md:justify-self-center md:border md:bg-card md:p-3 md:backdrop-blur-none lg:w-[40rem]")}>
            {playback}
          </div>
        )}
        <Panel
          title="Timing"
          className={cn(
            "order-5 mx-3 mb-3 md:z-10 md:col-start-1 md:row-span-3 md:row-start-1 md:m-0 md:max-h-full md:origin-left md:self-start md:rotate-y-8",
            tv.full && "max-md:hidden",
          )}
        >
          {tower}
        </Panel>
        <div
          className={cn(
            "order-4 flex min-h-0 flex-col gap-3 p-3 md:z-10 md:col-start-3 md:row-span-3 md:row-start-1 md:origin-right md:p-0 md:-rotate-y-8",
            tv.full && "max-md:hidden",
          )}
        >
          <Panel title="Driver focus" className="shrink-0">
            {focus}
          </Panel>
          <Panel title="Race control" className="md:flex-1">
            {feed}
          </Panel>
        </div>
      </div>
    </div>
  );
}
