// Minimal iCalendar (RFC 5545) generation — no dependency. Covers two uses:
// a single VEVENT attached to a confirmation email (opens "Add to calendar"
// in Apple Mail/Gmail/Outlook), and a multi-event VCALENDAR feed a business
// owner can subscribe to from their phone's calendar app so it stays synced
// automatically. Both avoid needing OAuth against Google/Apple's calendar
// APIs — a subscribed .ics URL is enough for one-way sync into any calendar app.

function toIcsDateUtc(isoString) {
  return new Date(isoString).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escapeIcsText(str) {
  return String(str || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// RFC 5545 requires lines folded at 75 octets, continuation lines start with
// a single space. Most modern calendar apps tolerate long lines, but folding
// keeps this spec-correct for stricter parsers.
function foldLine(line) {
  if (line.length <= 75) return line;
  let result = "";
  let rest = line;
  result += rest.slice(0, 75);
  rest = rest.slice(75);
  while (rest.length > 0) {
    result += "\r\n " + rest.slice(0, 74);
    rest = rest.slice(74);
  }
  return result;
}

function buildVEvent({ uid, summary, description, location, startUtc, endUtc, organizerEmail, status = "CONFIRMED" }) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toIcsDateUtc(new Date().toISOString())}`,
    `DTSTART:${toIcsDateUtc(startUtc)}`,
    `DTEND:${toIcsDateUtc(endUtc)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    description ? `DESCRIPTION:${escapeIcsText(description)}` : null,
    location ? `LOCATION:${escapeIcsText(location)}` : null,
    organizerEmail ? `ORGANIZER:mailto:${organizerEmail}` : null,
    `STATUS:${status}`,
    "END:VEVENT",
  ].filter(Boolean);
  return lines.map(foldLine).join("\r\n");
}

// A single-event .ics for a confirmation email attachment.
export function buildSingleEventIcs({ uid, summary, description, location, startUtc, endUtc, organizerEmail }) {
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//nextchaptersalon.com//booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    buildVEvent({ uid, summary, description, location, startUtc, endUtc, organizerEmail }),
    "END:VCALENDAR",
  ].join("\r\n");
  return body;
}

// A multi-event feed for "subscribe via URL" in Google/Apple/Outlook
// calendar apps — calendarName shows up as the subscribed calendar's title.
export function buildCalendarFeedIcs({ calendarName, events }) {
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//nextchaptersalon.com//booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    ...events.map((e) =>
      buildVEvent({
        uid: e.uid,
        summary: e.summary,
        description: e.description,
        location: e.location,
        startUtc: e.startUtc,
        endUtc: e.endUtc,
        organizerEmail: e.organizerEmail,
      })
    ),
    "END:VCALENDAR",
  ].join("\r\n");
  return body;
}
