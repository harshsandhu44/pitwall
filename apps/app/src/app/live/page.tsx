import type { Metadata } from "next";
import { LiveView } from "@/components/pages/live-view";

export const metadata: Metadata = { title: "Live" };

export default function LivePage() {
  return <LiveView />;
}
