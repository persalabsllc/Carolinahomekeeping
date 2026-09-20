# Launch verification

## Implemented

- Coastal public site using the supplied logo, service pages, commercial inquiries, geographic pages, policies and technical SEO.
- Eight-step price/booking flow, server price verification, real-capacity scheduling, Stripe Checkout and idempotent booking fulfillment.
- Authenticated Control Room, CRM, configurable pricing/ZIPs/availability, confirmation outbox and retry job.
- Dedicated Neon database resource and Vercel project. Production migration completed. No availability, bookings or customers seeded.

## Verification so far

- Production build and TypeScript: passed.
- 34 automated checks: passed. Includes all pricing tiers, add-ons, recurring discounts and a real in-process Postgres migration/constraint test.
- Production Vercel deployment: READY.
- Desktop homepage and booking steps: inspected in browser.
- Phone-width homepage, home details, service choices, add-ons and frequency: inspected at a 375px content width in an isolated preview. No horizontal overflow observed. Local-font inheritance corrected after visual inspection.
- Browser checks passed for supported/unsupported ZIP, Standard/Deep/Move prices, empty-home eligibility, move cabinet exclusion, add-ons, recurring totals and the honest no-availability fallback.
- Commercial inquiry and residential scheduling-interest submission: saved and verified in the production database, including quote and stage. Two explicitly labeled internal QA leads were closed and marked do-not-contact; they are never publicly displayed. No test bookings or payments were created.
- Unauthenticated Control Room: does not expose customer records. Sign-in awaits email setup.
- Dependency audit: no production vulnerabilities reported.

## Connections still required before paid launch

- Stripe sign-in/appropriate account credentials and webhook setup; then success/decline and confirmation end-to-end tests with test credentials.
- Resend access, verified sender and monitored reply-to email; then admin sign-in and delivered-email verification.
- Owner supplied working hours and initial duration rules. The scheduler now opens those hours automatically for one team once payment setup is complete; confirm staffing capacity and the provisional four-hour Move estimate before enabling live checkout.
- GoDaddy domain DNS, currently reported by Vercel as A @ → 216.150.1.1. Update APP_URL to https://carolinahomekeeping.com after DNS and HTTPS are valid.
- Review initial tax treatment, service area, cancellation and legal policies.

Stripe success/decline, a payment-created booking, delivered confirmation, signed-in administration and real appointment selection have **not** been verified end to end. They remain release gates, not claimed successes. The no-availability lead check is not a substitute for testing abandonment after contact entry in the paid booking path.

Online payments remain explicitly disabled pending these connections. No real charge has been taken or claimed. The Vercel URL is the usable current site.

## Duration scheduling update

- Mon–Fri 8 AM–5 PM; Sat 8 AM–2 PM; Sundays closed, all Eastern.
- Standard 2 hours; Deep 3 hours; Move 4 hours initially. Paid add-on units default to 30 minutes each. Configurable in Control Room.
- Full interval overlap checks replace per-arrival-window capacity checks, using one shared transaction lock for checkout, fulfillment, rescheduling, commercial scheduling and configuration changes.
- Control Room calendar displays open time, booked work, checkout holds and time-off blocks. Customers see available starts with estimated finish times.
- Existing minimum notice remains 24 hours; public payment readiness remains unchanged.
- Scheduling unit and isolated database tests passed. Production Stripe and email end-to-end verification remains pending account setup.
- Preview-only visual checks passed for the shared calendar, phone-width appointment picker, changing duration, Saturday cutoff and booking selection. These checks used isolated illustrative UI fixtures; no production appointments or holds were created.
