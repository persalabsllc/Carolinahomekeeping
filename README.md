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
- `db/001_initial.sql`, `db/002_duration_scheduling.sql`, `db/003_admin_passwords.sql`, `db/004_subscriptions.sql`: core schema, scheduling, administrator access and subscription invoices.
- `lib/scheduling.ts`: shared Eastern business hours, duration estimates and interval availability.
- `lib/schedule-store.ts`: the database occupancy query and transaction reservation guard.
- `lib/availability-highlights.ts`, `lib/home-availability.ts`, `components/live-availability.tsx`: the homepage's two live standard-clean openings. The read-only `/api/availability/highlights` endpoint uses the same occupied intervals, recurring patterns, configured duration, team capacity and minimum notice as booking, over the next 14 days. Responses contain only public time labels and intervals; no customer or internal calendar information. Refreshes every 30 seconds while visible and on focus/reconnect, with no response caching. Failed refreshes or data older than 65 seconds remove the openings. Booking readiness is displayed separately so prelaunch calendar openings never imply payment is enabled. Final checkout availability is still checked against the customer's actual selection.
- `components/mobile-booking-cta.tsx`: persistent mobile instant-price button on residential marketing pages. Excluded from the booking flow, commercial inquiry, policies and admin; those retain their own actions. Mobile footer spacing includes the bar and device safe area.
- Booking conversion UI: Step 1 continues to home details without revealing a default price. Two explicit condition answers distinguish routine cleaning, deep cleaning and review-only conditions. Optional `conditionFlags` are validated in the shared quote schema and stored in lead/booking JSON; every service requires review when flags are present. Existing saved quotes remain compatible. Control Room leads show the condition answers.
- Extras are grouped by `lib/addon-groups.ts` into Everyday Help, Kitchen Extras and Detail Extras; all amounts, limits, taxes and recurring discounts remain sourced from the existing pricing configuration. Future unclassified extras appear in Detail Extras.
- `components/booking-summary.tsx` keeps the full desktop breakdown and a collapsed mobile breakdown with a persistent total button. Customer pages and future customer emails show appointment start times only. Internal duration calculation, appointment end times, calendar blocking and owner notifications retain the scheduling estimates.
- `/api/availability` reads the real calendar whenever the database is connected; its `open` flag independently controls paid checkout readiness. With payment disabled, a selected opening can be sent as an unreserved appointment preference to the lead inbox. Checkout remains guarded by `canBook()` and a transaction-level capacity check. No payment credentials or launch flags are changed by this UI work.
- Confirmations retain browser/lead-token ownership checks. `components/booking-success.tsx` displays only server-confirmed booking details, a local `.ics` arrival reminder, and configured recurring savings for one-time customers. The calendar event has a start only, contains no entry codes or private management links, and does not create a recurring calendar rule. The recurring offer starts a separate future booking; it never alters or recharges the confirmed visit.
- `lib/recurrence.ts`, `lib/subscription-store.ts`: recurring calendar patterns, future visit materialization and idempotent invoice mapping.
- `lib/checkout-session.ts`, `lib/subscriptions.ts`: Stripe payment/subscription checkout, renewal reconciliation and customer billing portal.

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

Register `/api/stripe/webhook` for `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.voided`, `invoice.marked_uncollectible`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, and `customer.subscription.resumed`. Use the endpoint’s own signing secret. Keep live and test credentials, databases, and endpoints separate.

1. Server validates all home, contact, policy and service inputs and recalculates the price from current configuration. Client totals are never trusted; a changed price requires review.
2. A database transaction takes a shared scheduling advisory lock, locks the lead, recalculates duration and checks every overlapping booking/hold/block before reserving the entire interval. Different requested start times use the same lock; checking a single slot ID is not enough. Holds are counted until Stripe has definitely expired them or payment has been fulfilled. Time alone never releases ambiguous paid capacity.
3. Stripe Checkout is created with an idempotency key tied to the hold. Cards only avoids delayed-payment booking ambiguity; supported Apple Pay / Google Pay are offered by Stripe/device eligibility.
4. The verified webhook and authenticated return-page check call the same transaction-safe fulfillment function. One hold can create only one booking. Customer, home profile, subscription, bookings, event and confirmation outbox are committed together.
5. The outbox sends confirmation independently and retries. A browser closing after payment does not prevent booking creation. Duplicate webhook events cannot duplicate bookings.
6. Every minute `/api/cron` reconciles checkout and subscription state, extends recurring appointments, and queues due reminders and follow-ups, and retries email. It is authenticated by `CRON_SECRET`. Network-ambiguous Stripe creates are recovered before capacity is released.

