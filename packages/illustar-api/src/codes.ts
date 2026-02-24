import * as v from "valibot";

/** 부스 상태 */
export const BoothStatus = Object.freeze({
  /** 신청서 접수 완료 (미선정) */
  REVIEW: "B0100001",
  /** 수정 요청 */
  MODIFY: "B0100002",
  /** 결제 대기 중 */
  WAIT_PAY: "B0100003",
  /** 참가 확정 */
  COMPLETE: "B0100004",
  /** 환불 완료 */
  REFUND: "B0100005",
  /** 취소 완료 */
  CANCEL: "B0100006",
  /** 결제 진행중 */
  PAY_PROCESSING: "B0100007",
  /** 환불 요청 */
  REFUND_REQUEST: "B0100008",
  /** 입금 기한 초과 */
  PAY_LIMIT_EXCEED: "B0100009",
} as const);

export const BoothStatusSchema = v.enum(BoothStatus);

/** 부스 크기 */
export const BoothType = Object.freeze({
  /** 초소형 서클 */
  XS: "B0200001",
  /** 소형 서클 */
  S: "B0200002",
  /** 중형 서클 */
  M: "B0200003",
  /** 와이드 중형 서클 */
  WIDE_M: "B0200004",
  /** 와이드 대형 서클 */
  WIDE_L: "B0200005",
  /** 하이엔드 서클 */
  HIGH_END: "B0200006",
  /** 플래그십 서클 */
  FLAGSHIP: "B0200007",
} as const);

export const BoothTypeSchema = v.enum(BoothType);

/** 참가 요일 */
export const DateType = Object.freeze({
  /** 토요일 */
  SAT: "E0300001",
  /** 일요일 */
  SUN: "E0300002",
  /** 토요일, 일요일(양일) */
  SAT_SUN: "E0300003",
  /** 월요일 */
  MON: "E0300004",
  /** 화요일 */
  TUE: "E0300005",
  /** 수요일 */
  WED: "E0300006",
  /** 목요일 */
  THU: "E0300007",
  /** 금요일 */
  FRI: "E0300008",
  /** 목요일, 금요일 */
  THU_FRI: "E0300009",
  /** 금요일, 토요일(양일) */
  FRI_SAT: "E0300010",
  /** 금요일, 토요일, 일요일 */
  FRI_SAT_SUN: "E0300011",
  /** 목요일, 금요일, 토요일, 일요일 */
  THU_FRI_SAT_SUN: "E0300012",
} as const);

export const DateTypeSchema = v.enum(DateType);

/** 판매 상품 유형 */
export const GoodsType = Object.freeze({
  /** 일러스트북 */
  ILLUSTRATION_BOOK: "B0700001",
  /** 만화(동인지) */
  MANGA: "B0700002",
  /** 엽서, 카드택 등 소형 지류 굿즈 */
  SMALL_PAPER: "B0700003",
  /** 족자봉, 브로마이드 등 대형 평면 굿즈 */
  LARGE_FLAT: "B0700004",
  /** 아크릴 스탠드, 참 등 준 입체 굿즈 */
  SEMI_3D: "B0700005",
  /** 쿠션, 인형 등 말랑 입체 굿즈 */
  SOFT_3D: "B0700006",
  /** 기타 수공예품 */
  HANDICRAFT: "B0700007",
  /** 음반, 레코드, 음악 카드 등 음원 기반 굿즈 */
  AUDIO: "B0700008",
  /** 게임 및 소프트웨어 */
  SOFTWARE: "B0700009",
} as const);

export const GoodsTypeSchema = v.enum(GoodsType);

/** 쉼표 구분 문자열 → 배열 변환 (각 항목을 itemSchema로 검증) */
export function commaSeparated<O>(itemSchema: v.GenericSchema<unknown, O>) {
  return v.pipe(
    v.string(),
    v.transform((value): O[] => {
      const items = value === "" ? [] : value.split(",");
      return items.map((item) => v.parse(itemSchema, item));
    }),
  );
}

/** Y/N 플래그 → boolean 변환 */
export const YN = v.pipe(
  v.picklist(["Y", "N"]),
  v.transform((value) => value === "Y"),
);
