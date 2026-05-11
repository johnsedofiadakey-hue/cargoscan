# Runbook: Paystack Webhook Storm

**Scenario:** Paystack is flooding the system with webhook retries, or a misconfiguration is causing excessive webhook traffic.

## 1. Detection
- Sudden spike in requests to `/api/billing/webhook`.
- High CPU usage or database connection errors due to concurrent writes.
- Logs show repeated attempts for the same transaction ID.

## 2. Immediate Actions
1. **Verify Signatures**: Ensure all incoming webhooks are strictly verified. If not, drop them.
2. **Acknowledge Quickly**: Return a 200 OK response as fast as possible to stop Paystack from retrying. Do heavy processing asynchronously (e.g., via a job queue or event bus).

## 3. Resolution Steps
### Case A: Real Flood / Retries
1. Ensure the app returns `200 OK` immediately even if processing fails later.
2. If processing is falling behind, consider temporarily disabling the webhook endpoint or returning `200 OK` without processing, and manually sync transactions later.

### Case B: Malicious Traffic / Attack
1. If signatures are invalid, block the IP or use Cloudflare to throttle requests to the webhook URL.

## 4. Communication
- If user accounts are affected (e.g., plans not updating), send a notification that billing processing is delayed but no data is lost.
