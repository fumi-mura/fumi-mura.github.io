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
  }

  applyTheme(theme);
  applyLang(lang);

  var themeBtn = document.querySelector("[data-theme-btn]");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      theme = theme === "light" ? "dark" : "light";
      applyTheme(theme);
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
        for (var b = 0; b < blobs.length; b++) {
          var sp = b === 0 ? 0.12 : -0.09;
          var mp = b === 0 ? 26 : -20;
          blobs[b].style.transform =
            "translate3d(" + (mx * mp) + "px," + (scrollY * sp + my * mp) + "px,0)";
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
      if (clicks >= 3) {
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
})();
