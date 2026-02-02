import * as v from "valibot";
import type { AnyModel, CompositeKey, Infer } from "./types.ts";
import { keyToString } from "./serialize.ts";

export interface FileContents {
  readonly files: ReadonlyMap<string, string>;
}

function parseJsonl(content: string): unknown[] {
  return content
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

function hasNestedCollection(model: AnyModel): boolean {
  if (model.kind === "collection") return true;
  if (model.kind === "composite") {
    return Object.values(model.fields).some((f) => hasNestedCollection(f));
  }
  return false;
}

function reconstructComposite(
  model: AnyModel,
  record: Record<string, unknown>,
  parsed: ReadonlyMap<string, unknown[]>,
  parentFkFields: Record<string, unknown>,
): unknown {
  if (model.kind !== "composite") {
    throw new Error("reconstructComposite expects a composite model");
  }

  const result: Record<string, unknown> = {};
  const fields = model.fields as Record<string, AnyModel>;

  for (const [key, fieldModel] of Object.entries(fields)) {
    if (fieldModel.kind === "collection") {
      const childRecords = parsed.get(key) ?? [];
      const fkFields = { ...parentFkFields };

      // Match child records by foreign key fields
      const matchingRecords = childRecords.filter((child) => {
        const childObj = child as Record<string, unknown>;
        for (const [fkKey, fkValue] of Object.entries(fkFields)) {
          if (childObj[fkKey] !== fkValue) return false;
        }
        return true;
      });

      result[key] = deserializeCollection(fieldModel, matchingRecords, parsed);
    } else if (fieldModel.kind === "scalar") {
      result[key] = record[key];
    } else {
      result[key] = reconstructComposite(fieldModel, record, parsed, parentFkFields);
    }
  }

  return v.parse(model.schema, result);
}

function deserializeCollection(
  model: AnyModel,
  records: unknown[],
  parsed: ReadonlyMap<string, unknown[]>,
): Map<string, unknown> {
  if (model.kind !== "collection") {
    throw new Error("deserializeCollection expects a collection model");
  }

  const valueModel = model.valueModel as AnyModel;
  const map = new Map<string, unknown>();
  const needsReconstruction =
    valueModel.kind === "composite" &&
    Object.values(valueModel.fields as Record<string, AnyModel>).some((f) =>
      hasNestedCollection(f),
    );

  for (const record of records) {
    const obj = record as Record<string, unknown>;
    let item: unknown;

    if (needsReconstruction) {
      const key = model.keyFn(obj as Infer<AnyModel>) as CompositeKey;
      const fkFields: Record<string, unknown> = {};
      for (let i = 0; i < key.length; i++) {
        fkFields[`_fk${i}`] = key[i];
      }
      item = reconstructComposite(valueModel, obj, parsed, fkFields);
    } else if (valueModel.kind === "composite") {
      item = v.parse(valueModel.schema, obj);
    } else {
      item = v.parse(valueModel.schema, obj);
    }

    const key = model.keyFn(item as Infer<AnyModel>) as CompositeKey;
    map.set(keyToString(key), item);
  }

  return map;
}

export function deserialize<M extends AnyModel>(
  model: M,
  files: FileContents,
  name: string,
): Infer<M> {
  if (model.kind !== "collection") {
    throw new Error("Top-level deserialize expects a collection model");
  }

  const parsed = new Map<string, unknown[]>();
  for (const [filename, content] of files.files) {
    const key = filename.replace(/\.jsonl$/, "");
    parsed.set(key, parseJsonl(content));
  }

  const records = parsed.get(name) ?? [];
  return deserializeCollection(model, records, parsed) as Infer<M>;
}
