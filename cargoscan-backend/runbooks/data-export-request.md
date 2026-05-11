# Runbook: Data Export Request (DPA / GDPR)

**Scenario:** A user or organization requests a full export of their data under DPA or GDPR.

## 1. Procedure
1. **Verify Identity**: Ensure the request comes from the authorized account owner.
2. **Extract Data**:
   - Run a script or Prisma query to fetch all data related to the user/org:
     - User profile.
     - Shipments created.
     - Consignees created.
     - Scans and photos.
3. **Format Data**: Convert to a portable format (e.g., JSON or CSV).
4. **Deliver**: Send to the user via a secure link or email within 30 days.

## 2. SQL / Prisma Query Example
```js
const data = await prisma.organization.findUnique({
  where: { id: orgId },
  include: {
    users: true,
    shipments: {
      include: {
        cargoItems: {
          include: { scanResults: true }
        }
      }
    }
  }
});
```
