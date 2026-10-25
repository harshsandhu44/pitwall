"use client";

import { EllipsisIcon, LayoutGridIcon, MaximizeIcon, MinimizeIcon, RotateCcwIcon, Undo2Icon } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import ReactGridLayout, { type Layout, type LayoutItem, useContainerWidth } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COLS, type Direction, move, readingOrder, resize, swap } from "@/lib/layout";
import { useArrival } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface PanelDef {
  id: string;
  title: string;
  /** Short line under the title. */
  description?: ReactNode;
  content: ReactNode;
  /** Default place in the 12-column grid, in rows of ROW px. */
  layout: { x: number; y: number; w: number; h: number; minW?: number; minH?: number };
  /** Phones only: always sits right after this panel (driver focus next to the timing it follows). */
  phoneAfter?: string;
  /** Extra items at the top of the panel's ⋯ menu (e.g. the timing tower's columns). */
  menu?: ReactNode;
}

type Spot = { x: number; y: number; w: number; h: number };

/** A named arrangement in the Panels menu. Panels it doesn't place keep their default spot. */
export interface LayoutPreset {
  name: string;
  layout: Record<string, Spot>;
  hidden?: string[];
}

const ROW = 36;
const GAP = 12;
const storageKey = (id: string) => `pitwall.layout.${id}.v1`;

type Saved = { layout: Layout; hidden: string[] };

const defaults = (panels: PanelDef[], preset?: LayoutPreset): Saved => ({
  layout: panels.map((p) => ({ i: p.id, minW: p.layout.minW, minH: p.layout.minH, ...p.layout, ...preset?.layout[p.id] })),
  hidden: preset?.hidden ?? [],
});

/** The saved arrangement, fitted to today's panels: new panels get their default spot, removed ones are dropped. */
function load(id: string, panels: PanelDef[]): Saved {
  const fallback = defaults(panels);
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(id)) ?? "null") as Partial<Saved> | null;
    if (!saved || !Array.isArray(saved.layout)) return fallback;
    const byId = new Map(saved.layout.map((l) => [l.i, l]));
    return {
      layout: panels.map((p) => {
        const s = byId.get(p.id);
        const ok = s && [s.x, s.y, s.w, s.h].every(Number.isFinite);
        return { i: p.id, minW: p.layout.minW, minH: p.layout.minH, ...(ok ? { x: s.x, y: s.y, w: s.w, h: s.h } : p.layout) };
      }),
      hidden: (saved.hidden ?? []).filter((h) => panels.some((p) => p.id === h)),
    };
  } catch {
    return fallback; // storage blocked or corrupt: the default layout still works
  }
}

const phoneQuery = "(max-width: 767px)";
function useIsPhone() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(phoneQuery);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(phoneQuery).matches,
    () => false,
  );
}

/**
 * Panels the viewer can rearrange: drag by the title, resize from the right or bottom edge or the corner, or use
 * each panel's menu (the keyboard and touch path). Phones get one column in the saved order. Saved per browser.
 * A panel can be maximised, and the whole grid (with `footer`, e.g. playback controls) put in fullscreen.
 */
