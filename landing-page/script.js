// ===== Theme toggle (respects system + saved preference) =====
(function () {
  const root = document.documentElement;
  const saved = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.setAttribute("data-theme", saved || (prefersDark ? "dark" : "light"));

  const toggle = document.getElementById("themeToggle");
  toggle && toggle.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  });
})();

// ===== Mobile menu =====
(function () {
  const btn = document.getElementById("menuBtn");
  const links = document.querySelector(".nav-links");
  if (!btn || !links) return;
  btn.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(open));
  });
  links.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      links.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    })
  );
})();

// ===== Nav dropdown (Modules) =====
(function () {
  const item = document.getElementById("modulesNavItem");
  const trigger = document.getElementById("modulesTrigger");
  if (!item || !trigger) return;

  function close() {
    item.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
  }
  function toggle() {
    const willOpen = !item.classList.contains("open");
    item.classList.toggle("open", willOpen);
    trigger.setAttribute("aria-expanded", String(willOpen));
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle();
  });
  document.addEventListener("click", (e) => {
    if (!item.contains(e.target)) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
})();

// ===== Animated stat counters =====
(function () {
  const fmt = (n) =>
    n >= 1000000 ? (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M+"
    : n >= 1000 ? Math.round(n / 1000) + "K+"
    : n + "+";
  const els = document.querySelectorAll("[data-count]");
  if (!("IntersectionObserver" in window) || !els.length) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const target = +el.dataset.count;
      const start = performance.now();
      const dur = 1400;
      const tick = (now) => {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      io.unobserve(el);
    });
  }, { threshold: 0.5 });
  els.forEach((el) => io.observe(el));
})();

// ===== Demo form (submits to the backend, which emails the sales team) =====
(function () {
  const form = document.getElementById("demoForm");
  const note = document.getElementById("formNote");
  if (!form) return;

  const DEMO_ENDPOINT = "https://schoolment.com/school-erp/leads/";
  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const name = (data.get("name") || "").toString().trim();
    const email = (data.get("email") || "").toString().trim();
    const school = (data.get("school") || "").toString().trim();
    const phone = (data.get("phone") || "").toString().trim();
    const website = (data.get("website") || "").toString().trim(); // honeypot
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!name || !school || !emailOk) {
      note.textContent = "Please enter your name, school and a valid email.";
      note.className = "form-note err";
      return;
    }

    const originalLabel = submitBtn ? submitBtn.textContent : "";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending...";
    }
    note.textContent = "";
    note.className = "form-note";

    fetch(DEMO_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name,
        school: school,
        email: email,
        phone: phone,
        website: website,
        page_url: window.location.href,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("request failed");
        return res.json();
      })
      .then((body) => {
        note.textContent =
          body.message || "Thanks, " + name + "! Our team will reach out within 1 business day.";
        note.className = "form-note ok";
        form.reset();
      })
      .catch(() => {
        note.textContent =
          "Something went wrong. Please email info@schoolment.com and we'll get right back to you.";
        note.className = "form-note err";
      })
      .finally(() => {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel;
        }
      });
  });
})();

// ===== Current year in footer =====
document.getElementById("year").textContent = new Date().getFullYear();
