// GET /dashboard/:manageToken
//
// Owner dashboard — no login system, the URL itself is the credential (same
// trust model as booking-system's manage page: keep this link secret).
// Polls /api/dashboard-data every 20s so new requests appear close to
// real-time without standing up WebSockets/Durable Objects for what's a
// single-owner tool.

import { renderHead, escapeHtml, toScriptJson } from "../lib/layout.js";
import { getSettingsByManageToken } from "../lib/db.js";
import { getOrigin } from "../lib/http.js";

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const token = params.manageToken;

  const settings = await getSettingsByManageToken(env, token);
  if (!settings) {
    return new Response("Not found", { status: 404 });
  }

  const origin = getOrigin(request, env);
  const feedUrl = `${origin}/feed/${settings.manage_token}.ics`;

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
  @media (max-width: 900px) { .edit-row { grid-template-columns: 1fr 1fr; } }
  .hours-row { display:grid; grid-template-columns: 120px 1fr 1fr auto; gap:10px; align-items:center; margin-bottom:10px; }
  .subtab-empty { color:var(--cream-faint); padding: 30px 0; text-align:center; }
  .feed-box { background: var(--bg-panel-2); border:1px solid var(--gold-dim); border-radius:6px; padding:16px; font-family:monospace; font-size:0.82rem; word-break:break-all; color:var(--gold-bright); }
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
    <p class="text-dim">Every booking waits here until you accept or decline it. Overlapping requests are flagged, not blocked &mdash; you decide if it's a real conflict or a good downtime match.</p>
    <div id="pendingList"></div>
  </section>

  <section class="tab-panel" data-panel="calendar">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
      <h3 style="margin:0;">Upcoming Appointments</h3>
      <button class="btn btn--gold btn--sm" id="openManualBtn">+ Add Walk-in / Phone Booking</button>
    </div>
    <div id="upcomingList" style="margin-top:20px;"></div>

    <div class="card card--framed" id="manualForm" style="display:none;margin-top:24px;">
      <h4>New Manual Appointment</h4>
      <p class="text-dim" style="font-size:0.88rem;">Confirmed immediately &mdash; no review needed since you're entering it yourself.</p>
      <div class="field-row">
        <div><label>Service</label><select id="manualService"></select></div>
        <div><label>Stylist</label><select id="manualStylist"><option value="">No preference</option></select></div>
      </div>
      <div class="field-row">
        <div><label>Date</label><input id="manualDate" type="date"></div>
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
      <div style="display:flex;gap:10px;">
        <button class="btn btn--gold" id="saveManualBtn">Add to Calendar</button>
        <button class="btn btn--ghost" id="cancelManualBtn">Cancel</button>
      </div>
      <p id="manualMsg" style="margin-top:10px;font-size:0.9rem;"></p>
    </div>
  </section>

  <section class="tab-panel" data-panel="clients">
    <h3>Client Directory</h3>
    <p class="text-dim">Built automatically from booking history &mdash; no separate data entry.</p>
    <div id="clientsList"></div>
  </section>

  <section class="tab-panel" data-panel="services">
    <h3>Services</h3>
    <p class="text-dim">Duration is the full client-facing time. Mark "has downtime" for services like color where you're free during processing &mdash; it's shown to clients as a hint, not enforced.</p>
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
    <p class="text-dim" style="font-size:0.88rem;">Add an image URL once you have real photography hosted somewhere &mdash; leave blank to keep the elegant placeholder tile.</p>
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
    <p class="text-dim">Subscribe to this link once from your phone and every confirmed (and pending) appointment will show up in your regular calendar app going forward. It refreshes automatically every few hours &mdash; this is a one-way sync (salon &rarr; phone), not a two-way connection.</p>
    <div class="feed-box">${escapeHtml(feedUrl)}</div>
    <p class="text-dim" style="font-size:0.85rem;margin-top:14px;">
      <strong>iPhone:</strong> Settings app &rarr; Calendar &rarr; Accounts &rarr; Add Account &rarr; Other &rarr; Add Subscribed Calendar &rarr; paste the link above.<br>
      <strong>Android / Google Calendar:</strong> On desktop, open Google Calendar &rarr; Other calendars "+" &rarr; From URL &rarr; paste the link &mdash; it will then sync to the Google Calendar app on your phone automatically.
    </p>
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
        renderUpcoming();
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
        : (p.has_downtime ? '<div class="pill pill--pending" style="margin-top:8px;">Has downtime &mdash; good candidate to double-book</div>' : '');
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

  function renderUpcoming() {
    var list = document.getElementById('upcomingList');
    var upcoming = (DATA.upcoming || []).filter(function (a) { return a.status === 'confirmed'; });
    if (!upcoming.length) { list.innerHTML = '<p class="subtab-empty">Nothing confirmed yet.</p>'; return; }
    list.innerHTML = '<div class="row-list">' + upcoming.map(function (a) {
      return '<div class="row-list__item"><div><strong>' + escapeHtml(a.service_name) + '</strong> &mdash; ' + escapeHtml(a.customer_name) +
        '<br><span class="text-dim">' + fmtDateTime(a.start_at, DATA.settings.timezone) + (a.stylist_name ? ' &middot; ' + escapeHtml(a.stylist_name) : '') + '</span></div>' +
        '<span class="pill pill--confirmed">Confirmed</span></div>';
    }).join('') + '</div>';
  }

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

  // ---- Manual appointment ----
  document.getElementById('openManualBtn').onclick = function () {
    var form = document.getElementById('manualForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
    if (form.style.display === 'block') {
      var svcSel = document.getElementById('manualService');
      svcSel.innerHTML = (DATA.services || []).filter(function (s) { return s.active; }).map(function (s) {
        return '<option value="' + s.id + '">' + escapeHtml(s.name) + ' (' + s.duration_minutes + ' min)</option>';
      }).join('');
      var stSel = document.getElementById('manualStylist');
      stSel.innerHTML = '<option value="">No preference</option>' + (DATA.stylists || []).filter(function (s) { return s.active; }).map(function (s) {
        return '<option value="' + s.id + '">' + escapeHtml(s.name) + '</option>';
      }).join('');
    }
  };
  document.getElementById('cancelManualBtn').onclick = function () { document.getElementById('manualForm').style.display = 'none'; };
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
      document.getElementById('manualForm').style.display = 'none';
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
    el.innerHTML = (DATA.stylists || []).filter(function (s) { return s.active; }).map(function (s) {
      return '<div class="edit-row" style="grid-template-columns:1fr 1fr 2fr auto;" data-id="' + s.id + '">' +
        '<input class="stName" value="' + escapeHtml(s.name) + '" placeholder="Name">' +
        '<input class="stTitle" value="' + escapeHtml(s.title || '') + '" placeholder="Title">' +
        '<input class="stBio" value="' + escapeHtml(s.bio || '') + '" placeholder="Short bio">' +
        '<button class="btn btn--ghost mini-btn stRemove" type="button">Remove</button>' +
      '</div>';
    }).join('');
    bindStylistRemove();
  }
  function bindStylistRemove() {
    document.querySelectorAll('.stRemove').forEach(function (btn) { btn.onclick = function () { btn.closest('.edit-row').remove(); }; });
  }
  document.getElementById('addStylistBtn').onclick = function () {
    var el = document.getElementById('teamEditor');
    var row = document.createElement('div');
    row.className = 'edit-row';
    row.style.gridTemplateColumns = '1fr 1fr 2fr auto';
    row.innerHTML = '<input class="stName" placeholder="Name"><input class="stTitle" placeholder="Title"><input class="stBio" placeholder="Short bio"><button class="btn btn--ghost mini-btn stRemove" type="button">Remove</button>';
    el.appendChild(row);
    bindStylistRemove();
  };
  document.getElementById('saveTeamBtn').onclick = function () {
    var rows = document.querySelectorAll('#teamEditor .edit-row');
    var stylists = Array.prototype.map.call(rows, function (row) {
      return { id: row.dataset.id ? Number(row.dataset.id) : undefined, name: row.querySelector('.stName').value, title: row.querySelector('.stTitle').value, bio: row.querySelector('.stBio').value, active: true };
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
      return '<div class="edit-row" style="grid-template-columns:1fr 3fr 80px auto;" data-id="' + t.id + '">' +
        '<input class="tmName" value="' + escapeHtml(t.client_name) + '" placeholder="Client name">' +
        '<input class="tmQuote" value="' + escapeHtml(t.quote) + '" placeholder="Quote">' +
        '<input class="tmRating" type="number" min="1" max="5" value="' + t.rating + '">' +
        '<button class="btn btn--ghost mini-btn tmRemove" type="button">Remove</button>' +
      '</div>';
    }).join('');
    document.querySelectorAll('.tmRemove').forEach(function (btn) { btn.onclick = function () { btn.closest('.edit-row').remove(); }; });

    var gEl = document.getElementById('galleryEditor');
    gEl.innerHTML = (DATA.galleryItems || []).filter(function (g) { return g.active; }).map(function (g) {
      return '<div class="edit-row" style="grid-template-columns:1fr 1fr 2fr auto;" data-id="' + g.id + '">' +
        '<input class="glLabel" value="' + escapeHtml(g.label) + '" placeholder="Label">' +
        '<input class="glCategory" value="' + escapeHtml(g.category) + '" placeholder="Category">' +
        '<input class="glImage" value="' + escapeHtml(g.image_url || '') + '" placeholder="Image URL (optional)">' +
        '<button class="btn btn--ghost mini-btn glRemove" type="button">Remove</button>' +
      '</div>';
    }).join('');
    document.querySelectorAll('.glRemove').forEach(function (btn) { btn.onclick = function () { btn.closest('.edit-row').remove(); }; });
  }
  document.getElementById('addTestimonialBtn').onclick = function () {
    var el = document.getElementById('testimonialsEditor');
    var row = document.createElement('div');
    row.className = 'edit-row';
    row.style.gridTemplateColumns = '1fr 3fr 80px auto';
    row.innerHTML = '<input class="tmName" placeholder="Client name"><input class="tmQuote" placeholder="Quote"><input class="tmRating" type="number" min="1" max="5" value="5"><button class="btn btn--ghost mini-btn tmRemove" type="button">Remove</button>';
    el.appendChild(row);
    document.querySelectorAll('.tmRemove').forEach(function (btn) { btn.onclick = function () { btn.closest('.edit-row').remove(); }; });
  };
  document.getElementById('addGalleryBtn').onclick = function () {
    var el = document.getElementById('galleryEditor');
    var row = document.createElement('div');
    row.className = 'edit-row';
    row.style.gridTemplateColumns = '1fr 1fr 2fr auto';
    row.innerHTML = '<input class="glLabel" placeholder="Label"><input class="glCategory" placeholder="Category"><input class="glImage" placeholder="Image URL (optional)"><button class="btn btn--ghost mini-btn glRemove" type="button">Remove</button>';
    el.appendChild(row);
    document.querySelectorAll('.glRemove').forEach(function (btn) { btn.onclick = function () { btn.closest('.edit-row').remove(); }; });
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
        if (document.querySelector('.tab-panel[data-panel="calendar"]').classList.contains('active')) renderUpcoming();
        if (document.querySelector('.tab-panel[data-panel="clients"]').classList.contains('active')) renderClients();
      });
  }, 20000);
</script>
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}