### Recurring subscriptions

Recurring customers explicitly authorize automatic billing before Checkout. Weekly, every two weeks and every four weeks use Stripe `mode: subscription` with week intervals of 1, 2 or 4. Four weeks means 28 days, not a calendar month. One-time cleaning uses `mode: payment`.

The first visit is prepaid at checkout using a one-time line item. An identical recurring line is deferred with `subscription_data.trial_end` until the day before the second visit; this is a Stripe billing mechanism, not an advertised free cleaning. Subsequent charges occur every 1/2/4 weeks. The complete per-visit amount includes the selected cleaning, repeated add-ons and applicable tax. Discounts apply to base cleaning and configured room adjustments, not extras. The accepted amount/scope/duration are stored on the plan; changing global prices does not silently change existing subscriptions. Customers see the recurring amount, next charge date, upcoming visits and cancellation terms before consenting.

Each subscription reserves its original weekday and Eastern wall-clock time, including across daylight saving changes. Checkout checks the entire ongoing pattern against bookings, blocks and other subscription holds, under the shared transaction lock. Fixed exceptions and the 28-day cadence cycle protect the pattern beyond the visible 90-day booking horizon. The next 120 days are materialized as real booking records, extended by the reconciliation job. The calendar projects reservations beyond those records. A materialized/rescheduled visit replaces its original projected occurrence, so it is never counted twice. Batched availability projects occupied intervals once for all candidate starts.

Signed invoice events attach each renewal to exactly one visit. Duplicate/out-of-order events cannot create duplicate appointments or downgrade paid invoices. Payment failure marks the visit as an issue and keeps its reserved time; staff must not perform an unpaid visit. Successful recovery restores an upcoming failed visit, while payments received after the visit time or cancellation require attention. Reconciliation processes five subscriptions per run, oldest checked first. Monitor/revisit batch sizing as volume grows.

Control Room → Subscriptions shows status, price, cadence and customer, with billing-portal and cancellation actions. Customers receive a private 90-day management link in confirmation and renewal emails; it grants access only to that plan and uses a URL fragment removed from browser history. The Stripe portal supports payment-method updates, invoice history and cancellation, but not price or schedule changes. Canceling stops future automatic billing immediately and releases unpaid future visits. Paid appointments stay booked and follow the cancellation/refund policy. Customer plan cancellation does not itself issue a refund. Existing unpaid recurring visits cannot be canceled, completed or rescheduled individually in Control Room; manage the subscription instead. A paid visit can be rescheduled without changing the ongoing pattern. Changing an entire routine requires canceling the old plan and explicitly booking a new one; do not alter its price/cadence directly in Stripe. Unexpected provider-side changes pause collection for owner review.

Historical frequency preferences without a Stripe subscription are never automatically converted or charged.

Cancelling a booking in Control Room releases capacity but does not issue a refund or notify the customer automatically. Apply the accepted cancellation policy and refund through Stripe; its refund webhook updates recorded amounts. Reschedules and commercial job scheduling similarly require direct customer communication. Commercial jobs start unpaid; no payment is inferred.

## Control Room

`/control-room` supports password login without Resend. Passwords are individually salted and hashed with asynchronous scrypt (N=131072, r=8, p=1); plaintext passwords are never stored or logged. Access requires the exact `ADMIN_EMAILS` allowlist on every request. Authentication uses database-backed IP/email rate limits and an eight-hour signed Secure/HttpOnly/SameSite cookie. All admin mutations independently check authentication and request origin. No public registration or default admin password exists.

