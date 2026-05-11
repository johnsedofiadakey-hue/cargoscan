# Runbook: Meta (WhatsApp) Token Rotation

**Scenario:** Annual or emergency rotation of the Meta WhatsApp Cloud API access token.

## 1. Detection
- WhatsApp messages fail to send with "Invalid Token" or "Expired Token" errors.
- Proactive reminder from Meta Developer portal or internal calendar.

## 2. Procedure
1. **Generate New Token**:
   - Log in to the Meta for Developers portal.
   - Navigate to your App -> WhatsApp -> Configuration.
   - Generate a new Permanent Access Token (if supported) or a long-lived token.
2. **Update Environment Variables**:
   - Go to your hosting provider (e.g., Render, Railway).
   - Update the `WHATSAPP_TOKEN` environment variable with the new value.
3. **Restart Backend**:
   - Restart the backend service to pick up the new environment variable.
4. **Verify**:
   - Use the "WhatsApp Test" tab in the Super Admin dashboard to send a test message.

## 3. Fallback
- If the new token fails, revert to the old token immediately if it's still valid.
