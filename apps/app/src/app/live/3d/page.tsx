import type { Metadata } from "next";
import { Live3DView } from "@/components/pages/race-3d-view";

export const metadata: Metadata = { title: "Live in 3D" };

export default function Live3DPage() {
  return <Live3DView />;
}
