import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Ask `probe` every `intervalMs` until it answers, and return that answer.
 * Resolves `undefined` when `timeoutMs` passes or `signal` aborts first. A
 * probe that throws is asked again next time: a poll outlives a blip.
 */
export async function pollUntil<T>(
  probe: () => Promise<T | undefined>,
  options: { intervalMs: number; timeoutMs: number; signal?: AbortSignal },
): Promise<T | undefined> {
  const deadline = Date.now() + options.timeoutMs;
  while (!options.signal?.aborted) {
    try {
      const answer = await probe();
      if (answer !== undefined) return answer;
    } catch {
      // Asked again below, until the deadline.
    }
    const wait = Math.min(options.intervalMs, deadline - Date.now());
    if (wait <= 0) return undefined;
    try {
      await sleep(wait, undefined, { signal: options.signal });
    } catch {
      return undefined;
    }
  }
  return undefined;
}
