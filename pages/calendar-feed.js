// GET /feed/:manageToken.ics
//
// A subscribable calendar feed for the owner's own phone — this is how
// bookings show up automatically in the stock Calendar app on iPhone/Android
// (Google Calendar) without building a native app or going through Google's
// OAuth calendar API. Subscribe once, and it stays in sync going forward:
//
//   iPhone:  Settings app -> Calendar -> Accounts -> Add Account ->
//            Other -> Add Subscribed Calendar -> paste this URL.
//   Android: Google Calendar app -> Settings -> Add calendar ->
//            "From URL" -> paste this URL. (Or on desktop Google Calendar:
//            Other calendars -> "+" -> "From URL" -> paste -> syncs to
//            every device signed into that Google account, phone included.)
//
// This is a genuinely different mechanism than the calendar invite (.ics)
// attached to each confirmation email — that's a one-time "add this one
// event" file. This URL is a live feed: new/updated/removed appointments
// appear automatically on whatever cadence the phone's calendar app
// refreshes subscribed calendars (Apple/Google typically re-check every few
// hours, not instantly — there's no push notification for a plain ICS
// subscription, only for full OAuth calendar integrations).
//
// Includes pending_review requests too (clearly labeled) so the owner can
// see incoming requests on their phone calendar even before opening the
// dashboard or an email — confirmed ones show normally.
//
// Gated by the salon's manage_token, same trust model as the dashboard URL
// itself — treat this link as a secret.

import { getSettingsByManageToken, listUpcomingAppointments } from "../lib/db.js";
import { buildCalendarFeedIcs } from "../lib/ics.js";

export async function onRequestGet(context) {
  const { env, params } = context;
  const token = params.manageToken;

  const settings = await getSettingsByManageToken(env, token);
  if (!settings) {
    return new Response("Not found", { status: 404 });
  }

  const appointments = await listUpcomingAppointments(env);
  const events = appointments.map((a) => ({
    uid: `${a.manage_token}@nextchaptersalon.com`,
    summary:
      a.status === "pending_review"
        ? `PENDING REVIEW: ${a.service_name} — ${a.customer_name}`
        : `${a.service_name} — ${a.customer_name}`,
    description: [
      a.stylist_name ? `Stylist: ${a.stylist_name}` : null,
      a.customer_phone,
      a.customer_email,
      a.notes,
    ]
      .filter(Boolean)
      .join("\n"),
    startUtc: a.start_at,
    endUtc: a.end_at,
    organizerEmail: settings.notify_email,
  }));

  const ics = buildCalendarFeedIcs({ calendarName: `${settings.business_name} bookings`, events });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar;charset=UTF-8",
      "Cache-Control": "no-cache",
    },
  });
}
