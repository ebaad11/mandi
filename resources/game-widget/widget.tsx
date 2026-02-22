import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import { useState, useEffect } from "react";
import { propsSchema, type Props } from "./types";
import { GameChrome } from "./components/GameChrome";
import { OnboardingView } from "./components/OnboardingView";
import { SkeletonMapScreen } from "./components/SkeletonMapScreen";
import { MapScreen } from "./components/MapScreen";

export const widgetMetadata: WidgetMetadata = {
  description: "Ancient civilization strategy game — Assyrian/Babylonian hex world",
  props: propsSchema,
  exposeAsTool: false,
};

export default function GameWidget() {
  const { props, isPending } = useWidget<Props>();

  const [mapData, setMapData] = useState<Props["map"] | null>(null);
  const [profileData, setProfileData] = useState<Props["profile"] | null>(null);
  const [eventsData, setEventsData] = useState<Props["events"] | null>(null);
  const [openPanel, setOpenPanel] = useState<"profile" | "events" | null>(null);

  useEffect(() => {
    if (isPending) return;
    if (props.view === "onboarding") {
      setMapData(null);
      setProfileData(null);
      setEventsData(null);
      setOpenPanel(null);
    } else if (props.view === "map" && props.map) {
      setMapData(props.map);
    } else if (props.view === "profile" && props.profile) {
      setProfileData(props.profile);
      setOpenPanel("profile");
    } else if (props.view === "events" && props.events) {
      setEventsData(props.events);
      setOpenPanel("events");
    }
  }, [props, isPending]);

  // No map data yet and still loading → skeleton
  if (!mapData && isPending) {
    return (
      <McpUseProvider autoSize>
        <SkeletonMapScreen />
      </McpUseProvider>
    );
  }

  // Onboarding (no map yet)
  if (!mapData && props.view === "onboarding") {
    return (
      <McpUseProvider autoSize>
        <GameChrome>
          <OnboardingView {...(props.onboarding ?? {})} />
        </GameChrome>
      </McpUseProvider>
    );
  }

  // Still no map data (e.g. first view is profile/events before map is loaded)
  if (!mapData) {
    return (
      <McpUseProvider autoSize>
        <SkeletonMapScreen />
      </McpUseProvider>
    );
  }

  // Main: map always visible, panels as overlays
  return (
    <McpUseProvider autoSize>
      <MapScreen
        mapData={mapData}
        profileData={profileData}
        eventsData={eventsData}
        openPanel={openPanel}
        setOpenPanel={setOpenPanel}
        isLoading={isPending}
      />
    </McpUseProvider>
  );
}
