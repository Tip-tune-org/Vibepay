# VibePay Backend API Reference

This reference is derived from Nest controller annotations in `backend/src/**/controllers/*.ts`.
The backend uses URI versioning behind `/api`, with the default version taken from `API_VERSION` (usually `v1`).

- Base URL: `http://localhost:3001`
- Swagger UI: `http://localhost:3001/api/docs`
- Versioned API base: `/api/v1`
- Non-versioned probes: `/api/health`, `/api/ready`, `/api/live`
- Version metadata: `/api/version`

---

## Auth

Authentication is wallet-based and challenge-response driven.

### `POST /api/v1/auth/challenge`
Request body:
```json
{ "publicKey": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" }
```
Returns a challenge string to sign with a Stellar wallet.

### `POST /api/v1/auth/verify`
Request body:
```json
{
  "publicKey": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "challenge": "...",
  "signature": "..."
}
```
Response includes JWT tokens and sets secure cookies:
- `access_token`
- `refresh_token`

### `POST /api/v1/auth/refresh`
Uses either:
- `refresh_token` cookie
- `Authorization: Bearer <refresh_token>` header

Response returns a refreshed access token and updates the `access_token` cookie.

### `POST /api/v1/auth/logout`
Requires authentication; invalidates refresh state and clears cookies.

### `GET /api/v1/auth/me`
Requires authentication; returns the currently authenticated user.

---

## Users / Artists

All `artists` routes require authentication via JWT/cookie.

### `POST /api/v1/artists`
Create an artist profile for the logged-in user.

### `GET /api/v1/artists`
List artists with pagination.

### `GET /api/v1/artists/me`
Get the current user’s artist profile.

### `PATCH /api/v1/artists/me`
Update the current user’s artist profile.

### `DELETE /api/v1/artists/me`
Soft-delete the current user’s artist profile.

### `POST /api/v1/artists/:artistId/restore`
Restore a soft-deleted artist (admin/owner guard applies).

---

## Tracks

### `POST /api/v1/tracks`
Create a new track. Supports multipart file upload for `file`.

### `GET /api/v1/tracks`
List tracks with pagination and filters.
Supported query parameters include: `page`, `limit`, `sortBy`, `sortOrder`, `artistId`, `genre`, `album`, `isPublic`, `releaseDate`.

### `GET /api/v1/tracks/public`
List public tracks only.

### `GET /api/v1/tracks/search`
Search tracks by title or album.
Required query parameter: `q`.
Supports the same pagination/filter query parameters as `/tracks`.

### `GET /api/v1/tracks/artist/:artistId`
Get tracks by artist.

### `GET /api/v1/tracks/genre/:genre`
Get tracks by genre.

### `GET /api/v1/tracks/:id`
Get track by ID.

### `PATCH /api/v1/tracks/:id`
Update track metadata.

### `PATCH /api/v1/tracks/:id/play`
Increment the track play count.

### `PATCH /api/v1/tracks/:id/tips`
Add tip amount to a track’s totals.
Request body requires `amount`.

### `DELETE /api/v1/tracks/:id`
Delete a track.

---

## Tips

### `POST /api/v1/tips`
Create a new tip record.
Required headers:
- `x-user-id`: tipper user ID
- optional `Idempotency-Key`

### `GET /api/v1/tips/:id`
Get a tip by ID.

### `GET /api/v1/tips/user/:userId/history`
Get tip history for a user (tips sent by that user).

### `GET /api/v1/tips/artist/:artistId/received`
Get tips received by an artist.

### `GET /api/v1/tips/artist/:artistId/stats`
Get tip statistics for an artist.

---

## Search

### `GET /api/v1/search`
Full-text search for artists and tracks.
Supported query parameters:
- `q`
- `type` (`artist` or `track`)
- `genre`
- `status`
- `country`
- `city`
- `hasLocation`
- `isVerified`
- `releaseDateFrom`
- `releaseDateTo`
- `sort`
- `page`
- `limit`

### `GET /api/v1/search/suggestions`
Autocomplete suggestions for artists and tracks.
Supported query parameters:
- `q` (partial search)
- `type`
- `limit`

### `GET /api/v1/tracks/search`
Track-specific search by title or album.
Required query parameter: `q`.

---

## Admin

The following endpoints are protected by admin guards or owner-level access.

### Reports
- `GET /api/v1/reports`
- `GET /api/v1/reports/:id`
- `PATCH /api/v1/reports/:id/status`
- `PATCH /api/v1/reports/:id/assign`
- `PATCH /api/v1/reports/:id/escalate`

### Verification admin
- `GET /api/v1/verification/admin/pending`
- `PATCH /api/v1/verification/admin/requests/:id/review`
- `GET /api/v1/verification/admin/stats`

### Rate limit metrics
- `GET /api/v1/admin/rate-limits/metrics`
- `GET /api/v1/admin/rate-limits/endpoints`
- `GET /api/v1/admin/rate-limits/top-ips`
- `GET /api/v1/admin/rate-limits/suspicious-ips`
- `GET /api/v1/admin/rate-limits/summary`
- `POST /api/v1/admin/rate-limits/reset`

---

## Health and Version

### `GET /api/version`
Returns current API version metadata.

### `GET /api/health`
### `GET /api/ready`
### `GET /api/live`

These endpoints are excluded from the `/api` global prefix versioning stack and remain version-neutral.
