# Carolina Homekeeping Co.

Production-oriented Next.js application for **Send A Scout LLC d/b/a Carolina Homekeeping Co.** The primary customer journey is instant price → actual appointment → Stripe payment → verified booking and confirmation. No fabricated reviews, seeded availability, demo bookings or customer counters.

## Stack and layout

- Next.js 16 App Router, React 19, TypeScript. Coastal brand, responsive custom CSS, optimized supplied-logo derivative and generated interior photo.
- Postgres (dedicated Neon database), parameterized SQL through `postgres`.
- Stripe hosted Checkout (cards and supported device wallets), signature-verified webhook, server-calculated totals.
- Resend email, transactional confirmation outbox, allowlisted administrator password / optional email-code login with signed HttpOnly sessions.
- `lib/pricing.ts`: shared validated pricing model; `settings.pricing` is the editable source of truth after migration.
- `app/book`, `components/booking-flow.tsx`: eight-step residential funnel.
- `app/api/checkout`, `lib/payments.ts`: atomic slot reservations, checkout, idempotent fulfillment.
- `app/control-room`, `components/control-room.tsx`, `app/api/admin`: authenticated administration.
- `db/001_initial.sql`, `db/002_duration_scheduling.sql`, `db/003_admin_passwords.sql`: core schema, scheduling blocks and administrator access.
- `lib/scheduling.ts`: shared Eastern business hours, duration estimates and interval availability.
- `lib/schedule-store.ts`: the database occupancy query and transaction reservation guard.

## Environment

Copy `.env.example` to `.env.local` for local development. Never commit credentials. Use the hosting platform’s encrypted environment settings.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Dedicated Postgres connection URL, TLS in production |
| `APP_URL` | Canonical HTTPS origin, e.g. `https://carolinahomekeeping.com`; Stripe redirects use this server-side |
| `SESSION_SECRET` | At least 32 random characters for admin session signing and code hashing |
| `ADMIN_EMAILS` | Comma-separated exact allowlist of administrator emails |
| `ADMIN_SETUP_INVITE` | Optional production-only JSON `{email,tokenHash,expiresAt}` for one-time password activation; generated with the script below |
| `STRIPE_SECRET_KEY` | Project-appropriate server secret; test key in test environment, live key in production |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for this app’s webhook endpoint |
| `RESEND_API_KEY` | Transactional email credential |
| `EMAIL_FROM` | Verified sender, e.g. `Carolina Homekeeping <bookings@carolinahomekeeping.com>` |
| `SUPPORT_EMAIL` | Monitored reply-to address, displayed on Contact page |
| `BOOKING_ENABLED` | Set `true` only after operating details and payment flow are verified |
| `CRON_SECRET` | Random secret protecting `/api/cron` (Vercel supplies it as a Bearer header) |

No secret is prefixed with `NEXT_PUBLIC_`. Stripe hosted Checkout does not require a publishable key in this application.

## Run and deploy

```sh
npm ci
# Once the dedicated database connection is configured:
node --env-file=.env.local --import tsx scripts/migrate.ts
npm test
npm run build
npm run dev
```

Link only `persalabsllc/Carolinahomekeeping` to the `carolinahomekeeping` Vercel project. Use the Next.js preset and Node 24 (or the current supported Node LTS). Connect the dedicated Neon resource to this project. Run migrations before deploying with `DATABASE_URL`. The migration is repeatable and transaction-protected. It initializes pricing and scheduling rules but never creates customer data, bookings or fictional appointments.

The Vercel build includes an optional migration step when `DATABASE_URL` is present. Preview deployments must use a **separate database and Stripe test keys**. Do not connect this database to unrelated projects. After environment changes redeploy so functions receive them.

Configure the custom domain in Vercel and apply the DNS records Vercel displays. Confirm HTTPS and set `APP_URL` to the final canonical origin before enabling checkout. The app supports public deployment while checkout is disabled; customers still see prices and can leave a lead when the database is connected.

## Stripe and booking correctness

Register `/api/stripe/webhook` for `checkout.session.completed`, `checkout.session.expired`, and `charge.refunded`. Use the endpoint’s own signing secret. Keep live and test credentials, databases, and endpoints separate.

