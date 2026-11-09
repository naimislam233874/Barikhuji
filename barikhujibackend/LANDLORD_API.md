# Landlord property API (Task 1 and 2)

Base: `/api/v1/landlord`. Every route requires a signed-in **landlord** session (admins and customers get 403).
Every write (POST/PUT/PATCH/DELETE) also needs the `X-CSRF-Token` header, like the auth routes. Responses are `Cache-Control: no-store`.
Bodies must be JSON. `multipart/form-data` is answered with 415 (photo upload is a later step).

| Route | Result |
|---|---|
| `GET /stats` | `{ activeListings, pendingListings, views, inquiries }` (`inquiries` is 0 until the Inquiry model exists) |
| `GET /properties` | array of `{ id, title, area, city, rent, status, views, inquiries, updatedAt }`, newest first, max 200 |
| `POST /properties` | 201 + the listing; always `pending_review` |
| `GET /properties/:id` | the listing (owner view) |
| `PUT /properties/:id` | 200 + the listing. Required fields must be present; optional ones left out stay unchanged |
| `PATCH /properties/:id/status` | body `{ "status": "active" \| "paused" }`; 200 + the listing |
| `DELETE /properties/:id` | 204 |

Errors use the existing shape `{ "message": "...", "errors": { "field": "..." } }`.
Someone else's listing, an unknown id and a malformed id all return 404.

## Editable fields (anything else in the body is ignored)
`title` (10-100), `description` (30-2000), `type` (Apartment, Room, Studio, Mess/Seat), `furnished` (Furnished, Semi-furnished, Unfurnished),
`city` (Dhaka, Chattogram, Sylhet, Rajshahi, Khulna, Barishal, Rangpur, Mymensingh), `area` (2-80), `address` (optional, max 200),
`rent` (1-10,000,000), `deposit` (0-50,000,000), `bedrooms` (1-10), `bathrooms` (1-10), `availableFrom` (YYYY-MM-DD),
`suitableFor` (1+ of Bachelor, Student, Family), `amenities` (optional: Lift, Generator, Gas, Wi-Fi, Parking, Security, CCTV),
`images` (optional, max 8 `https://` URLs or `/uploads/...` paths).

Never writable by a landlord: `landlord`, `status` (except via PATCH), `featured`, `verified`, `views`, `submittedAt`, `reviewedAt`, `reviewedBy`.

## Review rules
- New listing: `pending_review`.
- Editing with any real change to an editable field: `active`, `paused` and `rejected` listings go back to `pending_review`
  (`submittedAt` reset, `reviewedAt`/`reviewedBy` cleared). A pending listing stays pending. An identical PUT changes nothing.
  The list of fields that trigger re-review is `CONTENT_FIELDS` in `utils/propertyRules.js`.
- Landlord PATCH: only `active` <-> `paused`, and only on listings an admin already approved. A pending or rejected listing returns 409.
- Approval never changes the landlord's `User` record.

## Not included in this step
Photo upload (multipart), public property endpoints, admin review API, inquiries, favorites, per-landlord listing quota.
