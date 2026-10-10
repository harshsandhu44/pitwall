"use client";

import { type GrandPrix, nextSession, SESSION_LABEL, sessionWeather, weatherLabel } from "@pitwall/shared";
import { QueryState, SourceNote } from "@/components/data/query-state";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtMm, fmtPct, fmtTemp, formatHour } from "@/lib/format";
import { useForecast, useNow } from "@/lib/hooks";
import { Wind } from "./wind";

/** Model conditions now + forecast at the next session start for a race weekend's circuit. */
export function WeatherConditions({ race }: { race: GrandPrix }) {
  const forecast = useForecast(race.circuit.id);
  const now = useNow();
  return (
    <QueryState query={forecast} loading={<Skeleton className="h-[229px] w-full" />}>
      {(f, res) => {
        const c = f.current;
        const next = now === null ? null : nextSession([race], now);
        const s = next ? sessionWeather(f.hourly, next.session) : null;
        return (
          <div className="space-y-3 text-sm">
            {c && (
              <div>
                <p className="text-xs text-muted-foreground">Model estimate for {formatHour(c.time)} · not a track measurement</p>
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-2xl font-semibold tabular-nums">{fmtTemp(c.temperature)}</span>
                  <span>{weatherLabel(c.weatherCode)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Feels {fmtTemp(c.apparentTemperature)} · humidity {fmtPct(c.humidity)} · cloud {fmtPct(c.cloudCover)}
                </p>
                <p className="text-xs">
                  <Wind speed={c.windSpeed} direction={c.windDirection} gusts={c.windGusts} />
                </p>
              </div>
            )}
            {next && (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground">Forecast for {SESSION_LABEL[next.session.kind]}</p>
                {s?.atStart ? (
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">At start</dt>
                    <dd>
                      {fmtTemp(s.atStart.temperature)}, {weatherLabel(s.atStart.weatherCode)}
                    </dd>
                    <dt className="text-muted-foreground">Rain chance</dt>
                    <dd>up to {fmtPct(s.maxPrecipitationProbability)}</dd>
                    <dt className="text-muted-foreground">Rain total</dt>
                    <dd>{fmtMm(s.totalPrecipitation)}</dd>
                    <dt className="text-muted-foreground">Wind</dt>
                    <dd>
                      <Wind speed={s.atStart.windSpeed} direction={s.atStart.windDirection} />
                    </dd>
                  </dl>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Not available yet — hourly forecasts reach about 16 days ahead.
                  </p>
                )}
              </div>
            )}
            <SourceNote res={res} />
          </div>
        );
      }}
    </QueryState>
  );
}