1. Server validates all home, contact, policy and service inputs and recalculates the price from current configuration. Client totals are never trusted; a changed price requires review.
2. A database transaction takes a shared scheduling advisory lock, locks the lead, recalculates duration and checks every overlapping booking/hold/block before reserving the entire interval. Different requested start times use the same lock; checking a single slot ID is not enough. Holds are counted until Stripe has definitely expired them or payment has been fulfilled. Time alone never releases ambiguous paid capacity.
3. Stripe Checkout is created with an idempotency key tied to the hold. Cards only avoids delayed-payment booking ambiguity; supported Apple Pay / Google Pay are offered by Stripe/device eligibility.
4. The verified webhook and authenticated return-page check call the same transaction-safe fulfillment function. One hold can create only one booking. Customer, home profile, recurring intent, booking, event and confirmation outbox are committed together.
5. The outbox sends confirmation independently and retries. A browser closing after payment does not prevent booking creation. Duplicate webhook events cannot duplicate bookings.
6. Every five minutes `/api/cron` reconciles checkout state and retries email. It is authenticated by `CRON_SECRET`. Network-ambiguous Stripe creates are recovered before capacity is released.

Recurring discounts apply to the base clean and configured room adjustments, not extras. **This MVP charges only for the chosen visit.** Recurring frequency creates a coordination-needed plan; future appointments and payments are not silently invented or automatically charged.

Cancelling a booking in Control Room releases capacity but does not issue a refund or notify the customer automatically. Apply the accepted cancellation policy and refund through Stripe; its refund webhook updates recorded amounts. Reschedules and commercial job scheduling similarly require direct customer communication. Commercial jobs start unpaid; no payment is inferred.

## Control Room

`/control-room` supports password login without Resend. Passwords are individually salted and hashed with asynchronous scrypt (N=131072, r=8, p=1); plaintext passwords are never stored or logged. Access requires the exact `ADMIN_EMAILS` allowlist on every request. Authentication uses database-backed IP/email rate limits and an eight-hour signed Secure/HttpOnly/SameSite cookie. All admin mutations independently check authentication and request origin. No public registration or default admin password exists.

For first access, run `node scripts/create-admin-invite.mjs owner@example.com https://your-origin` locally. Treat its output as private. Save only its `environmentValue` into the production `ADMIN_SETUP_INVITE` environment variable and redeploy. Migration stores the token hash and expiry without reactivating a used invitation. Deploying a changed administrator allowlist permanently revokes outstanding invitations for removed addresses, including access through older deployment URLs. Give `setupUrl` privately to that owner; it expires after 72 hours. The owner validates the link, chooses a 12–128 character password and is signed in. The token is in the URL fragment (not server request logs), is stripped from browser history on load, and can activate only its approved email once. Reloading the setup page requires reopening the original invitation. The setup link cannot overwrite an existing password. Remove the provisioning environment variable after activation; existing credentials persist.

When Resend and `EMAIL_FROM` are ready, the login page also offers email codes (ten-minute expiry, HMAC hashes, five guesses per code). This provides a secondary login method if a password is forgotten. Until email is connected, access recovery requires an authenticated operator; there is no public password reset or login bypass. [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) and [Node scrypt documentation](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback) informed the implementation.

The dashboard shows today/upcoming appointments, leads, recorded revenue net of refunds, cancellations and email-delivery attention. Calendar has day/week/month views. Bookings expose the selected scope, home/contact/access details, notes and status. Customers include home profiles, history and revenue. Leads retain incomplete paid-booking attempts, commercial inquiries and contact requests.

Pricing UI edits all six service tiers, add-on price/limits/tax/enabled state, recurring percentages, bedroom/bathroom adjustments, ZIPs and minimum notice. Availability UI edits concurrent team capacity, base service minutes and minutes per add-on unit, and blocks/releases time off. The day/week/month calendar displays bookings, checkout holds, blocked periods and free time from the same occupancy data used by checkout. It refreshes every 30 seconds while open. Blocking a period that overlaps an existing booking or checkout hold is rejected.

The initial list views are capped at 1,000 records. Add paginated queries/reporting before volume outgrows this. Operational photo upload, cleaner accounts, automatic recurring billing and outbound marketing automation are intentionally not launched.

## Defaults requiring owner review

