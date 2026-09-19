# Launch verification

## Implemented

- Coastal public site using the supplied logo, service pages, commercial inquiries, geographic pages, policies and technical SEO.
- Eight-step price/booking flow, server price verification, real-capacity scheduling, Stripe Checkout and idempotent booking fulfillment.
- Authenticated Control Room, CRM, configurable pricing/ZIPs/availability, confirmation outbox and retry job.
- Dedicated Neon database resource and Vercel project. No availability or customer data seeded.

## Verification so far

- Production build and TypeScript: passed.
- 27 automated checks: passed. Includes all pricing tiers, add-ons, recurring discounts and a real in-process Postgres migration/constraint test.
- Production Vercel deployment: READY.
- Desktop homepage: inspected in browser.
- Dependency audit: no production vulnerabilities reported.

## Connections still required before paid launch

- Stripe sign-in/appropriate account credentials and webhook setup; then success/decline and confirmation end-to-end tests with test credentials.
- Resend access, verified sender and monitored reply-to email; then admin sign-in and delivered-email verification.
- Owner-confirmed real appointment windows and staffing capacity. No fictional capacity will be published.
- GoDaddy domain DNS, currently reported by Vercel as A @ → 216.150.1.1. Update APP_URL to https://carolinahomekeeping.com after DNS and HTTPS are valid.
- Review initial tax treatment, service area, cancellation and legal policies.

Online payments remain explicitly disabled pending these connections. No real charge has been taken or claimed. The Vercel URL is the usable current site.
