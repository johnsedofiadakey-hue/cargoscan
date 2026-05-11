# CargoScan Webhooks

Webhooks allow your system to receive real-time notifications about events in CargoScan. When an event occurs, we send an HTTP POST request to the URL you specify.

## Configuration
You can configure your webhook URL in the **Developers** tab of the CargoScan dashboard.

## Security & Signature Verification
To ensure that requests are genuinely sent by CargoScan, each request includes a signature in the header:
`x-cargoscan-signature`

The signature is a HMAC-SHA256 hash of the raw request body, keyed with your webhook secret.

### Verification Example (Node.js)
```js
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
    
  return hash === signature;
}
```

## Supported Events

### `scan.created`
Fired when a new cargo scan is recorded.
- **Payload**:
```json
{
  "event": "scan.created",
  "data": {
    "id": "item_123",
    "shipmentId": "ship_abc",
    "cbm": 0.120,
    "dimensions": "60x40x50"
  }
}
```

### `shipment.status_updated`
Fired when a shipment status changes (e.g., to DELIVERED).
```json
{
  "event": "shipment.status_updated",
  "data": {
    "id": "ship_abc",
    "status": "DELIVERED"
  }
}
```
