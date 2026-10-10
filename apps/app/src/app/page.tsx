import { HomeView } from "@/components/pages/home-view";
import { PageHeader } from "@/components/pages/page-header";

export default function Home() {
  return (
    <>
      <PageHeader title="Overview" description="Next session, latest result and the championship at a glance." />
      <HomeView />
    </>
  );
}