- ZIPs: 28560 and 28562; these are broader than municipal boundaries. Confirm travel coverage before opening dates.
- Owner-authorized working hours: Monday–Friday 8 AM–5 PM, Saturday 8 AM–2 PM, Sunday closed, in America/New_York. Start options are generated every 30 minutes for the next 90 calendar days, honoring the configured minimum notice. Starts must be before normal closing time; full estimated duration may extend up to one hour after closing (6 PM weekdays, 3 PM Saturdays). No manual opening of individual windows is needed.
- Initial capacity is one cleaning team. Increase only when that many teams can work simultaneously. Staffing, travel and breaks remain an operational responsibility. No automatic travel buffer is added; time off can be blocked.
- Standard: 120 minutes; Deep: 180 minutes; Move: 240 minutes (initial assumption requiring owner confirmation). Every paid add-on unit adds 30 minutes by default, configurable individually. Ordinary included bed making is already in base time; paid linen changes add time per bed. Estimates are flat per service initially, not size-adjusted.
- Duration changes apply to new checkout holds. Paid bookings and reschedules retain the originally reserved interval length. Abandoned holds block their entire interval until Stripe confirms they are expired. Public checkout remains gated by BOOKING_ENABLED and provider readiness.
- 24-hour minimum online notice; configurable.
- Interior windows: proposed $8 per safely reachable standard window. Empty cabinet add-on: $30 per set of up to 10 emptied sections. Pet-hair base $20, plus $10 at 1,500 sqft and $20 at 3,000 sqft.
- Initial tax configuration: 6.75% on wash/dry/fold and folding extras, zero on base cleaning and other extras. This is a provisional implementation assumption. Have a North Carolina tax professional confirm the classification of each in-home service, rate, registrations and combined charges. Taxability/rate is configurable and included in the visible total.
- Terms, Privacy, Cancellation, and Service/Satisfaction are operational drafts based on the owner’s proposal, **not lawyer-reviewed legal documents**. Obtain professional review of cancellation charges, refunds/credits, privacy/retention, employee/contractor practices and the legal DBA before accepting paid work.
- Verify the sending domain, monitored support address, administrator allowlist, actual staffing and service policies before enabling payments.

## Privacy and future operations

Job photo schema stores **private object keys only**. No public photo bucket, uploader, route or gallery exists. Do not add public object URLs. Future uploads require authenticated cleaner assignment, explicit recorded customer consent, file/type/size validation, authorized per-booking access, short-lived signed download URLs and a retention/deletion policy.

`homes.profile` retains square footage, rooms, pets, access and persistent instructions. Extend it with flooring, product preferences, restricted rooms and preferred cleaner. `cleaners`, `job_assignments`, `job_checklists`, `job_photos`, booking timestamps and `booking_events` support the future My Day → Check In → Checklist/Photos → Complete workflow. Do not expose these tables through an unauthenticated data API.

Leads are captured only after contact details are submitted, with a clear service-follow-up disclosure. Access instructions are omitted from lead payloads. No marketing campaign runs automatically. Lead continuation uses an HttpOnly cookie; customer PII is not persisted in localStorage.

## Quality checks

`npm test` covers all 18 base service/size combinations at both boundaries, ZIP and condition review, add-on quantities, taxes, every discount, half-bathroom adjustments and invalid pricing inputs. `tests/scheduling.test.ts` also covers business hours, DST, full-duration boundaries, quantity-based duration, interval capacity, concurrent reservation attempts in an isolated PGlite database, cancellation, rescheduling and block release. `tests/auth.test.ts` covers password hashing and rejection, invitation expiry, allowlist enforcement, concurrent single-use activation and password authentication in an isolated database. `npm run build` runs TypeScript and production compilation.

Before enabling live bookings, verify in an isolated test environment:

- Supported and unsupported ZIPs; each cleaning type and size tier; move-empty-home rule.
- Add-ons, discount math, mobile layout and keyboard/form labels.
- Duration-aware start options, simultaneous overlapping attempts at last capacity, expired checkout, time-off blocks and closing-time boundaries.
- Stripe test success (`4242 4242 4242 4242`) and decline (`4000 0000 0000 0002`), signature rejection, duplicate webhook delivery.
- Paid booking in Control Room, customer record, lead conversion and delivered confirmation.
- Abandoned checkout saved as a lead, commercial inquiry and scheduled commercial job.
- Admin unauthorized access rejection; internal notes and access data never public.

Use an isolated database for payment and booking tests. The initial deployment verification created two explicitly labeled private QA inquiry records, then closed them with do-not-contact notes; it created no bookings or customer records. Current execution results and launch dependencies are tracked in `docs/launch-status.md`.

References: [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment), [Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create), [NCDOR Sales and Use Tax](https://www.ncdor.gov/taxes-forms/sales-and-use-tax).
