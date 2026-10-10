import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/data/query-state";
import { ReplayView } from "@/components/pages/replay-view";

export const metadata: Metadata = { title: "Replay" };

export default function ReplayPage() {
  return (
    <Suspense fallback={<LoadingRows />}>
      <ReplayView />
    </Suspense>
  );
}
