// Timezone-aware slot computation — the zone-conversion math here is
// identical to booking-system/lib/availability.js (Intl.DateTimeFormat is
// the only reliable cross-DST tool available in a Worker, no date library),
// copied rather than imported so this folder stays self-contained and can
// be lifted out on its own later, same reasoning booking-system used for
// not importing from functions/_lib.
//
// generateAvailableSlots() itself is intentionally different: booking-system
// EXCLUDES any slot that conflicts with an existing appointment (hard
// no-overlap booking). This salon's owner explicitly wants the opposite —
// every request (paid or free) goes to a manual pending_review queue, and
// the owner decides whether an overlap is fine (e.g. a haircut during a
// color's processing time) or not. So instead of filtering slots out, this
// returns every slot inside business hours and annotates each one with how
// many existing appointments it overlaps, so the public booking page can
// show a soft "X other bookings near this time" hint without blocking
// anything, and the owner's dashboard can flag true conflicts for review.

function getTimeZoneOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - date.getTime();
}

export function zonedTimeToUtc(dateStr, timeStr, timeZone) {
  const naiveUtc = new Date(`${dateStr}T${timeStr}:00.000Z`);
  let offsetMs = getTimeZoneOffsetMs(naiveUtc, timeZone);
  let result = new Date(naiveUtc.getTime() - offsetMs);
  offsetMs = getTimeZoneOffsetMs(result, timeZone);
  result = new Date(naiveUtc.getTime() - offsetMs);
  return result;
}

export function utcToZonedParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const parts = dtf.formatToParts(date).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    weekday: weekdayMap[parts.weekday],
  };
}

export function addDaysToDateStr(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function weekdayOfDateStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

// Returns { slotsByDate: { "YYYY-MM-DD": [{ startAt, overlapCount }] } }.
// overlapCount is informational only — nothing here refuses a slot.
export function generateSlotsWithOverlapInfo({
  timezone,
  durationMinutes,
  rules,
  blockedDates,
  existingAppointments,
  fromDate,
  toDate,
  stepMinutes = 15,
  now = new Date(),
}) {
  const blockedSet = new Set(blockedDates.map((b) => b.date));
  const existing = existingAppointments.map((a) => ({
    startMs: new Date(a.start_at).getTime(),
    endMs: new Date(a.end_at).getTime(),
  }));
  const durationMs = durationMinutes * 60000;
  const stepMs = stepMinutes * 60000;
  const nowMs = now.getTime();

  const slotsByDate = {};
  let cursorDate = fromDate;
  let guard = 0;
  while (cursorDate <= toDate && guard < 400) {
    guard++;
    if (!blockedSet.has(cursorDate)) {
      const weekday = weekdayOfDateStr(cursorDate);
      const dayRules = rules.filter((r) => r.weekday === weekday);
      for (const rule of dayRules) {
        const windowStart = zonedTimeToUtc(cursorDate, rule.start, timezone).getTime();
        const windowEnd = zonedTimeToUtc(cursorDate, rule.end, timezone).getTime();
        let slotStart = windowStart;
        while (slotStart + durationMs <= windowEnd) {
          const slotEnd = slotStart + durationMs;
          if (slotStart > nowMs) {
            const overlapCount = existing.filter((e) => overlaps(slotStart, slotEnd, e.startMs, e.endMs)).length;
            if (!slotsByDate[cursorDate]) slotsByDate[cursorDate] = [];
            slotsByDate[cursorDate].push({
              startAt: new Date(slotStart).toISOString(),
              overlapCount,
            });
          }
          slotStart += stepMs;
        }
      }
    }
    cursorDate = addDaysToDateStr(cursorDate, 1);
  }

  return slotsByDate;
}
