// Capture native console.warn at module load time, before any monkey-patching.
// This ensures internal warnings always reach the real console.
type WarnFn = (...args: unknown[]) => void;

const nativeWarn: WarnFn =
  typeof console !== 'undefined' ? console.warn.bind(console) : () => {};

export function warnInternal(message: string, ...args: unknown[]): void {
  nativeWarn(message, ...args);
}
