# Runbook: Database Down

**Scenario:** The Postgres database is unreachable or throwing connection errors.

## 1. Detection
- Sentry/Log alerts for `PrismaClientInitializationError` or `PrismaClientKnownRequestError`.
- Health check endpoint `/api/health` returns 500 or fails to respond.
- Users report "Internal Server Error" on dashboard or app.

## 2. Immediate Actions
1. **Check Database Status**:
   - If using Render/Supabase/Railway, check their status page.
   - Check the database metrics (CPU, Memory, Connections).
2. **Check App Logs**:
   - Look for specific error messages in the backend logs.
   - Common issues: Connection limit reached, credentials expired, or database instance crashed.

## 3. Resolution Steps
### Case A: Connection Limit Reached
1. Check active connections in the database dashboard.
2. If the app is leaking connections, restart the backend service to clear them.
3. Consider increasing the connection limit or adding a connection pooler (e.g., PgBouncer).

### Case B: Database Crashed / Unresponsive
1. Restart the database instance from the provider's dashboard.
2. If corruption is suspected, prepare to restore from the latest backup (see Backups section in Roadmap).

## 4. Communication
- Notify internal team on Slack/WhatsApp.
- Update the public status page (`status.cargoscan.app`) to "Partial Outage" or "Major Outage".
- Template for status page: "We are investigating an issue connecting to our database. Our team is working on a resolution."

## 5. Post-Incident
- Document the root cause in an incident report.
- Add preventive measures (e.g., better connection pooling, increased resources).
