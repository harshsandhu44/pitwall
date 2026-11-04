"use client";

import { BellIcon, BellOffIcon, BellRingIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type AlertMode, setAlertMode, useAlertMode } from "@/lib/live-alerts";

const MODES: { value: AlertMode; label: string; icon: typeof BellIcon }[] = [
  { value: "off", label: "Off", icon: BellOffIcon },
  { value: "chime", label: "Chime", icon: BellIcon },
  { value: "voice", label: "Chime + voice", icon: BellRingIcon },
];

/** Live alerts: off, a chime, or a chime and a spoken call (plus notifications while the tab is in the background). */
export function AlertsToggle({ className }: { className?: string }) {
  const mode = useAlertMode();
  const current = MODES.find((m) => m.value === mode)!;
  const blocked = mode !== "off" && typeof Notification !== "undefined" && Notification.permission === "denied";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" aria-label={`Alerts: ${current.label}`} className={className} />}>
        <current.icon aria-hidden />
        <span className="hidden sm:inline">Alerts</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Alerts</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={mode} onValueChange={(v: AlertMode) => setAlertMode(v)}>
            {MODES.map((m) => (
              <DropdownMenuRadioItem key={m.value} value={m.value}>
                {m.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <p className="max-w-56 px-2 py-1.5 text-[11px] text-muted-foreground">
          {blocked
            ? "Sound only: notifications are blocked for this site."
            : "Flags, safety cars, stewards' decisions and team radio. Notifications too while the tab is in the background."}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
