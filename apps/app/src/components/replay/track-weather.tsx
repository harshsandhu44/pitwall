import { lastAtOrBefore, type SessionReplay } from "@pitwall/shared";
import { EmptyState } from "@/components/data/query-state";
import { Wind } from "@/components/weather/wind";
import { fmtClock, fmtPct, fmtTemp } from "@/lib/format";

/** Latest track-side weather observation at the replay position (OpenF1 publishes about one a minute). */
export function TrackWeather({ weather, t }: { weather: SessionReplay["weather"]; t: number }) {
  const i = lastAtOrBefore(weather.map((w) => w.t), t);
  const w = weather[i];
  if (!w) return <EmptyState>No weather observation recorded yet at this point.</EmptyState>;
  const rows: [string, React.ReactNode][] = [
    ["Air", fmtTemp(w.air)],
    ["Track", fmtTemp(w.track)],
    ["Humidity", fmtPct(w.humidity)],
    ["Wind", <Wind key="w" speed={w.windSpeed === null ? null : w.windSpeed * 3.6} direction={w.windDirection} />],
    ["Rain", w.rainfall === null ? "—" : w.rainfall ? "Yes" : "No"],
  ];
  return (
    <div className="space-y-2 text-xs">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-mono tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">Observed at the track at {fmtClock(w.t)}.</p>
    </div>
  );
}
