'use strict';

/**
 * Sets a conservative set of security headers on every response.
 */
const setSecurityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');

  if (req.secure || req.get('x-forwarded-proto') === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  next();
};

/**
 * Dependency-free, in-memory fixed-window rate limiter.
 * For multi-instance deployments use a shared store (e.g. Redis) instead.
 */
const createRateLimiter = ({
  windowMs = 15 * 60 * 1000,
  max = 100,
  keyGenerator = (req) => req.ip || 'unknown',
  message = 'تم تجاوز عدد المحاولات المسموح بها، حاول مرة أخرى لاحقاً',
} = {}) => {
  const hits = new Map();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, Math.max(windowMs, 1000));
  if (typeof cleanup.unref === 'function') cleanup.unref();

  return (req, res, next) => {
    if (req.method === 'OPTIONS') return next();

    const now = Date.now();
    let key;
    try {
      key = String(keyGenerator(req));
    } catch (error) {
      key = req.ip || 'unknown';
    }

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
      return res.status(429).json({ success: false, message });
    }

    return next();
  };
};

module.exports = {
  createRateLimiter,
  setSecurityHeaders,
};
