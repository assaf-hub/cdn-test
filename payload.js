/* Published to a public GitHub repo and served via jsDelivr's /gh/ route.
   Writes a hidden marker node into the host page so the harness can prove that
   code from an allowlisted CDN both EXECUTED and REACHED THE DOM - not merely
   that the request was permitted.

   Deliberately inert: no network, no reads of page data, no storage. The
   marker is display:none so it cannot disturb layout, and the harness removes
   it again as part of its own cleanup. */
(function () {
  var MARK = "JSDELIVR-DOM-WRITE-OK";
  try {
    var el = document.createElement("div");
    el.id = "jsdelivr-dom-marker";
    el.setAttribute("data-mark", MARK);
    el.style.display = "none";
    el.textContent = MARK + " @ " + new Date().toISOString();
    (document.body || document.documentElement).appendChild(el);
    globalThis.__domWrite = {
      mark: MARK,
      at: new Date().toISOString(),
      src: (document.currentScript && document.currentScript.src) || null
    };
  } catch (e) {
    globalThis.__domWrite = { mark: null, error: e.name + " - " + (e.message || "") };
  }
})();
