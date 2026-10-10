import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/data/query-state";
import { WeatherView } from "@/components/pages/weather-view";

export const metadata: Metadata = { title: "Weather" };

export default function WeatherPage() {
  return (
    <Suspense fallback={<LoadingRows />}>
      <WeatherView />
    </Suspense>
  );
}
