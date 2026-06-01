/* LOVEFLIX — lazy-images.js
   Adds loading="lazy" + decoding="async" to every <img> on the page,
   including ones injected later by the vault / timeline / chat.
   Zero deps, ~1 KB.
*/
(function () {
  "use strict";

  function tagImg(img) {
    if (!img || img.tagName !== "IMG") return;
    // Don't lazy-load images already in the viewport at first paint
    // (the splash / login hero). Heuristic: data-eager attr opts out.
    if (img.hasAttribute("data-eager")) return;
    if (!img.hasAttribute("loading")) img.setAttribute("loading", "lazy");
    if (!img.hasAttribute("decoding")) img.setAttribute("decoding", "async");
    // Helpful hint for browsers that support it
    if (!img.hasAttribute("fetchpriority")) {
      img.setAttribute("fetchpriority", "low");
    }
  }

  function scan(root) {
    (root || document).querySelectorAll("img").forEach(tagImg);
  }

  // Initial pass
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { scan(); });
  } else {
    scan();
  }

  // Catch dynamically-added images (vault uploads, timeline cards, chat)
  var mo = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      for (var j = 0; j < m.addedNodes.length; j++) {
        var n = m.addedNodes[j];
        if (n.nodeType !== 1) continue;
        if (n.tagName === "IMG") tagImg(n);
        else if (n.querySelectorAll) n.querySelectorAll("img").forEach(tagImg);
      }
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
