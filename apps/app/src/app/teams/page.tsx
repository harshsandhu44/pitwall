import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/data/query-state";
import { RosterView } from "@/components/pages/roster-view";

export const metadata: Metadata = { title: "Teams" };

export default function TeamsPage() {
  return (
    <Suspense fallback={<LoadingRows />}>
      <RosterView kind="teams" />
    </Suspense>
  );
}
