import { describe, it, expect } from 'vitest';
import { safeStringify } from '../src/utils.js';

describe('safeStringify', () => {
  // -----------------------------------------------------------------------
  // Primitives
  // -----------------------------------------------------------------------
  describe('primitives', () => {
    it('should return strings unchanged', () => {
      expect(safeStringify('hello')).toBe('hello');
    });

    it('should stringify numbers', () => {
      expect(safeStringify(42)).toBe('42');
      expect(safeStringify(3.14)).toBe('3.14');
      expect(safeStringify(0)).toBe('0');
      expect(safeStringify(-1)).toBe('-1');
    });

    it('should stringify booleans', () => {
      expect(safeStringify(true)).toBe('true');
      expect(safeStringify(false)).toBe('false');
    });

    it('should stringify null', () => {
      expect(safeStringify(null)).toBe('null');
    });

    it('should stringify undefined', () => {
      // JSON.stringify(undefined) returns undefined (not a string),
      // so the catch branch uses String(undefined) = "undefined"
      const result = safeStringify(undefined);
      expect(typeof result).toBe('string');
    });
  });

  // -----------------------------------------------------------------------
  // Depth limiting
  // -----------------------------------------------------------------------
  describe('depth limiting', () => {
    it('should truncate objects deeper than default maxDepth of 2', () => {
      const obj = { a: { b: { c: { d: 'deep' } } } };
      const result = safeStringify(obj);
      const parsed = JSON.parse(result);

      // depth 0 = root obj, depth 1 = { b: ... }, depth 2 = { c: ... }
      // depth 3 = { d: 'deep' } should be truncated to "[Object]"
      expect(parsed.a.b.c).toBe('[Object]');
    });

    it('should allow customizing maxDepth', () => {
      const obj = { a: { b: { c: 'found' } } };
      // maxDepth=3 allows depth 0,1,2,3
      const result = safeStringify(obj, 3);
      const parsed = JSON.parse(result);
      expect(parsed.a.b.c).toBe('found');
    });

    it('should truncate arrays beyond maxDepth as [Array]', () => {
      const obj = { a: { b: { c: [1, 2, 3] } } };
      const result = safeStringify(obj); // maxDepth=2
      const parsed = JSON.parse(result);
      expect(parsed.a.b.c).toBe('[Array]');
    });

    it('should handle maxDepth of 0 (only root)', () => {
      const obj = { nested: { value: 1 } };
      const result = safeStringify(obj, 0);
      const parsed = JSON.parse(result);
      expect(parsed.nested).toBe('[Object]');
    });

    it('should handle maxDepth of 1', () => {
      const obj = { a: { b: { c: 'deep' } } };
      const result = safeStringify(obj, 1);
      const parsed = JSON.parse(result);
      expect(parsed.a.b).toBe('[Object]');
    });
  });

  // -----------------------------------------------------------------------
  // Circular references
  // -----------------------------------------------------------------------
  describe('circular references', () => {
    it('should produce [Circular] for circular references without crashing', () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj.self = obj;

      const result = safeStringify(obj);
      expect(result).toContain('[Circular]');
      // Should not throw, and should be valid JSON
      const parsed = JSON.parse(result);
      expect(parsed.a).toBe(1);
      expect(parsed.self).toBe('[Circular]');
    });

    it('should handle nested circular references', () => {
      const a: Record<string, unknown> = { name: 'a' };
      const b: Record<string, unknown> = { name: 'b', parent: a };
      a.child = b;

      const result = safeStringify(a, 10);
      expect(result).toContain('[Circular]');
      const parsed = JSON.parse(result);
      expect(parsed.name).toBe('a');
      expect(parsed.child.name).toBe('b');
      expect(parsed.child.parent).toBe('[Circular]');
    });
  });

  // -----------------------------------------------------------------------
  // maxLength truncation
  // -----------------------------------------------------------------------
  describe('maxLength truncation', () => {
    it('should truncate output exceeding maxLength', () => {
      const longString = 'x'.repeat(200);
      const result = safeStringify(longString, 2, 50);
      expect(result.length).toBeLessThanOrEqual(53); // 50 + "..."
      expect(result.endsWith('...')).toBe(true);
    });

    it('should not truncate output within maxLength', () => {
      const str = 'short';
      const result = safeStringify(str, 2, 1000);
      expect(result).toBe('short');
      expect(result.endsWith('...')).toBe(false);
    });

    it('should truncate large serialized objects', () => {
      const obj = { data: 'a'.repeat(500) };
      const result = safeStringify(obj, 2, 100);
      expect(result.length).toBeLessThanOrEqual(103); // 100 + "..."
      expect(result.endsWith('...')).toBe(true);
    });

    it('should handle very large strings getting truncated', () => {
      const huge = 'z'.repeat(100_000);
      const result = safeStringify(huge, 2, 10_240);
      expect(result.length).toBeLessThanOrEqual(10_243); // 10240 + "..."
    });
  });

  // -----------------------------------------------------------------------
  // Error objects
  // -----------------------------------------------------------------------
  describe('Error serialization', () => {
    it('should serialize Error name, message, and stack', () => {
      const err = new TypeError('bad type');
      const result = safeStringify(err);
      const parsed = JSON.parse(result);
      expect(parsed.name).toBe('TypeError');
      expect(parsed.message).toBe('bad type');
      expect(typeof parsed.stack).toBe('string');
    });

    it('should omit stack when captureStackTraces is false', () => {
      const err = new Error('no stack');
      const result = safeStringify(err, 2, 10_240, false);
      const parsed = JSON.parse(result);
      expect(parsed.name).toBe('Error');
      expect(parsed.message).toBe('no stack');
      expect(parsed.stack).toBeUndefined();
    });

    it('should include stack when captureStackTraces is true (default)', () => {
      const err = new RangeError('out of range');
      const result = safeStringify(err);
      const parsed = JSON.parse(result);
      expect(parsed.stack).toBeDefined();
      expect(typeof parsed.stack).toBe('string');
    });
  });
});
