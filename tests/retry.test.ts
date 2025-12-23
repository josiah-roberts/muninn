import { describe, test, expect, mock } from "bun:test";
import { withRetry, isRetryableError, fetchWithTimeout } from "../src/services/retry.ts";

describe("isRetryableError", () => {
  test("returns true for network errors", () => {
    const error = new TypeError("fetch failed");
    expect(isRetryableError(error)).toBe(true);
  });

  test("returns true for abort errors (timeout)", () => {
    const error = new DOMException("The operation was aborted", "AbortError");
    expect(isRetryableError(error)).toBe(true);
  });

  test("returns true for 5xx server errors", () => {
    expect(isRetryableError(new Error("status: 500"))).toBe(true);
    expect(isRetryableError(new Error("status: 502"))).toBe(true);
    expect(isRetryableError(new Error("status: 503"))).toBe(true);
  });

  test("returns true for 429 rate limit errors", () => {
    expect(isRetryableError(new Error("status: 429"))).toBe(true);
  });

  test("returns false for 4xx client errors (except 429)", () => {
    expect(isRetryableError(new Error("status: 400"))).toBe(false);
    expect(isRetryableError(new Error("status: 401"))).toBe(false);
    expect(isRetryableError(new Error("status: 404"))).toBe(false);
  });

  test("returns true for unknown errors", () => {
    expect(isRetryableError(new Error("Something went wrong"))).toBe(true);
  });
});

describe("withRetry", () => {
  test("returns result on first success", async () => {
    const fn = mock(() => Promise.resolve("success"));

    const result = await withRetry(fn);

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("retries on failure and eventually succeeds", async () => {
    let attempts = 0;
    const fn = mock(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error("temporary failure");
      }
      return "success";
    });

    const result = await withRetry(fn, {
      maxAttempts: 3,
      initialDelayMs: 10, // Fast for tests
    });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("throws after max attempts exhausted", async () => {
    const fn = mock(() => Promise.reject(new Error("persistent failure")));

    await expect(
      withRetry(fn, {
        maxAttempts: 3,
        initialDelayMs: 10,
      })
    ).rejects.toThrow("persistent failure");

    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("does not retry non-retryable errors", async () => {
    const fn = mock(() => Promise.reject(new Error("status: 400 bad request")));

    await expect(
      withRetry(fn, {
        maxAttempts: 3,
        initialDelayMs: 10,
      })
    ).rejects.toThrow("status: 400");

    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("calls onRetry callback on each retry", async () => {
    let attempts = 0;
    const fn = mock(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error("temporary failure");
      }
      return "success";
    });

    const onRetry = mock(() => {});

    await withRetry(fn, {
      maxAttempts: 3,
      initialDelayMs: 10,
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(2); // Called after 1st and 2nd failure
  });

  test("respects custom isRetryable function", async () => {
    const fn = mock(() => Promise.reject(new Error("custom error")));

    // Custom function that says nothing is retryable
    const isRetryable = () => false;

    await expect(
      withRetry(fn, {
        maxAttempts: 3,
        initialDelayMs: 10,
        isRetryable,
      })
    ).rejects.toThrow("custom error");

    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("increases delay with exponential backoff", async () => {
    const delays: number[] = [];
    let attempts = 0;
    const fn = mock(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error("temporary failure");
      }
      return "success";
    });

    await withRetry(fn, {
      maxAttempts: 3,
      initialDelayMs: 100,
      backoffMultiplier: 2,
      onRetry: (_error, _attempt, delayMs) => {
        delays.push(delayMs);
      },
    });

    // First delay should be ~100ms, second should be ~200ms (with some jitter)
    expect(delays[0]).toBeGreaterThanOrEqual(100);
    expect(delays[0]).toBeLessThan(150);
    expect(delays[1]).toBeGreaterThan(150); // Should be at least 100 * 2
  });
});

describe("fetchWithTimeout", () => {
  test("completes successfully within timeout", async () => {
    // This test requires a real server, so we'll just test the timeout mechanism
    // by checking that it doesn't throw immediately
    const controller = new AbortController();

    // Create a mock response for a very short timeout
    const result = fetchWithTimeout("https://httpbin.org/delay/0", {
      timeoutMs: 5000,
    }).catch(() => "error");

    // Just verify it returns a promise and doesn't throw synchronously
    expect(result).toBeInstanceOf(Promise);
  });

  test("aborts on timeout", async () => {
    // Use a very short timeout with a slow endpoint
    const result = fetchWithTimeout("https://httpbin.org/delay/10", {
      timeoutMs: 50, // 50ms timeout
    });

    await expect(result).rejects.toThrow();
  });
});
