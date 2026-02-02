import type { AnyModel, CompositeKey, Infer, KeyElement } from "./types.ts";

export interface SerializedFiles {
  readonly files: ReadonlyMap<string, string>;
}

function stringifySorted(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown) => {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val as Record<string, unknown>).toSorted()) {
        sorted[k] = (val as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return val;
  });
}

function compareKeyElement(a: KeyElement, b: KeyElement): number {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  return String(a).localeCompare(String(b));
}

function compareCompositeKey(a: CompositeKey, b: CompositeKey): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const cmp = compareKeyElement(a[i]!, b[i]!);
    if (cmp !== 0) return cmp;
  }
  return a.length - b.length;
}

function keyToString(key: CompositeKey): string {
  return key.join("\0");
}

function hasNestedCollection(model: AnyModel): boolean {
  if (model.kind === "collection") return true;
  if (model.kind === "composite") {
    return Object.values(model.fields).some((f) => hasNestedCollection(f));
  }
  return false;
}

function flattenToRecord(model: AnyModel, value: unknown): Record<string, unknown> {
  if (model.kind === "scalar") {
    throw new Error("Cannot flatten a scalar to a record");
  }

  if (model.kind === "composite") {
    const result: Record<string, unknown> = {};
    const fields = model.fields as Record<string, AnyModel>;
    const obj = value as Record<string, unknown>;

    for (const [key, fieldModel] of Object.entries(fields)) {
      if (fieldModel.kind === "collection") continue;
      if (fieldModel.kind === "scalar") {
        result[key] = obj[key];
      } else {
        Object.assign(result, flattenToRecord(fieldModel, obj[key]));
      }
    }
    return result;
  }

  throw new Error("Cannot flatten a collection to a record");
}

interface CollectionEntry {
  key: CompositeKey;
  record: Record<string, unknown>;
}

function collectEntries(
  model: AnyModel,
  value: unknown,
  name: string,
  output: Map<string, CollectionEntry[]>,
  parentKeyFields?: Record<string, unknown>,
): void {
  if (model.kind !== "collection") return;

  const map = value as Map<string, unknown>;
  const entries: CollectionEntry[] = output.get(name) ?? [];
  output.set(name, entries);

  const valueModel = model.valueModel as AnyModel;
  const needsNormalization =
    valueModel.kind === "composite" &&
    Object.values(valueModel.fields as Record<string, AnyModel>).some((f) =>
      hasNestedCollection(f),
    );

  for (const [_mapKey, item] of map) {
    const key = model.keyFn(item as Infer<AnyModel>) as CompositeKey;
    const record = flattenToRecord(valueModel, item);

    if (parentKeyFields) {
      Object.assign(record, parentKeyFields);
    }

    entries.push({ key, record });

    if (needsNormalization && valueModel.kind === "composite") {
      collectNestedCollections(valueModel, item, key, output);
    }
  }
}

function buildFkRecord(key: CompositeKey): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (let i = 0; i < key.length; i++) {
    result[`_fk${i}`] = key[i];
  }
  return result;
}

function collectNestedCollections(
  valueModel: AnyModel,
  item: unknown,
  parentKey: CompositeKey,
  output: Map<string, CollectionEntry[]>,
): void {
  if (valueModel.kind !== "composite") return;
  const fields = valueModel.fields as Record<string, AnyModel>;
  const obj = item as Record<string, unknown>;
  const fkRecord = buildFkRecord(parentKey);

  for (const [fieldKey, fieldModel] of Object.entries(fields)) {
    if (fieldModel.kind === "collection") {
      collectEntries(fieldModel, obj[fieldKey], fieldKey, output, fkRecord);
    }
  }
}

export function serialize<M extends AnyModel>(
  model: M,
  data: Infer<M>,
  name: string,
): SerializedFiles {
  const output = new Map<string, CollectionEntry[]>();

  if (model.kind === "collection") {
    collectEntries(model, data, name, output);
  } else {
    throw new Error("Top-level serialize expects a collection model");
  }

  const files = new Map<string, string>();

  for (const [filename, entries] of output) {
    const sorted = entries.toSorted((a, b) => compareCompositeKey(a.key, b.key));

    const lines = sorted.map((e) => stringifySorted(e.record));
    files.set(`${filename}.jsonl`, `${lines.join("\n")}\n`);
  }

  return { files };
}

export { keyToString, compareCompositeKey };
