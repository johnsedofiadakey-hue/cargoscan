# Runbook: Data Deletion Request (DPA / GDPR)

**Scenario:** A user or organization requests deletion of their data.

## 1. Procedure
1. **Verify Identity**: Ensure the request comes from the authorized account owner.
2. **Soft Delete (Optional)**: Flag the account as inactive for a grace period (e.g., 30 days) in case they change their mind.
3. **Hard Delete**:
   - Delete all database records related to the user/org.
   - Delete associated photos from storage (S3/Supabase).
4. **Confirm**: Send a confirmation email that the data has been deleted.

## 2. SQL / Prisma Query Example
```js
await prisma.organization.delete({
  where: { id: orgId }
});
// Ensure cascade deletes are configured in Prisma schema or handled manually!
```