For first access, run `node scripts/create-admin-invite.mjs owner@example.com https://your-origin` locally. Treat its output as private. Save only its `environmentValue` into the production `ADMIN_SETUP_INVITE` environment variable and redeploy. Migration stores the token hash and expiry without reactivating a used invitation. Deploying a changed administrator allowlist permanently revokes outstanding invitations for removed addresses, including access through older deployment URLs. Give `setupUrl` privately to that owner; it expires after 72 hours. The owner validates the link, chooses a 12–128 character password and is signed in. The token is in the URL fragment (not server request logs), is stripped from browser history on load, and can activate only its approved email once. Reloading the setup page requires reopening the original invitation. The setup link cannot overwrite an existing password. Remove the provisioning environment variable after activation; existing credentials persist.

When Resend and `EMAIL_FROM` are ready, the login page also offers email codes (ten-minute expiry, HMAC hashes, five guesses per code). This provides a secondary login method if a password is forgotten. Until email is connected, access recovery requires an authenticated operator; there is no public password reset or login bypass. [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) and [Node scrypt documentation](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback) informed the implementation.

The dashboard shows today/upcoming appointments, leads, recorded revenue net of refunds, cancellations and email-delivery attention. Calendar has day/week/month views. Bookings expose the selected scope, home/contact/access details, notes and status. Customers include home profiles, history and revenue. Leads retain incomplete paid-booking attempts, commercial inquiries and contact requests.

Pricing UI edits all six service tiers, add-on price/limits/tax/enabled state, recurring percentages, bedroom/bathroom adjustments, ZIPs and minimum notice. Availability UI edits concurrent team capacity, base service minutes and minutes per add-on unit, and blocks/releases time off. The day/week/month calendar displays bookings, checkout holds, blocked periods and free time from the same occupancy data used by checkout. It refreshes every 30 seconds while open. Blocking a period that overlaps an existing booking or checkout hold is rejected.

The initial list views are capped at 1,000 records. Add paginated queries/reporting before volume outgrows this. Operational photo upload, cleaner accounts and outbound marketing automation are intentionally not launched. Subscription billing is implemented but remains gated by Stripe setup and provider testing.

## Defaults requiring owner review

- ZIPs: 28560 and 28562; these are broader than municipal boundaries. Confirm travel coverage before opening dates.
- Owner-authorized working hours: Monday–Friday 8 AM–5 PM, Saturday 8 AM–2 PM, Sunday closed, in America/New_York. Start options are generated every 30 minutes for the next 90 calendar days, honoring the configured minimum notice. Starts must be before normal closing time; full estimated duration may extend up to one hour after closing (6 PM weekdays, 3 PM Saturdays). No manual opening of individual windows is needed.
- Initial capacity is one cleaning team. Increase only when that many teams can work simultaneously. Staffing, travel and breaks remain an operational responsibility. No automatic travel buffer is added; time off can be blocked.
- Standard: 120 minutes; Deep: 180 minutes; Move: 240 minutes (initial assumption requiring owner confirmation). Additional active-work minutes per unit: dishes 15; wash/dry/fold 20 per load; fold-only 15 per basket; put-away 10 per basket; linen change 10 per bed; oven 30; refrigerator 20; cabinets 30 per set; interior window 3; pet-hair attention 20 per home. Each is editable in Control Room → Availability using whole minutes. The full visit is summed first, then rounded up once to the next 5 minutes; three windows add 10 minutes to a base clean. Washer/dryer and dishwasher cycles overlap the cleaning; enough actual cycle time must still fit the visit. Ordinary included bed making is already in base time; paid linen changes add time per bed. Estimates are flat per service initially, not size-adjusted.
- Duration changes apply to new checkout holds. Existing recurring plans, paid bookings and reschedules retain the originally reserved interval length. Abandoned holds block their entire interval until Stripe confirms they are expired. Public checkout remains gated by BOOKING_ENABLED and provider readiness.
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

### Ad landing page

`/clean-home` is an unlisted Facebook/Instagram ad destination. It is deliberately omitted from navigation and the sitemap, and sends both `noindex` metadata and an `X-Robots-Tag`. It is **not access-controlled**: anyone with the URL can open it, as required for ad clicks. It is not disallowed in robots.txt so crawlers can read its noindex directive. Do not add it to public menus.

