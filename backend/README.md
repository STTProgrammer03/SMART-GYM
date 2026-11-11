# SQL Server backend setup

## Website login and WhatsApp OTP

The HTML member website currently offers temporary phone-only login for approved
demonstration accounts. Enable it only in the local backend `.env` with
`DEMO_LOGIN_ENABLED=true` and an explicit comma-separated `DEMO_LOGIN_PHONES`
allowlist. The backend also requires the phone to match an active member in the
selected workspace. Login creates a normal workspace-scoped session that expires
after 12 hours. Set `DEMO_LOGIN_ENABLED=false` to turn this bypass off.

The existing OTP page and backend OTP handling remain available. OTP login
requires the phone-bound verification token returned by OTP verification; the
website's current login page does not request or verify an OTP.

New-member registration requests a six-digit WhatsApp code through Periskope.
Set `PERISKOPE_API_KEY`, `PERISKOPE_PHONE` (your connected sender number with
country code, or Periskope phone ID), and `PERISKOPE_BASE_URL` in `backend/.env`.
The default API URL is `https://api.periskope.app/v1`. Restart the backend after
changing configuration or code. Credentials stay on the backend.

Members can enter a Malaysian mobile number locally (e.g. `0123456789`) or with
country code (`60123456789`). OTP requests and verification normalize both to the
international number before member lookup, rate limiting, and WhatsApp delivery.
Verified registration numbers receive a phone-bound, single-use proof valid for
15 minutes. Registration requires this proof, a valid plan, a photo and a receipt.
Proofs and OTPs are held in memory and are cleared on backend restart.
Other countries require the country code.
Codes expire in five minutes, are single-use, and stop working after five wrong
attempts. Requests are limited to one per minute and five per hour per number,
in addition to IP limits. Provider acceptance means queued, not confirmed delivery;
check receipt on the destination phone. Failed sends return a retry message.
Codes are hashed in memory and are never logged. Restarting the server clears
codes and limits; multiple server instances require a shared OTP/rate-limit store.

Run `npm.cmd test` for offline checks; this does not run `test-periskope.js`,
which sends a real WhatsApp message. To test live, restart the server, request
a code from the registration page, check WhatsApp, and enter it before expiry.

## Database setup

### Member photo popup

The HTML dashboard offers camera capture or device selection when an approved
member has no photo. A preview is shown before saving. Camera access needs HTTPS
or localhost and browser permission. Photo requirements are guidance, not automated
face detection; face verification/device synchronization are not implemented here.

`action=upload-photo` authenticates the member and saves actual image bytes in
`dbo.media_files` with `media_kind='PHOTO'`, content type and byte size.
The same transaction updates both `isapi_staff.photo_key` and
`member_app_profiles.photo_key`, so SQL-backed admin consumers can resolve the
same photo. Optional photo changes through update-profile follow the same flow.
New registration photos are saved in media_files and referenced by
member_app_requests.photo_key until the admin approves the application.
Generated photo keys use UUID filenames, matching the existing media store.
Failed transactions roll back both the media insert and member/request changes.

The authenticated photo endpoint reads new photos from SQL. Existing `web/`
photo keys remain readable from backend/uploads; do not delete that folder.
Payment receipts still use the local upload folder and web/ keys. Admin receipt
access requires that folder or a separate receipt-storage integration.
Saving a photo in SQL does not itself trigger door-device synchronization.

The API implements login, registration, profiles, photos, membership plans and
details, renewal requests, attendance, payment/contact settings and logout.
It uses existing tables. Profile-only registration requires the migration
`migrations/001-registration-before-membership.sql`: run it once on each database
before using this registration flow. It makes plan and receipt optional for
registration while retaining those requirements for renewal. No new table is added.

1. Enter your SQL password inside the quotes in `backend/.env`.
   Keep that file local; it is excluded from Git. Do not put SQL credentials in
   `web/config.json` or anywhere inside `build/web`.
   If `.env` does not exist, copy `.env.example` to `.env` first.
2. In a terminal in this folder run:

   ```powershell
   npm.cmd install
   npm.cmd run check-db
   ```

   The check connects to the configured database and saves table/column metadata
   in `schema.json`. It does not read member rows or change records.
3. Run `npm.cmd start` and keep the terminal open. The endpoint
   `http://localhost:3000/api/health` reports `memberApi: ready`.
4. In another terminal at the project root, run
   `python -m http.server 8080 --bind 127.0.0.1 --directory build/web`.
   For the HTML member website, serve `member-website` instead of `build/web` and
open `http://localhost:8080/index.html`. Both website config files point to the API
   at `http://localhost:3000`.

The configured endpoint is `smartouch.no-ip.info` on TCP port `1434`, database
`GymACM`. Its membership table metadata has been inspected successfully.
The local `.env` enables `DB_TRUST_SERVER_CERTIFICATE=true` with the owner's
approval for the server's self-signed certificate. SQL traffic remains encrypted,
but this local setting bypasses certificate identity verification. The example
configuration retains certificate verification by default.

The database contains multiple workspaces. `MEMBER_WORKSPACE_ID=legacy-workspace`
in `.env` scopes member lookups, plans, sessions and settings. Change it and
restart the backend to use another workspace. This does not move any records;
sessions from another workspace cannot access the selected workspace's data.

Phone formatting spaces, plus signs, brackets and hyphens are ignored for login.
The demonstration login only permits allowlisted active members in the workspace
selected by the website.

Registration collects full name, WhatsApp number verified by OTP, profile photo,
membership plan and payment receipt. It creates a PENDING application with the
selected plan_id and receipt_key and signs the applicant in. Existing members
and pending applicants can sign in again through verified OTP login when that
flow is restored. Pending applicants retain pending-only access until
administrator approval.
Duplicate existing accounts or open registrations for the same number are rejected.
The admin system can resolve new photo keys through dbo.media_files. Existing
web/ photo keys and receipt keys still resolve through backend upload storage. Approval and device synchronization remain admin responsibilities.
The registration page reads current plans and payment instructions through the
public registration-options endpoint; it never receives private member data.
Renewal also creates a pending request. Membership validity and door access
remain unchanged until administrator approval. This backend does not include an
admin approval UI, device synchronization or push sending. The QR stays a demo.

Photos and receipts accept PNG/JPEG/WebP images up to 5 MB each. New photos
are stored in SQL media_files; receipts and legacy web/ photos remain in
backend/uploads. Back up both SQL and the upload folder. Only the signed-in
member's own photo is exposed by this API. The admin website's rendering and
cache behavior must be verified separately in that website.

Session tokens are random and stored as SHA-256 hashes, expire after seven days
for OTP login (12 hours for demonstration login), and are revoked on logout.
Disabled members cannot use existing sessions.
The process limits login and registration attempts; counters reset on restart.
The HTML website intentionally uses phone-only login only for explicitly
allowlisted demo accounts; OTP remains available for regular login restoration
and new-member registration.
This server binds to loopback; public hosting also needs HTTPS and durable uploads.

Run `npm.cmd test` for unit/API checks. Run `node smoke-db.js` for the SQL-backed
HTTP integration check. It writes temporary fixtures within a transaction,
always rolls them back, and removes test images. It covers registration, login,
profile updates, renewal, reads, logout, session expiry and workspace isolation.

Driver reference: https://tediousjs.github.io/node-mssql/
