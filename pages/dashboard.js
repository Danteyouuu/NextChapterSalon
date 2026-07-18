// GET /dashboard/:manageToken
//
// Owner dashboard — no login system, the URL itself is the credential (same
// trust model as booking-system's manage page: keep this link secret).
// Polls /api/dashboard-data every 20s so new requests appear close to
// real-time without standing up WebSockets/Durable Objects for what's a
// single-owner tool.

import { renderHead, escapeHtml, escapeAttr, toScriptJson } from "../lib/layout.js";
import { getSettingsByManageToken } from "../lib/db.js";
import { getOrigin } from "../lib/http.js";
import { utcToZonedParts, addDaysToDateStr } from "../lib/availability.js";

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const token = params.manageToken;

  const settings = await getSettingsByManageToken(env, token);
  if (!settings) {
    return new Response("Not found", { status: 404 });
  }

  const origin = getOrigin(request, env);
  const feedUrl = `${origin}/feed/${settings.manage_token}.ics`;
  // webcal:// is the scheme phones actually recognize as "subscribe to this
  // calendar" -- tapping it hands off straight to the Calendar app's
  // subscribe/import flow instead of just opening the ICS as text in a
  // browser tab. Same URL, different scheme.
  const webcalUrl = feedUrl.replace(/^https?:\/\//, "webcal://");
  // One day earlier than the salon's actual "today" -- a pure UX floor for
  // the date picker (the real gate is server-side, in
  // api/manual-appointment.js, which has its own 1-day grace period for the
  // same reason: avoid the picker refusing to let the owner select "today"
  // over a timezone-configuration edge case between the salon's settings
  // and wherever the owner's device happens to think it is).
  const todayLocalDate = addDaysToDateStr(utcToZonedParts(new Date(), settings.timezone).date, -1);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
${renderHead({ title: "Owner Dashboard", path: "" })}
<style>
  body { padding-bottom: 80px; }
  .dash-header { border-bottom: 1px solid rgba(201,166,107,0.16); padding: 22px 0; }
  .dash-header__inner { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px; }
  .tabs { display:flex; gap:6px; overflow-x:auto; padding: 18px 0 0; border-bottom:1px solid rgba(201,166,107,0.12); }
  .tab-btn {
    padding:10px 18px; background:none; border:none; border-bottom:2px solid transparent;
    color:var(--cream-faint); font-family:var(--font-label); text-transform:uppercase; letter-spacing:0.08em;
    font-size:0.85rem; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:8px;
  }
  .tab-btn.active { color:var(--gold); border-bottom-color:var(--gold); }
  .tab-badge { background:var(--wine); color:var(--cream); border-radius:999px; font-size:0.7rem; padding:1px 7px; }
  .tab-panel { display:none; padding: 36px 0; }
  .tab-panel.active { display:block; }
  .req-card { border:1px solid rgba(201,166,107,0.22); border-radius:6px; padding:20px; margin-bottom:16px; background:var(--bg-panel-2); }
  .req-card.has-conflict { border-color: var(--wine-bright); }
  .req-row { display:flex; justify-content:space-between; gap:20px; flex-wrap:wrap; align-items:flex-start; }
  .row-list { border:1px solid rgba(201,166,107,0.15); border-radius:6px; overflow:hidden; }
  .row-list__item { display:flex; justify-content:space-between; gap:14px; padding:14px 18px; border-bottom:1px solid rgba(201,166,107,0.1); flex-wrap:wrap; align-items:center; }
  .row-list__item:last-child { border-bottom:none; }
  .mini-btn { padding:6px 14px; font-size:0.75rem; }
  .edit-row { display:grid; grid-template-columns: 2fr 1fr 1fr 1fr auto; gap:10px; align-items:center; margin-bottom:10px; }
  .edit-row input, .edit-row select { margin-bottom:0; }
  .edit-row--team { grid-template-columns: 1fr 1fr 2fr auto; }
  .edit-row--testimonial { grid-template-columns: 1fr 3fr 80px auto; }
  .edit-row--gallery { grid-template-columns: 1fr 1fr 2fr auto; }
  .edit-row .svcRemove, .edit-row .stRemove, .edit-row .tmRemove, .edit-row .glRemove { justify-self:end; }
  @media (max-width: 900px) { .edit-row { grid-template-columns: 1fr 1fr; } }
  .hours-row { display:grid; grid-template-columns: 120px 1fr 1fr auto; gap:10px; align-items:center; margin-bottom:10px; }
  .subtab-empty { color:var(--cream-faint); padding: 30px 0; text-align:center; }
  .feed-box { background: var(--bg-panel-2); border:1px solid var(--gold-dim); border-radius:6px; padding:16px; font-family:monospace; font-size:0.82rem; word-break:break-all; color:var(--gold-bright); }

  /* ---- Mobile: this is the primary way the owner will use the dashboard,
     so every multi-column editor row collapses to one field per line
     instead of cramming 3-5 inputs into a 375px-wide screen. The
     !important is intentional and scoped to this single breakpoint --
     these grid-template-columns values are also set inline/per-variant
     above, and this is the one rule that needs to always win at this
     width regardless of which variant it is. */
  @media (max-width: 640px) {
    .edit-row, .edit-row--team, .edit-row--testimonial, .edit-row--gallery, .hours-row {
      grid-template-columns: 1fr !important;
      gap: 8px;
      padding: 14px; background: var(--bg-panel-2); border:1px solid rgba(201,166,107,0.15); border-radius:6px; margin-bottom:12px;
    }
    .edit-row .svcRemove, .edit-row .stRemove, .edit-row .tmRemove, .edit-row .glRemove, .hrRemove {
      justify-self:stretch; margin-top:4px;
    }
    .dash-header__inner { gap:10px; }
    .dash-header__inner > div:last-child { width:100%; }
    .dash-header__inner > div:last-child a, .dash-header__inner > div:last-child button { flex:1; text-align:center; }
    .tabs { gap:2px; }
    .tab-btn { padding:9px 12px; font-size:0.78rem; }
    .req-row > div:last-child { width:100%; }
    .req-row > div:last-child button { flex:1; }
    .row-list__item { flex-direction:column; align-items:flex-start; }
    .row-list__item > div:last-child { text-align:left; margin-top:6px; }
    .cropper-box { width:100% !important; height:min(70vw,320px) !important; }
    .cropper-panel { padding:16px !important; }
  }

  /* ---- Photo upload + crop/zoom widget (see openImageCropper() below) ---- */
  .photo-field { display:flex; align-items:center; gap:12px; margin-bottom:16px; flex-wrap:wrap; }
  .photo-thumb { width:56px; height:56px; border-radius:6px; object-fit:cover; border:1px solid rgba(201,166,107,0.25); background:var(--bg-panel-2); flex-shrink:0; }
  .photo-thumb--empty { display:flex; align-items:center; justify-content:center; color:var(--cream-faint); font-size:0.7rem; text-align:center; }
  .cropper-overlay { position:fixed; inset:0; background:rgba(10,8,7,0.82); z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px; }
  .cropper-panel { background:var(--bg-panel); border:1px solid var(--gold-dim); border-radius:8px; padding:24px; max-width:480px; width:100%; }
  .cropper-box { width:320px; height:320px; max-width:100%; margin:0 auto; overflow:hidden; border-radius:6px; border:1px solid rgba(201,166,107,0.3); background:#000; position:relative; cursor:grab; touch-action:none; }
  .cropper-box:active { cursor:grabbing; }
  .cropper-box canvas { display:block; width:100%; height:100%; }
  .cropper-controls { display:flex; align-items:center; gap:10px; margin:16px 0; }
  .cropper-controls input[type="range"] { margin:0; width:100%; }
  .cropper-actions { display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end; }

  /* ---- Generic modal (reused for the walk-in form; the photo cropper
     above predates this and keeps its own near-identical classes rather
     than risk touching working drag/zoom code) ---- */
  .modal-overlay { position:fixed; inset:0; background:rgba(10,8,7,0.82); z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px; }
  .modal-panel { background:var(--bg-panel); border:1px solid var(--gold-dim); border-radius:8px; padding:28px; max-width:560px; width:100%; max-height:90vh; overflow-y:auto; }
  @media (max-width: 640px) { .modal-panel { padding:20px; max-height:94vh; } }

  /* ---- Drag-and-drop day calendar (Calendar tab) ---- */
  .cal-scroll { overflow-x:auto; margin-top:16px; border:1px solid rgba(201,166,107,0.15); border-radius:8px; }
  .cal-grid { display:flex; min-width:100%; width:max-content; }
  .cal-axis { flex:0 0 56px; position:relative; border-right:1px solid rgba(201,166,107,0.15); }
  .cal-axis__spacer { padding:10px 12px; font-size:0.78rem; visibility:hidden; border-bottom:1px solid transparent; }
  .cal-axis__label { position:absolute; right:8px; transform:translateY(-50%); font-size:0.72rem; color:var(--cream-faint); font-family:var(--font-label); letter-spacing:0.04em; }
  .cal-col { flex:0 0 220px; position:relative; border-right:1px solid rgba(201,166,107,0.1); background-image:repeating-linear-gradient(to bottom, rgba(201,166,107,0.08) 0, rgba(201,166,107,0.08) 1px, transparent 1px, transparent var(--cal-hour-px, 90px)); }
  .cal-col:last-child { border-right:none; }
  .cal-col__header { background:var(--bg-panel); border-bottom:1px solid rgba(201,166,107,0.2); padding:10px 12px; font-family:var(--font-label); text-transform:uppercase; letter-spacing:0.06em; font-size:0.78rem; color:var(--gold); text-align:center; }
  .cal-body-wrap { position:relative; }
  .cal-block {
    position:absolute; left:4px; right:4px; border-radius:6px; padding:6px 8px; overflow:hidden;
    font-size:0.78rem; line-height:1.3; cursor:grab; touch-action:none; box-shadow:0 2px 6px rgba(0,0,0,0.25);
    border:1.5px solid; user-select:none;
  }
  .cal-block:active { cursor:grabbing; }
  .cal-block.is-pending { border-style:dashed; opacity:0.88; }
  /* No transition here on purpose -- top/left/width are rewritten on every
     single pointermove during a drag, and animating those changes fights
     the live tracking (the block visibly lags/eases toward each new spot
     instead of following the pointer 1:1). Position updates during a drag
     need to be instant; only the drop-shadow/opacity are allowed to ease. */
  .cal-block.is-dragging { z-index:500; box-shadow:0 10px 26px rgba(0,0,0,0.5); opacity:0.96; transition:box-shadow 0.15s ease, opacity 0.15s ease; }
  .cal-block.is-delete-armed { background:rgba(224,64,64,0.35) !important; border-color:#e04040 !important; }
  .cal-block__title { font-weight:600; color:var(--cream); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .cal-block__time { color:rgba(255,255,255,0.85); font-size:0.7rem; }
  .cal-block__delete-hint { position:absolute; inset:0; display:none; align-items:center; justify-content:center; font-family:var(--font-label); text-transform:uppercase; letter-spacing:0.08em; font-size:0.72rem; color:#fff; background:rgba(224,64,64,0.55); border-radius:5px; }
  .cal-block.is-delete-armed .cal-block__delete-hint { display:flex; }
  /* Real hit target is taller than it looks (the visible grip is just a
     hint) -- negative margin extends it without affecting layout height. */
  .cal-resize { position:absolute; left:0; right:0; bottom:-6px; height:20px; cursor:ns-resize; display:flex; align-items:flex-end; justify-content:center; padding-bottom:3px; touch-action:none; }
  .cal-resize::after { content:''; width:28px; height:4px; border-radius:2px; background:rgba(255,255,255,0.55); }
  .cal-col--drop-target { background-color:rgba(201,166,107,0.07); }
  .cal-empty { padding:40px 20px; text-align:center; color:var(--cream-faint); }

  @media (max-width: 640px) {
    .cal-col { flex-basis:170px; }
    .cal-axis { flex-basis:44px; }
  }
</style>
</head>
<body>

<header class="dash-header">
  <div class="wrap dash-header__inner">
    <div>
      <span class="eyebrow" style="margin-bottom:2px;">Owner Dashboard</span>
      <h2 style="margin:0;">${escapeHtml(settings.business_name)}</h2>
    </div>
    <div style="display:flex;gap:10px;">
      <a class="btn btn--ghost btn--sm" href="/" target="_blank">View Live Site &rarr;</a>
      <button class="btn btn--ghost btn--sm" id="logoutBtn" type="button">Log Out</button>
    </div>
  </div>
  <div class="wrap tabs" id="tabs">
    <button class="tab-btn active" data-tab="requests">Requests <span class="tab-badge" id="pendingBadge" style="display:none;">0</span></button>
    <button class="tab-btn" data-tab="calendar">Calendar</button>
    <button class="tab-btn" data-tab="clients">Clients</button>
    <button class="tab-btn" data-tab="services">Services</button>
    <button class="tab-btn" data-tab="team">Team</button>
    <button class="tab-btn" data-tab="hours">Hours</button>
    <button class="tab-btn" data-tab="content">Content</button>
    <button class="tab-btn" data-tab="settings">Settings</button>
  </div>
</header>

<main class="wrap">

  <section class="tab-panel active" data-panel="requests">
    <h3>Pending Requests</h3>
    <p class="text-dim">Every booking waits here until you accept or decline it. Overlapping requests get flagged, not blocked, so you can decide whether it's a real conflict or a good downtime match.</p>
    <div id="pendingList"></div>
  </section>

  <section class="tab-panel" data-panel="calendar">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <button class="btn btn--ghost mini-btn" id="calPrevBtn" type="button" aria-label="Previous day">&larr;</button>
        <button class="btn btn--ghost mini-btn" id="calTodayBtn" type="button">Today</button>
        <button class="btn btn--ghost mini-btn" id="calNextBtn" type="button" aria-label="Next day">&rarr;</button>
        <h3 style="margin:0 0 0 6px;" id="calDateLabel"></h3>
      </div>
      <button class="btn btn--gold btn--sm" id="openManualBtn">+ Add Walk-in / Phone Booking</button>
    </div>
    <p class="text-dim" style="font-size:0.85rem;margin-top:8px;">Drag an appointment to move it to a new time or stylist. Drag the bottom edge to change its length. Dashed blocks are still pending review.</p>
    <div class="cal-scroll"><div class="cal-grid" id="calGrid"></div></div>

    <div class="modal-overlay" id="manualModal" style="display:none;">
      <div class="modal-panel" id="manualForm">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
          <h4 style="margin:0;">New Manual Appointment</h4>
          <button class="btn btn--ghost mini-btn" id="manualCloseX" type="button" aria-label="Close">&times;</button>
        </div>
        <p class="text-dim" style="font-size:0.88rem;">Confirmed immediately. No review needed since you're entering it yourself.</p>
        <div class="field-row">
          <div><label>Service</label><select id="manualService"></select></div>
          <div><label>Stylist</label><select id="manualStylist"><option value="">No preference</option></select></div>
        </div>
        <div class="field-row">
          <div><label>Date</label><input id="manualDate" type="date" min="${todayLocalDate}"></div>
          <div><label>Time</label><input id="manualTime" type="time"></div>
        </div>
        <label>Client Name</label>
        <input id="manualName" placeholder="Walk-in">
        <div class="field-row">
          <div><label>Email (optional)</label><input id="manualEmail" type="email"></div>
          <div><label>Phone (optional)</label><input id="manualPhone"></div>
        </div>
        <label>Notes</label>
        <textarea id="manualNotes"></textarea>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn--gold" id="saveManualBtn">Add to Calendar</button>
          <button class="btn btn--ghost" id="cancelManualBtn">Cancel</button>
        </div>
        <p id="manualMsg" style="margin-top:10px;font-size:0.9rem;"></p>
      </div>
    </div>
  </section>

  <section class="tab-panel" data-panel="clients">
    <h3>Client Directory</h3>
    <p class="text-dim">Built automatically from booking history, no separate data entry needed.</p>
    <div id="clientsList"></div>
  </section>

  <section class="tab-panel" data-panel="services">
    <h3>Services</h3>
    <p class="text-dim">Duration is the full client-facing time. Mark "has downtime" for services like color where you're free during processing. It's shown to clients as a hint, not enforced.</p>
    <div id="servicesEditor"></div>
    <button class="btn btn--ghost btn--sm" id="addServiceBtn" style="margin-top:10px;">+ Add Service</button>
    <div style="margin-top:24px;"><button class="btn btn--gold" id="saveServicesBtn">Save Services</button> <span id="servicesMsg"></span></div>
  </section>

  <section class="tab-panel" data-panel="team">
    <h3>Team</h3>
    <div id="teamEditor"></div>
    <button class="btn btn--ghost btn--sm" id="addStylistBtn" style="margin-top:10px;">+ Add Stylist</button>
    <div style="margin-top:24px;"><button class="btn btn--gold" id="saveTeamBtn">Save Team</button> <span id="teamMsg"></span></div>
  </section>

  <section class="tab-panel" data-panel="hours">
    <h3>Business Hours</h3>
    <div id="hoursEditor"></div>
    <button class="btn btn--ghost btn--sm" id="addHoursBtn" style="margin-top:10px;">+ Add Hours Block</button>
    <h3 style="margin-top:36px;">Blocked Dates</h3>
    <div id="blockedEditor"></div>
    <div class="field-row" style="margin-top:10px;">
      <input id="newBlockedDate" type="date">
      <input id="newBlockedReason" placeholder="Reason (optional)">
    </div>
    <button class="btn btn--ghost btn--sm" id="addBlockedBtn">+ Block This Date</button>
    <div style="margin-top:24px;"><button class="btn btn--gold" id="saveHoursBtn">Save Hours &amp; Blocked Dates</button> <span id="hoursMsg"></span></div>
  </section>

  <section class="tab-panel" data-panel="content">
    <h3>Testimonials</h3>
    <div id="testimonialsEditor"></div>
    <button class="btn btn--ghost btn--sm" id="addTestimonialBtn" style="margin-top:10px;">+ Add Testimonial</button>

    <h3 style="margin-top:36px;">Gallery</h3>
    <p class="text-dim" style="font-size:0.88rem;">Add an image URL once you have real photography hosted somewhere. Leave blank to keep the placeholder tile.</p>
    <div id="galleryEditor"></div>
    <button class="btn btn--ghost btn--sm" id="addGalleryBtn" style="margin-top:10px;">+ Add Gallery Item</button>

    <div style="margin-top:24px;"><button class="btn btn--gold" id="saveContentBtn">Save Content</button> <span id="contentMsg"></span></div>
  </section>

  <section class="tab-panel" data-panel="settings">
    <h3>Business Info</h3>
    <label>Business Name</label><input id="setBusinessName">
    <label>Tagline</label><input id="setTagline">
    <label>Notify Email (where booking requests are sent)</label><input id="setNotifyEmail" type="email">
    <div class="field-row">
      <div><label>Phone</label><input id="setPhone"></div>
      <div><label>Timezone</label><input id="setTimezone" placeholder="America/Chicago"></div>
    </div>
    <label>Address Line 1</label><input id="setAddress1">
    <label>Address Line 2</label><input id="setAddress2">
    <button class="btn btn--gold" id="saveSettingsBtn">Save Business Info</button> <span id="settingsMsg"></span>

    <h3 style="margin-top:44px;">Sync to Your Phone Calendar</h3>
    <p class="text-dim">Tap the button below on your phone and every confirmed (and pending) appointment will show up in your regular calendar app going forward. It refreshes automatically every few hours. This is a one-way sync (salon &rarr; phone), not a two-way connection.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:16px 0;">
      <a class="btn btn--gold btn--sm" href="${escapeAttr(webcalUrl)}" id="calSubscribeBtn">Add to Calendar</a>
      <a class="btn btn--ghost btn--sm" href="${escapeAttr(feedUrl)}" download="next-chapter-salon.ics" id="calDownloadBtn">Download .ics File</a>
    </div>
    <p class="text-dim" style="font-size:0.85rem;">Tapping "Add to Calendar" opens your phone's Calendar app directly and subscribes for you. That's the one-tap option and what most iPhones expect. If it doesn't open anything (some Android browsers ignore the link type), use "Download .ics File" instead, or copy the link below and paste it into your calendar app's "Subscribe by URL" / "From URL" option.</p>
    <div class="feed-box">${escapeHtml(feedUrl)}</div>
  </section>

</main>

<script src="/assets/shared.js"></script>
<script>
  var MANAGE_TOKEN = ${toScriptJson(token)};
  var DATA = null;

  // ---- Log out (only meaningful if this session was reached via /admin's
  // cookie login; if you're on /dashboard/:manageToken directly there's no
  // cookie to clear, so this just harmlessly sends you to /admin) ----
  var logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      fetch('/api/admin-logout', { method: 'POST' }).finally(function () {
        window.location.href = '/admin';
      });
    });
  }

  // ---- Tabs ----
  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      document.querySelector('.tab-panel[data-panel="' + btn.dataset.tab + '"]').classList.add('active');
    });
  });

  function fmtDay(dateStr) {
    var d = new Date(dateStr + 'T12:00:00Z');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  function fmtDateTime(iso, tz) {
    var d = new Date(iso);
    return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz || 'America/Chicago' });
  }

  // ---- Data load + poll ----
  function loadData() {
    return fetch('/api/dashboard-data?manageToken=' + encodeURIComponent(MANAGE_TOKEN))
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.ok) { document.body.innerHTML = '<p style="padding:60px;color:#e08aa0;">' + (res.error || 'Could not load dashboard.') + '</p>'; return; }
        DATA = res;
        renderPending();
        renderCalendar();
        renderClients();
      });
  }

  function renderPending() {
    var badge = document.getElementById('pendingBadge');
    var list = document.getElementById('pendingList');
    var pending = DATA.pending || [];
    if (pending.length) { badge.style.display = 'inline-block'; badge.textContent = pending.length; }
    else { badge.style.display = 'none'; }

    if (!pending.length) { list.innerHTML = '<p class="subtab-empty">No pending requests right now.</p>'; return; }

    list.innerHTML = pending.map(function (p) {
      var conflictNote = p.conflictCount > 0
        ? '<div class="pill pill--conflict" style="margin-top:8px;">Overlaps ' + p.conflictCount + ' other booking' + (p.conflictCount > 1 ? 's' : '') + '</div>'
        : (p.has_downtime ? '<div class="pill pill--pending" style="margin-top:8px;">Has downtime, good candidate to double-book</div>' : '');
      return '<div class="req-card' + (p.conflictCount > 0 ? ' has-conflict' : '') + '">' +
        '<div class="req-row">' +
          '<div>' +
            '<strong>' + escapeHtml(p.service_name) + '</strong> &mdash; ' + escapeHtml(p.customer_name) + '<br>' +
            '<span class="text-dim">' + fmtDateTime(p.start_at, DATA.settings.timezone) + (p.stylist_name ? ' &middot; ' + escapeHtml(p.stylist_name) : '') + '</span><br>' +
            '<span class="text-dim" style="font-size:0.85rem;">' + escapeHtml(p.customer_email) + (p.customer_phone ? ' &middot; ' + escapeHtml(p.customer_phone) : '') + '</span>' +
            (p.notes ? '<p class="text-dim" style="margin-top:8px;font-style:italic;">"' + escapeHtml(p.notes) + '"</p>' : '') +
            conflictNote +
          '</div>' +
          '<div style="display:flex;gap:8px;flex-shrink:0;">' +
            '<button class="btn btn--gold mini-btn" data-accept="' + p.id + '">Accept</button>' +
            '<button class="btn btn--ghost mini-btn" data-decline="' + p.id + '">Decline</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    list.querySelectorAll('[data-accept]').forEach(function (btn) {
      btn.onclick = function () { respondToRequest(Number(btn.dataset.accept), 'accept'); };
    });
    list.querySelectorAll('[data-decline]').forEach(function (btn) {
      btn.onclick = function () {
        var reason = prompt('Optional note to the client about why (leave blank to skip):') || '';
        respondToRequest(Number(btn.dataset.decline), 'decline', reason);
      };
    });
  }

  function respondToRequest(id, action, reason) {
    fetch('/api/' + (action === 'accept' ? 'accept-appointment' : 'decline-appointment'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manageToken: MANAGE_TOKEN, appointmentId: id, reason: reason }),
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (!res.ok) { alert(res.error || 'Something went wrong.'); return; }
      loadData();
    });
  }

  // ---- Calendar tab: drag-and-drop day scheduler ----
  // Design notes:
  // - One column per active stylist (plus an "Unassigned" column if any
  //   appointment that day has no stylist), a day at a time -- prev/next/
  //   today to navigate. Dragging is scoped to the visible day; to move an
  //   appointment to a different day, navigate there first.
  // - Blocks are colored on a green->red gradient by duration (short =
  //   green, long = red), and that color is recomputed live while resizing
  //   so stretching a block out visibly shifts it toward red as it asked.
  // - Move/resize math works entirely in minute-deltas from the block's
  //   already-correct rendered position, applied to the original UTC
  //   timestamp -- this sidesteps needing a local-time-to-UTC converter in
  //   the browser (see api/reschedule-appointment.js for the equivalent
  //   server-side reasoning).
  var CAL_PX_PER_MIN = 1.5;
  var CAL_SNAP_MIN = 15;
  var calDate = null; // "YYYY-MM-DD", in the salon's own timezone
  var calDragState = null;

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function todayInTz(tz) { return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()); }
  function addDaysToDateStr(dateStr, n) {
    var parts = dateStr.split('-').map(Number);
    var d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    d.setUTCDate(d.getUTCDate() + n);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }
  function localDateStrOf(iso, tz) { return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso)); }
  function localMinutesOfDay(iso, tz) {
    var parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
    var h = 0, m = 0;
    parts.forEach(function (p) { if (p.type === 'hour') h = Number(p.value); if (p.type === 'minute') m = Number(p.value); });
    return h * 60 + m;
  }
  function hhmmToMin(hhmm) {
    var parts = String(hhmm).split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }
  // Green (short) -> amber -> red (long). 30 min or less is fully green, 90+
  // is fully red, everything between blends smoothly -- so a walk-in trim
  // and a long balayage never look alike, and dragging the edge to stretch
  // a block updates the color the same way in real time.
  function colorForDuration(minutes) {
    var t = Math.max(0, Math.min(1, (minutes - 30) / (90 - 30)));
    var hue = 130 - t * 130; // 130=green, 0=red
    return { border: 'hsl(' + hue + ',70%,50%)', fill: 'hsla(' + hue + ',70%,50%,0.22)' };
  }

  // Appointments that overlap in time (allowed on purpose, see
  // lib/availability.js) now render side by side within their column
  // instead of stacked exactly on top of each other. Standard day-view
  // layout: group appointments into clusters of mutually-overlapping time
  // (transitively -- A overlapping B and B overlapping C puts all three in
  // one cluster even if A and C don't directly overlap), then greedily
  // pack each cluster into the fewest lanes, reusing a lane as soon as
  // it's free. Returns { [appointmentId]: { index, total } }.
  function layoutLanes(appointments, tz) {
    var items = appointments.map(function (a) {
      var s = localMinutesOfDay(a.start_at, tz);
      var e = s + Math.max(5, Math.round((new Date(a.end_at) - new Date(a.start_at)) / 60000));
      return { a: a, s: s, e: e };
    }).sort(function (x, y) { return x.s - y.s || x.e - y.e; });

    var clusters = [];
    items.forEach(function (it) {
      var cluster = clusters.length ? clusters[clusters.length - 1] : null;
      if (cluster && it.s < cluster.end) {
        cluster.items.push(it);
        cluster.end = Math.max(cluster.end, it.e);
      } else {
        clusters.push({ items: [it], end: it.e });
      }
    });

    var layout = {};
    clusters.forEach(function (cluster) {
      var laneEnds = [];
      cluster.items.forEach(function (it) {
        var laneIdx = -1;
        for (var i = 0; i < laneEnds.length; i++) {
          if (laneEnds[i] <= it.s) { laneIdx = i; break; }
        }
        if (laneIdx === -1) { laneIdx = laneEnds.length; laneEnds.push(0); }
        laneEnds[laneIdx] = it.e;
        layout[it.a.id] = { index: laneIdx };
      });
      cluster.items.forEach(function (it) { layout[it.a.id].total = laneEnds.length; });
    });
    return layout;
  }

  function renderCalendarLabel() {
    var tz = (DATA.settings && DATA.settings.timezone) || 'America/Chicago';
    var isToday = calDate === todayInTz(tz);
    document.getElementById('calDateLabel').textContent = fmtDay(calDate) + (isToday ? ' (Today)' : '');
  }

  function renderCalendar() {
    if (!calDate) calDate = todayInTz((DATA.settings && DATA.settings.timezone) || 'America/Chicago');
    renderCalendarLabel();

    var tz = (DATA.settings && DATA.settings.timezone) || 'America/Chicago';
    var grid = document.getElementById('calGrid');
    var dayAppts = (DATA.upcoming || []).filter(function (a) {
      return (a.status === 'confirmed' || a.status === 'pending_review') && localDateStrOf(a.start_at, tz) === calDate;
    });

    var activeStylists = (DATA.stylists || []).filter(function (s) { return s.active; });
    var columns = activeStylists.map(function (s) { return { id: s.id, name: s.name }; });
    var hasUnassigned = dayAppts.some(function (a) { return !a.stylist_id || !activeStylists.some(function (s) { return s.id === a.stylist_id; }); });
    if (hasUnassigned || !columns.length) columns.push({ id: null, name: columns.length ? 'Unassigned' : 'All Appointments' });

    // Window: business hours for this weekday, expanded to fit anything
    // scheduled outside them so nothing is ever clipped from view.
    var weekday = new Date(calDate + 'T12:00:00Z').getUTCDay();
    var rules = (DATA.rules || []).filter(function (r) { return r.weekday === weekday; });
    var startMin = rules.length ? Math.min.apply(null, rules.map(function (r) { return hhmmToMin(r.start); })) : 8 * 60;
    var endMin = rules.length ? Math.max.apply(null, rules.map(function (r) { return hhmmToMin(r.end); })) : 20 * 60;
    dayAppts.forEach(function (a) {
      var s = localMinutesOfDay(a.start_at, tz), e = localMinutesOfDay(a.end_at, tz);
      if (e <= s) e = s + 15; // guard against an appointment that wraps past midnight in this simple day view
      if (s < startMin) startMin = s;
      if (e > endMin) endMin = e;
    });
    startMin = Math.floor(startMin / 60) * 60;
    endMin = Math.ceil(endMin / 60) * 60;
    var totalMin = Math.max(60, endMin - startMin);
    var bodyHeight = totalMin * CAL_PX_PER_MIN;

    if (!dayAppts.length && !columns.length) { grid.innerHTML = '<div class="cal-empty">No stylists or appointments to show.</div>'; return; }

    var axisHtml = '<div class="cal-axis" style="height:' + (bodyHeight + 40) + 'px;"><div class="cal-axis__spacer">&nbsp;</div>';
    for (var m = startMin; m <= endMin; m += 60) {
      axisHtml += '<span class="cal-axis__label" style="top:' + (40 + (m - startMin) * CAL_PX_PER_MIN) + 'px;">' + fmtHourLabel(m) + '</span>';
    }
    axisHtml += '</div>';

    var colsHtml = columns.map(function (col) {
      var colAppts = dayAppts.filter(function (a) {
        return col.id === null ? (!a.stylist_id || !activeStylists.some(function (s) { return s.id === a.stylist_id; })) : a.stylist_id === col.id;
      });
      var lanes = layoutLanes(colAppts, tz);

      var blocksHtml = colAppts.map(function (a) {
        var s = localMinutesOfDay(a.start_at, tz);
        var durMin = Math.max(5, Math.round((new Date(a.end_at) - new Date(a.start_at)) / 60000));
        var top = (s - startMin) * CAL_PX_PER_MIN;
        var height = Math.max(18, durMin * CAL_PX_PER_MIN);
        var color = colorForDuration(durMin);
        var timeLabel = new Date(a.start_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
        var lane = lanes[a.id] || { index: 0, total: 1 };
        var laneWidthPct = 100 / lane.total;
        var posStyle = lane.total > 1
          ? 'left:calc(' + (lane.index * laneWidthPct) + '% + 3px);right:auto;width:calc(' + laneWidthPct + '% - 6px);'
          : '';
        return '<div class="cal-block' + (a.status === 'pending_review' ? ' is-pending' : '') + '" data-id="' + a.id +
          '" data-start="' + a.start_at + '" data-end="' + a.end_at + '" data-stylist="' + (a.stylist_id || '') +
          '" style="top:' + top + 'px;height:' + height + 'px;background:' + color.fill + ';border-color:' + color.border + ';' + posStyle + '">' +
          '<div class="cal-block__title">' + escapeHtml(a.customer_name) + '</div>' +
          '<div class="cal-block__time">' + timeLabel + ' &middot; ' + escapeHtml(a.service_name) + '</div>' +
          '<div class="cal-block__delete-hint">Release to Delete</div>' +
          '<div class="cal-resize"></div>' +
        '</div>';
      }).join('');
      return '<div class="cal-col" style="--cal-hour-px:' + (60 * CAL_PX_PER_MIN) + 'px;">' +
        '<div class="cal-col__header">' + escapeHtml(col.name) + '</div>' +
        '<div class="cal-body-wrap" style="height:' + bodyHeight + 'px;" data-col-id="' + (col.id === null ? '' : col.id) + '">' + blocksHtml + '</div>' +
      '</div>';
    }).join('');

    grid.innerHTML = axisHtml + colsHtml;
    bindCalendarDrag(startMin, columns);
  }

  function fmtHourLabel(minutes) {
    var h = Math.floor(minutes / 60), suffix = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + (minutes % 60 ? ':' + pad2(minutes % 60) : '') + suffix;
  }

  // Drag design notes (rewritten after the first version turned out fragile
  // in practice):
  // - Listeners for move/up live on the document, not on the block itself.
  //   The original version used setPointerCapture() on the block and
  //   reparented it between columns mid-drag (appendChild into whichever
  //   column the pointer was over) -- reparenting an element that holds
  //   pointer capture isn't reliably preserved across browsers, which is
  //   very likely why dragging felt broken/unresponsive. Document-level
  //   listeners don't care what the target element is doing.
  // - The dragged block switches to position:fixed and is moved to be a
  //   direct child of <body> for the duration of the drag, then the whole
  //   calendar is re-rendered from fresh data on drop (success or
  //   failure/cancel) rather than trying to patch the DOM back together --
  //   simpler and can't end up in a half-moved state.
  // - It visually snaps to whichever column is under the pointer and to
  //   the nearest 15-minute line as you drag, rather than free-following
  //   the cursor -- clearer feedback about where it'll actually land.
  // - A small movement threshold before "engaging" the drag means an
  //   ordinary click doesn't fire a pointless zero-delta reschedule call.
  // - Dragging predominantly right past a threshold arms delete instead of
  //   move; releasing there asks for confirmation.
  var DRAG_ENGAGE_PX = 6;
  var DELETE_ARM_PX = 110;

  function bindCalendarDrag(startMin, columns) {
    document.querySelectorAll('.cal-block').forEach(function (block) {
      block.querySelector('.cal-resize').addEventListener('pointerdown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        startResize(block, e);
      });
      block.addEventListener('pointerdown', function (e) {
        if (e.target.closest('.cal-resize')) return;
        startMove(block, e);
      });
    });

    function startMove(block, downEvent) {
      var homeWrap = block.parentElement;
      var startRect = block.getBoundingClientRect();
      var grabOffsetX = downEvent.clientX - startRect.left;
      var grabOffsetY = downEvent.clientY - startRect.top;
      var startClientX = downEvent.clientX, startClientY = downEvent.clientY;
      var engaged = false;
      var lastColWrap = homeWrap;
      var lastSnappedTopMin = Math.round(parseFloat(block.style.top) / CAL_PX_PER_MIN);
      var homeTopMin = lastSnappedTopMin;
      var deleteArmed = false;

      function engage() {
        engaged = true;
        calDragState = { type: 'move' };
        block.classList.add('is-dragging');
        block.style.position = 'fixed';
        block.style.width = startRect.width + 'px';
        block.style.height = startRect.height + 'px';
        block.style.left = startRect.left + 'px';
        block.style.top = startRect.top + 'px';
        block.style.right = 'auto';
        document.body.appendChild(block);
      }

      function onMove(ev) {
        var dx = ev.clientX - startClientX, dy = ev.clientY - startClientY;
        if (!engaged) {
          if (Math.abs(dx) < DRAG_ENGAGE_PX && Math.abs(dy) < DRAG_ENGAGE_PX) return;
          engage();
        }

        deleteArmed = dx > DELETE_ARM_PX && dx > Math.abs(dy) * 1.4;
        block.classList.toggle('is-delete-armed', deleteArmed);

        document.querySelectorAll('.cal-col--drop-target').forEach(function (c) { c.classList.remove('cal-col--drop-target'); });

        if (deleteArmed) {
          // Follow the cursor loosely while armed to delete -- no column
          // snapping, it reads more like "drag it away" than "drag it here".
          block.style.left = (ev.clientX - grabOffsetX) + 'px';
          block.style.top = (ev.clientY - grabOffsetY) + 'px';
          return;
        }

        var targetWrap = homeWrap;
        document.querySelectorAll('.cal-body-wrap').forEach(function (w) {
          var r = w.getBoundingClientRect();
          if (ev.clientX >= r.left && ev.clientX <= r.right) targetWrap = w;
        });
        lastColWrap = targetWrap;
        targetWrap.closest('.cal-col').classList.add('cal-col--drop-target');

        var wrapRect = targetWrap.getBoundingClientRect();
        var rawTop = ev.clientY - grabOffsetY - wrapRect.top;
        var clampedTop = Math.max(0, Math.min(rawTop, wrapRect.height - startRect.height));

        // Visual position follows the pointer smoothly, pixel for pixel --
        // snapping the *visual* position to 15-minute increments on every
        // move event is what made this feel jumpy/wonky (the block hops
        // instead of gliding). The 15-minute snap is still applied, just
        // only to the underlying time value used once the drag ends, which
        // is the only place it actually needs to be exact.
        var snapMin = CAL_SNAP_MIN;
        lastSnappedTopMin = Math.round((clampedTop / CAL_PX_PER_MIN) / snapMin) * snapMin;

        block.style.left = wrapRect.left + 'px';
        block.style.width = wrapRect.width + 'px';
        block.style.top = (wrapRect.top + clampedTop) + 'px';
      }

      function onUp() {
        cleanup();
        if (!engaged) return; // plain click/tap -- nothing to do

        if (deleteArmed) {
          confirmDelete(block);
          return;
        }

        var shiftMin = lastSnappedTopMin - homeTopMin;
        var origStartMs = new Date(block.dataset.start).getTime();
        var origEndMs = new Date(block.dataset.end).getTime();
        var finalStartMs = origStartMs + shiftMin * 60000;
        var finalEndMs = finalStartMs + (origEndMs - origStartMs);
        var newColId = lastColWrap.dataset.colId;
        submitReschedule(block, new Date(finalStartMs).toISOString(), new Date(finalEndMs).toISOString(), newColId === '' ? null : Number(newColId));
      }

      function onCancel() { cleanup(); renderCalendar(); }

      function cleanup() {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onCancel);
        document.querySelectorAll('.cal-col--drop-target').forEach(function (c) { c.classList.remove('cal-col--drop-target'); });
        calDragState = null;
        // The block was reparented to <body> while floating (engage()) --
        // every code path from here on triggers a full renderCalendar()
        // (directly, or via loadData() after the server call resolves),
        // which only rebuilds #calGrid's contents. Without this, the
        // floating copy would be orphaned outside #calGrid and left
        // visible on screen as a stale duplicate after the real re-render.
        if (engaged && block.parentElement === document.body) block.parentElement.removeChild(block);
      }

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onCancel);
    }

    function startResize(block, downEvent) {
      var startHeight = block.getBoundingClientRect().height;
      var startClientY = downEvent.clientY;
      var engaged = false;

      function onMove(ev) {
        if (!engaged) {
          if (Math.abs(ev.clientY - startClientY) < DRAG_ENGAGE_PX) return;
          engaged = true;
          calDragState = { type: 'resize' };
          block.classList.add('is-dragging');
        }
        // Smooth 1:1 visual follow, same reasoning as the move drag above
        // -- only the final committed duration gets snapped to 15 minutes.
        var deltaY = ev.clientY - startClientY;
        var minHeight = CAL_SNAP_MIN * CAL_PX_PER_MIN;
        var newHeight = Math.max(minHeight, startHeight + deltaY);
        block.style.height = newHeight + 'px';
        var color = colorForDuration(Math.round(newHeight / CAL_PX_PER_MIN));
        block.style.background = color.fill;
        block.style.borderColor = color.border;
      }
      function onUp() {
        cleanup();
        if (!engaged) return;
        var rawDurationMin = parseFloat(block.style.height) / CAL_PX_PER_MIN;
        var newDurationMin = Math.max(CAL_SNAP_MIN, Math.round(rawDurationMin / CAL_SNAP_MIN) * CAL_SNAP_MIN);
        var origStartMs = new Date(block.dataset.start).getTime();
        var finalEndMs = origStartMs + newDurationMin * 60000;
        submitReschedule(block, new Date(origStartMs).toISOString(), new Date(finalEndMs).toISOString(), block.dataset.stylist ? Number(block.dataset.stylist) : null);
      }
      function onCancel() { cleanup(); renderCalendar(); }
      function cleanup() {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onCancel);
        calDragState = null;
      }
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onCancel);
    }
  }

  function confirmDelete(block) {
    var name = block.querySelector('.cal-block__title').textContent;
    if (window.confirm('Remove ' + name + '’s appointment? This can’t be undone from here.')) {
      fetch('/api/delete-appointment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manageToken: MANAGE_TOKEN, appointmentId: Number(block.dataset.id) }),
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (!res.ok) alert(res.error || "Couldn't delete that appointment.");
        loadData();
      }).catch(function () {
        alert("Couldn't delete that appointment. Please try again.");
        loadData();
      });
    } else {
      renderCalendar();
    }
  }

  function submitReschedule(block, startAt, endAt, stylistId) {
    fetch('/api/reschedule-appointment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manageToken: MANAGE_TOKEN, appointmentId: Number(block.dataset.id), startAt: startAt, endAt: endAt, stylistId: stylistId }),
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (!res.ok) { alert(res.error || "Couldn't reschedule that appointment."); }
      loadData();
    }).catch(function () {
      alert("Couldn't reschedule that appointment. Please try again.");
      loadData();
    });
  }

  document.getElementById('calPrevBtn').onclick = function () { calDate = addDaysToDateStr(calDate, -1); renderCalendar(); };
  document.getElementById('calNextBtn').onclick = function () { calDate = addDaysToDateStr(calDate, 1); renderCalendar(); };
  document.getElementById('calTodayBtn').onclick = function () { calDate = todayInTz((DATA.settings && DATA.settings.timezone) || 'America/Chicago'); renderCalendar(); };

  function renderClients() {
    var list = document.getElementById('clientsList');
    var clients = DATA.clients || [];
    if (!clients.length) { list.innerHTML = '<p class="subtab-empty">No clients yet.</p>'; return; }
    list.innerHTML = '<div class="row-list">' + clients.map(function (c) {
      return '<div class="row-list__item"><div><strong>' + escapeHtml(c.customer_name) + '</strong><br>' +
        '<span class="text-dim">' + escapeHtml(c.customer_email) + (c.customer_phone ? ' &middot; ' + escapeHtml(c.customer_phone) : '') + '</span></div>' +
        '<div style="text-align:right;"><span class="text-gold">' + c.visit_count + ' visit' + (c.visit_count > 1 ? 's' : '') + '</span><br>' +
        '<span class="text-dim" style="font-size:0.82rem;">Last: ' + fmtDateTime(c.last_visit, DATA.settings.timezone) + '</span></div></div>';
    }).join('') + '</div>';
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---- Photo upload + crop/zoom widget ----
  // Self-contained (no external cropper library -- keeps the CSP simple and
  // avoids a CDN dependency): picks a file, lets the owner drag to pan and
  // use a slider to zoom over a fixed-aspect viewport, then rasterizes the
  // visible crop to an output canvas and uploads that as the final image.
  // outputW/outputH set both the crop aspect ratio and the stored resolution.
  function openImageCropper(opts, onDone) {
    var outputW = opts.outputW || 800;
    var outputH = opts.outputH || 800;
    var boxAspect = outputW / outputH;

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png,image/jpeg,image/webp';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    fileInput.onchange = function () {
      var file = fileInput.files[0];
      document.body.removeChild(fileInput);
      if (!file) return;
      var img = new Image();
      img.onload = function () { showCropperModal(img); };
      img.onerror = function () { alert('Could not read that image file.'); };
      img.src = URL.createObjectURL(file);
    };
    fileInput.click();

    function showCropperModal(img) {
      var overlay = document.createElement('div');
      overlay.className = 'cropper-overlay';
      overlay.innerHTML =
        '<div class="cropper-panel">' +
          '<h4 style="margin-top:0;">Adjust Photo</h4>' +
          '<p class="text-dim" style="font-size:0.85rem;margin-top:-8px;">Drag to reposition, use the slider to zoom in or out.</p>' +
          '<div class="cropper-box"><canvas></canvas></div>' +
          '<div class="cropper-controls">' +
            '<span class="text-dim" style="font-size:0.8rem;">Zoom</span>' +
            '<input type="range" id="cropZoom" min="100" max="400" value="100">' +
          '</div>' +
          '<div class="cropper-actions">' +
            '<button class="btn btn--ghost btn--sm" id="cropCancel" type="button">Cancel</button>' +
            '<button class="btn btn--gold btn--sm" id="cropSave" type="button">Use Photo</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);

      var boxEl = overlay.querySelector('.cropper-box');
      var canvas = overlay.querySelector('canvas');
      var ctx = canvas.getContext('2d');
      var VIEW = 320; // logical viewport size in CSS px (box is styled to match, scales down responsively via CSS)
      canvas.width = VIEW;
      canvas.height = VIEW / boxAspect;
      boxEl.style.height = (VIEW / boxAspect) + 'px';

      // Base scale: smallest zoom that still fully covers the viewport.
      var coverScale = Math.max(canvas.width / img.width, canvas.height / img.height);
      var zoom = 1; // multiplier on top of coverScale, driven by the slider
      var offsetX = 0, offsetY = 0; // pan, in source-image pixels, centered

      function clampOffsets() {
        var scale = coverScale * zoom;
        var maxX = Math.max(0, (img.width - canvas.width / scale) / 2);
        var maxY = Math.max(0, (img.height - canvas.height / scale) / 2);
        offsetX = Math.max(-maxX, Math.min(maxX, offsetX));
        offsetY = Math.max(-maxY, Math.min(maxY, offsetY));
      }

      function draw() {
        clampOffsets();
        var scale = coverScale * zoom;
        var srcW = canvas.width / scale, srcH = canvas.height / scale;
        var srcX = (img.width - srcW) / 2 + offsetX;
        var srcY = (img.height - srcH) / 2 + offsetY;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);
      }
      draw();

      overlay.querySelector('#cropZoom').addEventListener('input', function (e) {
        zoom = Number(e.target.value) / 100;
        draw();
      });

      // Drag to pan (mouse + touch via Pointer Events).
      var dragging = false, lastX = 0, lastY = 0;
      boxEl.addEventListener('pointerdown', function (e) {
        dragging = true; lastX = e.clientX; lastY = e.clientY;
        boxEl.setPointerCapture(e.pointerId);
      });
      boxEl.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var scale = coverScale * zoom;
        var rectScale = canvas.width / boxEl.clientWidth; // canvas logical px per CSS px, since the box scales down on small screens
        offsetX -= (e.clientX - lastX) * rectScale / scale;
        offsetY -= (e.clientY - lastY) * rectScale / scale;
        lastX = e.clientX; lastY = e.clientY;
        draw();
      });
      function endDrag() { dragging = false; }
      boxEl.addEventListener('pointerup', endDrag);
      boxEl.addEventListener('pointercancel', endDrag);

      function close() { document.body.removeChild(overlay); }
      overlay.querySelector('#cropCancel').onclick = close;
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

      overlay.querySelector('#cropSave').onclick = function () {
        var saveBtn = overlay.querySelector('#cropSave');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Uploading…';
        var out = document.createElement('canvas');
        out.width = outputW;
        out.height = outputH;
        var outCtx = out.getContext('2d');
        var scale = coverScale * zoom;
        var srcW = canvas.width / scale, srcH = canvas.height / scale;
        var srcX = (img.width - srcW) / 2 + offsetX;
        var srcY = (img.height - srcH) / 2 + offsetY;
        outCtx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, out.width, out.height);
        out.toBlob(function (blob) {
          fetch('/api/upload-image?manageToken=' + encodeURIComponent(MANAGE_TOKEN), {
            method: 'POST',
            headers: { 'Content-Type': 'image/jpeg' },
            body: blob,
          }).then(function (r) { return r.json(); }).then(function (res) {
            if (!res.ok) { alert(res.error || 'Upload failed.'); saveBtn.disabled = false; saveBtn.textContent = 'Use Photo'; return; }
            close();
            onDone(res.url);
          }).catch(function () {
            alert('Upload failed. Please try again.');
            saveBtn.disabled = false; saveBtn.textContent = 'Use Photo';
          });
        }, 'image/jpeg', 0.9);
      };
    }
  }

  // Wires an "Upload Photo" button + thumbnail preview into a container,
  // tracking the current URL on the container's dataset so save handlers
  // can read it back out alongside the row's other fields.
  function bindPhotoField(container, initialUrl, cropOpts) {
    container.dataset.photoUrl = initialUrl || '';
    function render() {
      var url = container.dataset.photoUrl;
      container.innerHTML =
        (url ? '<img class="photo-thumb" src="' + escapeHtml(url) + '">' : '<div class="photo-thumb photo-thumb--empty">No photo</div>') +
        '<button class="btn btn--ghost mini-btn photoUploadBtn" type="button">' + (url ? 'Replace Photo' : 'Upload Photo') + '</button>';
      container.querySelector('.photoUploadBtn').onclick = function () {
        openImageCropper(cropOpts, function (url) {
          container.dataset.photoUrl = url;
          render();
        });
      };
    }
    render();
  }

  // Same idea as bindPhotoField, but for rows (like Gallery) that already
  // have a plain "Image URL" text input the save handler reads from --
  // wires the upload button to just fill that input rather than tracking
  // its own separate dataset, so a manually-pasted URL and an uploaded
  // photo both end up in the same place.
  function bindPhotoFieldToInput(container, inputEl, cropOpts) {
    function render() {
      var url = inputEl.value;
      container.innerHTML =
        (url ? '<img class="photo-thumb" src="' + escapeHtml(url) + '">' : '<div class="photo-thumb photo-thumb--empty">No photo</div>') +
        '<button class="btn btn--ghost mini-btn photoUploadBtn" type="button">' + (url ? 'Replace Photo' : 'Upload Photo') + '</button>';
      container.querySelector('.photoUploadBtn').onclick = function () {
        openImageCropper(cropOpts, function (url) {
          inputEl.value = url;
          render();
        });
      };
    }
    inputEl.addEventListener('input', render);
    render();
  }

  // ---- Manual appointment (pops up over the calendar as a modal, same
  // pattern as the photo cropper, rather than pushing the page's layout
  // around) ----
  function openManualModal() {
    document.getElementById('manualModal').style.display = 'flex';
    // Scroll the form itself back to the top every time it opens -- without
    // this, entering several walk-ins back to back left it wherever it was
    // scrolled to (e.g. down at Notes) after the previous submit, since the
    // modal is just hidden/shown rather than recreated each time.
    document.getElementById('manualForm').scrollTop = 0;
    // Clear out anything left over from the last time this was opened.
    ['manualDate', 'manualTime', 'manualName', 'manualEmail', 'manualPhone', 'manualNotes'].forEach(function (id) {
      document.getElementById(id).value = '';
    });
    document.getElementById('manualMsg').textContent = '';
    // Re-floor the date picker every time the form opens, in case this
    // dashboard tab has been sitting open since before midnight — the
    // server-rendered min="" only reflects page load time. One day earlier
    // than "today" as a UX safety margin (see the comment on
    // todayLocalDate above) so the picker never refuses to let today be
    // selected; the server is the real gate and has its own matching grace
    // period.
    document.getElementById('manualDate').min = addDaysToDateStr(todayInTz((DATA.settings && DATA.settings.timezone) || 'America/Chicago'), -1);
    var svcSel = document.getElementById('manualService');
    svcSel.innerHTML = (DATA.services || []).filter(function (s) { return s.active; }).map(function (s) {
      return '<option value="' + s.id + '">' + escapeHtml(s.name) + ' (' + s.duration_minutes + ' min)</option>';
    }).join('');
    var stSel = document.getElementById('manualStylist');
    stSel.innerHTML = '<option value="">No preference</option>' + (DATA.stylists || []).filter(function (s) { return s.active; }).map(function (s) {
      return '<option value="' + s.id + '">' + escapeHtml(s.name) + '</option>';
    }).join('');
    svcSel.focus(); // land on the first field, ready to type/select immediately
  }
  function closeManualModal() { document.getElementById('manualModal').style.display = 'none'; }

  document.getElementById('openManualBtn').onclick = openManualModal;
  document.getElementById('cancelManualBtn').onclick = closeManualModal;
  document.getElementById('manualCloseX').onclick = closeManualModal;
  document.getElementById('manualModal').addEventListener('click', function (e) {
    if (e.target === this) closeManualModal(); // backdrop click
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.getElementById('manualModal').style.display !== 'none') closeManualModal();
  });
  document.getElementById('saveManualBtn').onclick = function () {
    var date = document.getElementById('manualDate').value;
    var time = document.getElementById('manualTime').value;
    if (!date || !time) { document.getElementById('manualMsg').textContent = 'Pick a date and time.'; return; }
    var startAt = new Date(date + 'T' + time + ':00').toISOString();
    fetch('/api/manual-appointment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manageToken: MANAGE_TOKEN,
        serviceId: Number(document.getElementById('manualService').value),
        stylistId: document.getElementById('manualStylist').value || null,
        startAt: startAt,
        customerName: document.getElementById('manualName').value,
        customerEmail: document.getElementById('manualEmail').value,
        customerPhone: document.getElementById('manualPhone').value,
        notes: document.getElementById('manualNotes').value,
      }),
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (!res.ok) { document.getElementById('manualMsg').textContent = res.error || 'Something went wrong.'; return; }
      closeManualModal();
      loadData();
    });
  };

  // ---- Services editor ----
  function renderServicesEditor() {
    var el = document.getElementById('servicesEditor');
    el.innerHTML = (DATA.services || []).filter(function (s) { return s.active; }).map(function (s, i) {
      return '<div class="edit-row" data-idx="' + i + '" data-id="' + s.id + '">' +
        '<input class="svcName" value="' + escapeHtml(s.name) + '" placeholder="Service name">' +
        '<select class="svcCategory">' + (DATA.categories || []).map(function (c) { return '<option value="' + c.id + '"' + (c.id === s.category_id ? ' selected' : '') + '>' + escapeHtml(c.name) + '</option>'; }).join('') + '</select>' +
        '<input class="svcDuration" type="number" value="' + s.duration_minutes + '" placeholder="Minutes">' +
        '<input class="svcPrice" type="number" step="0.01" value="' + (s.price_cents / 100).toFixed(2) + '" placeholder="Price">' +
        '<button class="btn btn--ghost mini-btn svcRemove" type="button">Remove</button>' +
      '</div>' +
      '<label style="display:inline-flex;align-items:center;gap:6px;font-size:0.8rem;margin:-4px 0 16px;"><input type="checkbox" class="svcDowntime" style="width:auto;margin:0;" ' + (s.has_downtime ? 'checked' : '') + '> Has downtime (stylist free during part of it)</label>' +
      '<label style="display:inline-flex;align-items:center;gap:6px;font-size:0.8rem;margin:-4px 0 20px 20px;"><input type="checkbox" class="svcFrom" style="width:auto;margin:0;" ' + (s.price_is_from ? 'checked' : '') + '> Show as "From $"</label>';
    }).join('');
    bindServiceRemove();
  }
  function bindServiceRemove() {
    document.querySelectorAll('.svcRemove').forEach(function (btn) {
      btn.onclick = function () { btn.closest('.edit-row').remove(); };
    });
  }
  document.getElementById('addServiceBtn').onclick = function () {
    var el = document.getElementById('servicesEditor');
    var row = document.createElement('div');
    row.className = 'edit-row';
    row.innerHTML = '<input class="svcName" placeholder="Service name">' +
      '<select class="svcCategory">' + (DATA.categories || []).map(function (c) { return '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>'; }).join('') + '</select>' +
      '<input class="svcDuration" type="number" value="60" placeholder="Minutes">' +
      '<input class="svcPrice" type="number" step="0.01" value="0" placeholder="Price">' +
      '<button class="btn btn--ghost mini-btn svcRemove" type="button">Remove</button>';
    el.appendChild(row);
    bindServiceRemove();
  };
  document.getElementById('saveServicesBtn').onclick = function () {
    var rows = document.querySelectorAll('#servicesEditor .edit-row');
    // has_downtime / price_is_from checkboxes are rendered as siblings of
    // each .edit-row (not nested inside it), so they're collected by index
    // here rather than via row.querySelector.
    var downtimeBoxes = document.querySelectorAll('.svcDowntime');
    var fromBoxes = document.querySelectorAll('.svcFrom');
    var services = Array.prototype.map.call(rows, function (row, i) {
      return {
        id: row.dataset.id ? Number(row.dataset.id) : undefined,
        name: row.querySelector('.svcName').value,
        categoryId: Number(row.querySelector('.svcCategory').value),
        durationMinutes: Number(row.querySelector('.svcDuration').value) || 30,
        priceCents: Math.round((Number(row.querySelector('.svcPrice').value) || 0) * 100),
        hasDowntime: downtimeBoxes[i] ? downtimeBoxes[i].checked : false,
        priceIsFrom: fromBoxes[i] ? fromBoxes[i].checked : false,
      };
    });
    fetch('/api/manage-services', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manageToken: MANAGE_TOKEN, services: services }),
    }).then(function (r) { return r.json(); }).then(function (res) {
      document.getElementById('servicesMsg').textContent = res.ok ? 'Saved.' : (res.error || 'Error');
      if (res.ok) loadData();
    });
  };

  // ---- Team editor ----
  function renderTeamEditor() {
    var el = document.getElementById('teamEditor');
    var stylists = (DATA.stylists || []).filter(function (s) { return s.active; });
    el.innerHTML = stylists.map(function (s) {
      return '<div class="stylist-block" style="margin-bottom:18px;">' +
        '<div class="photo-field"></div>' +
        '<div class="edit-row edit-row--team" data-id="' + s.id + '">' +
          '<input class="stName" value="' + escapeHtml(s.name) + '" placeholder="Name">' +
          '<input class="stTitle" value="' + escapeHtml(s.title || '') + '" placeholder="Title">' +
          '<input class="stBio" value="' + escapeHtml(s.bio || '') + '" placeholder="Short bio">' +
          '<button class="btn btn--ghost mini-btn stRemove" type="button">Remove</button>' +
        '</div>' +
      '</div>';
    }).join('');
    Array.prototype.forEach.call(el.querySelectorAll('.photo-field'), function (field, i) {
      bindPhotoField(field, stylists[i] ? stylists[i].photo_url : null, { outputW: 600, outputH: 600 });
    });
    bindStylistRemove();
  }
  function bindStylistRemove() {
    document.querySelectorAll('.stRemove').forEach(function (btn) { btn.onclick = function () { btn.closest('.stylist-block').remove(); }; });
  }
  document.getElementById('addStylistBtn').onclick = function () {
    var el = document.getElementById('teamEditor');
    var block = document.createElement('div');
    block.className = 'stylist-block';
    block.style.marginBottom = '18px';
    block.innerHTML = '<div class="photo-field"></div><div class="edit-row edit-row--team"><input class="stName" placeholder="Name"><input class="stTitle" placeholder="Title"><input class="stBio" placeholder="Short bio"><button class="btn btn--ghost mini-btn stRemove" type="button">Remove</button></div>';
    el.appendChild(block);
    bindPhotoField(block.querySelector('.photo-field'), null, { outputW: 600, outputH: 600 });
    bindStylistRemove();
  };
  document.getElementById('saveTeamBtn').onclick = function () {
    var rows = document.querySelectorAll('#teamEditor .edit-row');
    var photoFields = document.querySelectorAll('#teamEditor .photo-field');
    var stylists = Array.prototype.map.call(rows, function (row, i) {
      return {
        id: row.dataset.id ? Number(row.dataset.id) : undefined,
        name: row.querySelector('.stName').value,
        title: row.querySelector('.stTitle').value,
        bio: row.querySelector('.stBio').value,
        photo_url: photoFields[i] ? (photoFields[i].dataset.photoUrl || null) : null,
        active: true,
      };
    });
    fetch('/api/manage-stylists', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manageToken: MANAGE_TOKEN, stylists: stylists }),
    }).then(function (r) { return r.json(); }).then(function (res) {
      document.getElementById('teamMsg').textContent = res.ok ? 'Saved.' : (res.error || 'Error');
      if (res.ok) loadData();
    });
  };

  // ---- Hours + blocked dates ----
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function renderHoursEditor() {
    var el = document.getElementById('hoursEditor');
    el.innerHTML = (DATA.rules || []).map(function (r) {
      return '<div class="hours-row">' +
        '<select class="hrWeekday">' + WEEKDAYS.map(function (w, i) { return '<option value="' + i + '"' + (i === r.weekday ? ' selected' : '') + '>' + w + '</option>'; }).join('') + '</select>' +
        '<input class="hrStart" type="time" value="' + r.start + '">' +
        '<input class="hrEnd" type="time" value="' + r.end + '">' +
        '<button class="btn btn--ghost mini-btn hrRemove" type="button">Remove</button>' +
      '</div>';
    }).join('');
    bindHoursRemove();

    var bEl = document.getElementById('blockedEditor');
    var blocked = (DATA.blockedDates || []).slice();
    bEl.innerHTML = blocked.length ? blocked.map(function (b) {
      return '<div class="row-list__item" data-date="' + b.date + '" style="border:1px solid rgba(201,166,107,0.15);border-radius:6px;margin-bottom:8px;"><span>' + b.date + (b.reason ? ' — ' + escapeHtml(b.reason) : '') + '</span><button class="btn btn--ghost mini-btn blRemove" type="button">Remove</button></div>';
    }).join('') : '<p class="subtab-empty">No blocked dates.</p>';
    bindBlockedRemove();
  }
  function bindHoursRemove() { document.querySelectorAll('.hrRemove').forEach(function (btn) { btn.onclick = function () { btn.closest('.hours-row').remove(); }; }); }
  function bindBlockedRemove() { document.querySelectorAll('.blRemove').forEach(function (btn) { btn.onclick = function () { btn.closest('[data-date]').remove(); }; }); }
  document.getElementById('addHoursBtn').onclick = function () {
    var el = document.getElementById('hoursEditor');
    var row = document.createElement('div');
    row.className = 'hours-row';
    row.innerHTML = '<select class="hrWeekday">' + WEEKDAYS.map(function (w, i) { return '<option value="' + i + '">' + w + '</option>'; }).join('') + '</select><input class="hrStart" type="time" value="09:00"><input class="hrEnd" type="time" value="17:00"><button class="btn btn--ghost mini-btn hrRemove" type="button">Remove</button>';
    el.appendChild(row);
    bindHoursRemove();
  };
  document.getElementById('addBlockedBtn').onclick = function () {
    var date = document.getElementById('newBlockedDate').value;
    if (!date) return;
    var reason = document.getElementById('newBlockedReason').value;
    var bEl = document.getElementById('blockedEditor');
    if (bEl.querySelector('.subtab-empty')) bEl.innerHTML = '';
    var row = document.createElement('div');
    row.className = 'row-list__item';
    row.dataset.date = date;
    row.style.cssText = 'border:1px solid rgba(201,166,107,0.15);border-radius:6px;margin-bottom:8px;';
    row.innerHTML = '<span>' + date + (reason ? ' — ' + escapeHtml(reason) : '') + '</span><button class="btn btn--ghost mini-btn blRemove" type="button">Remove</button>';
    bEl.appendChild(row);
    bindBlockedRemove();
    document.getElementById('newBlockedDate').value = '';
    document.getElementById('newBlockedReason').value = '';
  };
  document.getElementById('saveHoursBtn').onclick = function () {
    var rules = Array.prototype.map.call(document.querySelectorAll('#hoursEditor .hours-row'), function (row) {
      return { weekday: Number(row.querySelector('.hrWeekday').value), start: row.querySelector('.hrStart').value, end: row.querySelector('.hrEnd').value };
    });
    var blockedDates = Array.prototype.map.call(document.querySelectorAll('#blockedEditor [data-date]'), function (row) {
      return { date: row.dataset.date };
    });
    fetch('/api/manage-settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manageToken: MANAGE_TOKEN, availabilityRules: rules, blockedDates: blockedDates }),
    }).then(function (r) { return r.json(); }).then(function (res) {
      document.getElementById('hoursMsg').textContent = res.ok ? 'Saved.' : (res.error || 'Error');
      if (res.ok) loadData();
    });
  };

  // ---- Content (testimonials / gallery) ----
  function renderContentEditor() {
    var tEl = document.getElementById('testimonialsEditor');
    tEl.innerHTML = (DATA.testimonials || []).filter(function (t) { return t.active; }).map(function (t) {
      return '<div class="edit-row edit-row--testimonial" data-id="' + t.id + '">' +
        '<input class="tmName" value="' + escapeHtml(t.client_name) + '" placeholder="Client name">' +
        '<input class="tmQuote" value="' + escapeHtml(t.quote) + '" placeholder="Quote">' +
        '<input class="tmRating" type="number" min="1" max="5" value="' + t.rating + '">' +
        '<button class="btn btn--ghost mini-btn tmRemove" type="button">Remove</button>' +
      '</div>';
    }).join('');
    document.querySelectorAll('.tmRemove').forEach(function (btn) { btn.onclick = function () { btn.closest('.edit-row').remove(); }; });

    var gEl = document.getElementById('galleryEditor');
    gEl.innerHTML = (DATA.galleryItems || []).filter(function (g) { return g.active; }).map(function (g) {
      return '<div class="gallery-block" style="margin-bottom:18px;">' +
        '<div class="photo-field"></div>' +
        '<div class="edit-row edit-row--gallery" data-id="' + g.id + '">' +
          '<input class="glLabel" value="' + escapeHtml(g.label) + '" placeholder="Label">' +
          '<input class="glCategory" value="' + escapeHtml(g.category) + '" placeholder="Category">' +
          '<input class="glImage" value="' + escapeHtml(g.image_url || '') + '" placeholder="Image URL (or upload above)">' +
          '<button class="btn btn--ghost mini-btn glRemove" type="button">Remove</button>' +
        '</div>' +
      '</div>';
    }).join('');
    Array.prototype.forEach.call(gEl.querySelectorAll('.gallery-block'), function (block) {
      bindPhotoFieldToInput(block.querySelector('.photo-field'), block.querySelector('.glImage'), { outputW: 900, outputH: 675 });
    });
    document.querySelectorAll('.glRemove').forEach(function (btn) { btn.onclick = function () { btn.closest('.gallery-block').remove(); }; });
  }
  document.getElementById('addTestimonialBtn').onclick = function () {
    var el = document.getElementById('testimonialsEditor');
    var row = document.createElement('div');
    row.className = 'edit-row edit-row--testimonial';
    row.innerHTML = '<input class="tmName" placeholder="Client name"><input class="tmQuote" placeholder="Quote"><input class="tmRating" type="number" min="1" max="5" value="5"><button class="btn btn--ghost mini-btn tmRemove" type="button">Remove</button>';
    el.appendChild(row);
    document.querySelectorAll('.tmRemove').forEach(function (btn) { btn.onclick = function () { btn.closest('.edit-row').remove(); }; });
  };
  document.getElementById('addGalleryBtn').onclick = function () {
    var el = document.getElementById('galleryEditor');
    var block = document.createElement('div');
    block.className = 'gallery-block';
    block.style.marginBottom = '18px';
    block.innerHTML = '<div class="photo-field"></div><div class="edit-row edit-row--gallery"><input class="glLabel" placeholder="Label"><input class="glCategory" placeholder="Category"><input class="glImage" placeholder="Image URL (or upload above)"><button class="btn btn--ghost mini-btn glRemove" type="button">Remove</button></div>';
    el.appendChild(block);
    bindPhotoFieldToInput(block.querySelector('.photo-field'), block.querySelector('.glImage'), { outputW: 900, outputH: 675 });
    document.querySelectorAll('.glRemove').forEach(function (btn) { btn.onclick = function () { btn.closest('.gallery-block').remove(); }; });
  };
  document.getElementById('saveContentBtn').onclick = function () {
    var testimonials = Array.prototype.map.call(document.querySelectorAll('#testimonialsEditor .edit-row'), function (row) {
      return { id: row.dataset.id ? Number(row.dataset.id) : undefined, clientName: row.querySelector('.tmName').value, quote: row.querySelector('.tmQuote').value, rating: Number(row.querySelector('.tmRating').value) || 5 };
    });
    var galleryItems = Array.prototype.map.call(document.querySelectorAll('#galleryEditor .edit-row'), function (row) {
      return { id: row.dataset.id ? Number(row.dataset.id) : undefined, label: row.querySelector('.glLabel').value, category: row.querySelector('.glCategory').value, imageUrl: row.querySelector('.glImage').value || null };
    });
    fetch('/api/manage-content', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manageToken: MANAGE_TOKEN, testimonials: testimonials, galleryItems: galleryItems }),
    }).then(function (r) { return r.json(); }).then(function (res) {
      document.getElementById('contentMsg').textContent = res.ok ? 'Saved.' : (res.error || 'Error');
      if (res.ok) loadData();
    });
  };

  // ---- Settings ----
  function renderSettings() {
    var s = DATA.settings;
    document.getElementById('setBusinessName').value = s.business_name || '';
    document.getElementById('setTagline').value = s.tagline || '';
    document.getElementById('setNotifyEmail').value = s.notify_email || '';
    document.getElementById('setPhone').value = s.phone || '';
    document.getElementById('setTimezone').value = s.timezone || '';
    document.getElementById('setAddress1').value = s.address_line1 || '';
    document.getElementById('setAddress2').value = s.address_line2 || '';
  }
  document.getElementById('saveSettingsBtn').onclick = function () {
    fetch('/api/manage-settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manageToken: MANAGE_TOKEN,
        settings: {
          businessName: document.getElementById('setBusinessName').value,
          tagline: document.getElementById('setTagline').value,
          notifyEmail: document.getElementById('setNotifyEmail').value,
          phone: document.getElementById('setPhone').value,
          timezone: document.getElementById('setTimezone').value,
          addressLine1: document.getElementById('setAddress1').value,
          addressLine2: document.getElementById('setAddress2').value,
        },
      }),
    }).then(function (r) { return r.json(); }).then(function (res) {
      document.getElementById('settingsMsg').textContent = res.ok ? 'Saved.' : (res.error || 'Error');
    });
  };

  // ---- Boot ----
  loadData().then(function () {
    renderServicesEditor();
    renderTeamEditor();
    renderHoursEditor();
    renderContentEditor();
    renderSettings();
  });

  // Poll just the requests queue so new bookings show up without disturbing
  // whatever tab/edit the owner is currently on.
  setInterval(function () {
    fetch('/api/dashboard-data?manageToken=' + encodeURIComponent(MANAGE_TOKEN))
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.ok) return;
        DATA.pending = res.pending;
        DATA.upcoming = res.upcoming;
        DATA.clients = res.clients;
        renderPending();
        // Skip re-rendering mid-drag -- would yank the block out from under
        // an in-progress move/resize. The drag's own submitReschedule()
        // already calls loadData() (a full render) right after it finishes.
        if (!calDragState && document.querySelector('.tab-panel[data-panel="calendar"]').classList.contains('active')) renderCalendar();
        if (document.querySelector('.tab-panel[data-panel="clients"]').classList.contains('active')) renderClients();
      });
  }, 20000);
</script>
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}
