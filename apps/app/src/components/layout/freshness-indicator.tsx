"use client";

import type { ApiResponse } from "@pitwall/shared";
import { useQueryClient } from "@tanstack/react-query";
import { CircleCheckIcon, CircleDashedIcon, ClockAlertIcon, CloudOffIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api";

type Health = "fresh" | "stale" | "failing" | "idle";

const VIEW: Record<Health, { icon: typeof CircleCheckIcon; label: string; detail: string; className: string }> = {
  fresh: { icon: CircleCheckIcon, label: "Data fresh", detail: "Everything on screen is within its refresh window.", className: "text-muted-foreground" },
  stale: { icon: ClockAlertIcon, label: "Some data stale", detail: "At least one panel shows an older copy because a provider is slow or unreachable.", className: "text-foreground" },
  failing: { icon: CloudOffIcon, label: "Provider issue", detail: "At least one data provider could not be reached.", className: "text-destructive" },
  idle: { icon: CircleDashedIcon, label: "No data yet", detail: "Nothing has loaded yet.", className: "text-muted-foreground" },
};

/** Worst state across every query currently cached on this page. */
export function FreshnessIndicator() {
  const client = useQueryClient();
  const cache = client.getQueryCache();
  const health = useSyncExternalStore(
    (cb) => cache.subscribe(cb),
    () => {
      let h: Health = "idle";
      for (const q of cache.getAll()) {
        if (!q.getObserversCount()) continue;
        if (q.state.error instanceof ApiError) return "failing";
        const res = q.state.data as ApiResponse<unknown> | undefined;
        if (res?.status === "stale") h = "stale";
        else if (res && h === "idle") h = "fresh";
      }
      return h;
    },
    () => "idle" as Health,
  );
  const v = VIEW[health];
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span role="status" aria-live="polite" className={`flex items-center gap-1.5 text-xs ${v.className}`}>
            <v.icon aria-hidden className="size-3.5" />
            <span className="hidden md:inline">{v.label}</span>
            <span className="sr-only md:hidden">{v.label}</span>
          </span>
        }
      />
      <TooltipContent>{v.detail}</TooltipContent>
    </Tooltip>
  );
}
