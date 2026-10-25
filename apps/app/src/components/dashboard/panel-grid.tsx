"use client";

import { EllipsisIcon, LayoutGridIcon, RotateCcwIcon, Undo2Icon } from "lucide-react";
import { type ReactNode, useEffect, useId, useState, useSyncExternalStore } from "react";
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
}

const ROW = 36;
const GAP = 12;
const storageKey = (id: string) => `pitwall.layout.${id}.v1`;

type Saved = { layout: Layout; hidden: string[] };

const defaults = (panels: PanelDef[]): Saved => ({ layout: panels.map((p) => ({ i: p.id, ...p.layout })), hidden: [] });

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
 * Panels the viewer can rearrange: drag by the title, resize from the corner, or use each panel's menu
 * (the keyboard and touch path). Phones get one column in the saved order. Saved per browser.
 */
export function PanelGrid({ id, panels }: { id: string; panels: PanelDef[] }) {
  // Only rendered on the client after data loads (static export), so reading storage here can't mismatch the HTML.
  const [saved, setSaved] = useState(() => load(id, panels));
  const phone = useIsPhone();
  const { width, containerRef, mounted } = useContainerWidth();
  // The arrangement a reset threw away, offered back for a few seconds.
  const [undo, setUndo] = useState<Saved | null>(null);
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
    return <Panel key={p.id} def={p} menu={menu} onHide={() => setHidden(p.id, true)} fill={!phone} />;
  };

  return (
    <div className="space-y-3">
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
          </DropdownMenuContent>
        </DropdownMenu>
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
            Undo reset
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setUndo(saved);
              setSaved(defaults(panels));
            }}
          >
            <RotateCcwIcon aria-hidden />
            Reset layout
          </Button>
        )}
        <span className="hidden md:inline">Drag a panel by its title, resize it from the bottom-right corner, or use its ⋯ menu.</span>
      </div>

      <div ref={containerRef}>
        {phone ? (
          <div className="space-y-3">{order.map((i) => panel(panels.find((p) => p.id === i)!))}</div>
        ) : (
          mounted && (
            <ReactGridLayout
              layout={visible}
              width={width}
              gridConfig={{ cols: COLS, rowHeight: ROW, margin: [GAP, GAP], containerPadding: [0, 0] }}
              dragConfig={{ handle: ".panel-drag", cancel: "button, a, input, label" }}
              onLayoutChange={onLayoutChange}
            >
              {visible.map((l) => panel(panels.find((p) => p.id === l.i)!))}
            </ReactGridLayout>
          )
        )}
      </div>
    </div>
  );
}

const pick = (l: LayoutItem | undefined) => (l ? { x: l.x, y: l.y, w: l.w, h: l.h } : {});

function Panel({
  def,
  menu,
  onHide,
  fill,
  children,
  ...grid
}: {
  def: PanelDef;
  menu: [string, () => void][];
  onHide: () => void;
  fill: boolean;
  /** The resize handle react-grid-layout adds. */
  children?: ReactNode;
}) {
  const titleId = useId();
  return (
    // react-grid-layout passes its positioning props (style, className, ref, handlers) through to this element.
    <section aria-labelledby={titleId} {...grid}>
      <Card className={cn("gap-0 py-0 motion-safe:animate-slide-in", fill && "h-full")}>
        <header className="panel-drag flex items-start gap-2 border-b px-4 py-2.5 md:cursor-grab md:active:cursor-grabbing">
          <div className="min-w-0 flex-1">
            <CardTitle id={titleId} role="heading" aria-level={2}>
              {def.title}
            </CardTitle>
            {def.description && <div className="mt-0.5 text-xs text-muted-foreground">{def.description}</div>}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`${def.title} panel options`} />}>
              <EllipsisIcon aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {menu.map(([label, run]) => (
                <DropdownMenuItem key={label} onClick={run}>
                  {label}
                </DropdownMenuItem>
              ))}
              {menu.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={onHide}>Hide panel</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <div className={cn("p-4", fill && "min-h-0 flex-1 overflow-auto")}>{def.content}</div>
      </Card>
      {children}
    </section>
  );
}
