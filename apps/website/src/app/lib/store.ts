import {
  createRoomShellSlice,
  createRoomStore,
  LayoutTypes,
  type RoomShellSliceState,
} from "@sqlrooms/room-shell";
import { DatabaseIcon, TableIcon } from "lucide-react";
import { DataSourcesPanel } from "../components/data-sources-panel";
import { MainView } from "../components/main-view";

export type RoomState = RoomShellSliceState;

export const { roomStore, useRoomStore } = createRoomStore<RoomState>((set, get, store) => ({
  ...createRoomShellSlice({
    config: {
      title: "KATI Data Explorer",
      dataSources: [
        {
          tableName: "events",
          type: "url",
          url: "/data/illustar/events.parquet",
        },
        {
          tableName: "circles",
          type: "url",
          url: "/data/illustar/circles.parquet",
        },
        {
          tableName: "concerts",
          type: "url",
          url: "/data/illustar/concerts.parquet",
        },
        {
          tableName: "schedule",
          type: "url",
          url: "/data/illustar/schedule.parquet",
        },
        {
          tableName: "ongoing_booth_info",
          type: "url",
          url: "/data/illustar/ongoing_booth_info.parquet",
        },
      ],
    },
    layout: {
      config: {
        type: LayoutTypes.enum.mosaic,
        nodes: {
          direction: "row",
          first: "data-sources",
          second: "main",
          splitPercentage: 25,
        },
      },
      panels: {
        "data-sources": {
          title: "Data Sources",
          icon: DatabaseIcon,
          component: DataSourcesPanel,
          placement: "sidebar",
        },
        main: {
          title: "Main View",
          icon: TableIcon,
          component: MainView,
          placement: "main",
        },
      },
    },
  })(set, get, store),
}));
