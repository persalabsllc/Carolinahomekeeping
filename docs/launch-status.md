# Launch verification

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
