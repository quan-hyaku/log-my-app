const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_MAX_LENGTH = 10_240;

export function safeStringify(
  value: unknown,
  maxDepth: number = DEFAULT_MAX_DEPTH,
  maxLength: number = DEFAULT_MAX_LENGTH,
  captureStackTraces: boolean = true,
): string {
  if (typeof value === 'string') return truncate(value, maxLength);

  if (value instanceof Error) {
    const obj: Record<string, unknown> = {
      name: value.name,
      message: value.message,
    };
    if (captureStackTraces) {
      obj.stack = value.stack;
    }
    return truncate(JSON.stringify(obj), maxLength);
  }

  const seen = new WeakSet();
  const depthMap = new WeakMap<object, number>();
  let isRoot = true;

  function replacer(this: unknown, _key: string, val: unknown): unknown {
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) return '[Circular]';
      seen.add(val);

      let currentDepth: number;
      if (isRoot) {
        currentDepth = 0;
        isRoot = false;
      } else {
        const parentDepth =
          typeof this === 'object' && this !== null
            ? (depthMap.get(this) ?? 0)
            : 0;
        currentDepth = parentDepth + 1;
      }
      depthMap.set(val, currentDepth);

      if (currentDepth > maxDepth) {
        return Array.isArray(val) ? '[Array]' : '[Object]';
      }
    }
    return val;
  }

  try {
    return truncate(JSON.stringify(value, replacer), maxLength);
  } catch {
    return truncate(String(value), maxLength);
  }
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...';
}
