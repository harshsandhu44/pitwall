"use client";

import { type GrandPrix, scheduleState, SESSION_LABEL, sessionWeather, weatherLabel } from "@pitwall/shared";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { WeatherForecast } from "@pitwall/shared";
import { fmtMm, fmtPct, fmtTemp, formatHour, formatSessionTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { Wind } from "./wind";

/** Every session of the weekend: forecast at the start and across the scheduled window. */
export function RaceWeatherSummary({ race, forecast }: { race: GrandPrix; forecast: WeatherForecast }) {
  const now = useNow();
  return (
    <Table>
      <TableCaption className="sr-only">Forecast for each session of the {race.name}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Session</TableHead>
          <TableHead>At start</TableHead>
          <TableHead className="text-right">Rain chance</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Rain total</TableHead>
          <TableHead className="hidden md:table-cell">Wind</TableHead>
          <TableHead className="hidden lg:table-cell">Wet hours</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {race.sessions.map((s) => {
          const past = now !== null && scheduleState(s, now) === "finished";
          // A forecast for a session that already ran isn't a record of what happened; don't present it as one.
          const w = past ? null : sessionWeather(forecast.hourly, s);
          return (
            <TableRow key={s.kind}>
              <TableCell>
                <span className="font-medium">{SESSION_LABEL[s.kind]}</span>
                <span className="block font-mono text-[11px] text-muted-foreground">{now === null ? "…" : formatSessionTime(s)}</span>
              </TableCell>
              {!w?.atStart ? (
                <TableCell colSpan={5} className="text-xs text-muted-foreground">
                  {!s.start ? "Start time not published" : past ? "Session has finished" : "Forecast doesn't reach this session yet"}
                </TableCell>
              ) : (
                <>
                  <TableCell className="text-xs">
                    {fmtTemp(w.atStart.temperature)} · {weatherLabel(w.atStart.weatherCode)}
                    {w.temperatureRange && w.temperatureRange[0] !== w.temperatureRange[1] && (
                      <span className="block text-muted-foreground">
                        {fmtTemp(w.temperatureRange[0])}–{fmtTemp(w.temperatureRange[1])} during
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">{fmtPct(w.maxPrecipitationProbability)}</TableCell>
                  <TableCell className="hidden text-right font-mono text-xs tabular-nums sm:table-cell">{fmtMm(w.totalPrecipitation)}</TableCell>
                  <TableCell className="hidden text-xs md:table-cell">
                    <Wind speed={w.atStart.windSpeed} direction={w.atStart.windDirection} gusts={w.maxGusts} />
                  </TableCell>
                  <TableCell className="hidden text-xs lg:table-cell">
                    {w.wetHours.length ? w.wetHours.map((t) => formatHour(t)).join(", ") : "None forecast"}
                  </TableCell>
                </>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
