# Runbook: Secret Rotation

**Scenario:** Rotating JWT secret, Paystack keys, or Admin passwords due to routine maintenance or a suspected leak.

## 1. JWT Secret Rotation
1. **Generate New Secret**: Generate a strong random string (e.g., 32+ bytes).
2. **Update Environment**: Set `JWT_SECRET` in the hosting provider.
3. **Implications**: All users will be logged out and must log in again. This is expected.

## 2. Paystack Key Rotation
1. **Rotate in Paystack**: Generate a new secret key in the Paystack dashboard.
2. **Update App**: Update `PAYSTACK_SECRET_KEY` in environment variables.
3. **Verify**: Perform a test transaction to ensure billing still works.

## 3. Super Admin Password Rotation
1. **Update DB**: Update the hashed password for the super admin user in the database.
2. **Update Env**: If stored in env vars (as per audit fixes), update `SUPER_ADMIN_PASSWORD` and restart the app.
