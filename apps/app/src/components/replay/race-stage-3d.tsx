"use client";

import type { PositionWindow, ReplayDriver, SessionReplay, TimingRow } from "@pitwall/shared";
import { LayoutDashboardIcon } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { webgl } from "@/components/racing/circuit-scene";
import { battlesOf, TrackCanvas } from "@/components/replay/track-canvas";
import { buttonVariants } from "@/components/ui/button";
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
}) {
  const [view, setView] = useState<View>("overview");
  return (
    <div className="fixed inset-x-0 top-[calc(3.5rem+1px)] bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 bg-background md:bottom-0">
      <div className="relative flex h-full flex-col overflow-y-auto md:pointer-events-none md:grid md:grid-cols-[18.5rem_minmax(0,1fr)_21.5rem] md:grid-rows-[auto_minmax(0,1fr)_auto] md:gap-3 md:overflow-hidden md:p-4 md:perspective-[2000px] md:*:pointer-events-auto">
        <div className="order-2 h-[45dvh] shrink-0 border-y md:absolute md:inset-0 md:h-auto md:border-0">
          <RaceScene {...scene} view={view} />
        </div>
        <header className="order-1 flex flex-wrap items-center gap-x-3 gap-y-1 p-3 md:z-10 md:col-start-2 md:row-start-1 md:justify-center md:self-start md:p-0 md:text-center">
          <div className="min-w-0 basis-full">
            <h1 className="truncate font-display text-lg leading-tight font-black tracking-tight uppercase italic">{title}</h1>
            <p className="truncate text-xs text-muted-foreground">{description}</p>
          </div>
          {badge}
          <ToggleGroup value={[view]} onValueChange={(v: string[]) => v[0] && setView(v[0] as View)} aria-label="Camera" variant="outline" size="sm" className="bg-card">
            <ToggleGroupItem value="overview">Overview</ToggleGroupItem>
            <ToggleGroupItem value="follow">Follow</ToggleGroupItem>
          </ToggleGroup>
          <Link href={dashboard} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "bg-card")}>
            <LayoutDashboardIcon aria-hidden /> Dashboard
          </Link>
        </header>
        {playback && (
          <div className="sticky bottom-0 z-10 order-3 border-b bg-background/95 p-3 backdrop-blur md:static md:col-start-2 md:row-start-3 md:self-end md:justify-self-center md:border md:bg-card md:p-3 md:backdrop-blur-none lg:w-[40rem]">
            {playback}
          </div>
        )}
        <Panel title="Timing" className="order-5 mx-3 mb-3 md:z-10 md:col-start-1 md:row-span-3 md:row-start-1 md:m-0 md:max-h-full md:origin-left md:self-start md:rotate-y-8">
          {tower}
        </Panel>
        <div className="order-4 flex min-h-0 flex-col gap-3 p-3 md:z-10 md:col-start-3 md:row-span-3 md:row-start-1 md:origin-right md:p-0 md:-rotate-y-8">
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
