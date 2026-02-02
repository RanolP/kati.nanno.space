import type { AnyModel, Infer } from "./types.ts";

export function merge<M extends AnyModel>(model: M, left: Infer<M>, right: Infer<M>): Infer<M> {
  switch (model.kind) {
    case "scalar": {
      return right;
    }

    case "composite": {
      const result: Record<string, unknown> = {};
      for (const [key, fieldModel] of Object.entries(model.fields)) {
        const l = (left as Record<string, unknown>)[key];
        const r = (right as Record<string, unknown>)[key];
        result[key] = merge(fieldModel as AnyModel, l as Infer<AnyModel>, r as Infer<AnyModel>);
      }
      return result as Infer<M>;
    }

    case "collection": {
      const leftMap = left as Map<string, unknown>;
      const rightMap = right as Map<string, unknown>;
      const result = new Map<string, unknown>();

      for (const [key, value] of leftMap) {
        result.set(key, value);
      }

      for (const [key, value] of rightMap) {
        const existing = result.get(key);
        if (existing !== undefined) {
          result.set(
            key,
            merge(model.valueModel, existing as Infer<AnyModel>, value as Infer<AnyModel>),
          );
        } else {
          result.set(key, value);
        }
      }

      return result as Infer<M>;
    }
  }
}
