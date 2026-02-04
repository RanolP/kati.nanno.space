import { lazy, Suspense } from "react";

const Room = lazy(() => import("../../components/room").then((m) => ({ default: m.Room })));

export default function IndexPage() {
  return (
    <Suspense
      fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}
    >
      <Room />
    </Suspense>
  );
}
