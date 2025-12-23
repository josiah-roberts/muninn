/**
 * Retry utility with exponential backoff for external API calls.
 */

export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay in ms (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in ms (default: 10000) */
  maxDelayMs?: number;
  /** Multiplier for each retry (default: 2) */
  backoffMultiplier?: number;
  /** Function to determine if error is retryable (default: retries all errors) */
  isRetryable?: (error: unknown) => boolean;
  /** Optional callback when a retry occurs */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'isRetryable'>> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Default function to determine if an error is retryable.
 * Retries on network errors and 5xx server errors, but not on 4xx client errors.
 */
export function isRetryableError(error: unknown): boolean {
  // Network errors (no response)
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // Timeout errors
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  // HTTP errors - retry on 5xx, 429 (rate limit), but not other 4xx
  if (error instanceof Error) {
    const statusMatch = error.message.match(/status[:\s]+(\d{3})/i);
    if (statusMatch) {
      const status = parseInt(statusMatch[1], 10);
      return status >= 500 || status === 429;
    }
  }

  // Default: retry unknown errors
  return true;
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic and exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = DEFAULT_OPTIONS.maxAttempts,
    initialDelayMs = DEFAULT_OPTIONS.initialDelayMs,
    maxDelayMs = DEFAULT_OPTIONS.maxDelayMs,
    backoffMultiplier = DEFAULT_OPTIONS.backoffMultiplier,
    isRetryable = isRetryableError,
    onRetry,
  } = options;

  let lastError: unknown;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if we've exhausted attempts or error isn't retryable
      if (attempt >= maxAttempts || !isRetryable(error)) {
        throw error;
      }

      // Notify of retry
      if (onRetry) {
        onRetry(error, attempt, delayMs);
      }

      // Wait before retrying
      await sleep(delayMs);

      // Increase delay for next attempt (with jitter)
      const jitter = Math.random() * 0.2 * delayMs; // 0-20% jitter
      delayMs = Math.min(delayMs * backoffMultiplier + jitter, maxDelayMs);
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError;
}

/**
 * Create a fetch wrapper with timeout support.
 */
export function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 30000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Combine with any existing signal
  const signal = options.signal
    ? combineSignals(options.signal, controller.signal)
    : controller.signal;

  return fetch(url, { ...fetchOptions, signal })
    .finally(() => clearTimeout(timeoutId));
}

/**
 * Combine multiple AbortSignals into one.
 */
function combineSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }

  return controller.signal;
}
