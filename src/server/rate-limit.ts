import type { MiddlewareHandler } from "hono";

interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Simple in-memory rate limiter
// For production with multiple instances, use Redis or similar
class RateLimiter {
  private store = new Map<string, RateLimitEntry>();

  constructor(private config: RateLimitConfig) {
    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60_000);
  }

  isAllowed(key: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const entry = this.store.get(key);

    // No entry or expired entry
    if (!entry || entry.resetAt <= now) {
      const resetAt = now + this.config.windowMs;
      this.store.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: this.config.maxRequests - 1, resetAt };
    }

    // Entry exists and not expired
    if (entry.count >= this.config.maxRequests) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    entry.count++;
    return { allowed: true, remaining: this.config.maxRequests - entry.count, resetAt: entry.resetAt };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.resetAt <= now) {
        this.store.delete(key);
      }
    }
  }
}

// Rate limiters for different endpoint types
const generalLimiter = new RateLimiter({
  windowMs: 60_000,     // 1 minute
  maxRequests: 100,     // 100 requests per minute
});

const aiLimiter = new RateLimiter({
  windowMs: 60_000,     // 1 minute
  maxRequests: 10,      // 10 requests per minute (expensive AI calls)
});

// Get client identifier from request (uses session or IP)
function getClientKey(c: { req: { header: (name: string) => string | undefined } }): string {
  // In a real app, you might use session ID or authenticated user ID
  // For now, use X-Forwarded-For or fall back to a default
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return c.req.header("x-real-ip") || "unknown";
}

// General rate limiting middleware
export const rateLimit: MiddlewareHandler = async (c, next) => {
  const key = getClientKey(c);
  const result = generalLimiter.isAllowed(key);

  // Add rate limit headers
  c.header("X-RateLimit-Limit", "100");
  c.header("X-RateLimit-Remaining", result.remaining.toString());
  c.header("X-RateLimit-Reset", Math.ceil(result.resetAt / 1000).toString());

  if (!result.allowed) {
    return c.json({ error: "Too many requests. Please try again later." }, 429);
  }

  await next();
};

// Stricter rate limiting for AI/expensive endpoints
export const aiRateLimit: MiddlewareHandler = async (c, next) => {
  const key = `ai:${getClientKey(c)}`;
  const result = aiLimiter.isAllowed(key);

  c.header("X-RateLimit-Limit", "10");
  c.header("X-RateLimit-Remaining", result.remaining.toString());
  c.header("X-RateLimit-Reset", Math.ceil(result.resetAt / 1000).toString());

  if (!result.allowed) {
    return c.json({
      error: "Rate limit exceeded for AI operations. Please wait before trying again."
    }, 429);
  }

  await next();
};
