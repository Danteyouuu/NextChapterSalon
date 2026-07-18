// Single entry point for the whole site. This project started as a module
// mounted under /next-chapter-salon/* inside a larger site (campbelldan.com)
// — this is the lifted-out, standalone version, so every route is now
// root-relative (nextchaptersalon.com/booking, not
// campbelldan.com/next-chapter-salon/booking). worker/index.js is a
// thin wrapper that calls routeNextChapterSalon() for every request and
// falls through to static assets if nothing matches.

import * as availability from "./api/availability.js";
import * as createAppointment from "./api/create-appointment.js";
import * as cancelAppointment from "./api/cancel-appointment.js";
import * as acceptAppointment from "./api/accept-appointment.js";
import * as declineAppointment from "./api/decline-appointment.js";
import * as manageSettings from "./api/manage-settings.js";
import * as manageServices from "./api/manage-services.js";
import * as manageStylists from "./api/manage-stylists.js";
import * as manageContent from "./api/manage-content.js";
import * as contact from "./api/contact.js";
import * as dashboardData from "./api/dashboard-data.js";
import * as manualAppointment from "./api/manual-appointment.js";

import * as homePage from "./pages/home.js";
import * as aboutPage from "./pages/about.js";
import * as servicesPage from "./pages/services.js";
import * as galleryPage from "./pages/gallery.js";
import * as teamPage from "./pages/team.js";
import * as testimonialsPage from "./pages/testimonials.js";
import * as policiesPage from "./pages/policies.js";
import * as contactPage from "./pages/contact-page.js";
import * as giftCardsPage from "./pages/gift-cards.js";
import * as bookingPage from "./pages/booking.js";
import * as myAppointmentPage from "./pages/my-appointment.js";
import * as dashboardPage from "./pages/dashboard.js";
import * as calendarFeed from "./pages/calendar-feed.js";

export async function routeNextChapterSalon(request, env, ctx, path, method) {
  const context = (params = {}) => ({
    request,
    env,
    params,
    waitUntil: (p) => ctx.waitUntil(p),
    data: {},
  });

  // ---- API ----
  if (path === "/api/availability" && method === "GET") {
    return availability.onRequestGet(context());
  }
  if (path === "/api/create-appointment" && method === "POST") {
    return createAppointment.onRequestPost(context());
  }
  if (path === "/api/cancel-appointment" && method === "POST") {
    return cancelAppointment.onRequestPost(context());
  }
  if (path === "/api/accept-appointment" && method === "POST") {
    return acceptAppointment.onRequestPost(context());
  }
  if (path === "/api/decline-appointment" && method === "POST") {
    return declineAppointment.onRequestPost(context());
  }
  if (path === "/api/manage-settings" && method === "POST") {
    return manageSettings.onRequestPost(context());
  }
  if (path === "/api/manage-services" && method === "POST") {
    return manageServices.onRequestPost(context());
  }
  if (path === "/api/manage-stylists" && method === "POST") {
    return manageStylists.onRequestPost(context());
  }
  if (path === "/api/manage-content" && method === "POST") {
    return manageContent.onRequestPost(context());
  }
  if (path === "/api/contact" && method === "POST") {
    return contact.onRequestPost(context());
  }
  if (path === "/api/dashboard-data" && method === "GET") {
    return dashboardData.onRequestGet(context());
  }
  if (path === "/api/manual-appointment" && method === "POST") {
    return manualAppointment.onRequestPost(context());
  }

  // ---- Pages ----
  if (path === "/" && method === "GET") {
    return homePage.onRequestGet(context());
  }
  if (path === "/about" && method === "GET") {
    return aboutPage.onRequestGet(context());
  }
  if (path === "/services" && method === "GET") {
    return servicesPage.onRequestGet(context());
  }
  if (path === "/gallery" && method === "GET") {
    return galleryPage.onRequestGet(context());
  }
  if (path === "/team" && method === "GET") {
    return teamPage.onRequestGet(context());
  }
  if (path === "/testimonials" && method === "GET") {
    return testimonialsPage.onRequestGet(context());
  }
  if (path === "/policies" && method === "GET") {
    return policiesPage.onRequestGet(context());
  }
  if (path === "/contact" && method === "GET") {
    return contactPage.onRequestGet(context());
  }
  if (path === "/gift-cards" && method === "GET") {
    return giftCardsPage.onRequestGet(context());
  }
  if (path === "/booking" && method === "GET") {
    return bookingPage.onRequestGet(context());
  }

  const myApptMatch = path.match(/^\/my-appointment\/([^/]+)$/);
  if (myApptMatch && method === "GET") {
    return myAppointmentPage.onRequestGet(context({ manageToken: myApptMatch[1] }));
  }

  const dashboardMatch = path.match(/^\/dashboard\/([^/]+)$/);
  if (dashboardMatch && method === "GET") {
    return dashboardPage.onRequestGet(context({ manageToken: dashboardMatch[1] }));
  }

  const feedMatch = path.match(/^\/feed\/([^/]+)\.ics$/);
  if (feedMatch && method === "GET") {
    return calendarFeed.onRequestGet(context({ manageToken: feedMatch[1] }));
  }

  return null;
}
