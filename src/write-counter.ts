import { TRIM_CHECK_INTERVAL } from './types.js';

const STORAGE_SUFFIX = '_writeCount';
const PERSIST_INTERVAL = Math.max(1, Math.floor(TRIM_CHECK_INTERVAL / 5));

export class WriteCounter {
  private count: number;
  private readonly key: string;

  constructor(storageKey: string) {
    this.key = `__${storageKey}${STORAGE_SUFFIX}__`;
    this.count = this.load();
  }

  increment(): number {
    this.count++;
    if (this.count % PERSIST_INTERVAL === 0) {
      this.persist();
    }
    return this.count;
  }

  reset(): void {
    this.count = 0;
    this.persist();
  }

  get value(): number {
    return this.count;
  }

  persist(): void {
    try {
      localStorage.setItem(this.key, String(this.count));
    } catch {
      // QuotaExceeded or localStorage unavailable — non-critical
    }
  }

  private load(): number {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw !== null) {
        const val = parseInt(raw, 10);
        return Number.isFinite(val) && val >= 0 ? val : 0;
      }
    } catch {
      // localStorage unavailable
    }
    return 0;
  }
}
