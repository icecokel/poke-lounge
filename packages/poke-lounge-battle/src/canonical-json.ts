function canonicalizeValue(value: unknown, ancestors: WeakSet<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Value is not valid canonical JSON");
    }
    return Object.is(value, -0) ? 0 : value;
  }

  if (typeof value !== "object") {
    throw new TypeError("Value is not valid canonical JSON");
  }

  if (ancestors.has(value)) {
    throw new TypeError("Value is not valid canonical JSON: cyclic reference");
  }
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      return Array.from({ length: value.length }, function callback(_, index) {
        if (!(index in value)) {
          throw new TypeError("Value is not valid canonical JSON: sparse array");
        }
        return canonicalizeValue(value[index], ancestors);
      });
    }

    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Value is not valid canonical JSON: non-plain object");
    }

    const record = value as Record<string, unknown>;
    const result = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(record).sort()) {
      result[key] = canonicalizeValue(record[key], ancestors);
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value, new WeakSet<object>()));
}
