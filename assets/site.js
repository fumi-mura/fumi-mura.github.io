(function () {
  var root = document.documentElement;
  var THEME_KEY = "fumiworks_theme";
  var LANG_KEY = "fumiworks_lang";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia && window.matchMedia("(pointer: fine)").matches;

  var savedTheme = null, savedLang = null;
  try { savedTheme = localStorage.getItem(THEME_KEY); savedLang = localStorage.getItem(LANG_KEY); } catch (e) {}
  var browserLang = (navigator.language || "en").toLowerCase();
  var lang = savedLang || (browserLang.indexOf("ja") === 0 ? "ja" : "en");
  var theme = savedTheme || "light";

  function applyTheme(t) {
    root.setAttribute("data-theme", t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  }
  function updateLangButtons(l) {
    var btns = document.querySelectorAll("[data-lang-btn]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute("aria-pressed", btns[i].getAttribute("data-lang-btn") === l ? "true" : "false");
    }
  }
  function applyLang(l) {
    root.setAttribute("data-lang", l);
    root.setAttribute("lang", l);
    updateLangButtons(l);
    try { localStorage.setItem(LANG_KEY, l); } catch (e) {}
    window.dispatchEvent(new Event("langchange"));
  }

  applyTheme(theme);
  applyLang(lang);

  var themeBtn = document.querySelector("[data-theme-btn]");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var next = theme === "light" ? "dark" : "light";
      var doSwitch = function () { theme = next; applyTheme(theme); };
      if (reduce || typeof document.startViewTransition !== "function") {
        doSwitch();
        return;
      }
      var r = themeBtn.getBoundingClientRect();
      var x = r.left + r.width / 2;
      var y = r.top + r.height / 2;
      var endR = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      var vt = document.startViewTransition(doSwitch);
      vt.ready.then(function () {
        root.animate(
          { clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + endR + "px at " + x + "px " + y + "px)"] },
          { duration: 480, easing: "cubic-bezier(.16,1,.3,1)", pseudoElement: "::view-transition-new(root)" }
        );
      });
    });
  }

  var fade = document.getElementById("fade");
  var langBtns = document.querySelectorAll("[data-lang-btn]");
  for (var i = 0; i < langBtns.length; i++) {
    langBtns[i].addEventListener("click", function () {
      var next = this.getAttribute("data-lang-btn");
      if (next === lang) return;
      lang = next;
      if (fade) {
        fade.style.opacity = "0";
        setTimeout(function () { applyLang(lang); fade.style.opacity = "1"; }, 160);
      } else {
        applyLang(lang);
      }
    });
  }

  var reveals = document.querySelectorAll("[data-reveal]");
  if (reduce || !("IntersectionObserver" in window)) {
    for (var j = 0; j < reveals.length; j++) reveals[j].classList.add("in");
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    for (var k = 0; k < reveals.length; k++) io.observe(reveals[k]);
  }

  // Blobs: scroll parallax + mouse follow
  if (!reduce) {
    var blobs = document.querySelectorAll(".blob-wrap");
    if (blobs.length) {
      var scrollY = window.scrollY || 0;
      var mx = 0, my = 0;
      var queued = false;
      function renderBlobs() {
        queued = false;
        var hueShift = Math.min(scrollY * 0.05, 60);
        for (var b = 0; b < blobs.length; b++) {
          var sp = b === 0 ? 0.12 : -0.09;
          var mp = b === 0 ? 26 : -20;
          blobs[b].style.transform =
            "translate3d(" + (mx * mp) + "px," + (scrollY * sp + my * mp) + "px,0)";
          blobs[b].style.filter = "hue-rotate(" + hueShift + "deg)";
        }
      }
      function requestRender() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(renderBlobs);
      }
      window.addEventListener("scroll", function () {
        scrollY = window.scrollY || 0;
        requestRender();
      }, { passive: true });
      if (finePointer) {
        window.addEventListener("mousemove", function (e) {
          mx = e.clientX / window.innerWidth - 0.5;
          my = e.clientY / window.innerHeight - 0.5;
          requestRender();
        }, { passive: true });
      }

      // Idle: gentle breathing when the user goes quiet
      var idleTimer = null;
      function setBreathing(on) {
        for (var b = 0; b < blobs.length; b++) blobs[b].classList.toggle("is-breathing", on);
      }
      function resetIdle() {
        setBreathing(false);
        clearTimeout(idleTimer);
        idleTimer = setTimeout(function () { setBreathing(true); }, 3000);
      }
      window.addEventListener("mousemove", resetIdle, { passive: true });
      window.addEventListener("scroll", resetIdle, { passive: true });
      window.addEventListener("pointerdown", resetIdle, { passive: true });
      resetIdle();
    }
  }

  // Cards: 3D tilt + sheen follow
  if (finePointer && !reduce) {
    var cards = document.querySelectorAll(".card");
    for (var c = 0; c < cards.length; c++) {
      (function (card) {
        card.addEventListener("mouseenter", function () { card.classList.add("is-tilting"); });
        card.addEventListener("mousemove", function (e) {
          var r = card.getBoundingClientRect();
          var px = (e.clientX - r.left) / r.width;
          var py = (e.clientY - r.top) / r.height;
          var rx = (0.5 - py) * 6;
          var ry = (px - 0.5) * 8;
          card.style.transform =
            "perspective(900px) rotateX(" + rx + "deg) rotateY(" + ry + "deg) translateY(-8px)";
          card.style.setProperty("--mx", px * 100 + "%");
          card.style.setProperty("--my", py * 100 + "%");
        });
        card.addEventListener("mouseleave", function () {
          card.classList.remove("is-tilting");
          card.style.transform = "";
          card.style.removeProperty("--mx");
          card.style.removeProperty("--my");
        });
      })(cards[c]);
    }
  }

  var logo = document.querySelector(".logo");

  // Logo: magnet hover
  if (logo && finePointer && !reduce) {
    logo.addEventListener("mousemove", function (e) {
      var r = logo.getBoundingClientRect();
      var x = e.clientX - (r.left + r.width / 2);
      var y = e.clientY - (r.top + r.height / 2);
      logo.style.transform = "translate(" + x * 0.3 + "px," + y * 0.4 + "px)";
    });
    logo.addEventListener("mouseleave", function () { logo.style.transform = ""; });
  }

  // Logo: rapid-tap easter egg (hue shift + confetti)
  if (logo) {
    var hues = [250, 12, 330, 150, 45, 285];
    var hueIdx = 0;
    function shiftHue() {
      hueIdx = (hueIdx + 1) % hues.length;
      var h = hues[hueIdx];
      root.style.setProperty("--accent", "oklch(0.6 0.15 " + h + ")");
      root.style.setProperty("--accent-soft", "oklch(0.6 0.15 " + h + " / 0.28)");
      root.style.setProperty("--card-glow", "oklch(0.62 0.15 " + h + " / 0.34)");
      root.style.setProperty("--card-glow-edge", "oklch(0.62 0.15 " + h + " / 0)");
      root.style.setProperty("--blob1", "oklch(0.72 0.12 " + h + " / 0.45)");
      root.style.setProperty("--blob2", "oklch(0.8 0.1 " + ((h + 60) % 360) + " / 0.35)");
    }
    function burst() {
      var r = logo.getBoundingClientRect();
      var ox = r.left + r.width / 2;
      var oy = r.top + r.height / 2;
      var palette = ["#4f8cff", "#ff6b9d", "#ffd166", "#5fd0a8", "#c084fc", "#ff8f5e"];
      for (var p = 0; p < 40; p++) {
        var piece = document.createElement("div");
        piece.className = "confetti-piece";
        piece.style.background = palette[p % palette.length];
        document.body.appendChild(piece);
        var angle = Math.random() * Math.PI * 2;
        var vel = 120 + Math.random() * 180;
        var dx = Math.cos(angle) * vel;
        var dy = Math.sin(angle) * vel - (120 + Math.random() * 120);
        var rot = Math.random() * 720 - 360;
        piece.animate([
          { transform: "translate(" + ox + "px," + oy + "px) rotate(0deg)", opacity: 1 },
          { transform: "translate(" + (ox + dx) + "px," + (oy + dy + 460) + "px) rotate(" + rot + "deg)", opacity: 0 }
        ], { duration: 1100 + Math.random() * 500, easing: "cubic-bezier(.16,1,.3,1)" }).onfinish = function () {
          this.effect.target.remove();
        };
      }
    }
    function celebrate() {
      shiftHue();
      if (!reduce && typeof Element.prototype.animate === "function") burst();
    }

    var clicks = 0, tapTimer = null;
    logo.addEventListener("click", function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      clicks++;
      clearTimeout(tapTimer);
      if (clicks >= 2) {
        clicks = 0;
        celebrate();
        return;
      }
      var href = logo.getAttribute("href");
      tapTimer = setTimeout(function () {
        if (clicks === 1) window.location.href = href;
        clicks = 0;
      }, 300);
    });
  }

  // App screenshots: filmstrip in each card + lightbox gallery
  var strips = document.querySelectorAll(".card-strip[data-shots]");
  var lb = document.getElementById("lightbox");
  if (strips.length && lb) {
    var lbImg = lb.querySelector(".lb-img");
    var dotsWrap = lb.querySelector(".lb-dots");
    var countEl = lb.querySelector(".lb-count");
    var btnPrev = lb.querySelector(".lb-prev");
    var btnNext = lb.querySelector(".lb-next");
    var btnClose = lb.querySelector(".lb-close");
    var app = null, count = 0, idx = 0, lastFocus = null;
    var shotManifest = null;

    function curLang() { return root.getAttribute("data-lang") === "en" ? "en" : "ja"; }
    function appShots(a) {
      if (!shotManifest || !shotManifest.apps || !shotManifest.apps[a]) return null;
      return shotManifest.apps[a][curLang()] || shotManifest.apps[a].ja || shotManifest.apps[a].en || null;
    }
    function countFor(a) {
      var shots = appShots(a);
      return shots && shots.count ? shots.count : 0;
    }
    function srcFor(i) {
      var shots = appShots(app);
      return shots && shots.images ? shots.images[i - 1] : "";
    }
    function thumbFor(a, i) {
      var shots = appShots(a);
      return shots && shots.thumbs ? shots.thumbs[i - 1] : "";
    }
    function preload(i) { if (i >= 1 && i <= count) { new Image().src = srcFor(i); } }

    function buildStrips() {
      for (var s = 0; s < strips.length; s++) {
        var strip = strips[s];
        var a = strip.getAttribute("data-shots");
        var n = countFor(a);
        strip.innerHTML = "";
        if (!n) continue;
        for (var i = 1; i <= n; i++) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "strip-item";
          btn.setAttribute("aria-label", a + " " + i + " / " + n);
          var im = document.createElement("img");
          im.src = thumbFor(a, i);
          im.alt = "";
          im.loading = "lazy";
          btn.appendChild(im);
          (function (ap, nn, start) {
            btn.addEventListener("click", function () { openLb(ap, nn, start); });
          })(a, n, i - 1);
          strip.appendChild(btn);
        }
      }
    }

    function show(i) {
      if (!count) return;
      idx = (i + count) % count;
      lbImg.src = srcFor(idx + 1);
      countEl.textContent = (idx + 1) + " / " + count;
      var dots = dotsWrap.children;
      for (var d = 0; d < dots.length; d++) {
        dots[d].setAttribute("aria-current", d === idx ? "true" : "false");
      }
      preload(idx + 2);
      preload(idx);
    }

    function buildDots() {
      dotsWrap.innerHTML = "";
      for (var d = 0; d < count; d++) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "lb-dot";
        b.setAttribute("aria-label", (d + 1) + " / " + count);
        (function (n) { b.addEventListener("click", function () { show(n); }); })(d);
        dotsWrap.appendChild(b);
      }
    }

    function openLb(a, n, start) {
      app = a;
      count = n;
      if (!count) return;
      lastFocus = document.activeElement;
      buildDots();
      lb.hidden = false;
      document.body.style.overflow = "hidden";
      requestAnimationFrame(function () { lb.classList.add("is-open"); });
      show(start);
      btnClose.focus();
    }
    function closeLb() {
      lb.classList.remove("is-open");
      document.body.style.overflow = "";
      var done = function (e) {
        if (e && e.target !== lb) return;
        lb.hidden = true;
        lb.removeEventListener("transitionend", done);
      };
      if (reduce) done(); else lb.addEventListener("transitionend", done);
      if (lastFocus) lastFocus.focus();
    }

    function initGallery(manifest) {
      shotManifest = manifest;
      buildStrips();
    }

    window.addEventListener("langchange", function () {
      buildStrips();
      if (!lb.hidden && app) {
        count = countFor(app);
        if (!count) { closeLb(); return; }
        buildDots();
        show(Math.min(idx, count - 1));
      }
    });
    btnPrev.addEventListener("click", function () { show(idx - 1); });
    btnNext.addEventListener("click", function () { show(idx + 1); });
    btnClose.addEventListener("click", closeLb);
    lb.addEventListener("click", function (e) {
      if (e.target === lb || e.target.classList.contains("lb-stage")) closeLb();
    });
    document.addEventListener("keydown", function (e) {
      if (lb.hidden) return;
      if (e.key === "Escape") closeLb();
      else if (e.key === "ArrowLeft") show(idx - 1);
      else if (e.key === "ArrowRight") show(idx + 1);
    });

    var sx = 0, sy = 0, swiping = false;
    lb.addEventListener("touchstart", function (e) {
      var p = e.touches[0]; sx = p.clientX; sy = p.clientY; swiping = true;
    }, { passive: true });
    lb.addEventListener("touchend", function (e) {
      if (!swiping) return;
      swiping = false;
      var p = e.changedTouches[0];
      var dx = p.clientX - sx, dy = p.clientY - sy;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) show(dx < 0 ? idx + 1 : idx - 1);
    }, { passive: true });

    if (typeof fetch === "function") {
      fetch("assets/apps/manifest.json")
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(initGallery)
        .catch(function () { initGallery(null); });
    } else {
      initGallery(null);
    }
  }
})();
