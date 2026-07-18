# Next Chapter Salon

A full marketing site + booking system built for one client (Next Chapter
Salon — a book/library-themed boutique hair studio), built as a
self-contained module in this repo the same way `booking-system/` is: its
own `pages/`, `api/`, `lib/`, and D1 tables (prefixed `ncs_`), one mount
point into `worker/index.js`, liftable into its own Worker/repo later with
minimal changes.

## Why this isn't just `booking-system/` reused

The client's requirements are genuinely different from the general-purpose
booking module:

- **Every appointment needs manual accept/reject** — nothing auto-confirms,
  paid or free. `booking-system/` auto-confirms free bookings and
  payment-confirms paid ones; this salon's owner wants to personally review
  every request before it's real.
- **Overlapping bookings are allowed on purpose** — a color service has real
  stylist-free "downtime" (processing) where a quick haircut can be fit in
  around it. `booking-system/`'s core booking guarantee is *no two
  appointments can ever overlap*; this site inverts that on purpose and
  leans on the owner's judgment instead of a scheduling algorithm. See the
  comment block at the top of `schema.sql` and `lib/availability.js` for the
  full reasoning.
- **No payment integration (v1)** — collecting a deposit before a human has
  even reviewed the request seemed backwards for a curated, high-touch
  studio. `lib/payments/` from `booking-system/` is reusable if that
  changes later (see "What's not built yet" below).

Because the booking model is fundamentally different, this is a fork of the
*ideas* in `booking-system/` (timezone math, ICS generation, email sending,
the "private link is the credential" auth model) rather than a shared
dependency — each file explains where it diverges and why.

## How it's wired in

Every route lives under `/next-chapter-salon/*`. `worker/index.js`
delegates the whole prefix to `next-chapter-salon/router.js` in one place,
identical to how `booking-system/` is wired — see the
`routeNextChapterSalon` call in `fetch()`.

**Important — domain:** today this is only reachable at
`campbelldan.com/next-chapter-salon/...`. If the client wants their own
domain (e.g. `nextchaptersalon.com`), that needs a `[[routes]]` block added
to `wrangler.toml` (same pattern as the existing `campbelldan.com` entry)
plus DNS pointed at Cloudflare — a few-minute change once a domain is
purchased, not done yet since no domain was provided.

## One-time setup

1. **Create the tables** (same D1 database as the rest of the site):
   ```
   npm run d1:remote:salon
   ```
   (or `npm run d1:local:salon` for local dev, same pattern as
   `d1:local:booking`)
2. **Deploy**:
   ```
   npm run deploy
   ```
3. **Find the owner dashboard URL.** The schema seeds one settings row with
   a generated `manage_token`. The dashboard lives at:
   ```
   https://campbelldan.com/next-chapter-salon/dashboard/NCS-DCCDEA769DFD
   ```
   Treat that URL as a password — there's no login system, same trust model
   as every other private link in this repo. Everything (business info,
   hours, blocked dates, services, team, testimonials, gallery placeholders,
   pending requests, manual walk-in entries, client directory) is managed
   from there. **Change this token** if the salon owner should have a
   unique one rather than the one baked into `schema.sql` — there's no
   "rotate token" API yet, it'd need a direct D1 `UPDATE`.
4. **Real content.** The schema seeds placeholder copy (owner bio, stylist
   names, service prices, testimonials, gallery labels) so every page
   renders fully instead of empty — all of it is meant to be replaced from
   the dashboard before this goes live for real. The gallery renders an
   elegant "photo coming soon" tile for any item without a real `image_url`.

## Calendar sync ("plug into their phone calendar")

Two mechanisms, both plain `.ics`, no Google/Apple OAuth needed:

- Every confirmed appointment's email includes a single-event `.ics`
  attachment — tapping it in Gmail/Apple Mail/Outlook offers "Add to
  Calendar" on both iOS and Android.
- The dashboard's Settings tab shows a **subscribable feed URL**
  (`/next-chapter-salon/feed/<manage_token>.ics`) for the owner's own phone:
  - **iPhone:** Settings app → Calendar → Accounts → Add Account → Other →
    Add Subscribed Calendar → paste the URL.
  - **Android:** open Google Calendar on desktop → Other calendars "+" →
    From URL → paste the URL. It then syncs to the Google Calendar app on
    any phone signed into that account.

**This is one-way and not instant** — it's a read-only feed the phone's
calendar app re-fetches on its own schedule (typically every few hours for
Apple/Google, no push). It is *not* a two-way sync (nothing created on the
phone shows up in the dashboard), and it's not real-time. A true two-way,
instant sync would mean building against the Google Calendar API and Apple's
EventKit/CalDAV directly — a materially bigger integration (OAuth per
provider, webhook subscriptions, conflict resolution) that wasn't in scope
here. The pending-requests queue itself already updates within ~20 seconds
on the dashboard (it polls), and the owner also gets an email the instant a
request comes in — the phone calendar feed is a convenience on top of that,
not the primary way requests are surfaced.

## On "replacing Vagaro"

This covers Vagaro's core loop well: public booking page, manual
accept/reject, a real calendar with manual walk-in/phone-booking entry, a
lightweight client directory built automatically from booking history,
email confirmations/reminders/cancellations, and phone calendar sync. It
does **not** attempt several things Vagaro also does, which would each be
their own project:

- **Point of sale / checkout at the chair** (retail products, tips, split
  tender) — nothing here.
- **Payroll / commission tracking** — nothing here.
- **Marketing automation** (SMS campaigns, automated re-booking nudges,
  email marketing beyond transactional confirmations) — nothing here.
- **Online payment at booking / deposits** — deliberately deferred, see
  above; `booking-system/lib/payments/` is a reusable starting point.
- **True multi-stylist independent calendars** — `stylist_id` exists on
  every appointment and the dashboard lets you assign one, but availability
  is computed against the whole salon's hours, not per-stylist hours/off
  days. Fine for a small team sharing a schedule; would need real work for
  a bigger multi-chair studio with staggered schedules.
- **Client login / self-service account** — clients manage a single
  appointment via its private link (`/my-appointment/<token>`), not a full
  account with booking history, saved cards, etc.

Worth being upfront about that list rather than implying full parity.

## Known limitations

- No rate limiting on public endpoints (`create-appointment`, `contact`,
  `availability`).
- The single admin `manage_token` covers the whole dashboard — no
  per-staff logins or permission levels.
- Blocked dates are full-day only, same as `booking-system/`.
- The gallery/testimonials editors in the dashboard store an image URL you
  provide (e.g. from an R2 bucket, Cloudflare Images, or any hosted image)
  rather than handling file upload directly — no upload UI yet.
- Contact-form inquiries land in `ncs_contact_inquiries` and email the
  owner, but there's no dashboard view of past inquiries yet — currently
  only visible via a direct D1 query.
