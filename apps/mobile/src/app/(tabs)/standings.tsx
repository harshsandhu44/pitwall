// Port of apps/app/src/components/pages/standings-view.tsx: Drivers and Constructors (progression chart and
// results matrix stay web-only for now).
import type { ConstructorStanding, DriverStanding, PointsProgression, Standings as StandingsData } from "@pitwall/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { QueryState, SourceNote } from "@/components/data";
import { ConstructorStandingsTable, DriverStandingsTable } from "@/components/standings";
import { PageHeader, Screen, Segmented, T } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useSeason } from "@/lib/hooks";

type Tab = "drivers" | "constructors";

export default function Standings() {
  const { season } = useSeason();
  const params = useLocalSearchParams<{ view?: string }>();
  const router = useRouter();
  const tab: Tab = params.view === "constructors" ? "constructors" : "drivers";
  const s = season ? `season=${season}` : null;
  const drivers = useApi<StandingsData<DriverStanding>>(s && `/api/standings/drivers?${s}`);
  const constructors = useApi<StandingsData<ConstructorStanding>>(s && tab === "constructors" ? `/api/standings/constructors?${s}` : null);
  const driverProg = useApi<PointsProgression>(s && tab === "drivers" ? `/api/standings/progression?type=drivers&${s}` : null);
  const constructorProg = useApi<PointsProgression>(s && tab === "constructors" ? `/api/standings/progression?type=constructors&${s}` : null);

  return (
    <Screen>
      <PageHeader title={`${season ?? ""} Championship standings`} description="Drivers' and constructors' championships.">
        <Segmented
          value={tab}
          onChange={(v) => router.setParams({ view: v })}
          items={[
            { value: "drivers", label: "Drivers" },
            { value: "constructors", label: "Constructors" },
          ]}
        />
      </PageHeader>
      {tab === "drivers" ? (
        <QueryState query={drivers}>
          {(st, res) => (
            <View style={{ gap: 8 }}>
              <T s={12} c="mutedForeground">After round {st.round}</T>
              <DriverStandingsTable standings={st} progression={driverProg.data?.data ?? undefined} />
              <SourceNote res={res} />
            </View>
          )}
        </QueryState>
      ) : (
        <QueryState query={constructors}>
          {(st, res) => (
            <View style={{ gap: 8 }}>
              {st.round > 0 && <T s={12} c="mutedForeground">After round {st.round}</T>}
              <ConstructorStandingsTable standings={st} progression={constructorProg.data?.data ?? undefined} />
              <SourceNote res={res} />
            </View>
          )}
        </QueryState>
      )}
    </Screen>
  );
}
