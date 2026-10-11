import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/data/query-state";
import { WeatherRedirect } from "@/components/pages/weather-redirect";

export const metadata: Metadata = { title: "Weather" };

export default function WeatherPage() {
  return (
    <Suspense fallback={<LoadingRows />}>
      <WeatherRedirect />
    </Suspense>
  );
}
