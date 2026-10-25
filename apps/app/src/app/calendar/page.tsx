import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/data/query-state";
import { CalendarView } from "@/components/pages/calendar-view";
import { PageHeader } from "@/components/pages/page-header";
import { SeasonLabel } from "@/components/layout/season-selector";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage() {
  return (
    <>
      <PageHeader title={<><Suspense><SeasonLabel /></Suspense>Calendar</>} description="Every Grand Prix weekend of the season. Race start times are in your time zone." />
      <Suspense fallback={<LoadingRows />}>
        <CalendarView />
      </Suspense>
    </>
  );
}
