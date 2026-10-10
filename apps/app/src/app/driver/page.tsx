import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/data/query-state";
import { ProfileView } from "@/components/pages/profile-view";

export const metadata: Metadata = { title: "Driver" };

export default function DriverPage() {
  return (
    <Suspense fallback={<LoadingRows />}>
      <ProfileView kind="drivers" />
    </Suspense>
  );
}
