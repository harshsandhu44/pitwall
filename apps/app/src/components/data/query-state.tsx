"use client";

import type { ApiResponse, Source } from "@pitwall/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { AlertTriangleIcon, ClockAlertIcon, RotateCwIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { formatAge } from "@/lib/format";
import { useNow } from "@/lib/hooks";

export const SOURCE_LABEL: Record<Source, string> = {
  jolpica: "Jolpica F1",
  openf1: "OpenF1",
  "open-meteo": "Open-Meteo",
  rainviewer: "RainViewer",
  pitwall: "Pitwall",
};

/** Source, age and staleness of a response, always visible next to the data it describes. */
export function SourceNote({ res }: { res: ApiResponse<unknown> }) {
  const now = useNow();
  const stale = res.status === "stale";
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
      {stale && <ClockAlertIcon aria-hidden className="size-3" />}
      <span>{SOURCE_LABEL[res.source]}</span>
      <span aria-hidden>·</span>
      <span>
        {stale ? "Stale copy, fetched " : "Updated "}
        {now === null ? "…" : formatAge(res.fetchedAt, now)}
      </span>
      {stale && res.cache === "fallback" && <span>(provider currently unreachable)</span>}
    </p>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const res = error instanceof ApiError ? error.response : null;
  const title =
    res?.status === "not_found"
      ? "Not found"
      : res?.status === "unavailable"
        ? `${SOURCE_LABEL[res.source]} is unavailable right now`
        : "Something went wrong loading this data";
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm">
      <AlertTriangleIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-xs break-words text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p>
      </div>
      {onRetry && res?.status !== "not_found" && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RotateCwIcon aria-hidden /> Retry
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{children}</p>;
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-7 w-full" />
      ))}
    </div>
  );
}

/** Loading → skeleton, failure → error with retry, success → children with the data. */
export function QueryState<T>({
  query,
  loading = <LoadingRows />,
  children,
}: {
  query: UseQueryResult<ApiResponse<T>>;
  loading?: ReactNode;
  children: (data: T, res: ApiResponse<T>) => ReactNode;
}) {
  if (query.isPending) return query.fetchStatus === "idle" ? null : loading;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return children(query.data.data as T, query.data);
}
