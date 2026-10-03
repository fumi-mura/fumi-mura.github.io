(function () {
  var root = document.documentElement;
  // JS が動くときだけ、スクロールで現れる要素を最初に隠す（動かないと中身が出ないため）
  root.classList.add("js");
  var video = document.querySelector(".screen-video");
  var sound = document.querySelector("[data-sound]");
  var head = document.querySelector(".day-head");
  var stores = document.querySelectorAll("[data-store]");
  var clips = document.querySelectorAll("video[data-clip]");

  var STORE = {
    ja: "https://apps.apple.com/jp/app/id6785427120",
    en: "https://apps.apple.com/us/app/id6785427120"
  };

  // App Store Connect でこの LP 経由の入手を数えるための印。pt はプロバイダ ID（開発者アカウントごとに 1 つ）。
  // どこから来たかは LP の URL の ?src= で受け取る（note の記事なら ?src=note）。ct は App Store の上限に収める
  var PROVIDER = "94214112";
  var source = (new URLSearchParams(location.search).get("src") || "").toLowerCase();
  var campaign = "reelo-lp" + (/^[a-z0-9-]{1,16}$/.test(source) ? "-" + source : "");

  function storeUrl(lang) {
    return STORE[lang] + "?pt=" + PROVIDER + "&ct=" + campaign + "&mt=8";
  }

  // localStorage はプライベートブラウズなどで例外を投げるので、失敗しても表示は続ける
  function saved() {
    try { return localStorage.getItem("reelo-lang"); } catch (e) { return null; }
  }

  function save(lang) {
    try { localStorage.setItem("reelo-lang", lang); } catch (e) {}
  }

  function initialLang() {
    var param = new URLSearchParams(location.search).get("lang");
    if (param === "ja" || param === "en") return param;
    var stored = saved();
    if (stored === "ja" || stored === "en") return stored;
    return (navigator.language || "").toLowerCase().indexOf("ja") === 0 ? "ja" : "en";
  }

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  var CLIPS = "../assets/apps/reelo/lp/clips/";
  var LP = "../assets/apps/reelo/lp/";
  // スマホには小さい版（約 1.9MB）を出す。大きい版は 4.8MB あり、モバイル回線で開いた瞬間に読み込むには重い
  var small = window.matchMedia("(max-width: 860px)").matches || saveData;

  // 各節のループは画面に入るまで読み込まない。言語を変えたら、読み込み済みのものだけ差し替える
  function loadClip(clip, lang) {
    clip.poster = CLIPS + clip.dataset.clip + "-" + lang + ".jpg";
    if (!clip.dataset.loaded) return;
    var src = CLIPS + clip.dataset.clip + "-" + lang + ".mp4";
    if (clip.getAttribute("src") === src) return;
    clip.src = src;
    if (!reduced && clip.dataset.visible) clip.play().catch(function () {});
  }

  function soundLabel() {
    var lang = root.dataset.lang;
    var on = sound.getAttribute("aria-pressed") === "true";
    sound.setAttribute("aria-label", sound.dataset[(on ? "labelOn" : "labelOff") + (lang === "ja" ? "Ja" : "En")]);
  }

  function setLang(lang, swapVideo) {
    root.dataset.lang = lang;
    root.lang = lang;
    stores.forEach(function (a) { a.href = storeUrl(lang); });
    clips.forEach(function (clip) { loadClip(clip, lang); });
    document.querySelectorAll("[data-lang-btn]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(btn.dataset.langBtn === lang));
    });
    soundLabel();

    // 動画は言語ごとに焼き込んだ文字が違うので差し替える。
    // 動きを減らす設定とデータセーバーの人には自動で再生しない（音のボタンで始められる）
    var src = LP + "hero-" + lang + (small ? "-sm" : "") + ".mp4";
    if (swapVideo && video.getAttribute("src") !== src) {
      video.poster = LP + "poster-" + lang + ".jpg";
      // play() だけだと、読み込み直後に呼んだ 1 回が効かないことがあった。autoplay も立てておけば、再生できる状態になった時点でブラウザが始める
      video.autoplay = !reduced && !saveData;
      video.src = src;
      if (video.autoplay) video.play().catch(function () {});
    }
  }

  var lang = initialLang();
  setLang(lang, true);

  document.querySelectorAll("[data-lang-btn]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      save(btn.dataset.langBtn);
      setLang(btn.dataset.langBtn, true);
    });
  });

  sound.addEventListener("click", function () {
    var on = sound.getAttribute("aria-pressed") !== "true";
    sound.setAttribute("aria-pressed", String(on));
    video.muted = !on;
    if (video.paused) video.play().catch(function () {});
    soundLabel();
  });

  if ("IntersectionObserver" in window) {
    var clipObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var clip = entry.target;
        if (entry.isIntersecting) {
          clip.dataset.visible = "1";
          if (!clip.dataset.loaded) {
            clip.dataset.loaded = "1";
            loadClip(clip, root.dataset.lang);
          }
          if (!reduced) clip.play().catch(function () {});
        } else {
          delete clip.dataset.visible;
          clip.pause();
        }
      });
    }, { rootMargin: "200px 0px" });
    clips.forEach(function (clip) { clipObserver.observe(clip); });

    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -10% 0px" });
    document.querySelectorAll("[data-reveal]").forEach(function (el) { revealObserver.observe(el); });
  } else {
    document.querySelectorAll("[data-reveal]").forEach(function (el) { el.classList.add("in"); });
  }

  var bar = document.querySelector(".bar");
  var heroCta = document.querySelector(".hero .cta");
  // 上部のバーの入手ボタンは、ヒーローのボタンを通り過ぎてから出す。両方同時に見えると重複する
  function onScroll() {
    bar.classList.toggle("scrolled", window.scrollY > 24);
    bar.classList.toggle("show-cta", heroCta.getBoundingClientRect().bottom < 0);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  function tick() {
    if (video.duration) {
      head.style.setProperty("--p", (video.currentTime / video.duration).toFixed(4));
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
