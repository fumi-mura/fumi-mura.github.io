(function () {
  var KEY = "site-lang";

  function normalize(value) {
    if (value === "ja" || value === "en") return value;
    return null;
  }

  function detect() {
    var fromUrl = normalize(new URLSearchParams(location.search).get("lang"));
    if (fromUrl) return fromUrl;
    var fromStore = normalize(localStorage.getItem(KEY));
    if (fromStore) return fromStore;
    var nav = (navigator.language || "ja").toLowerCase();
    return nav.indexOf("ja") === 0 ? "ja" : "en";
  }

  function apply(lang) {
    var root = document.documentElement;
    root.setAttribute("data-lang", lang);
    root.setAttribute("lang", lang);
    var buttons = document.querySelectorAll("[data-lang-btn]");
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      btn.setAttribute("aria-pressed", btn.getAttribute("data-lang-btn") === lang ? "true" : "false");
    }
  }

  var current = detect();
  apply(current);

  document.addEventListener("DOMContentLoaded", function () {
    apply(current);
    var buttons = document.querySelectorAll("[data-lang-btn]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function () {
        var next = normalize(this.getAttribute("data-lang-btn"));
        if (!next) return;
        current = next;
        try {
          localStorage.setItem(KEY, next);
        } catch (e) {}
        apply(next);
      });
    }
  });
})();
