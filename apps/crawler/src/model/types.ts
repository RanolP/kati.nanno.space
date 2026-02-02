import type * as v from "valibot";

// --- Scalar ---

export interface ScalarModel<V = unknown> {
  readonly kind: "scalar";
  readonly schema: v.GenericSchema<V>;
}

// --- Composite ---

export interface CompositeModel<
  Fields extends Record<string, AnyModel> = Record<string, AnyModel>,
> {
  readonly kind: "composite";
  readonly fields: Fields;
  readonly schema: v.GenericSchema<CompositeInfer<Fields>>;
}

// --- Collection ---

export type KeyElement = string | number;
export type CompositeKey = readonly [KeyElement, ...KeyElement[]];

export interface CollectionModel<
  V extends AnyModel = AnyModel,
  K extends CompositeKey = CompositeKey,
> {
  readonly kind: "collection";
  readonly valueModel: V;
  readonly keyFn: (value: Infer<V>) => K;
  readonly schema: v.GenericSchema<Infer<V>[]>;
}

// --- Union ---

export type AnyModel = ScalarModel | CompositeModel | CollectionModel;

// --- Inference ---

type CompositeInfer<Fields extends Record<string, AnyModel>> = {
  [K in keyof Fields]: Infer<Fields[K]>;
};

export type Infer<M extends AnyModel> =
  M extends ScalarModel<infer V>
    ? V
    : M extends CompositeModel<infer Fields>
      ? CompositeInfer<Fields>
      : M extends CollectionModel<infer V>
        ? Map<string, Infer<V>>
        : never;
