import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/data/query-state";
import { RaceView } from "@/components/pages/race-view";

export const metadata: Metadata = { title: "Race weekend" };

export default function RacePage() {
  return (
    <Suspense fallback={<LoadingRows />}>
      <RaceView />
    </Suspense>
  );
}
