(() => {
  "use strict";

  /* Site settings live in assets/js/config.js, so they can change without touching this file. */
  const CONFIG = window.NEGOSYOWORKS_CONFIG || {};
  const SITE = { apkUrl: "", appVersion: "", apkSizeMb: "", ...(CONFIG.app || {}) };
  const CONTACT = { facebook: "", whatsapp: "", email: "", ...(CONFIG.contact || {}) };

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- Plans (from the app's launch pricing and plan catalog) ---------- */
  const PLANS = [
    { code: "trial", name: "Free", title: "Studio Starter", price: 0, tagline: "Set up everything. Your first 7 days include going live.", live: 0, members: 0, cta: "Get the app",
      lead: "", features: ["7 days of going live free when you sign up", "Saved setups and all six starter templates", "Every popup, effect and the 13 sound pads"], note: "After the free week, going live needs a paid plan" },
    { code: "solo", name: "Solo", title: "Solo Seller", price: 299, tagline: "For sellers who run the live on their own.", live: 1, members: 0, cta: "Start selling",
      lead: "Everything in Free, plus", features: ["Go live from your phone or tablet", "Facebook, YouTube, TikTok or any RTMP server", "720p or 1080p lives", "Reconnects by itself if the signal drops"] },
    { code: "duo", name: "Duo", title: "Seller + Assistant", price: 599, tagline: "For sellers with an assistant beside them.", live: 2, members: 1, cta: "Choose Duo", popular: true,
      lead: "Everything in Solo, plus", features: ["Two lives at the same time", "1 team member seat", "Shared setups and uploads", "Team member permissions"] },
    { code: "team", name: "Team", title: "MSME Team", price: 999, tagline: "For growing shops with a selling team.", live: 4, members: 3, cta: "Grow your team",
      lead: "Everything in Duo, plus", features: ["Up to four lives at once", "3 team member seats", "Team collaboration", "Priority support"] }
  ];
  const LADDER = { trial: "I want to try it first.", solo: "I sell alone.", duo: "I sell with an assistant.", team: "I run a team." };

  // "Free" can go live only during the 7-day free week every new account gets.
  const E = [true, true, true, true], PAID = [false, true, true, true], T = [false, false, true, true];
  const COMPARE = [
    ["Plan", [["Lives at once", ["—", "1", "2", "4"]], ["Team members", ["—", "—", "1", "3"]], ["Saved setups", E], ["Starter templates", E]]],
    ["In the app", [["Phones and tablets", E], ["Front and back camera, 0.5× to 2× zoom", E], ["Portrait 9:16 and landscape 16:9", E], ["Blur, picture and green-screen backgrounds", E], ["Foreground picture and 17 colour filters", E], ["Built-in and your own popups", E], ["Popup entrances and effects", E], ["13 sound pads", E]]],
    ["Going live", [["Go live after the free week", PAID], ["Facebook, YouTube, TikTok or any RTMP server", PAID], ["720p or 1080p", PAID], ["Reconnects if the signal drops", PAID], ["Stream keys kept on your phone", E]]],
    ["Team", [["Shared setups and uploads", T], ["Team collaboration", T], ["Team member permissions", T], ["Priority support", [false, false, false, true]]]]
  ];

  const peso = (n) => "₱" + n.toLocaleString("en-PH");
  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" class="yes" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const DASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" class="no" aria-hidden="true"><path d="M7 12h10"/></svg>';


  function renderPlans() {
    $("#plan-cards").innerHTML = PLANS.map((p, i) => `
      <article class="plan${p.popular ? " popular" : ""}" data-rise style="--i:${i + 3}">
        ${p.popular ? '<span class="flag">Most popular</span>' : ""}
        <div class="plan-name"><span class="code">${esc(p.name)}</span><h2>${esc(p.title)}</h2></div>
        <div class="plan-price"><span class="amt">${peso(p.price)}</span><span class="per">${p.price ? "/ month" : "no payment needed"}</span></div>
        <p class="tagline">${esc(p.tagline)}</p>
        <div style="display:grid;gap:16px;align-content:start">
          <div class="limits">
            <div><b>${p.live || "—"}</b><span>${p.live === 1 ? "live" : "lives"} at once</span></div>
            <div><b>${p.members || "—"}</b><span>${p.members === 1 ? "team member" : "team members"}</span></div>
          </div>
          <ul class="feat">
            ${p.lead ? `<li class="lead">${esc(p.lead)}</li>` : ""}
            ${p.features.map((f) => `<li>${CHECK}<span>${esc(f)}</span></li>`).join("")}
            ${p.note ? `<li class="note">${DASH}<span>${esc(p.note)}</span></li>` : ""}
          </ul>
        </div>
        <a class="btn ${p.popular ? "btn-primary" : "btn-ghost"}" href="#app" data-plan="${esc(p.name)}">${esc(p.cta)}</a>
      </article>`).join("");

    const head = `<thead><tr><th scope="col"><span class="sr-only">Feature</span></th>${PLANS.map((p) => `<th scope="col"${p.popular ? ' class="hl"' : ""}>${esc(p.name)}<small>${p.price ? peso(p.price) + "/mo" : "₱0"}</small></th>`).join("")}</tr></thead>`;
    const cell = (v, i) => {
      const hl = PLANS[i].popular ? ' class="col-hl"' : "";
      if (v === true) return `<td${hl}>${CHECK}<span class="sr-only">Included</span></td>`;
      if (v === false || v === "—") return `<td${hl}>${DASH}<span class="sr-only">Not included</span></td>`;
      if (v === "Preview") return `<td${hl}><span class="prev">Preview</span></td>`;
      return `<td${hl}><b>${esc(v)}</b></td>`;
    };
    const body = COMPARE.map(([group, rows]) =>
      `<tr class="group"><td colspan="5">${esc(group)}</td></tr>` +
      rows.map(([label, vals]) => `<tr><th scope="row">${esc(label)}</th>${vals.map(cell).join("")}</tr>`).join("")
    ).join("");
    $("#compare").innerHTML = head + "<tbody>" + body + "</tbody>";

    $("#ladder").innerHTML = PLANS.map((p) =>
      `<a href="#plans"><span class="price">${peso(p.price)}</span><span class="who"><b>${esc(p.name)}.</b> ${esc(LADDER[p.code])}</span><span class="go">${p.price ? "/ MONTH" : "FREE"} →</span></a>`).join("");
  }

  /* ---------- Templates, keycaps, bunting ---------- */
  const TEMPLATES = [
    { name: "11.11 Mega sale", bg: "repeating-linear-gradient(135deg,#0B63CE 0 10px,#0952AD 10px 20px)", backdrop: "Brand wall", shape: "l", pops: [["11.11 SALE", "#F5C542"], ["10% OFF", "#FFFFFF"]], text: "Fireworks and a ka-ching for the big sale day." },
    { name: "Beauty demo", bg: "linear-gradient(160deg,#F2B8C6,#B5708A)", backdrop: "Vanity corner", shape: "p", pops: [["NEW", "#8AB4FF"], ["FREE SHIPPING", "#FFFFFF"]], text: "Soft sparkles for makeup and skincare demos." },
    { name: "Cooking live", bg: "linear-gradient(160deg,#C08A58,#6B4528)", backdrop: "Kitchen set", shape: "l", pops: [["LIVE TODAY", "#FF5A36"]], text: "A ding and applause when the dish is ready." },
    { name: "Auction night", bg: "linear-gradient(160deg,#5D6C80,#2D3440)", backdrop: "Studio loft", shape: "l", pops: [["SOLD OUT", "#F4F1EA"]], text: "Drumroll, then a bang when the last bid wins." },
    { name: "Payday sale", bg: "linear-gradient(160deg,#5B3A52,#2A1D28)", backdrop: "Boutique rack", shape: "p", pops: [["BUY 1 TAKE 1", "#FFFFFF"], ["FREE", "#FF5A36"]], text: "Confetti for bundle deals on the 15th and 30th." },
    { name: "Clean and simple", bg: "linear-gradient(160deg,#FFFFFF,#E7E5EA)", backdrop: "Clean white", shape: "l", pops: [], text: "No popups. Just you and the product." }
  ];
  $("#templates").innerHTML = TEMPLATES.map((t) => `
    <article class="tpl">
      <div class="tpl-thumb" style="background:#1B1820">
        <div class="shape ${t.shape}" style="background:${t.bg}"><div class="minis">${t.pops.map(([txt, c]) => `<span class="mini" style="background:${c};color:#0D0C10">${esc(txt)}</span>`).join("")}</div></div>
      </div>
      <div style="display:grid;gap:4px"><h3>${esc(t.name)}</h3><span class="meta">${esc(t.backdrop.toUpperCase())} · ${t.shape === "l" ? "LANDSCAPE" : "PORTRAIT"}</span></div>
      <p>${esc(t.text)}</p>
    </article>`).join("");

  /* Starter templates slider: advances one card every 5 seconds */
  (function slider() {
    const INTERVAL = 5000, TICK = 100;
    const root = $("#tpl-slider"), rail = $("#templates"), dots = $("#tpl-dots"), pauseBtn = $("#tpl-pause");
    const cards = $$(".tpl", rail);
    let elapsed = 0, userPaused = false, hovering = false, focused = false, onScreen = true, dotCount = 0, raf = 0;

    const step = () => { const c = cards[0]; return c ? c.offsetWidth + (parseFloat(getComputedStyle(rail).columnGap) || 0) : 0; };
    const positions = () => { const s = step(); return s ? Math.max(1, Math.round((rail.scrollWidth - rail.clientWidth) / s) + 1) : 1; };
    const index = () => { const s = step(); return s ? Math.min(positions() - 1, Math.round(rail.scrollLeft / s)) : 0; };

    function goTo(i) {
      const n = positions(), target = ((i % n) + n) % n;
      rail.scrollTo({ left: target * step(), behavior: reduceMotion ? "auto" : "smooth" });
      elapsed = 0;
    }
    function renderDots() {
      const n = positions();
      if (n !== dotCount) {
        dotCount = n;
        dots.innerHTML = Array.from({ length: n }, (_, i) => `<button class="dot-btn" type="button" data-i="${i}" aria-label="Show template ${i + 1} of ${n}"><i></i></button>`).join("");
        dots.hidden = n < 2;
      }
      const at = index();
      $$(".dot-btn", dots).forEach((d, i) => d.setAttribute("aria-current", i === at ? "true" : "false"));
    }
    function setProgress() { const d = $('.dot-btn[aria-current="true"] i', dots); if (d) d.style.setProperty("--p", Math.min(1, elapsed / INTERVAL)); }
    const running = () => !reduceMotion && !userPaused && !hovering && !focused && onScreen && current === "home" && !document.hidden && positions() > 1;

    setInterval(() => {
      if (!running()) return;
      elapsed += TICK;
      if (elapsed >= INTERVAL) goTo(index() + 1);
      setProgress();
    }, TICK);

    rail.addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderDots(); setProgress(); }); }, { passive: true });
    ["pointerdown", "wheel", "touchstart", "keydown"].forEach((ev) => rail.addEventListener(ev, () => { elapsed = 0; }, { passive: true }));
    root.addEventListener("mouseenter", () => { hovering = true; });
    root.addEventListener("mouseleave", () => { hovering = false; });
    root.addEventListener("focusin", () => { focused = true; });
    root.addEventListener("focusout", (e) => { if (!root.contains(e.relatedTarget)) focused = false; });
    $("#tpl-prev").addEventListener("click", () => goTo(index() - 1));
    $("#tpl-next").addEventListener("click", () => goTo(index() + 1));
    dots.addEventListener("click", (e) => { const b = e.target.closest(".dot-btn"); if (b) goTo(Number(b.dataset.i)); });

    const PAUSE_ICON = pauseBtn.innerHTML;
    const PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
    function setPaused(v) {
      userPaused = v;
      pauseBtn.innerHTML = v ? PLAY_ICON : PAUSE_ICON;
      pauseBtn.setAttribute("aria-label", v ? "Play slideshow" : "Pause slideshow");
    }
    pauseBtn.addEventListener("click", () => setPaused(!userPaused));
    if (reduceMotion) pauseBtn.hidden = true;

    new IntersectionObserver(([en]) => { onScreen = en.isIntersecting; }, { threshold: 0.35 }).observe(rail);
    new ResizeObserver(() => { renderDots(); setProgress(); }).observe(rail);
    renderDots();
  })();

  const ALL_KEYS = [["1", "Laugh"], ["2", "Applause"], ["3", "Bang"], ["4", "Gunshot"], ["5", "Drumroll"], ["6", "Air horn"], ["7", "Ka-ching"], ["8", "Ding"], ["9", "Boo"], ["0", "Wow"], ["Q", "Crickets"], ["W", "Ba-dum-tss"], ["E", "Fireworks"]];
  $("#keycaps").innerHTML = ALL_KEYS.map(([, n]) => `<div class="key"><span>${n}</span></div>`).join("");

  (function bunting() {
    const colors = ["#FF5A36", "#F5C542", "#8AB4FF", "#F4F1EA", "#6FBF8E"];
    let out = "";
    for (let i = 0; i < 15; i++) {
      const x = 8 + i * 20, t = x / 300;
      const y = (1 - t) * (1 - t) * 6 + 2 * (1 - t) * t * 34 + t * t * 6; // same curve as the string
      out += `<path d="M${x - 7} ${y - 1}L${x + 7} ${y - 1}L${x} ${y + 14}z" fill="${colors[i % colors.length]}"/>`;
    }
    $("#flags").innerHTML = out;
  })();

  /* ---------- Router with page transitions ---------- */
  const ROUTES = ["home", "plans", "app", "contact"];
  let current = null;
  const routeFromHash = () => { const h = location.hash.replace("#", ""); return ROUTES.includes(h) ? h : "home"; };

  function movePill(animate) {
    const pill = $(".nav-pill"), link = $(`.nav a[data-route="${current}"]`);
    if (!pill) return;
    if (!link) return;
    if (!animate) pill.style.transition = "none";
    pill.style.width = link.offsetWidth + "px";
    pill.style.transform = `translateX(${link.offsetLeft}px)`;
    if (!animate) { pill.offsetWidth; pill.style.transition = ""; }
  }

  function show(route, { first = false } = {}) {
    $$(".page").forEach((p) => { p.hidden = p.dataset.page !== route; p.classList.remove("is-entering", "is-fading"); });
    $$(".nav a").forEach((a) => { if (a.dataset.route === route) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    current = route;
    movePill(!first);
    if (!first) window.scrollTo(0, 0);
    const page = $(`.page[data-page="${route}"]`);
    if (!reduceMotion) { page.offsetWidth; page.classList.add("is-entering"); setTimeout(() => page.classList.remove("is-entering"), 1400); }
    if (!first) { const h = $("h1", page); if (h) h.focus({ preventScroll: true }); }
    demo.setActive(route === "home");
  }

  function go(route) {
    if (route === current) { window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }); return; }
    if (document.startViewTransition && !reduceMotion) {
      document.startViewTransition(() => show(route));
    } else {
      show(route);
      if (!reduceMotion) { const p = $(`.page[data-page="${route}"]`); p.classList.add("is-fading"); }
    }
  }

  // Only page names route; any other #anchor (like the skip link's #main) is left to the browser.
  window.addEventListener("hashchange", () => {
    const h = location.hash.slice(1);
    if (!h || ROUTES.includes(h)) go(routeFromHash());
  });
  window.addEventListener("resize", () => movePill(false));
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-plan]");
    if (a) pickPlan(a.dataset.plan);
    const link = e.target.closest('a[href^="#"]');
    if (link && link.getAttribute("href") === "#" + current) { e.preventDefault(); go(current); }
  });

  /* ---------- Hero demo: popups, effects, sounds ---------- */
  const POPUPS = [
    { key: "off", name: "10% OFF", chip: "y", html: "10% OFF", cls: "pp-off", pos: "top", enter: "in-pop", fx: "fireworks", fxName: "Fireworks", sound: "kaching", swatch: "#F5C542" },
    { key: "flash", name: "FLASH SALE", chip: "c", html: "FLASH<br>SALE", cls: "pp-flash", pos: "mid", enter: "in-bounce", fx: "confetti", fxName: "Confetti", sound: "airhorn", swatch: "#FF5A36" },
    { key: "ship", name: "FREE SHIPPING", chip: "s", html: "FREE<br>SHIPPING", cls: "pp-ship", pos: "upper-left", enter: "in-slide", fx: "sparkles", fxName: "Sparkles", sound: "ding", swatch: "#8AB4FF" },
    { key: "b1t1", name: "BUY 1 TAKE 1", chip: "w", html: "BUY 1<br>TAKE 1", cls: "pp-b1t1", pos: "low", enter: "in-pop", fx: "banderitas", fxName: "Banderitas", sound: "applause", swatch: "#FFFFFF" },
    { key: "last", name: "LAST 5 PCS", chip: "k", html: "LAST<br>5 PCS", cls: "pp-last", pos: "right", enter: "in-bounce", fx: "hearts", fxName: "Hearts", sound: "drumroll", swatch: "#0D0C10" },
    { key: "sold", name: "SOLD OUT", chip: "w", html: "SOLD OUT", cls: "pp-sold", pos: "mid", enter: "in-pop", fx: "none", fxName: "Bang", sound: "bang", swatch: "#FF5A36" }
  ];
  const PADS = [["kaching", "Ka-ching"], ["ding", "Ding"], ["applause", "Applause"], ["drumroll", "Drumroll"], ["airhorn", "Air horn"], ["bang", "Bang"]];

  const demo = (() => {
    const stage = $("#stage"), layer = $("#popups"), canvas = $("#fx"), ctx = canvas.getContext("2d");
    const showing = new Set();
    let soundOn = false, active = true, interacted = false, visible = true, cycleIdx = 0;
    let parts = [], flags = null, raf = 0, audio = null;

    $("#tiles").innerHTML = POPUPS.map((p) => `<button class="tchip" type="button" data-key="${p.key}" aria-pressed="false" aria-label="${p.name}"><span class="chip-pop ${p.chip}" aria-hidden="true">${p.name}</span><span class="on" aria-hidden="true">ON</span></button>`).join("");
    $("#pads").innerHTML = PADS.map(([id, n]) => `<button class="pad" type="button" data-sound="${id}" aria-label="Play ${n}"><span>${n}</span></button>`).join("");

    /* Canvas sizing */
    function size() {
      const r = stage.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(r.width * d); canvas.height = Math.round(r.height * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
    }
    size();
    new ResizeObserver(size).observe(stage);
    const W = () => stage.clientWidth, H = () => stage.clientHeight;

    /* Popups */
    function setTile(key, on) {
      $(`.tchip[data-key="${key}"]`, $("#tiles")).setAttribute("aria-pressed", on);
    }
    function showPopup(p, withFx = true) {
      if (showing.has(p.key)) return;
      // One popup at a time keeps the demo picture readable.
      [...showing].forEach((k) => hidePopup(POPUPS.find((o) => o.key === k)));
      const slot = document.createElement("div");
      slot.className = "slot"; slot.dataset.pos = p.pos; slot.dataset.key = p.key;
      slot.innerHTML = `<div class="popup ${p.cls} ${reduceMotion ? "" : p.enter}">${p.html}</div>`;
      layer.appendChild(slot);
      showing.add(p.key); setTile(p.key, true);
      if (withFx) {
        if (!reduceMotion) setTimeout(() => effect(p.fx, slot), p.enter === "in-bounce" ? 380 : 120);
        if (soundOn) play(p.sound);
      }
    }
    function hidePopup(p) {
      const slot = $(`.slot[data-key="${p.key}"]`, layer);
      showing.delete(p.key); setTile(p.key, false);
      if (!slot) return;
      if (reduceMotion) { slot.remove(); return; }
      const el = slot.firstElementChild;
      el.className = el.className.replace(/\bin-\w+\b/, "") + " out";
      el.addEventListener("animationend", () => slot.remove(), { once: true });
      setTimeout(() => slot.remove(), 600);
    }
    const toggle = (p) => (showing.has(p.key) ? hidePopup(p) : showPopup(p));

    /* Effects */
    const COLORS = ["#F5C542", "#FF5A36", "#8AB4FF", "#FFFFFF", "#6FBF8E"];
    const rnd = (a, b) => a + Math.random() * (b - a);
    function center(slot) {
      const el = slot.firstElementChild, s = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
      return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2, w: r.width, h: r.height };
    }
    function effect(kind, slot) {
      const w = W(), h = H();
      if (kind === "fireworks") {
        [[0.28, 0.2], [0.72, 0.16], [0.5, 0.32]].forEach(([fx, fy], i) => setTimeout(() => {
          const c = COLORS[i % 3];
          for (let k = 0; k < 42; k++) { const a = (k / 42) * Math.PI * 2, v = rnd(1.2, 3.2); parts.push({ t: "dot", x: fx * w, y: fy * h, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.045, life: 1, decay: rnd(0.012, 0.02), r: rnd(1.2, 2.2), c: Math.random() < 0.3 ? "#FFFFFF" : c }); }
        }, i * 260));
      } else if (kind === "confetti") {
        for (let k = 0; k < 110; k++) parts.push({ t: "rect", x: rnd(0, w), y: rnd(-h * 0.4, -10), vx: rnd(-0.6, 0.6), vy: rnd(1.4, 3), g: 0.01, life: 1, decay: 0.004, r: rnd(3, 6), rot: rnd(0, 6), vr: rnd(-0.2, 0.2), c: COLORS[k % 5], sway: rnd(0, 6) });
      } else if (kind === "sparkles") {
        const c = center(slot);
        for (let k = 0; k < 26; k++) parts.push({ t: "star", x: c.x + rnd(-c.w * 0.7, c.w * 0.7), y: c.y + rnd(-c.h, c.h), vx: 0, vy: rnd(-0.3, -0.05), g: 0, life: 1, decay: rnd(0.008, 0.016), r: rnd(3, 7), c: k % 3 ? "#FFF6C8" : "#8AB4FF", ph: rnd(0, 6) });
      } else if (kind === "hearts") {
        for (let k = 0; k < 16; k++) parts.push({ t: "heart", x: w * rnd(0.6, 0.95), y: h * rnd(0.85, 1.05), vx: rnd(-0.25, 0.25), vy: rnd(-1.6, -0.9), g: 0, life: 1, decay: rnd(0.006, 0.01), r: rnd(5, 9), c: k % 2 ? "#FF5A36" : "#FF8FA8", ph: rnd(0, 6), delay: k * 6 });
      } else if (kind === "banderitas") {
        flags = { t: 0, n: 9 };
      }
      loop();
    }
    function drawHeart(x, y, r) {
      ctx.beginPath(); ctx.moveTo(x, y + r * 0.35);
      ctx.bezierCurveTo(x - r, y - r * 0.4, x - r * 0.4, y - r, x, y - r * 0.35);
      ctx.bezierCurveTo(x + r * 0.4, y - r, x + r, y - r * 0.4, x, y + r * 0.35); ctx.fill();
    }
    function drawStar(x, y, r) {
      ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
    }
    function loop() { if (!raf) raf = requestAnimationFrame(frame); }
    function frame() {
      raf = 0;
      const w = W(), h = H();
      ctx.clearRect(0, 0, w, h);
      parts = parts.filter((p) => p.life > 0 && p.y < h + 40);
      for (const p of parts) {
        if (p.delay > 0) { p.delay--; continue; }
        p.vy += p.g; p.x += p.vx + (p.t === "rect" ? Math.sin((p.y + p.sway * 40) / 30) * 0.6 : 0) + (p.t === "heart" ? Math.sin(p.y / 18 + p.ph) * 0.4 : 0); p.y += p.vy; p.life -= p.decay;
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.4)); ctx.fillStyle = p.c;
        if (p.t === "dot") { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
        else if (p.t === "rect") { p.rot += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); }
        else if (p.t === "star") { p.ph += 0.15; drawStar(p.x, p.y, p.r * (0.55 + 0.45 * Math.sin(p.ph))); }
        else if (p.t === "heart") drawHeart(p.x, p.y, p.r);
      }
      if (flags) {
        flags.t += 1;
        const t = flags.t, drop = Math.min(1, t / 30), lift = t > 150 ? Math.min(1, (t - 150) / 30) : 0;
        const base = -30 + 48 * easeOut(drop) - 60 * lift;
        [[0, base], [0, base + 26]].forEach(([, y0], row) => {
          ctx.globalAlpha = 1 - lift; ctx.strokeStyle = "rgba(244,241,234,.7)"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(-4, y0); ctx.quadraticCurveTo(w / 2, y0 + 30, w + 4, y0); ctx.stroke();
          for (let i = 0; i < flags.n; i++) {
            const tt = (i + 0.5 + row * 0.5) / (flags.n + row * 0.5), x = (-4) * (1 - tt) ** 2 + 2 * (1 - tt) * tt * (w / 2) + tt * tt * (w + 4);
            const y = y0 * (1 - tt) ** 2 + 2 * (1 - tt) * tt * (y0 + 30) + tt * tt * y0;
            const sw = Math.sin(t / 9 + i) * 3, s = w / 22;
            ctx.fillStyle = COLORS[(i + row * 2) % 5];
            ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s, y); ctx.lineTo(x + sw, y + s * 2.2); ctx.fill();
          }
        });
        if (t > 180) flags = null;
      }
      ctx.globalAlpha = 1;
      if (parts.length || flags) loop();
    }
    const easeOut = (x) => 1 - (1 - x) ** 3;

    /* Sounds: synthesized in the browser, started only by a tap or key */
    function ac() {
      if (!audio) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; audio = new C(); }
      if (audio.state === "suspended") audio.resume();
      return audio;
    }
    function tone(a, { f, type = "sine", t0 = 0, dur = 0.3, vol = 0.2, f2 }) {
      const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + t0;
      o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
    }
    function noise(a, { t0 = 0, dur = 0.2, vol = 0.3, freq = 1800, q = 0.8, type = "bandpass" }) {
      const len = Math.max(1, Math.floor(a.sampleRate * dur)), b = a.createBuffer(1, len, a.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
      const s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime + t0;
      s.buffer = b; fl.type = type; fl.frequency.value = freq; fl.Q.value = q; g.gain.value = vol;
      s.connect(fl).connect(g).connect(a.destination); s.start(t);
    }
    const SOUNDS = {
      kaching: (a) => { noise(a, { dur: 0.05, vol: 0.4, freq: 3000 }); tone(a, { f: 1568, type: "triangle", t0: 0.05, dur: 0.18, vol: 0.18 }); tone(a, { f: 2637, type: "triangle", t0: 0.12, dur: 0.7, vol: 0.16 }); tone(a, { f: 3951, t0: 0.12, dur: 0.5, vol: 0.06 }); return 800; },
      ding: (a) => { tone(a, { f: 1760, dur: 1.3, vol: 0.2 }); tone(a, { f: 3520, dur: 0.6, vol: 0.05 }); return 900; },
      applause: (a) => { for (let i = 0; i < 46; i++) noise(a, { t0: i * 0.035 + Math.random() * 0.03, dur: 0.05, vol: 0.18 * Math.sin(Math.PI * i / 46) + 0.05, freq: rnd(1200, 2600), q: 1.4 }); return 1700; },
      drumroll: (a) => { for (let i = 0; i < 28; i++) noise(a, { t0: i * 0.04, dur: 0.06, vol: 0.08 + i * 0.008, freq: 900, q: 0.6 }); noise(a, { t0: 1.15, dur: 0.4, vol: 0.6, freq: 700, q: 0.5 }); tone(a, { f: 110, f2: 50, t0: 1.15, dur: 0.35, vol: 0.4 }); return 1500; },
      airhorn: (a) => { [370, 440, 466].forEach((f) => tone(a, { f, type: "sawtooth", dur: 0.85, vol: 0.06 })); return 900; },
      bang: (a) => { noise(a, { dur: 0.5, vol: 0.9, freq: 500, type: "lowpass", q: 0.3 }); tone(a, { f: 120, f2: 40, dur: 0.45, vol: 0.55 }); return 600; }
    };
    function play(id) {
      const a = ac(); if (!a || !SOUNDS[id]) return;
      const ms = SOUNDS[id](a);
      const pad = $(`.pad[data-sound="${id}"]`); if (pad) { pad.classList.add("playing"); setTimeout(() => pad.classList.remove("playing"), ms); }
    }
    function setSound(on) { soundOn = on; $("#sound-switch").setAttribute("aria-checked", on); }

    /* Wiring */
    $("#tiles").addEventListener("click", (e) => { const t = e.target.closest(".tchip"); if (t) toggle(POPUPS.find((p) => p.key === t.dataset.key)); });
    $("#pads").addEventListener("click", (e) => { const b = e.target.closest(".pad"); if (!b) return; setSound(true); play(b.dataset.sound); });
    $("#sound-switch").addEventListener("click", () => { setSound(!soundOn); if (soundOn) ac(); });
    $("#deck").addEventListener("pointerdown", () => { interacted = true; }, { passive: true });

    /* The tray's Sounds sheet and Hide all, as in the app */
    const sheet = $("#sound-sheet"), openBtn = $("#open-sounds");
    function setSheet(open) {
      sheet.hidden = !open;
      openBtn.setAttribute("aria-expanded", open);
      if (open) $(".pad", sheet).focus({ preventScroll: true });
    }
    openBtn.addEventListener("click", () => setSheet(sheet.hidden));
    $("#close-sounds").addEventListener("click", () => { setSheet(false); openBtn.focus({ preventScroll: true }); });
    $("#hide-all").addEventListener("click", () => { interacted = true; [...showing].forEach((k) => hidePopup(POPUPS.find((p) => p.key === k))); });

    /* "Your screen" or "What buyers see": the app's buttons never reach the live */
    const handset = $("#deck"), hint = $("#deck-hint");
    function setView(buyer) {
      handset.classList.toggle("buyer", buyer);
      $$(".app-ui", handset).forEach((el) => { el.inert = buyer; });
      $("#view-seller").setAttribute("aria-pressed", !buyer);
      $("#view-buyer").setAttribute("aria-pressed", buyer);
      hint.textContent = buyer
        ? "This is all your buyers get: the camera, your popups, effects and sounds. None of your buttons."
        : "Tap a popup on the phone to show or hide it. Your buttons never go out on the live.";
    }
    $("#view-seller").addEventListener("click", () => setView(false));
    $("#view-buyer").addEventListener("click", () => setView(true));
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(stage);

    /* The live's running time, as the app's top bar shows it */
    let liveSeconds = 12 * 60 + 48;
    const clockEl = $("#live-clock");
    const pad2 = (n) => String(n).padStart(2, "0");
    setInterval(() => {
      if (!active || document.hidden) return;
      liveSeconds += 1;
      clockEl.textContent = `LIVE ${pad2(Math.floor(liveSeconds / 60))}:${pad2(liveSeconds % 60)}`;
    }, 1000);

    /* Auto demo until someone taps */
    const CYCLE = ["flash", "ship", "b1t1", "last", "sold", "off"];
    showPopup(POPUPS[0], false);
    if (!reduceMotion) setInterval(() => {
      if (interacted || !active || !visible || document.hidden) return;
      const nextKey = CYCLE[cycleIdx++ % CYCLE.length];
      const next = POPUPS.find((p) => p.key === nextKey);
      showPopup(next);
    }, 3600);

    return { setActive(v) { active = v; } };
  })();

  /* ---------- Contact: Facebook, WhatsApp and Gmail ---------- */
  const ICONS = {
    facebook: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3C7 3 3 6.7 3 11.3c0 2.6 1.3 4.9 3.4 6.4V21l3.1-1.7c.8.2 1.6.3 2.5.3 5 0 9-3.7 9-8.3S17 3 12 3z"/><path d="M7.5 13.5l3-3 2.3 2.2 3.7-3.7"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1.3-4A8 8 0 1 1 8.2 19z"/><path d="M9.2 8.6c0 3.4 2.8 6.2 6.2 6.2l1-1.6-2-1-1 .9a4.6 4.6 0 0 1-2.5-2.5l.9-1-1-2z"/></svg>',
    email: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5L12 13l8.5-6.5"/></svg>'
  };
  const digits = (n) => n.replace(/\D/g, "");
  const prettyPhone = (n) => { const d = digits(n); return d.length === 12 && d.startsWith("63") ? `+63 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : n; };
  // Links that open WhatsApp or Gmail with a message already written; the visitor presses send.
  const waLink = (text) => `https://wa.me/${digits(CONTACT.whatsapp)}?text=${encodeURIComponent(text)}`;
  const gmailLink = (subject, body) => `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(CONTACT.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const EXT = 'target="_blank" rel="noopener noreferrer"';

  function renderContact() {
    const hello = "Hi NegosyoWorks Studio! I have a question.";
    const wa = waLink(hello);
    const gmail = gmailLink("NegosyoWorks Studio question", hello);
    const fbLabel = CONTACT.facebook.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "");
    const rows = [
      { icon: ICONS.facebook, name: "Facebook", val: fbLabel,
        actions: `<a class="btn btn-primary" href="${esc(CONTACT.facebook)}" ${EXT}>Message on Facebook <span class="arrow" aria-hidden="true">→</span></a>` },
      { icon: ICONS.whatsapp, name: "WhatsApp", val: prettyPhone(CONTACT.whatsapp),
        actions: `<a class="btn btn-primary" href="${esc(wa)}" ${EXT}>Chat on WhatsApp <span class="arrow" aria-hidden="true">→</span></a><button class="btn btn-ghost" type="button" data-copy="${esc(CONTACT.whatsapp)}" data-label="Copy number">Copy number</button>` },
      { icon: ICONS.email, name: "Gmail", val: CONTACT.email,
        actions: `<a class="btn btn-primary" href="${esc(gmail)}" ${EXT}>Write in Gmail <span class="arrow" aria-hidden="true">→</span></a><button class="btn btn-ghost" type="button" data-copy="${esc(CONTACT.email)}" data-label="Copy email">Copy email</button>` }
    ];
    const filled = { Facebook: /^https:\/\//.test(CONTACT.facebook), WhatsApp: digits(CONTACT.whatsapp).length >= 10, Gmail: /@/.test(CONTACT.email) };
    $("#reach-list").innerHTML = rows.filter((r) => filled[r.name]).map((r) => `
      <li class="reach-item">
        <span class="reach-ico">${r.icon}</span>
        <span class="reach-name">${r.name}</span>
        <span class="reach-val">${esc(r.val)}</span>
        <div class="reach-actions">${r.actions}</div>
      </li>`).join("");
  }
  $("#reach-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-copy]");
    if (b) copyText(b.dataset.copy, b, b.closest(".reach-item").querySelector(".reach-val"));
  });

  /* ---------- Get the app ---------- */
  function pickPlan(name) {
    const plan = PLANS.find((p) => p.name === name);
    const note = $("#picked");
    if (!plan) { note.hidden = true; return; }
    note.innerHTML = plan.price
      ? `You picked <b>${esc(plan.name)}</b> (${peso(plan.price)} a month). Start with your free week, then choose ${esc(plan.name)} in the app under Account → Plan.`
      : `You picked <b>Free</b>. Your first 7 days include going live.`;
    note.hidden = false;
  }

  // Only a path on this site ("/app/…") or an https address is used as the download link.
  function apkHref(value) {
    const v = String(value || "").trim();
    return /^https:\/\/[^\s"'<>]+$/.test(v) || /^\/[^\s"'<>\/][^\s"'<>]*$/.test(v) ? v : "";
  }

  (function renderDownload() {
    const box = $("#download");
    const apk = apkHref(SITE.apkUrl);
    $("#app-meta").textContent = ["Android app", SITE.appVersion && `Version ${SITE.appVersion}`, SITE.apkSizeMb && `${SITE.apkSizeMb} MB`].filter(Boolean).join(" · ");
    if (!apk) {
      box.innerHTML = `<div class="not-yet">
        <b>The download isn't on this page yet</b>
        <p>Message us and we'll send you the app to install on your phone or tablet.</p>
        <div><a class="btn btn-primary" href="#contact">Message us for the app <span class="arrow" aria-hidden="true">→</span></a></div>
      </div>`;
      return;
    }
    box.innerHTML = `<div style="display:grid;gap:14px">
      <a class="btn btn-primary btn-big" href="${esc(apk)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>Download the app</a>
      <div class="qr"><div class="qr-box" id="qr" aria-hidden="true"></div><div><b>On a computer?</b><span>Scan this with your Android phone's camera to download the app there.</span></div></div>
    </div>`;
    // The QR code is a convenience: if its library didn't load, the box just goes.
    try { new window.QRCode($("#qr"), { text: new URL(apk, location.href).href, width: 192, height: 192, correctLevel: window.QRCode.CorrectLevel.M }); }
    catch { $(".qr", box).remove(); }
  })();

  async function copyText(text, button, fallbackEl) {
    const label = button.dataset.label || button.textContent;
    try { await navigator.clipboard.writeText(text); button.textContent = "Copied"; }
    catch { const r = document.createRange(); r.selectNodeContents(fallbackEl); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); button.textContent = "Press Ctrl+C"; }
    setTimeout(() => { button.textContent = label; }, 1800);
  }

  /* ---------- Boot ---------- */
  renderPlans();
  renderContact();
  show(routeFromHash(), { first: true });
  if (document.fonts) document.fonts.ready.then(() => movePill(false));
})();