export function PanelGrid({ id, panels, presets = [], footer }: { id: string; panels: PanelDef[]; presets?: LayoutPreset[]; footer?: ReactNode }) {
  // Only rendered on the client after data loads (static export), so reading storage here can't mismatch the HTML.
  const [saved, setSaved] = useState(() => load(id, panels));
  const phone = useIsPhone();
  const { width, containerRef, mounted } = useContainerWidth();
  // The desktop grid renders its panels only once it has measured the container.
  const arrival = useArrival<HTMLDivElement>(phone || mounted);
  // The arrangement a reset or preset threw away, offered back for a few seconds.
  const [undo, setUndo] = useState<Saved | null>(null);
  const replace = (next: Saved) => {
    setUndo(saved);
    setSaved(next);
  };
  const [maximised, setMaximised] = useState<string | null>(null);
  useEffect(() => {
    if (!maximised) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setMaximised(null);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [maximised]);
  const root = useRef<HTMLDivElement>(null);
  const [canFullscreen] = useState(() => document.fullscreenEnabled);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(!!root.current && document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggleFullscreen = () => void (fullscreen ? document.exitFullscreen() : root.current?.requestFullscreen())?.catch(() => {});
  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => setUndo(null), 10_000);
    return () => clearTimeout(id);
  }, [undo]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(id), JSON.stringify(saved));
    } catch {
      // per-viewer convenience only
    }
  }, [id, saved]);

  const visible = saved.layout.filter((l) => !saved.hidden.includes(l.i));
  const setLayout = (layout: Layout) => setSaved((s) => ({ ...s, layout }));
  // The grid reports only visible panels; hidden ones keep their last spot for when they come back.
  const onLayoutChange = (changed: Layout) => {
    const byId = new Map(changed.map((l) => [l.i, l]));
    setLayout(saved.layout.map((l) => ({ ...l, ...pick(byId.get(l.i)) })));
  };
  const setHidden = (panel: string, hide: boolean) =>
    setSaved((s) => ({ ...s, hidden: hide ? [...s.hidden, panel] : s.hidden.filter((h) => h !== panel) }));
  // Moves act on visible panels only, then hidden ones are put back untouched.
  const act = (f: (l: Layout) => Layout) => {
    const hidden = saved.layout.filter((l) => saved.hidden.includes(l.i));
    setLayout([...f(visible), ...hidden]);
  };
  const order = readingOrder(visible);
  if (phone) {
    for (const p of panels) {
      if (!p.phoneAfter || !order.includes(p.id) || !order.includes(p.phoneAfter)) continue;
      order.splice(order.indexOf(p.id), 1);
      order.splice(order.indexOf(p.phoneAfter) + 1, 0, p.id);
    }
  }
  const swapInOrder = (panel: string, by: -1 | 1) => {
    const other = order[order.indexOf(panel) + by];
    if (other) act((l) => swap(l, panel, other));
  };

  const panel = (p: PanelDef) => {
    const pinned = !!p.phoneAfter && order.includes(p.phoneAfter);
    const menu: [string, () => void][] = phone
      ? pinned
        ? []
        : [
          ["Move up", () => swapInOrder(p.id, -1)],
          ["Move down", () => swapInOrder(p.id, 1)],
        ]
      : [
          ...(["up", "down", "left", "right"] as Direction[]).map((d): [string, () => void] => [`Move ${d}`, () => act((l) => move(l, p.id, d))]),
          ["Wider", () => act((l) => resize(l, p.id, 1, 0))],
          ["Narrower", () => act((l) => resize(l, p.id, -1, 0))],
          ["Taller", () => act((l) => resize(l, p.id, 0, 2))],
          ["Shorter", () => act((l) => resize(l, p.id, 0, -2))],
        ];
    return (
      <Panel key={p.id} def={p} menu={menu} onHide={() => setHidden(p.id, true)} onMaximise={() => setMaximised(p.id)} fill={!phone} away={maximised === p.id} />
    );
  };
  const big = maximised ? panels.find((p) => p.id === maximised && !saved.hidden.includes(p.id)) : undefined;

  return (
    <div ref={root} className={cn("space-y-3", fullscreen && "overflow-auto bg-background p-4")}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
            <LayoutGridIcon aria-hidden />
            Panels
            {saved.hidden.length > 0 && <span className="ml-0.5 font-mono tabular-nums">({saved.hidden.length} hidden)</span>}
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Show panels</DropdownMenuLabel>
              {panels.map((p) => (
                <DropdownMenuCheckboxItem key={p.id} checked={!saved.hidden.includes(p.id)} onCheckedChange={(on) => setHidden(p.id, !on)}>
                  {p.title}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
            {presets.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Layouts</DropdownMenuLabel>
                  {presets.map((preset) => (
                    <DropdownMenuItem key={preset.name} onClick={() => replace(defaults(panels, preset))}>
                      {preset.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {canFullscreen && (
          <Button variant="ghost" size="sm" aria-pressed={fullscreen} onClick={toggleFullscreen}>
            {fullscreen ? <MinimizeIcon aria-hidden /> : <MaximizeIcon aria-hidden />}
            {fullscreen ? "Exit fullscreen" : "Fullscreen"}
          </Button>
        )}
        {undo ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSaved(undo);
              setUndo(null);
            }}
          >
            <Undo2Icon aria-hidden />
            Undo layout change
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => replace(defaults(panels))}
          >
            <RotateCcwIcon aria-hidden />
            Reset layout
          </Button>
        )}
        <span className="hidden md:inline">Drag a panel by its title, resize it from its right or bottom edge, or use its ⋯ menu.</span>
      </div>

      <div ref={containerRef}>
        <div ref={arrival}>
        {phone ? (
          <div className="space-y-3">{order.map((i) => panel(panels.find((p) => p.id === i)!))}</div>
        ) : (
          mounted && (
            <ReactGridLayout
              layout={visible}
              width={width}
              gridConfig={{ cols: COLS, rowHeight: ROW, margin: [GAP, GAP], containerPadding: [0, 0] }}
              dragConfig={{ handle: ".panel-drag", cancel: "button, a, input, label" }}
              resizeConfig={{ handles: ["se", "e", "s"] }}
              onLayoutChange={onLayoutChange}
            >
              {visible.map((l) => panel(panels.find((p) => p.id === l.i)!))}
            </ReactGridLayout>
          )
        )}
        </div>
      </div>
      {/* Once only: the footer may hold window shortcuts (replay keys). */}
      {!big && footer}
      {big && (
        // Inside the root, so it stays in fullscreen too; the footer comes along so playback stays reachable.
        <div className="fixed inset-0 z-40 flex flex-col gap-3 bg-background p-3 md:p-6">
          <Panel def={big} menu={[]} onRestore={() => setMaximised(null)} fill className="min-h-0 flex-1" />
          {footer}
        </div>
      )}
    </div>
  );
}

const pick = (l: LayoutItem | undefined) => (l ? { x: l.x, y: l.y, w: l.w, h: l.h } : {});

function Panel({
  def,
  menu,
  onHide,
  onMaximise,
  onRestore,
  fill,
  away = false,
  className,
  children,
  ...grid
}: {
  def: PanelDef;
  menu: [string, () => void][];
  onHide?: () => void;
  onMaximise?: () => void;
  /** Set while the panel is maximised: a Restore button replaces the menu. */
  onRestore?: () => void;
  fill: boolean;
  /** Shown maximised elsewhere: keep the spot, don't render the content twice. */
  away?: boolean;
  className?: string;
  /** The resize handle react-grid-layout adds. */
  children?: ReactNode;
}) {
  const titleId = useId();
  return (
    // react-grid-layout passes its positioning props (style, className, ref, handlers) through to this element.
    <section aria-labelledby={titleId} className={className} {...grid}>
      <Card data-rise className={cn("gap-0 py-0", fill && "h-full")}>
        <header className={cn("flex items-start gap-2 border-b px-4 py-2.5", !onRestore && "panel-drag md:cursor-grab md:active:cursor-grabbing")}>
          <div className="min-w-0 flex-1">
            <CardTitle id={titleId} role="heading" aria-level={2}>
              {def.title}
            </CardTitle>
            {def.description && <div className="mt-0.5 text-xs text-muted-foreground">{def.description}</div>}
          </div>
          {onRestore ? (
            <Button variant="outline" size="sm" onClick={onRestore} autoFocus>
              <MinimizeIcon aria-hidden />
              Restore
              <kbd className="hidden font-mono text-[10px] text-muted-foreground md:inline">Esc</kbd>
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`${def.title} panel options`} />}>
                <EllipsisIcon aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {def.menu}
                {def.menu && <DropdownMenuSeparator />}
                {menu.map(([label, run]) => (
                  <DropdownMenuItem key={label} onClick={run}>
                    {label}
                  </DropdownMenuItem>
                ))}
                {menu.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={onMaximise}>Maximise</DropdownMenuItem>
                <DropdownMenuItem onClick={onHide}>Hide panel</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </header>
        <div className={cn("p-4", fill && "min-h-0 flex-1 overflow-auto")}>
          {away ? <p className="text-xs text-muted-foreground">Shown maximised. Press Esc to restore.</p> : def.content}
        </div>
      </Card>
      {children}
    </section>
  );
}
