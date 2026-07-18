// GET /booking
//
// Public booking request flow. Every submission goes to pending_review —
// see schema.sql / lib/availability.js for why nothing here blocks
// overlapping times: the owner reviews and decides by hand. Slots that
// overlap an existing appointment still show up, with a soft badge ("2
// other bookings near this time") so the client isn't surprised later.

import { renderHead, renderNav, renderFooter, toScriptJson } from "../lib/layout.js";
import { listServicesGroupedByCategory, listStylists } from "../lib/db.js";

export async function onRequestGet(context) {
  const { env } = context;
  const [categories, stylists] = await Promise.all([
    listServicesGroupedByCategory(env),
    listStylists(env, { activeOnly: true }),
  ]);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
${renderHead({ title: "Book an Appointment", description: "Request an appointment at Next Chapter Salon.", path: "/booking" })}
</head>
<body>
${renderNav("/booking")}

<header class="page-header">
  <div class="wrap">
    <span class="eyebrow">Reserve Your Time</span>
    <h1>Book an Appointment</h1>
    <p class="lede center">Every request is reviewed personally &mdash; you'll hear back with a confirmation, usually within a day.</p>
  </div>
</header>

<section class="section">
  <div class="wrap" style="max-width:680px;">
    <div class="card card--framed reveal" id="bookingCard">

      <div id="step1">
        <label for="service">Service</label>
        <select id="service"></select>
        <p id="serviceNote" class="text-dim" style="font-size:0.88rem;margin-top:-10px;margin-bottom:20px;"></p>

        <label for="stylist">Stylist</label>
        <select id="stylist">
          <option value="">No preference</option>
          ${stylists.map((s) => `<option value="${s.id}">${s.name}${s.title ? ` — ${s.title}` : ""}</option>`).join("")}
        </select>

        <label>Day</label>
        <div class="day-row" id="dayRow" style="display:flex;gap:8px;overflow-x:auto;padding:4px 0 14px;"></div>

        <label>Available Times</label>
        <div class="slot-grid" id="slotGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-bottom:6px;"></div>
        <p class="text-dim" id="emptyNote" style="font-size:0.9rem;"></p>
      </div>

      <form id="bookingForm" style="display:none;margin-top:20px;padding-top:24px;border-top:1px solid rgba(201,166,107,0.18);">
        <div id="selectedSummary" class="text-gold" style="font-family:var(--font-label);letter-spacing:0.04em;margin-bottom:18px;"></div>
        <label for="customerName">Your Name</label>
        <input id="customerName" required maxlength="200">
        <div class="field-row">
          <div>
            <label for="customerEmail">Email</label>
            <input id="customerEmail" type="email" required maxlength="200">
          </div>
          <div>
            <label for="customerPhone">Phone (optional)</label>
            <input id="customerPhone" type="tel" maxlength="60">
          </div>
        </div>
        <label for="notes">Anything We Should Know? (optional)</label>
        <textarea id="notes" maxlength="500" placeholder="Hair history, inspiration photos you'll bring, allergies, etc."></textarea>
        <button type="submit" class="btn btn--gold btn--block" id="submitBtn">Request This Appointment</button>
        <p id="formMsg" style="margin-top:14px;font-size:0.9rem;"></p>
      </form>

      <div id="successState" style="display:none;text-align:center;padding:20px 0;">
        <span class="eyebrow">Request Sent</span>
        <h3>Your Chapter Is Being Written</h3>
        <p class="text-dim">We've received your request and will confirm by email shortly. Nothing is booked until you hear back from us.</p>
        <a class="btn btn--ghost" id="viewRequestLink" href="#">View Your Request</a>
      </div>
    </div>
  </div>
</section>

${renderFooter()}
<script>
  var CATEGORIES = ${toScriptJson(categories)};
  var SERVICES = CATEGORIES.reduce(function(acc, c) { return acc.concat(c.services); }, []);
  var selectedSlot = null;
  var selectedDay = null;
  var selectedOverlap = 0;

  var serviceSel = document.getElementById('service');
  CATEGORIES.forEach(function(cat) {
    var group = document.createElement('optgroup');
    group.label = cat.name;
    cat.services.forEach(function(s) {
      var opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name + ' — ' + s.duration_minutes + ' min';
      group.appendChild(opt);
    });
    serviceSel.appendChild(group);
  });

  function currentService() {
    return SERVICES.find(function(x) { return String(x.id) === serviceSel.value; });
  }

  function updateServiceNote() {
    var s = currentService();
    var note = document.getElementById('serviceNote');
    if (!s) { note.textContent = ''; return; }
    var price = (s.price_is_from ? 'From $' : '$') + (s.price_cents / 100).toFixed(0);
    note.textContent = price + (s.has_downtime ? ' — includes processing time, so we can often fit another quick service around yours' : '');
  }

  function fmtDay(dateStr) {
    var d = new Date(dateStr + 'T12:00:00Z');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  function buildDayRow() {
    var row = document.getElementById('dayRow');
    row.innerHTML = '';
    var today = new Date();
    for (var i = 0; i < 21; i++) {
      var d = new Date(today.getTime() + i * 86400000);
      var dateStr = d.toISOString().slice(0, 10);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--ghost btn--sm';
      if (dateStr === selectedDay) { btn.style.background = 'var(--gold)'; btn.style.color = 'var(--ink)'; }
      btn.style.flex = '0 0 auto';
      btn.textContent = fmtDay(dateStr);
      btn.onclick = (function (ds) { return function () { selectedDay = ds; selectedSlot = null; buildDayRow(); loadSlots(); }; })(dateStr);
      row.appendChild(btn);
    }
  }

  function loadSlots() {
    var grid = document.getElementById('slotGrid');
    var empty = document.getElementById('emptyNote');
    grid.innerHTML = '';
    document.getElementById('bookingForm').style.display = 'none';
    if (!selectedDay) return;
    empty.textContent = 'Loading...';

    var serviceId = serviceSel.value;
    var url = '/api/availability?serviceId=' + encodeURIComponent(serviceId) + '&from=' + selectedDay + '&to=' + selectedDay;

    fetch(url).then(function (r) { return r.json(); }).then(function (res) {
      grid.innerHTML = '';
      if (!res.ok) { empty.textContent = res.error || 'Could not load availability.'; return; }
      var slots = (res.slotsByDate && res.slotsByDate[selectedDay]) || [];
      if (!slots.length) { empty.textContent = 'No times available this day.'; return; }
      empty.textContent = '';
      slots.forEach(function (slot) {
        var d = new Date(slot.startAt);
        var label = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: res.timezone });
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn--ghost btn--sm';
        btn.style.display = 'flex';
        btn.style.flexDirection = 'column';
        btn.style.gap = '2px';
        btn.innerHTML = '<span>' + label + '</span>' + (slot.overlapCount > 0 ? '<span style="font-size:0.68rem;opacity:0.75;text-transform:none;letter-spacing:0;">' + slot.overlapCount + ' other booking' + (slot.overlapCount > 1 ? 's' : '') + ' nearby</span>' : '');
        if (selectedSlot === slot.startAt) { btn.style.background = 'var(--gold)'; btn.style.color = 'var(--ink)'; }
        btn.onclick = function () {
          selectedSlot = slot.startAt;
          selectedOverlap = slot.overlapCount;
          Array.prototype.forEach.call(grid.children, function (el) { el.style.background = ''; el.style.color = 'var(--gold)'; });
          btn.style.background = 'var(--gold)';
          btn.style.color = 'var(--ink)';
          var summary = document.getElementById('selectedSummary');
          var s = currentService();
          summary.textContent = (s ? s.name : '') + ' — ' + fmtDay(selectedDay) + ' at ' + label + (slot.overlapCount > 0 ? ' (overlaps ' + slot.overlapCount + ' other booking' + (slot.overlapCount > 1 ? 's' : '') + ' — that is okay, we will review it)' : '');
          document.getElementById('bookingForm').style.display = 'block';
          document.getElementById('bookingForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        };
        grid.appendChild(btn);
      });
    }).catch(function () { empty.textContent = 'Could not load availability.'; });
  }

  serviceSel.onchange = function () { updateServiceNote(); selectedSlot = null; loadSlots(); };
  updateServiceNote();
  selectedDay = new Date().toISOString().slice(0, 10);
  buildDayRow();
  loadSlots();

  document.getElementById('bookingForm').onsubmit = function (e) {
    e.preventDefault();
    if (!selectedSlot) return;
    var btn = document.getElementById('submitBtn');
    var msg = document.getElementById('formMsg');
    btn.disabled = true;
    msg.style.color = 'var(--cream-dim)';
    msg.textContent = 'Sending your request...';

    fetch('/api/create-appointment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceId: Number(serviceSel.value),
        stylistId: document.getElementById('stylist').value || null,
        startAt: selectedSlot,
        customerName: document.getElementById('customerName').value,
        customerEmail: document.getElementById('customerEmail').value,
        customerPhone: document.getElementById('customerPhone').value,
        notes: document.getElementById('notes').value,
      }),
    }).then(function (r) { return r.json(); }).then(function (res) {
      btn.disabled = false;
      if (!res.ok) {
        msg.style.color = '#e08aa0';
        msg.textContent = res.error || 'Something went wrong.';
        return;
      }
      document.getElementById('step1').style.display = 'none';
      document.getElementById('bookingForm').style.display = 'none';
      var success = document.getElementById('successState');
      success.style.display = 'block';
      document.getElementById('viewRequestLink').href = '/my-appointment/' + res.manageToken;
    }).catch(function () {
      btn.disabled = false;
      msg.style.color = '#e08aa0';
      msg.textContent = 'Something went wrong. Please try again.';
    });
  };
</script>
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}
