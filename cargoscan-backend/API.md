# CargoScan API Documentation

Welcome to the CargoScan API documentation. This API allows freight forwarders to manage shipments, track cargo, and receive real-time updates.

## Base URL
`https://api.cargoscan.app/api`

## Authentication
Most endpoints require a JSON Web Token (JWT) passed in the `Authorization` header.
```http
Authorization: Bearer <your_token>
```

---

## Endpoints

### 1. Authentication

#### POST `/auth/login`
Authenticate a user and receive tokens.
- **Body**: `{ "email": "user@example.com", "password": "password" }`
- **Response**: `{ "token": "access_token", "refreshToken": "refresh_token", "user": { ... } }`

#### POST `/auth/logout`
Log out and invalidate the session.
- **Headers**: Requires Auth Token.

#### POST `/auth/refresh`
Get a new access token using a refresh token.
- **Body**: `{ "refreshToken": "your_refresh_token" }`
- **Response**: `{ "token": "new_access_token" }`

---

### 2. Shipments

#### GET `/shipments`
List all shipments for the organization.
- **Headers**: Requires Auth Token.
- **Response**: Array of Shipment objects.

#### POST `/shipments`
Create a new shipment.
- **Headers**: Requires Auth Token.
- **Body**: `{ "code": "SHP-001", "from": "Guangzhou", "to": "Tema", "cbmCapacity": 2.5 }`

---

### 3. Scans

#### POST `/scans`
Upload a new scan result from the iOS app or external device.
- **Headers**: Requires Auth Token or API Key.
- **Body**: `{ "shipmentId": "...", "consigneeId": "...", "length": 60, "width": 40, "height": 50, "cbm": 0.12 }`

---

### 4. Tracking (Public)

#### GET `/tracking/:code`
Fetch tracking details for a shipment or item. No authentication required.
- **Params**: `code` can be a Shipment Code or CargoItem ID.
- **Response**: `{ "type": "shipment|item", "data": { ... } }`

---

### 5. Consignees

#### GET `/consignees`
List consignees, optionally filtered by shipment.
- **Params**: `shipmentId` (optional).

#### POST `/consignees`
Create a new consignee.
- **Body**: `{ "name": "John Doe", "email": "john@example.com", "phone": "+233..." }`
