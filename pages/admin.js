// GET /admin
//
// Password-gated, memorable front door to the owner dashboard. The
// dashboard's real credential is still manage_token (via
// /dashboard/:manageToken, which continues to work exactly as before) —
// this just adds a short, guessable-looking URL protected by an actual
// password prompt, since a fixed path with no separate credential would let
// anyone who typed /admin straight in.
//
// First visit ever (no password set) shows a "create your password" form
// instead of a login form. After that, entering the correct password sets
// an HttpOnly cookie and hands the request off to the same dashboard
// renderer /dashboard/:manageToken uses.

import { renderHead, renderFooter, toScriptJson } from "../lib/layout.js";
import { getSettings } from "../lib/db.js";
import { getCookie } from "../lib/http.js";
import { ADMIN_COOKIE_NAME } from "../lib/auth.js";
import { onRequestGet as renderDashboard } from "./dashboard.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  const settings = await getSettings(env);
  if (!settings) return new Response("Salon not configured", { status: 500 });

  const cookieToken = getCookie(request, ADMIN_COOKIE_NAME);
  if (cookieToken && cookieToken === settings.manage_token) {
    return renderDashboard({ ...context, params: { manageToken: settings.manage_token } });
  }

  const isFirstTime = !settings.admin_password_hash;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
${renderHead({ title: isFirstTime ? "Set Up Admin Access" : "Admin Login", path: "" })}
</head>
<body>
<section class="section" style="min-height:78vh;display:flex;align-items:center;">
  <div class="wrap" style="max-width:420px;">
    <div class="card card--framed reveal">
      <span class="eyebrow">${isFirstTime ? "One-Time Setup" : "Owner Dashboard"}</span>
      <h1 style="font-size:1.7rem;margin:6px 0 6px;">${isFirstTime ? "Create Your Admin Password" : "Admin Login"}</h1>
      <p class="text-dim" style="margin-bottom:24px;">${
        isFirstTime
          ? "No password has been set for this dashboard yet. Choose one now. You'll use it every time you visit this page."
          : "Enter your password to continue to the dashboard."
      }</p>
      <form id="loginForm">
        <label for="password">Password</label>
        <input type="password" id="password" required minlength="8" autocomplete="${isFirstTime ? "new-password" : "current-password"}" autofocus>
        ${
          isFirstTime
            ? `<label for="confirmPassword">Confirm Password</label>
        <input type="password" id="confirmPassword" required minlength="8" autocomplete="new-password">`
            : ""
        }
        <p id="loginError" style="color:#e08aa0;margin:-8px 0 16px;display:none;"></p>
        <button type="submit" class="btn btn--gold btn--block" id="submitBtn">${isFirstTime ? "Set Password & Continue" : "Log In"}</button>
      </form>
    </div>
  </div>
</section>
${renderFooter()}
<script>
  var IS_FIRST_TIME = ${toScriptJson(isFirstTime)};
  var form = document.getElementById('loginForm');
  var errEl = document.getElementById('loginError');
  var submitBtn = document.getElementById('submitBtn');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var password = document.getElementById('password').value;
    errEl.style.display = 'none';
    if (IS_FIRST_TIME) {
      var confirmValue = document.getElementById('confirmPassword').value;
      if (password !== confirmValue) {
        errEl.textContent = 'Passwords do not match.';
        errEl.style.display = 'block';
        return;
      }
    }
    submitBtn.disabled = true;
    fetch('/api/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password }),
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.ok) {
          window.location.href = '/admin';
        } else {
          errEl.textContent = res.error || 'Incorrect password.';
          errEl.style.display = 'block';
          submitBtn.disabled = false;
        }
      })
      .catch(function () {
        errEl.textContent = 'Something went wrong. Please try again.';
        errEl.style.display = 'block';
        submitBtn.disabled = false;
      });
  });
</script>
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}