The page reuses `BookingFlow` in campaign mode: home/ZIP → service + routine + optional extras → appointment + address/contact → review/payment. The ordinary eight-step `/book` flow remains available. No pricing, scheduling, subscription or fulfillment engine is duplicated or changed. Optional access details and extras are collapsible. Campaign leads include their landing-page source in notes. No Meta Pixel, third-party ad tracking or new discount is silently enabled.

Before Stripe launch, the live calendar offers an **unreserved appointment preference** and lead capture. It never implies a paid or confirmed booking. The existing checkout readiness gate controls both entry points. End-to-end Stripe test-mode verification is still required before paid ad spend. The 29-second brief is a friction-reduction goal, not a guaranteed completion time or published claim.

`npm test` covers all 18 base service/size combinations at both boundaries, ZIP and condition review, add-on quantities, taxes, every discount, half-bathroom adjustments and invalid pricing inputs. `tests/scheduling.test.ts` also covers business hours, DST, full-duration boundaries, quantity-based duration, the reported $302.03 quote (now 215 minutes), five-minute total rounding, interval capacity, concurrent reservation attempts in an isolated PGlite database, cancellation, rescheduling and block release. `tests/auth.test.ts` covers password hashing and rejection, invitation expiry, allowlist enforcement, concurrent single-use activation and password authentication in an isolated database. `tests/recurrence.test.ts` covers subscription Checkout parameters and explicit consent, all cadences/DST, far-future conflicts, simultaneous recurring holds, recurring booking creation, invoice failure/recovery/idempotency, cancellation and late-payment handling in an isolated database. `npm run build` runs TypeScript and production compilation.

Before enabling live bookings, verify in an isolated test environment:

- Supported and unsupported ZIPs; each cleaning type and size tier; move-empty-home rule.
- Add-ons, discount math, mobile layout and keyboard/form labels.
- Duration-aware start options, simultaneous overlapping attempts at last capacity, expired checkout, time-off blocks and closing-time boundaries.
- Stripe test success (`4242 4242 4242 4242`) and decline (`4000 0000 0000 0002`), signature rejection, duplicate webhook delivery.
- Paid booking in Control Room, customer record, lead conversion and delivered confirmation.
- Each subscription cadence: first charge exactly once, next charge the day before visit two, ongoing invoices via Stripe test clocks, duplicated/reordered webhook delivery, declined renewal and recovery, customer/admin cancellation, preserved prepaid visits, portal payment updates and refund reconciliation. Confirm Stripe Checkout’s deferred recurring line plus immediate first-visit line in test mode before live launch.
- Abandoned checkout saved as a lead, commercial inquiry and scheduled commercial job.
- Admin unauthorized access rejection; internal notes and access data never public.

Use an isolated database for payment and booking tests. The initial deployment verification created two explicitly labeled private QA inquiry records, then closed them with do-not-contact notes; it created no bookings or customer records. Current execution results and launch dependencies are tracked in `docs/launch-status.md`.

