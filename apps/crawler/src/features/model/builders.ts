import * as v from "valibot";
import type {
  AnyModel,
  CollectionModel,
  CompositeKey,
  CompositeModel,
  Infer,
  ScalarModel,
} from "./types.ts";

export const scalar = {
  string: (): ScalarModel<string> => ({
    kind: "scalar",
    schema: v.string(),
  }),

  number: (): ScalarModel<number> => ({
    kind: "scalar",
    schema: v.number(),
  }),

  boolean: (): ScalarModel<boolean> => ({
    kind: "scalar",
    schema: v.boolean(),
  }),

  enum: <const T extends Record<string, string>>(enumObject: T): ScalarModel<T[keyof T]> => ({
    kind: "scalar",
    schema: v.enum(enumObject) as unknown as v.GenericSchema<T[keyof T]>,
  }),

  nullable: <V>(inner: ScalarModel<V>): ScalarModel<V | null> => ({
    kind: "scalar",
    schema: v.nullable(inner.schema) as unknown as v.GenericSchema<V | null>,
  }),

  simpleSet: <V>(inner: ScalarModel<V>): ScalarModel<V[]> => ({
    kind: "scalar",
    schema: v.pipe(
      v.array(inner.schema),
      v.transform((items) => [...items].toSorted() as V[]),
    ) as unknown as v.GenericSchema<V[]>,
  }),

  /** 문자열 또는 숫자 (API에서 혼용되는 경우) */
  stringOrNumber: (): ScalarModel<string | number> => ({
    kind: "scalar",
    schema: v.union([v.string(), v.number()]),
  }),
};

export function composite<const Fields extends Record<string, AnyModel>>(
  fields: Fields,
): CompositeModel<Fields> {
  const entries = Object.entries(fields).map(([key, model]) => [key, model.schema] as const);
  const schemaEntries = Object.fromEntries(entries) as {
    [K in keyof Fields]: Fields[K]["schema"];
  };

  return {
    kind: "composite",
    fields,
    schema: v.object(schemaEntries) as unknown as CompositeModel<Fields>["schema"],
  };
}

export function collection<V extends AnyModel, const K extends CompositeKey>(
  valueModel: V,
  keyFn: (value: Infer<V>) => K,
): CollectionModel<V, K> {
  return {
    kind: "collection",
    valueModel,
    keyFn,
    schema: v.array(valueModel.schema) as unknown as CollectionModel<V, K>["schema"],
  };
}

/** Make any model nullable */
export function nullable<M extends AnyModel>(model: M): ScalarModel<Infer<M> | null> {
  return {
    kind: "scalar",
    schema: v.nullable(model.schema) as unknown as v.GenericSchema<Infer<M> | null>,
  };
}
