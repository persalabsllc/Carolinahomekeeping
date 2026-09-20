# Launch verification

## Current status — September 20, 2026

Live booking is enabled at https://www.carolinahomekeeping.com/book. This section supersedes the historical launch notes below.

- Scope: GitHub `persalabsllc/Carolinahomekeeping`, Vercel `carolinahomekeeping`, and the Carolina Homekeeping Stripe account. Application code, prices, discounts, tax configuration, and scheduling rules were not changed for Stripe activation.
- Vercel production has secret-type `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. The live key is restricted to the Checkout, subscription, invoice, customer, product/price, Payment Intent and customer portal permissions needed by the existing implementation. No credential values are stored in this repository.
- `BOOKING_ENABLED=true` is Production only; `BOOKING_ENABLED=false` remains Preview only.
- Active Stripe event destination `we_1UHogABocA84xWHFp2TAkZnX` targets https://www.carolinahomekeeping.com/api/stripe/webhook and subscribes to all 12 event types handled by the route. API version: `2026-08-26.dahlia`.
- Production activation deployment `dpl_7mBvfqer5AJnpefoj2q9WUJyxBeJ` built successfully from application commit `111fe2d3d2fee8182f5ab97808bd4bd9cc242fb1`. Canonical-domain availability returned `open: true` for all four frequencies. Every returned start was Thursday or Sunday. Existing 8 AM–5 PM Eastern start hours, full-duration closing grace and one-cleaner capacity remain intact.
- Live unpaid Checkout sessions were created for one-time, weekly, two-week and four-week service using the application's actual `checkoutParameters` and production public quotes. The one-time and weekly hosted pages rendered correctly. All four unpaid sessions were explicitly expired. Four real Stripe-signed expiration deliveries returned HTTP 200, and a duplicate resend reached the activation deployment with HTTP 200 at 18:09:43 UTC. An unsigned webhook request returned HTTP 400.
- Stripe sandbox hosted Checkout rejected the documented decline test card, then completed one-time and all three recurring purchases using the documented successful test card. The recurring sessions charged the first visit exactly once, retained the correct cadence, and deferred the recurring charge until the day before visit two.
- Stripe test clocks exercised successful renewal, declined renewal, recovery and cancellation for weekly, two-week and four-week subscriptions. Actual Stripe invoice responses were reconciled through `invoiceData` and `recordInvoice` in an isolated PGlite database. Amounts, invoice deduplication, failure/recovery statuses and retention of prepaid visits passed. Test subscriptions were canceled afterward.
- Pricing spot check: standard cleaning at 1,500–1,999 sq ft, three bedrooms, two bathrooms and no extras remains $189.00 one time, $160.65 weekly, $170.10 every two weeks, and $179.55 every four weeks. All 71 existing automated tests and TypeScript passed; the production build passed.
- Production browser checks covered the pricing/routine choices and live Thursday/Sunday appointment picker. Runtime logs on the activation deployment showed successful requests; the observed HTTP 400 was the deliberate unsigned-webhook check.

Verification boundary: no real card was charged, and no production QA lead, customer, booking or subscription was created. Sandbox payment/invoice checks and isolated database reconciliation do not constitute a production paid-booking/confirmation-email round trip. Email delivery evidence from the earlier release is recorded separately in README.md. Temporary operator harnesses and keys are not deployed.

## Historical implementation and pre-launch notes

The following records describe earlier stages and are retained for context; their old schedule and disabled-booking statements are superseded by the current status above.

## Implemented

- Coastal public site using the supplied logo, service pages, commercial inquiries, geographic pages, policies and technical SEO.
- Eight-step price/booking flow, server price verification, real-capacity scheduling, Stripe Checkout and idempotent booking fulfillment.
- Authenticated Control Room, CRM, configurable pricing/ZIPs/availability, confirmation outbox and retry job.
- Dedicated Neon database resource and Vercel project. Production migration completed. No availability, bookings or customers seeded.

## Verification so far

- Production build and TypeScript: passed.
- 42 automated checks: passed. Includes all pricing tiers, add-ons, recurring discounts and a real in-process Postgres migration/constraint test.
- Production Vercel deployment: READY.
- Desktop homepage and booking steps: inspected in browser.
- Phone-width homepage, home details, service choices, add-ons and frequency: inspected at a 375px content width in an isolated preview. No horizontal overflow observed. Local-font inheritance corrected after visual inspection.
- Browser checks passed for supported/unsupported ZIP, Standard/Deep/Move prices, empty-home eligibility, move cabinet exclusion, add-ons, recurring totals and the honest no-availability fallback.
- Commercial inquiry and residential scheduling-interest submission: saved and verified in the production database, including quote and stage. Two explicitly labeled internal QA leads were closed and marked do-not-contact; they are never publicly displayed. No test bookings or payments were created.
- Unauthenticated Control Room: does not expose customer records. Password sign-in is independent of email setup. Owner activation uses a private, single-use invitation.
- Dependency audit: no production vulnerabilities reported.

## Connections still required before paid launch

- Stripe sign-in/appropriate account credentials and webhook setup; then success/decline and confirmation end-to-end tests with test credentials.
- Resend access, verified sender and monitored reply-to email; then optional email-code sign-in and delivered-email verification.
- Owner supplied working hours and initial duration rules. The scheduler now opens those hours automatically for one team once payment setup is complete; confirm staffing capacity and the provisional four-hour Move estimate before enabling live checkout.
- GoDaddy domain DNS, currently reported by Vercel as A @ → 216.150.1.1. Update APP_URL to https://carolinahomekeeping.com after DNS and HTTPS are valid.
- Review initial tax treatment, service area, cancellation and legal policies.

Stripe success/decline, a payment-created booking, delivered confirmation, production owner activation, signed-in administration and real appointment selection have **not** been verified end to end. They remain release gates, not claimed successes. The no-availability lead check is not a substitute for testing abandonment after contact entry in the paid booking path.

Online payments remain explicitly disabled pending these connections. No real charge has been taken or claimed. The Vercel URL is the usable current site.

## Duration scheduling update

- Mon–Fri 8 AM–5 PM; Sat 8 AM–2 PM; Sundays closed, all Eastern.
- Standard 2 hours; Deep 3 hours; Move 4 hours initially. Paid add-on units default to 30 minutes each. Configurable in Control Room.
- Full interval overlap checks replace per-arrival-window capacity checks, using one shared transaction lock for checkout, fulfillment, rescheduling, commercial scheduling and configuration changes.
- Control Room calendar displays open time, booked work, checkout holds and time-off blocks. Customers see available starts with estimated finish times.
- Existing minimum notice remains 24 hours; public payment readiness remains unchanged.
- Scheduling unit and isolated database tests passed. Production Stripe and email end-to-end verification remains pending account setup.
- Preview-only visual checks passed for the shared calendar, phone-width appointment picker, changing duration, Saturday cutoff and booking selection. These checks used isolated illustrative UI fixtures; no production appointments or holds were created.

## Closing grace and owner access

- New appointments must start before 5 PM weekdays or 2 PM Saturdays. Estimated finishes may extend to 6 PM weekdays or 3 PM Saturdays. Sundays remain closed. Interval blocking and the shared calendar include the extra hour.
- Password access uses salted scrypt hashes, exact administrator allowlisting, rate limiting and the existing eight-hour secure session. It no longer depends on Resend.
- Owner setup invitations contain 256-bit random tokens, store only hashes, expire after 72 hours and cannot be replayed or overwrite an existing password. The owner chooses their password privately.
- All 36 tests and the production build passed, including wrong credentials, expired/non-allowlisted invitations and concurrent attempts to consume the same invitation. The production owner password has not been chosen by the assistant.


## Recurring subscription update

- Recurring checkout uses Stripe subscription mode with weekly, two-week or four-week automatic billing. The first visit is charged at checkout; renewals start the day before visit two. The full displayed amount, including selected extras, repeats after explicit consent.
- Removed public messaging that recurring visits would only be coordinated later. Homepage, frequency selection, final review, confirmation and policies describe automatic billing and scheduling.
- The same weekday and Eastern time are reserved automatically. Full-series conflict checks and checkout holds prevent overlapping recurring sales. The Control Room calendar shares these reservations; Subscriptions provides billing/cancellation management.
- Upcoming 120 days become booking records, with indefinite reservations projected beyond that. Reconciliation extends records. Invoice webhooks mark the matching visit paid or flag payment issues without duplicating appointments.
- Customer management links support payment details, invoices and cancellation. Cancellation releases unpaid future visits while retaining prepaid appointments under the cancellation policy.
- Isolated database checks cover renewal failure/recovery, late payment, duplicate invoices, cancellation and competing recurring checkout holds. Calendar checks cover all cadences, DST, future blocks and materialized/rescheduled exceptions. An availability performance check with ten synthetic plans reduced 240 candidate checks from about 9 seconds to under half a second by reusing projections; no synthetic records were written to production.
- Stripe account connection, real Stripe test-mode first-payment/renewal/decline/cancellation checks and delivered Resend email remain pending. Automated local tests are not a claim that provider payments have been exercised. Checkout stays disabled until these release gates pass.

### Subscription preview verification

- Production build and all 42 automated checks passed before deployment.
- Isolated preview inspected at 390px: frequency choices and per-visit totals, selected add-on duration, real scheduling algorithm with synthetic recurring occupancy, full review and recurring disclosure, and customer plan-management screen. No horizontal overflow in the checked customer screens.
- Biweekly fixture reserved Monday 9–11:30 on its repeating weeks; overlapping starts were absent while the alternate week remained available. Control Room showed the same occupied interval and subscription details.
- Submit stayed disabled with no consent or only policy consent, and became enabled only after separate recurring authorization. No payment was submitted.
- Preview fixtures live only on the QA branch, have no database connection and were not included in production.
