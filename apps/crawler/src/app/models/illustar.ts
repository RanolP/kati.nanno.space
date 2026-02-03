import { BoothStatus, BoothType, DateType, GoodsType } from "../../services/illustar/index.ts";
import { collection, composite, scalar } from "../../features/model/index.ts";

// --- 공용 ---

const imageInfo = composite({
  id: scalar.number(),
  parent_table_key: scalar.stringOrNumber(),
  original_name: scalar.string(),
  url: scalar.string(),
});

// --- 행사 ---

const event = composite({
  id: scalar.number(),
  round: scalar.number(),
  event_type: scalar.string(),
  name: scalar.string(),
  status: scalar.string(),
  place: scalar.string(),
  start_date: scalar.string(),
  end_date: scalar.string(),
  show_date: scalar.string(),
  ticket_open_date: scalar.nullable(scalar.string()),
  image: scalar.number(),
  ticket_close_date: scalar.nullable(scalar.string()),
  ticket_date_desc: scalar.nullable(scalar.string()),
  ticket_bg_image_pc: scalar.number(),
  ticket_bg_image_mo: scalar.number(),
  description: scalar.nullable(scalar.string()),
  show_at_list: scalar.boolean(),
  show_at_ongoing: scalar.boolean(),
});

export const eventCollection = collection(event, (e) => [e.id] as const);

// --- 진행중 부스 ---

const ongoingBoothInfoItem = composite({
  ...event.fields,
  ticket_bg_image_pc_info: imageInfo,
});

export const ongoingBoothInfoCollection = collection(ongoingBoothInfoItem, (b) => [b.id] as const);

// --- 서클 ---

const circle = composite({
  id: scalar.number(),
  event_booth_application_id: scalar.number(),
  event_id: scalar.number(),
  booth_no: scalar.string(),
  booth_status: scalar.enum(BoothStatus),
  booth_name: scalar.string(),
  date_type: scalar.enum(DateType),
  booth_type: scalar.enum(BoothType),
  zone_type: scalar.string(),
  user_region: scalar.string(),
  near_booth: scalar.string(),
  homepage: scalar.string(),
  introduce: scalar.string(),
  tag: scalar.simpleSet(scalar.string()),
  image: scalar.number(),
  size_type: scalar.string(),
  complexity_type: scalar.string(),
  exp_type: scalar.string(),
  user_nickname: scalar.string(),
  goods_type: scalar.simpleSet(scalar.enum(GoodsType)),
  genre_type: scalar.string(),
  image_info: imageInfo,
});

export const circleCollection = collection(circle, (c) => [c.id] as const);

// --- 공연 ---

const concert = composite({
  id: scalar.string(),
  name: scalar.string(),
  status: scalar.string(),
  place: scalar.string(),
  start_date: scalar.string(),
  end_date: scalar.string(),
  show_date: scalar.string(),
  thumbnail_image_url: scalar.string(),
  ticket_date_desc: scalar.string(),
  ticket_open_date: scalar.string(),
  ticket_close_date: scalar.string(),
});

export const concertCollection = collection(concert, (c) => [c.id] as const);

// --- 일정 ---

const scheduleItem = composite({
  id: scalar.number(),
  event_name: scalar.string(),
  event_date: scalar.string(),
  event_location: scalar.string(),
  event_desc: scalar.string(),
  image: scalar.number(),
  image_info: imageInfo,
});

export const scheduleCollection = collection(scheduleItem, (s) => [s.id] as const);