References: [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment), [Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create), [Subscription trials and immediate invoice items](https://docs.stripe.com/billing/subscriptions/trials), [Subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks), [NCDOR Sales and Use Tax](https://www.ncdor.gov/taxes-forms/sales-and-use-tax).


## Automated customer communications

Migration `005_communications.sql` adds delivery scheduling, email preferences, one-use recovery offers and private booking feedback. Control Room → **Emails** lets the owner configure the alert recipient, enable/disable each workflow, change follow-up timing, set discount/expiry, supply a real business mailing address and add an HTTPS public review link. Defaults:

- Owner alert to `kkratoville@gmail.com` when a paid residential booking or agreed commercial job is confirmed. Each paid recurring visit also alerts the owner.
- Customer confirmation after verified payment (commercial scheduling confirms the agreed price without claiming payment).
- Reminders at 12 hours and 1 hour before the current appointment. Minute cron means timing is approximate. Bookings made after a reminder's target skip that reminder; delayed reminders expire after 30 minutes. Canceled, unpaid and rescheduled messages are checked immediately before dispatch.
- Feedback request two hours after **marking the booking completed**, never merely after its scheduled finish. Private feedback is available in Emails. Every rating gets the same public review option when a review URL is configured; no review gating. Unsubscribing stops feedback and offers, not necessary transactional messages.
- One abandoned-first-booking offer after two hours of inactivity, only with explicit email consent, no existing customer bookings and no unresolved active/paid checkout. An offer expires after seven days, provides 10% off the first visit including extras after recurring savings, and never changes future subscription charges. The offer is signed, restricted to the original email/lead, redeemed atomically with payment, and protected by a unique active-hold index. Recovery links restore quote/contact/address, exclude entry instructions and require fresh availability and policy/payment consent. Current prices are recalculated server-side.

Recovery email dispatch requires **BOOKING_ENABLED**, all payment connections, and a real `postalAddress` in email settings. Do not invent an address or review URL. A legitimate mailing address is required for promotional mail; business PO boxes are acceptable. Public-review invitations are omitted from emails until both postal address and review URL are configured. An ordinary private service-feedback request works meanwhile. These policy additions and discount tax treatment should receive professional legal/accounting review before paid launch.

`RESEND_API_KEY`, `EMAIL_FROM` (verified sender), `APP_URL` (canonical HTTPS origin), `SESSION_SECRET` and `CRON_SECRET` must be configured server-side. `SUPPORT_EMAIL` optionally sets Reply-To and should only point to a monitored mailbox. Sender authentication does not create an inbox. With no monitored mailbox, templates direct customers to Contact. The Emails tab has an authenticated **Send test email** action targeting the saved owner address. No test bookings are required.

The durable outbox uses transactional event insertion, unique event keys, per-message claims and Resend idempotency keys. It retries transient failures with backoff, never reuses an ambiguous delivery beyond Resend's 24-hour idempotency window (23-hour application cutoff), and exposes failures for review. `sent` means Resend accepted the message; final inbox delivery/bounces are visible in Resend. There is no automatic resend of failed jobs after that cutoff. Check provider logs first. All HTML is escaped and plain-text fallbacks are included. Unsubscribe GET is read-only; signed POST supports one-click unsubscribes. Recovery/feedback tokens are scoped by purpose; pages are excluded from indexing. Emails do not contain access codes.

The account's free Resend sending limits are shared with other domains. Monitor actual usage before increasing booking volume; owner alerts plus customer confirmation, two reminders and follow-up use at least five messages per cleaning. No paid plan is enabled by this implementation.

Verification uses isolated PGlite databases and provider fakes (no production customer records or emails), plus TypeScript/build and browser UI checks. Real Stripe acceptance/decline and recurring invoices must still be verified with the account connected before paid launch.


### Email release verification — September 20, 2026

- 48 automated tests passed; TypeScript and optimized production build passed.
- Desktop and 390px mobile preview checks covered restoring a recovery quote, fresh appointment selection, first-payment versus recurring totals, feedback submission (including a low rating with the same public-review option), and email settings. QA fixtures live only on the isolated `qa/email-automation` preview branch. `/qa-emails` returns 404 in production.
- Production private-link endpoints rejected invalid tokens. Admin mutation and cron routes rejected unauthenticated requests. The production cron ran successfully every minute.
- `EMAIL_FROM` is `Carolina Homekeeping Co. <bookings@carolinahomekeeping.com>`; `APP_URL` is `https://www.carolinahomekeeping.com`. Resend domain authentication is verified.
- A single owner-only delivery check traveled through the production outbox and cron to `kkratoville@gmail.com`. Resend confirmed **delivered** at 02:35 UTC. No customer, booking or payment test records were created; the test message remains visible as `owner_test` in email activity.
- The owner-provided mailing address, **6210 Old US Hwy 70 W, New Bern, NC 28562**, is saved in production email settings and remains editable in Control Room → Emails. Public contact details are centralized in `lib/business-contact.ts`: **252-515-4389**, **hello@carolinahomekeeping.com**, and the mailing address above appear on the Contact page and site footer. Phone/email links open the visitor’s dialer or email app. The phone is also used in structured data and customer emails. Publishing an email address does not configure its mailbox or change the automated-email Reply-To setting.
- Launch dependencies remain Stripe/payment activation and a public review URL for review invitations. The Namecheap customer-service inbox is a separate setup; templates direct customers to the Contact page and business phone meanwhile.
