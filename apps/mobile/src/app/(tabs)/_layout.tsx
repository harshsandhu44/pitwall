import { Tabs } from "expo-router/js-tabs";
import { AppHeader, TabBar } from "@/components/shell";

// The web's phone tab bar, with Grid (Drivers and Teams) where Replay goes once it ships. The app opens on
// "/", which is Home (index).
export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ header: ({ route }) => <AppHeader route={route.name} /> }}>
      <Tabs.Screen name="live" />
      <Tabs.Screen name="index" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="standings" />
      <Tabs.Screen name="grid" />
    </Tabs>
  );
}
