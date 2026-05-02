# Appreciate Me — Garage App

Track your car like an asset. Prove what it's worth.

## Stack
- Next.js 14 (App Router, TypeScript)
- Netlify Blobs (key-value storage, built into Netlify)
- Netlify Functions (serverless API)
- Tailwind CSS + custom design system

## Design Tokens
- Background: `#0a0a09`
- Accent: `#c8f000` / `#00e87a`
- Fonts: Bebas Neue (display), DM Sans (body), DM Mono (technical)

## Environment Variables
- `OPENAI_API_KEY` - required for AI Vehicle Evaluation and AI Visual Identity.
- `OPENAI_EVALUATION_MODEL` - optional model override for AI Vehicle Evaluation.
- `OPENAI_IMAGE_MODEL` - optional model override for AI Visual Identity.
- `ERROR_REPORT_ADMIN_KEY` - required to read error reports through the protected GET endpoint.

## Deploy to Netlify from GitHub

1. Push this repo to GitHub.
2. In Netlify: **Add new site -> Import from Git -> pick this repo**.
3. Build settings auto-detect from `netlify.toml`.
4. Add environment variables for AI features and protected error-report reads.
5. Your app will be live at `your-site-name.netlify.app`.

## Local Development

```bash
npm install
npx netlify dev
```

Opens at `http://localhost:8888` with functions emulation.

## What Works
- Garage dashboard backed by Netlify Blobs.
- Vehicle create/read/update/delete.
- Multi-photo upload, photo gallery, and cover photo selection.
- Build logs with add/edit/delete entries.
- Log attachments for image and PDF proof.
- Market comps with sold-prioritized valuation.
- Valuation Lab portfolio view.
- Ownership & Position tracking for purchase, loan, equity, and owner position.
- Condition Checkup with optional public-share visibility.
- Value Tasks for pending/completed value-building work.
- Mileage Forecast with manual mileage approval.
- AI Vehicle Evaluation.
- AI Visual Identity generation.
- Proof Strength scoring.
- Vehicle Timeline.
- Public share page at `/share/[vehicleId]`.
- Waitlist signup.
- Error reporting with protected reads.

## What's Intentionally Missing / Add Later
- Real auth, login, and user-scoped garages.
- Persistent community posts/comments; current community state is client-local only.
- Payment tiers.
- Admin dashboard and moderation tools.
- Production privacy/security hardening is ongoing.

## Beta Blockers
- Auth/login.
- Owner-scoped vehicles.
- Upload owner checks.
- Public share privacy review.
- Community persistence or clear preview label.
- AI error handling and usage limits.

## Structure

```text
src/
  app/
    layout.tsx              - root layout, no auth yet
    page.tsx                - intro page
    globals.css             - design system + animations
    signup/                 - waitlist signup
    app/
      layout.tsx            - app shell, nav, error boundary
      page.tsx              - garage dashboard
      valuation/            - Valuation Lab
      community/            - local-state community preview
      error-reports/        - protected error report viewer
      vehicles/new/         - add vehicle form
      vehicles/[id]/        - owner vehicle detail page
    share/[vehicleId]/      - public proof packet
  lib/
    types.ts                - Vehicle, LogEntry, valuation, condition, ownership types
    api.ts                  - fetch helpers
netlify/
  functions/
    vehicles.mts                 - list/create/delete vehicles
    vehicle.mts                  - get/update single vehicle and safe task completion
    get-vehicle-public.mts       - redacted public vehicle endpoint
    upload-photo.mts             - vehicle photo upload to blobs
    get-photo.mts                - vehicle photo serving
    upload-entry-attachment.mts  - log proof upload to blobs
    get-entry-attachment.mts     - log proof serving
    generate-ai-evaluation.mts   - AI vehicle evaluation
    generate-visual-identity.mts - AI visual identity generation and serving
    report-error.mts             - error report write and protected read
    waitlist.mts                 - waitlist signup
```
