/* Published to a public GitHub repo and served via jsDelivr's /gh/ route.
   Proves that code from an allowlisted CDN both EXECUTED and REACHED THE DOM -
   not merely that the request was permitted.

   Two write modes, so one file serves both harnesses:
     - if #jsdelivr-target exists, write VISIBLE content into it (standalone test)
     - otherwise append a display:none marker to <body> (embedded in a larger run)

   Deliberately inert: no network, no reads of page data, no storage. */
(function () {
  var MARK = "JSDELIVR-DOM-WRITE-OK";
  var stamp = new Date().toISOString();
  var src = (document.currentScript && document.currentScript.src) || null;

  try {
    var target = document.getElementById("jsdelivr-target");

    if (target) {
      /* Visible write. Built with createElement/textContent rather than
         innerHTML so the write itself does not depend on unsafe-inline or on
         any HTML-sanitiser behaviour in the host surface. */
      var box = document.createElement("div");
      box.className = "written";

      var h = document.createElement("strong");
      h.textContent = MARK;
      box.appendChild(h);

      var lines = [
        "This block was created by JavaScript fetched from jsDelivr.",
        "written at: " + stamp,
        "script src: " + (src || "(unavailable)"),
        "nodes appended by the remote file: 1"
      ];
      for (var i = 0; i < lines.length; i++) {
        var p = document.createElement("div");
        p.className = "wline";
        p.textContent = lines[i];
        box.appendChild(p);
      }
      target.appendChild(box);
    }

    /* Always leave the machine-readable marker too. */
    var el = document.createElement("div");
    el.id = "jsdelivr-dom-marker";
    el.setAttribute("data-mark", MARK);
    el.style.display = "none";
    el.textContent = MARK + " @ " + stamp;
    (document.body || document.documentElement).appendChild(el);

    globalThis.__domWrite = { mark: MARK, at: stamp, src: src, visible: !!target };
  } catch (e) {
    globalThis.__domWrite = { mark: null, error: e.name + " - " + (e.message || ""), at: stamp };
  }
})();
