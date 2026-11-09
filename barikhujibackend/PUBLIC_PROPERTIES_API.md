# Public property API (Phase 1)

Public, read-only, no sign-in, GET only. Base: `/api/v1/properties`. Only listings with status `active` are ever returned.

## GET /properties  ->  `{ items, total, page, pages }`
| Parameter | Meaning |
|---|---|
| `location` | every word must appear in the area or city, case-insensitive ("Mirpur, Dhaka" works). Max 100 characters, 5 words. Regex characters are matched literally |
| `minRent`, `maxRent` | whole taka, digits only; min may not exceed max |
| `type` | Apartment, Room, Studio, Mess/Seat (any letter case) |
| `suitableFor` | Bachelor, Student, Family |
| `bedrooms`, `bathrooms` | "at least N" (0 = any, max 10) |
| `furnished` | Furnished, Semi-furnished, Unfurnished |
| `availableFrom` | YYYY-MM-DD; listings available on or before that date |
| `amenities` | comma separated; the listing must have all of them (Lift, Generator, Gas, Wi-Fi, Parking, Security, CCTV) |
| `featured` | `1` or `true` filters; `0` or `false` does not |
| `sort` | `rentAsc`, `rentDesc`, `newest` (newest = most recently created). Default: featured first, then newest |
| `page`, `limit` | page 1-500 (default 1); limit 1-50 (default 12) |

Blank values are ignored and unknown parameters are ignored. Invalid values return 422 `{ message, errors }`.
Arrays and objects (`type[$ne]=x`, `type=a&type=b`) are rejected. A page past the end returns an empty `items` list with the real `total`.

## GET /properties/:id  ->  one listing
Pending, paused, rejected, unknown and malformed ids all return the same 404 `{ "message": "Property not found." }`.
Each successful call adds 1 to the listing's `views` (shown on the landlord dashboard) without changing `updatedAt`.

## Public shape
`{ id, title, area, city, rent, deposit, type, bedrooms, bathrooms, furnished, suitableFor[], amenities[], availableFrom, verified, featured, images[], description, landlord: { name, verified } }`

- `landlord.verified` is true when the landlord's ACCOUNT status is `active` (new landlords are `pending_verification`). Approving a listing never changes it.
- `landlord.responseTime` is not sent (nothing stores it); the frontend shows "Not available".
- Never sent: address, landlord id/email/phone, listing status, reviewer, submittedAt, views, timestamps.

## Try it without the admin API
Listings stay hidden until approved, and the admin API is a later phase. To approve one by hand in MongoDB shell:
```js
db.properties.updateOne({ _id: ObjectId("<listing id>") }, { $set: { status: "active", reviewedAt: new Date() } })
```
(Mongoose stores the `Property` model in the `properties` collection.)

## Known limits
- Listings of a suspended landlord stay public until the admin phase pauses them.
- No rate limit on public reads yet. Location search is a substring match, fine for thousands of listings but not a text index.
