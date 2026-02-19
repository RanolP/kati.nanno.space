import { useEffect, useState } from "react";

interface RoomModule {
  Room: React.ComponentType;
}

export default function IndexPage() {
  const [RoomComponent, setRoomComponent] = useState<React.ComponentType | undefined>(undefined);

  useEffect(() => {
    let alive = true;

    void import("../../components/room").then((module: RoomModule) => {
      if (!alive) return;
      setRoomComponent(() => module.Room);
    });

    return () => {
      alive = false;
    };
  }, []);

  if (!RoomComponent) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  return <RoomComponent />;
}
