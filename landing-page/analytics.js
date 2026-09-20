// Public marketing website only. Basic consent mode: no Google requests until acceptance.
(() => {
  "use strict";
  const measurementId = "G-JYNB9WB9JD";
  const storageKey = "schoolment.analytics-consent.v1";
  const maxAge = 180 * 24 * 60 * 60 * 1000;
  const liveHost = ["schoolment.com", "www.schoolment.com"].includes(location.hostname);
  if (/^\/(school-admin|school-erp|nodebuild)(\/|$)/.test(location.pathname)) return;
  if (document.getElementById("analytics-consent")) return;
  let loaded = false;
  let choice = null;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && ["accepted", "declined"].includes(saved.value) &&
        Number.isFinite(saved.time) && saved.time <= Date.now() && Date.now() - saved.time < maxAge) {
      choice = saved.value;
    }
  } catch (_) {}

  function cleanUrl(value) {
    try { const url = new URL(value); return url.origin + url.pathname; }
    catch (_) { return ""; }
  }

  function startAnalytics() {
    if (!liveHost || loaded || choice !== "accepted") return;
    loaded = true;
    window["ga-disable-" + measurementId] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("consent", "default", {
      analytics_storage: "denied", ad_storage: "denied",
      ad_user_data: "denied", ad_personalization: "denied"
    });
    window.gtag("consent", "update", { analytics_storage: "granted" });
    window.gtag("js", new Date());
    window.gtag("config", measurementId, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_domain: location.hostname,
      cookie_expires: maxAge / 1000,
      page_location: location.origin + location.pathname,
      page_referrer: cleanUrl(document.referrer)
    });
    const tag = document.createElement("script");
    tag.id = "schoolment-google-tag";
    tag.async = true;
    tag.src = "https://www.googletagmanager.com/gtag/js?id=" + measurementId;
    document.head.appendChild(tag);
  }

  function clearAnalyticsCookies() {
    for (const cookie of document.cookie.split(";")) {
      const name = cookie.split("=")[0].trim();
      if (name !== "_ga" && !name.startsWith("_ga_")) continue;
      for (const domain of ["", location.hostname, ".schoolment.com"]) {
        document.cookie = name + "=; Max-Age=0; path=/; SameSite=Lax" +
          (domain ? "; domain=" + domain : "");
      }
    }
  }

  const banner = document.createElement("section");
  banner.id = "analytics-consent";
  banner.className = "analytics-consent";
  banner.setAttribute("aria-labelledby", "analytics-consent-title");
  banner.innerHTML = '<div><h2 id="analytics-consent-title">Your analytics choice</h2>' +
    '<p>May we use Google Analytics to understand visits to our public website? ' +
    'It is optional. Rejecting analytics will not affect the website. ' +
    '<a href="/privacy-and-security/#website-analytics">Read our privacy notice</a>.</p></div>' +
    '<div class="analytics-consent-actions">' +
    '<button type="button" class="btn btn-ghost" data-analytics-choice="declined">Reject analytics</button>' +
    '<button type="button" class="btn btn-ghost" data-analytics-choice="accepted">Accept analytics</button>' +
    '</div>';
  document.body.appendChild(banner);
  const settings = document.createElement("button");
  settings.type = "button";
  settings.className = "analytics-settings";
  settings.textContent = "Analytics preferences";
  settings.setAttribute("aria-controls", banner.id);
  settings.addEventListener("click", () => {
    banner.hidden = false;
    banner.querySelector("button").focus();
  });
  const footer = document.querySelector(".site-footer .container") || document.body;
  footer.appendChild(settings);
  banner.addEventListener("click", (event) => {
    const button = event.target.closest("[data-analytics-choice]");
    if (!button) return;
    choice = button.dataset.analyticsChoice;
    try { localStorage.setItem(storageKey, JSON.stringify({ value: choice, time: Date.now() })); } catch (_) {}
    banner.hidden = true;
    if (choice === "accepted") startAnalytics();
    else {
      window["ga-disable-" + measurementId] = true;
      clearAnalyticsCookies();
      // Remove an already-loaded tag and its listeners by reopening without consent.
      if (loaded) { location.reload(); return; }
    }
    settings.focus({ preventScroll: true });
  });
  window.addEventListener("storage", (event) => {
    if ((event.key === storageKey || event.key === null) && loaded) {
      window["ga-disable-" + measurementId] = true;
      location.reload();
    }
  });
  banner.hidden = choice !== null;
  if (choice === "declined") clearAnalyticsCookies();
  startAnalytics();
})();
