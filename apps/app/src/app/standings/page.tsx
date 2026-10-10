import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/data/query-state";
import { PageHeader } from "@/components/pages/page-header";
import { StandingsView } from "@/components/pages/standings-view";

export const metadata: Metadata = { title: "Standings" };

export default function StandingsPage() {
  return (
    <>
      <PageHeader title="Championship standings" description="Drivers' and constructors' championships, progression and every result." />
      <Suspense fallback={<LoadingRows />}>
        <StandingsView />
      </Suspense>
    </>
  );
}
