import { RoomShell } from "@sqlrooms/room-shell";
import { ThemeProvider } from "@sqlrooms/ui";
import { roomStore } from "../lib/store";

export function Room() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="kati-ui-theme">
      <RoomShell className="h-screen" roomStore={roomStore}>
        <RoomShell.Sidebar />
        <RoomShell.LayoutComposer />
        <RoomShell.LoadingProgress />
      </RoomShell>
    </ThemeProvider>
  );
}
