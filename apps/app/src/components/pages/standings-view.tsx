"use client";

import type { ConstructorStanding, DriverStanding, PointsProgression, SeasonResults, Standings } from "@pitwall/shared";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { QueryState, SourceNote } from "@/components/data/query-state";
import { ConstructorStandingsTable } from "@/components/standings/constructor-standings-table";
import { DriverStandingsTable } from "@/components/standings/driver-standings-table";
import { PointsProgressionChart } from "@/components/standings/points-progression-chart";
import { SeasonResultsMatrix } from "@/components/standings/season-results-matrix";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi } from "@/lib/api";
import { useSeason } from "@/lib/hooks";

const TABS = ["drivers", "constructors", "progression", "results"] as const;
type Tab = (typeof TABS)[number];

export function StandingsView() {
  const { season } = useSeason();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab: Tab = TABS.includes(params.get("view") as Tab) ? (params.get("view") as Tab) : "drivers";
  const setTab = (v: Tab) => {
    const p = new URLSearchParams(params);
    p.set("view", v);
    router.replace(`${pathname}?${p}`, { scroll: false });
  };

  const s = season ? `season=${season}` : null;
  const drivers = useApi<Standings<DriverStanding>>(s && `/api/standings/drivers?${s}`);
  const constructors = useApi<Standings<ConstructorStanding>>(s && tab === "constructors" ? `/api/standings/constructors?${s}` : null);
  const results = useApi<SeasonResults>(s && `/api/results?${s}`);
  const driverProg = useApi<PointsProgression>(s && tab !== "results" ? `/api/standings/progression?type=drivers&${s}` : null);
  const constructorProg = useApi<PointsProgression>(
    s && (tab === "constructors" || tab === "progression") ? `/api/standings/progression?type=constructors&${s}` : null,
  );

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
      <TabsList className="mb-3">
        <TabsTrigger value="drivers">Drivers</TabsTrigger>
        <TabsTrigger value="constructors">Constructors</TabsTrigger>
        <TabsTrigger value="progression">Progression</TabsTrigger>
        <TabsTrigger value="results">Results matrix</TabsTrigger>
      </TabsList>

      <TabsContent value="drivers">
        <QueryState query={drivers}>
          {(st, res) => (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">After round {st.round}</p>
              <DriverStandingsTable standings={st} results={results.data?.data ?? undefined} progression={driverProg.data?.data ?? undefined} />
              <SourceNote res={res} />
            </div>
          )}
        </QueryState>
      </TabsContent>

      <TabsContent value="constructors">
        <QueryState query={constructors}>
          {(st, res) => (
            <div className="space-y-2">
              {st.round > 0 && <p className="text-xs text-muted-foreground">After round {st.round}</p>}
              <ConstructorStandingsTable standings={st} results={results.data?.data ?? undefined} progression={constructorProg.data?.data ?? undefined} />
              <SourceNote res={res} />
            </div>
          )}
        </QueryState>
      </TabsContent>

      <TabsContent value="progression" className="space-y-8">
        <section aria-labelledby="prog-drivers" className="space-y-2">
          <h2 id="prog-drivers" className="text-sm font-medium">Drivers</h2>
          <QueryState query={driverProg}>
            {(p, res) => (
              <>
                <PointsProgressionChart progression={p} type="drivers" />
                <SourceNote res={res} />
              </>
            )}
          </QueryState>
        </section>
        <section aria-labelledby="prog-constructors" className="space-y-2">
          <h2 id="prog-constructors" className="text-sm font-medium">Constructors</h2>
          <QueryState query={constructorProg}>
            {(p, res) =>
              p.constructors.length ? (
                <>
                  <PointsProgressionChart progression={p} type="constructors" />
                  <SourceNote res={res} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No constructors&apos; championship for this season.</p>
              )
            }
          </QueryState>
        </section>
      </TabsContent>

      <TabsContent value="results">
        <QueryState query={results}>
          {(r, res) => (
            <div className="space-y-2">
              <SeasonResultsMatrix results={r} order={drivers.data?.data?.entries.map((e) => e.driver.id) ?? []} />
              <SourceNote res={res} />
            </div>
          )}
        </QueryState>
      </TabsContent>
    </Tabs>
  );
}
