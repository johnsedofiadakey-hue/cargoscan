# Runbook: Redis Down

**Scenario:** The Redis instance is unreachable or throwing errors.

## 1. Detection
- Sentry/Log alerts for Redis connection errors.
- Rate limiter might fail open or fail closed depending on configuration.
- Auth token operations (if cached) might slow down or fail.

## 2. Immediate Actions
1. **Check Redis Status**:
   - Check status on provider dashboard (e.g., Redis Cloud, Render, etc.).
2. **Verify App Fallback**:
   - The app should be configured to handle Redis failures gracefully (fail-open for rate limits, or use in-memory fallbacks).

## 3. Resolution Steps
### Case A: Redis Instance Down
1. Restart the Redis instance from the dashboard.
2. If using a managed service, wait for auto-failover to complete.

### Case B: Connection Issues
1. Verify `REDIS_URL` in environment variables.
2. Check network policies or firewall rules.

## 4. Communication
- Update status page if service is noticeably degraded.
- Template: "We are experiencing a performance degradation due to issues with our cache layer. Core services remain operational."
