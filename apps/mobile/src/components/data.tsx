// Port of apps/app/src/components/data/query-state.tsx: same states, same copy.
import { type ApiResponse, formatAge, type Source } from "@pitwall/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { AlertTriangle, ClockAlert, RotateCw } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { ApiError } from "@/lib/api";
import { useNow } from "@/lib/hooks";
import { useTheme } from "@/theme/theme";
import { Button, Skeleton, T, TextLink } from "./ui";

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
  const { c } = useTheme();
  const stale = res.status === "stale";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {stale && <ClockAlert size={12} color={c.mutedForeground} />}
      <T s={12} c="mutedForeground">
        {SOURCE_LABEL[res.source]} · {stale ? "Stale copy, fetched " : "Updated "}
        {formatAge(res.fetchedAt, now)}
      </T>
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { c } = useTheme();
  const res = error instanceof ApiError ? error.response : null;
  const notFound = res?.status === "not_found";
  const title = notFound
    ? "We couldn't find that"
    : res?.status === "unavailable"
      ? `${SOURCE_LABEL[res.source]} is unavailable right now`
      : "Something went wrong loading this data";
  const detail = notFound
    ? "The link may be out of date, or the data hasn't been published yet."
    : error instanceof TypeError
      ? "Check your connection and try again."
      : error instanceof Error
        ? error.message
        : String(error);
  return (
    <View accessibilityRole="alert" style={{ flexDirection: "row", gap: 12, padding: 16, borderWidth: 1, borderStyle: "dashed", borderColor: c.border }}>
      <AlertTriangle size={16} color={c.destructive} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: 4 }}>
        <T f="medium">{title}</T>
        {detail ? <T s={12} c="mutedForeground">{detail}</T> : null}
        {notFound && <TextLink href="/calendar" s={12}>Browse the calendar</TextLink>}
        {onRetry && !notFound && <Button label="Retry" icon={RotateCw} variant="outline" onPress={onRetry} />}
      </View>
    </View>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ padding: 16, borderWidth: 1, borderStyle: "dashed", borderColor: c.border }}>
      <T c="mutedForeground">{children}</T>
    </View>
  );
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <View style={{ gap: 8 }} accessibilityLabel="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={28} />
      ))}
    </View>
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
