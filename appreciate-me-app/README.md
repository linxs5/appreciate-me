# Appreciate Me — Garage App

The maintenance record your next buyer will actually trust.

## Stack
- Next.js 14 (App Router, TypeScript)
- Netlify Blobs (key-value storage, built into Netlify)
- Netlify Functions (serverless API)
- Tailwind CSS + custom design system

## Design Tokens (match landing page exactly)
- Background: `#0a0a09`
- Accent: `#c8f000` (lime-yellow)
- Fonts: Bebas Neue (display), DM Sans (body), DM Mono (technical)

## Deploy to Netlify from GitHub

1. Push this repo to GitHub
2. In Netlify: **Add new site → Import from Git → pick this repo**
3. Build settings auto-detect from `netlify.toml` — just click Deploy
4. No environment variables needed (no auth yet)
5. Your app will be live at `your-site-name.netlify.app`

## Local development

```bash
npm install
npx netlify dev
```

Opens at `http://localhost:8888` with functions emulation.

## What works
- Garage dashboard with real vehicles from Netlify Blobs
- Add vehicle with photo, year/make dropdowns, optional VIN
- Vehicle detail page with hero photo, editable fields
- Photo replace button (uploads new photo, swaps hero)
- Build log: add/edit/delete entries
- Public share page at `/share/[id]` — no login required
- Delete vehicle (uses window.location to avoid layout crashes)

## What's intentionally missing (add later)
- Auth (was causing crashes — left out until env is set up safely)
- Multiple photos per vehicle (photo gallery)
- Owner-to-owner transfer
- AI valuation
- Payment tiers

## Structure

```
src/
  app/
    layout.tsx              - root layout, NO auth
    page.tsx                - intro page
    globals.css             - design system + animations
    app/
      layout.tsx            - passthrough, NEVER crashes
      page.tsx              - garage dashboard
      vehicles/new/         - add vehicle form
      vehicles/[id]/        - vehicle detail page
    share/[vehicleId]/      - public profile (no auth)
  lib/
    types.ts                - Vehicle, LogEntry interfaces
    api.ts                  - fetch helpers
  components/ui/            - reusable UI (if needed)
netlify/
  functions/
    vehicles.mts            - list/create/delete
    vehicle.mts             - get/update single
    get-vehicle-public.mts  - public endpoint (no auth)
    upload-photo.mts        - photo upload to blobs
    get-photo.mts           - photo serving
```
