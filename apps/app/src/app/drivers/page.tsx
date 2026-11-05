import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/data/query-state";
import { RosterView } from "@/components/pages/roster-view";

export const metadata: Metadata = { title: "Drivers" };

export default function DriversPage() {
  return (
    <Suspense fallback={<LoadingRows />}>
      <RosterView kind="drivers" />
    </Suspense>
  );
}
