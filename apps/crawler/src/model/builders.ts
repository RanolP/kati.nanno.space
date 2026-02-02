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

  enum: <const T extends string>(values: readonly [T, ...T[]]): ScalarModel<T> => ({
    kind: "scalar",
    schema: v.picklist(values),
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
