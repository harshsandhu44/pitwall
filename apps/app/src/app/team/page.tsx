import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/data/query-state";
import { ProfileView } from "@/components/pages/profile-view";

export const metadata: Metadata = { title: "Constructor" };

export default function ConstructorPage() {
  return (
    <Suspense fallback={<LoadingRows />}>
      <ProfileView kind="teams" />
    </Suspense>
  );
}
