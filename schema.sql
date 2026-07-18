-- Next Chapter Salon — D1 schema.
--
-- Single-business site (not multi-tenant like booking-system/), so there's
-- one settings row rather than a table of calendars. Tables are prefixed
-- ncs_ to coexist safely in the same campbelldan-orders D1 database
-- alongside the unrelated bk_ (booking-system) and other tables already
-- there — no shared foreign keys, just a shared physical database.
--
-- Booking model (deliberately different from booking-system/'s):
--   - EVERY appointment request lands as 'pending_review', paid or free.
--     The owner accepts or declines by hand — see next-chapter-salon/README.md
--     for why (client explicitly wants manual control + wants to allow
--     intentional overlapping bookings to work "downtime" gaps, e.g. a
--     color's processing time). Because a human reviews every request, the
--     database does NOT enforce a no-overlap constraint the way
--     booking-system/schema.sql's atomic INSERT...WHERE NOT EXISTS does —
--     overlaps are allowed to be *requested*; the owner's dashboard flags
--     them visually so the human can judge whether it's a real conflict or
--     a legitimate double-booking (e.g. dye processing + a quick men's cut).
--   - No payment/Stripe integration in this version — v1 scope is the
--     accept/reject workflow and the marketing site. The payments layer in
--     booking-system/lib/payments/ is reusable later if a deposit-at-booking
--     flow gets added.

CREATE TABLE IF NOT EXISTS ncs_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),   -- single row, enforced
  business_name TEXT NOT NULL DEFAULT 'Next Chapter Salon',
  tagline TEXT NOT NULL DEFAULT 'Every Ending Is a Beautiful Beginning',
  notify_email TEXT NOT NULL,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  manage_token TEXT NOT NULL UNIQUE,   -- private-link credential for the owner dashboard, same trust model as booking-system
  admin_password_hash TEXT,   -- NULL until first /admin login (see lib/auth.js) -- friendlier front door in front of manage_token
  admin_password_salt TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ncs_availability_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  weekday INTEGER NOT NULL,   -- 0=Sunday .. 6=Saturday
  start TEXT NOT NULL,        -- "HH:MM" local time
  end TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ncs_blocked_dates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,   -- "YYYY-MM-DD"
  reason TEXT
);

CREATE TABLE IF NOT EXISTS ncs_stylists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  title TEXT,                  -- "Master Colorist", "Owner & Lead Stylist", etc.
  bio TEXT,
  photo_url TEXT,               -- NULL -> render an elegant placeholder tile
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ncs_service_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ncs_services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES ncs_service_categories(id),
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60,   -- full client-facing duration, shown to customers
  price_cents INTEGER NOT NULL DEFAULT 0,
  price_is_from INTEGER NOT NULL DEFAULT 0,        -- 1 -> display as "From $85" (hair pricing commonly varies with length/thickness)
  has_downtime INTEGER NOT NULL DEFAULT 0,          -- 1 -> service has stylist-free processing time (surfaced to the owner as a scheduling hint, not enforced)
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ncs_appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER NOT NULL REFERENCES ncs_services(id),
  stylist_id INTEGER REFERENCES ncs_stylists(id),   -- NULL = "no preference"
  manage_token TEXT NOT NULL UNIQUE,   -- customer-facing token for self-service view/cancel
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  notes TEXT,
  start_at TEXT NOT NULL,   -- UTC ISO
  end_at TEXT NOT NULL,     -- UTC ISO
  status TEXT NOT NULL DEFAULT 'pending_review',   -- pending_review | confirmed | declined | canceled | completed
  decline_reason TEXT,
  decided_at TEXT,
  reminder_sent_at TEXT,   -- set once a 24h-ahead reminder email goes out, so the hourly cron doesn't resend
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ncs_appt_start ON ncs_appointments(start_at);
CREATE INDEX IF NOT EXISTS idx_ncs_appt_status ON ncs_appointments(status);

CREATE TABLE IF NOT EXISTS ncs_testimonials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_name TEXT NOT NULL,
  quote TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 5,
  service_name TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ncs_gallery_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,           -- e.g. "Balayage Transformation"
  category TEXT NOT NULL DEFAULT 'Color',
  image_url TEXT,                -- NULL -> render elegant placeholder tile until real photos are uploaded
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

-- Brute-force protection for /api/admin-login -- see lib/db.js's
-- countRecentFailedLogins()/recordFailedLogin(). Pruned periodically by the
-- hourly cron (lib/reminders.js) so this never grows unbounded.
CREATE TABLE IF NOT EXISTS ncs_login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ncs_login_attempts_ip_time ON ncs_login_attempts(ip, attempted_at);

CREATE TABLE IF NOT EXISTS ncs_contact_inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',   -- new | read | replied
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- Seed data — a real single settings row (manage_token below is a live
-- credential, treat it like a password) plus enough placeholder content
-- that every page renders fully instead of empty on first deploy. All of
-- this is meant to be edited from the owner dashboard once it's live.

INSERT OR IGNORE INTO ncs_settings (id, business_name, tagline, notify_email, phone, address_line1, address_line2, timezone, manage_token)
VALUES (
  1,
  'Next Chapter Salon',
  'Every Ending Is a Beautiful Beginning',
  'dantheanonymous@gmail.com',
  '(555) 555-0142',
  '214 Ashworth Lane',
  'Suite 3, Your City, ST 00000',
  'America/Chicago',
  'NCS-DCCDEA769DFD'
);

INSERT OR IGNORE INTO ncs_availability_rules (weekday, start, end) VALUES
  (2, '10:00', '19:00'),  -- Tue
  (3, '10:00', '19:00'),  -- Wed
  (4, '10:00', '19:00'),  -- Thu
  (5, '10:00', '19:00'),  -- Fri
  (6, '09:00', '17:00');  -- Sat

INSERT OR IGNORE INTO ncs_service_categories (id, name, sort_order) VALUES
  (1, 'Color', 1),
  (2, 'Cuts & Styling', 2),
  (3, 'Treatments', 3),
  (4, 'Extensions', 4),
  (5, 'Bridal & Occasion', 5);

INSERT OR IGNORE INTO ncs_services (category_id, name, description, duration_minutes, price_cents, price_is_from, has_downtime, sort_order) VALUES
  (1, 'Signature Balayage', 'Hand-painted, dimensional color finished with a gloss and blowout. Includes processing time.', 150, 22500, 1, 1, 1),
  (1, 'All-Over Color', 'Single-process root-to-end color for full, even coverage.', 90, 12500, 1, 1, 2),
  (1, 'Root Touch-Up', 'Refresh your regrowth between full color appointments.', 75, 9500, 1, 1, 3),
  (1, 'Color Correction', 'A consultation-first service for complex color repair.', 180, 30000, 1, 1, 4),
  (2, 'Signature Haircut & Style', 'Precision cut, tailored consultation, finished with a full style.', 60, 8500, 1, 0, 1),
  (2, 'Express Cut', 'A quick, precise trim for the client on the go.', 30, 5500, 1, 0, 2),
  (2, 'Blowout & Style', 'A polished finish for any occasion.', 45, 6500, 1, 0, 3),
  (3, 'Deep Conditioning Ritual', 'Restorative treatment for dry or color-treated hair.', 45, 6000, 1, 0, 1),
  (3, 'Scalp Treatment', 'A relaxing, therapeutic scalp treatment to promote healthy growth.', 40, 5500, 1, 0, 2),
  (4, 'Tape-In Extensions (Full)', 'Full application consultation, includes custom color match.', 180, 45000, 1, 0, 1),
  (5, 'Bridal Trial', 'A full run-through of your wedding-day hair, one-on-one.', 90, 15000, 1, 0, 1),
  (5, 'Wedding Day Styling', 'On-site or in-studio styling for your big day.', 120, 25000, 1, 0, 2);

INSERT OR IGNORE INTO ncs_stylists (id, name, title, bio, sort_order) VALUES
  (1, 'Owner Name', 'Founder & Master Stylist', 'With over a decade behind the chair, our founder built Next Chapter Salon around a simple idea: every appointment should feel like the start of something good. Replace this bio from the owner dashboard.', 1),
  (2, 'Stylist Name', 'Colorist', 'Placeholder bio — add each stylist''s specialty, training, and personality from the dashboard once your team is set up.', 2);

INSERT OR IGNORE INTO ncs_testimonials (id, client_name, quote, rating, service_name, sort_order) VALUES
  (1, 'A. Whitfield', 'Walking in felt like stepping into a novel — walking out, I felt like the main character. Best color I''ve ever had.', 5, 'Signature Balayage', 1),
  (2, 'M. Torres', 'They actually listen. My cut has never grown out this well before.', 5, 'Signature Haircut & Style', 2),
  (3, 'R. Chen', 'Worth every minute of the drive. The whole experience feels genuinely luxurious, not just the price tag.', 5, 'Color Correction', 3);

INSERT OR IGNORE INTO ncs_gallery_items (id, label, category, sort_order) VALUES
  (1, 'Balayage Transformation', 'Color', 1),
  (2, 'Studio Interior', 'Studio', 2),
  (3, 'Bridal Updo', 'Occasion', 3),
  (4, 'Root Melt', 'Color', 4),
  (5, 'Precision Bob', 'Cuts', 5),
  (6, 'Editorial Waves', 'Styling', 6);
