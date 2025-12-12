// Rate limiting middleware to prevent API abuse

const rateLimitStore = new Map();

function cleanupExpiredLimits() {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now > data.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

function createRateLimiter(options = {}) {
  const {
    windowMs = 60 * 1000, // 1 minute
    maxRequests = 100,
    keyGenerator = (req) => req.ip || 'unknown',
    handler = (req, res) => {
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
      });
    }
  } = options;

  return (req, res, next) => {
    try {
      // Cleanup expired limits periodically
      if (Math.random() < 0.01) {
        cleanupExpiredLimits();
      }

      const key = keyGenerator(req);
      const now = Date.now();
      let data = rateLimitStore.get(key);

      // Initialize or reset if window expired
      if (!data || now > data.resetTime) {
        data = {
          count: 0,
          resetTime: now + windowMs
        };
      }

      // Increment request count
      data.count++;
      rateLimitStore.set(key, data);

      // Attach rate limit info to request
      req.rateLimit = {
        limit: maxRequests,
        current: data.count,
        remaining: Math.max(0, maxRequests - data.count),
        resetTime: data.resetTime
      };

      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': req.rateLimit.remaining.toString(),
        'X-RateLimit-Reset': new Date(data.resetTime).toISOString(),
        'Retry-After': Math.ceil((data.resetTime - now) / 1000).toString()
      });

      // Check if limit exceeded
      if (data.count > maxRequests) {
        console.warn(`Rate limit exceeded for ${key}: ${data.count}/${maxRequests}`);
        return handler(req, res, next);
      }

      next();
    } catch (error) {
      console.error('Rate limiter error:', error.message);
      next(); // Continue on error to avoid breaking the app
    }
  };
}

module.exports = {
  createRateLimiter,
  cleanupExpiredLimits
};
