/**
 * Utility for executing operations with exponential backoff and jitter.
 * Designed to handle transient network hiccups, timeouts, and temporary server drops (§7.21).
 */

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  shouldRetry?: (error: any) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 350,
  maxDelayMs: 3000,
  factor: 2,
  shouldRetry: (error: any) => {
    // If it's a known non-transient error, don't retry
    if (error?.status === 400 || error?.status === 401 || error?.status === 403 || error?.status === 404 || error?.status === 422) {
      return false;
    }
    // Retry on network errors, fetch aborts, 5xx, or generic fetch exceptions
    return true;
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes an async action with automatic retry and jittered exponential backoff.
 */
export async function executeWithRetry<T>(
  actionFn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let attempt = 0;

  while (true) {
    try {
      const result = await actionFn();
      return result;
    } catch (error: any) {
      attempt++;
      if (attempt > opts.maxRetries || !opts.shouldRetry(error)) {
        throw error;
      }

      // Calculate exponential backoff with full jitter
      const exponentialDelay = opts.baseDelayMs * Math.pow(opts.factor, attempt - 1);
      const cappedDelay = Math.min(exponentialDelay, opts.maxDelayMs);
      const jitteredDelay = Math.floor(Math.random() * cappedDelay);

      await sleep(jitteredDelay);
    }
  }
}
