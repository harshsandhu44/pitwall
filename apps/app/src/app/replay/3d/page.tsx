import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/data/query-state";
import { Replay3DView } from "@/components/pages/race-3d-view";

export const metadata: Metadata = { title: "Replay in 3D" };

export default function Replay3DPage() {
  return (
    <Suspense fallback={<LoadingRows />}>
      <Replay3DView />
    </Suspense>
  );
}
