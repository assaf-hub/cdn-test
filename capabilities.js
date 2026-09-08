/* capabilities.js - published to a public GitHub repo, served via jsDelivr /gh/.
   Loaded by test-jsdelivr-capabilities.html.

   Question: once remotely-authored code is executing in this realm, WHAT does
   it actually have access to? This enumerates capability and reports it; it is
   not a harvester.

   Design rules, deliberate and load-bearing:
     - PRESENCE AND SHAPE ONLY. Values are reduced to type+length via shape().
       Key and cookie NAMES are reported because they carry the impact argument;
       contents never are.
     - NOTHING IS TRANSMITTED. No fetch to a foreign origin, no beacon, no image
       pixel. Results go into this page and stay there.
     - NOTHING DESTRUCTIVE IS INVOKED. require() is never called, no service
       worker is registered, clipboard.readText() is never awaited, no storage is
       written. Reachability is established by typeof, not by use.

   That distinction is the point: a report needs to show the capability exists,
   which does not require exercising it against a real user's data. */
(function () {
  var C = [];
  function add(area, title, result, sev, note) {
    C.push({ area: area, title: title, result: String(result), sev: sev || "info", note: note || null });
  }

  /* Reduce any value to its shape. Never its content. */
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
    cap = cap || 25;
    var n = list.slice(0, cap);
    return n.join(", ") + (list.length > cap ? "  …and " + (list.length - cap) + " more" : "");
  }
  function tryFn(fn, dflt) { try { return fn(); } catch (e) { return dflt === undefined ? ("threw: " + e.name) : dflt; } }

  /* ---------- 1. Realm identity ---------- */
  add("realm", "location.href", tryFn(function () { return location.href.slice(0, 160); }), "info");
  add("realm", "origin", tryFn(function () { return location.origin; }), "info");
  add("realm", "document.title", shape(tryFn(function () { return document.title; }, "")), "info");
  add("realm", "referrer", shape(tryFn(function () { return document.referrer; }, "")), "info");
  add("realm", "isSecureContext", tryFn(function () { return String(window.isSecureContext); }), "info");
  add("realm", "crossOriginIsolated", tryFn(function () { return String(window.crossOriginIsolated); }), "info");

  /* ---------- 2. Electron / node reachability - the real ceiling ---------- */
  var nodeish = [];
  ["require", "process", "module", "exports", "global", "Buffer", "__dirname", "__filename"]
    .forEach(function (k) { if (typeof window[k] !== "undefined") nodeish.push(k + ":" + typeof window[k]); });

  add("electron", "node globals present on window",
      nodeish.length ? nodeish.join(", ") : "none",
      nodeish.length ? "crit" : "none",
      nodeish.length
        ? "require() is NOT invoked here - reachability is established by typeof alone. If require " +
          "resolves real node builtins, this stops being a DOM-access issue and becomes code " +
          "execution outside the web sandbox, which is a materially different (and higher) finding."
        : "No node globals exposed to this realm - contextIsolation/nodeIntegration look correctly set.");

  if (typeof window.process !== "undefined" && window.process) {
    add("electron", "process.versions", shape(tryFn(function () { return process.versions; })), "crit",
        tryFn(function () {
          var v = process.versions || {};
          return "electron=" + (v.electron || "?") + "  chrome=" + (v.chrome || "?") + "  node=" + (v.node || "?");
        }));
    add("electron", "process.platform / type", tryFn(function () {
      return String(process.platform) + " / " + String(process.type);
    }), "high");
  }

  /* contextBridge-exposed APIs land on window as ordinary objects. Names only. */
  var bridge = tryFn(function () {
    return Object.keys(window).filter(function (k) {
      return /^(electron|__electron|ipc|ipcRenderer|desktop|slack|__slack|native|preload|api|bridge)/i.test(k);
    });
  }, []);
  add("electron", "possible preload/contextBridge surfaces",
      bridge.length ? names(bridge) : "none matched",
      bridge.length ? "high" : "none",
      bridge.length ? "Names only. Each is worth enumerating by hand - a bridge that forwards IPC is " +
                      "the pivot from renderer JS to main-process capability." : null);

  /* ---------- 3. Frame ancestry and parent reach ---------- */
  add("frames", "window === window.top", tryFn(function () { return String(window === window.top); }), "info");
  add("frames", "child frames", tryFn(function () { return String(window.frames.length); }), "info");
  if (window !== window.parent) {
    var pl = tryFn(function () { return window.parent.location.href.slice(0, 120); });
    var reachable = pl.indexOf("threw:") !== 0;
    add("frames", "read parent.location", reachable ? pl : pl,
        reachable ? "crit" : "none",
        reachable ? "Parent is same-origin from here, so the parent document's DOM is reachable too - " +
                    "this escapes the boundary the embedding was presumably meant to create."
                  : "Cross-origin parent: blocked by the same-origin policy, as expected.");
    add("frames", "read parent.document.title",
        shape(tryFn(function () { return window.parent.document.title; })),
        reachable ? "crit" : "none");
  }

  /* ---------- 4. Storage - names and sizes, never values ---------- */
  var ck = tryFn(function () { return document.cookie ? document.cookie.split(/; */) : []; }, []);
  add("storage", "document.cookie",
      ck.length ? ck.length + " cookie(s) readable from script" : "none readable",
      ck.length ? "high" : "info",
      ck.length ? "names: " + names(ck.map(function (c) { return c.split("=")[0]; })) +
                  "\nvalues redacted to lengths: " + ck.map(function (c) {
                    return (c.split("=")[1] || "").length; }).join(",") +
                  "\n\nAnything HttpOnly is absent from this list by definition, so this is the " +
                  "script-visible subset only."
                : null);

  ["localStorage", "sessionStorage"].forEach(function (which) {
    var res = tryFn(function () {
      var st = window[which], ks = [];
      for (var i = 0; i < st.length; i++) ks.push(st.key(i));
      return { n: st.length, keys: ks, sizes: ks.map(function (k) { return (st.getItem(k) || "").length; }) };
    });
    if (typeof res === "string") { add("storage", which, res, "info"); return; }
    add("storage", which, res.n ? res.n + " key(s) readable" : "empty",
        res.n ? "high" : "info",
        res.n ? "keys: " + names(res.keys) + "\nvalue lengths: " + res.sizes.slice(0, 25).join(",") +
                "\n\nRead-only enumeration; nothing was written and no value is reproduced here."
              : null);
  });

  add("storage", "indexedDB", typeof indexedDB !== "undefined" ? "available" : "unavailable",
      typeof indexedDB !== "undefined" ? "med" : "none",
      "Database names are listed asynchronously below if the API supports it.");
  add("storage", "caches (Service Worker cache)", typeof caches !== "undefined" ? "available" : "unavailable",
      typeof caches !== "undefined" ? "med" : "none");

  /* ---------- 5. What the rendered surface exposes ---------- */
  add("dom", "total elements", tryFn(function () { return String(document.querySelectorAll("*").length); }), "info");
  var inputs = tryFn(function () { return document.querySelectorAll("input,textarea,select"); }, []);
  var filled = tryFn(function () {
    var n = 0;
    Array.prototype.forEach.call(inputs, function (el) { if (el.value && el.value.length) n++; });
    return n;
  }, 0);
  add("dom", "form fields readable",
      inputs.length + " field(s), " + filled + " currently non-empty",
      filled ? "high" : "info",
      "Counts only - no field value is read into the report. On a live surface this is the " +
      "measure of what in-page input remote code can see.");
  add("dom", "document text reachable",
      shape(tryFn(function () { return document.body ? document.body.innerText : ""; })),
      "high", "Reported as a length. The text itself is never copied anywhere.");
  add("dom", "can inject nodes", tryFn(function () {
    var d = document.createElement("div"); d.style.display = "none";
    document.body.appendChild(d); d.remove(); return "yes - append+remove succeeded";
  }), "high", "Basis for UI redress on a surface that renders untrusted content.");

  /* ---------- 6. Sensitive APIs - presence only, never invoked ---------- */
  var api = [];
  [["clipboard", navigator.clipboard], ["clipboard.readText", navigator.clipboard && navigator.clipboard.readText],
   ["mediaDevices", navigator.mediaDevices], ["geolocation", navigator.geolocation],
   ["serviceWorker", navigator.serviceWorker], ["credentials", navigator.credentials],
   ["RTCPeerConnection", window.RTCPeerConnection], ["Notification", window.Notification]]
    .forEach(function (p) { if (p[1]) api.push(p[0]); });
  add("api", "sensitive APIs exposed to this realm", api.length ? names(api) : "none",
      api.length ? "med" : "none",
      "Presence checks only. Nothing here is called: no clipboard read, no permission prompt, " +
      "no service-worker registration. Invoking them would be exercising the capability rather " +
      "than demonstrating it.");

  /* ---------- 7. Host application globals ---------- */
  var interesting = tryFn(function () {
    return Object.keys(window).filter(function (k) {
      return /(boot_data|initial_state|__INITIAL|__REDUX|__NEXT|__NUXT|webpackChunk|__webpack|store|config|token|session|auth|user|team|workspace|TS)/i.test(k);
    });
  }, []);
  add("globals", "app-internal globals matched",
      interesting.length ? interesting.length + " matched" : "none",
      interesting.length ? "high" : "none",
      interesting.length
        ? interesting.slice(0, 25).map(function (k) { return k + " = " + shape(window[k]); }).join("\n") +
          "\n\nNames and shapes only. A bootstrapped config or store object on window is usually where " +
          "a surface's tokens and workspace identifiers actually live - worth enumerating by hand."
        : null);

  /* ---------- 8. Same-origin request capability ---------- */
  var jobs = [];
  jobs.push(new Promise(function (res) {
    if (typeof fetch !== "function") { add("net", "same-origin fetch", "fetch unavailable", "info"); return res(); }
    fetch(location.origin + "/", { cache: "no-store", credentials: "include" })
      .then(function (r) { return r.text().then(function (t) { return { r: r, len: t.length }; }); })
      .then(function (o) {
        add("net", "same-origin fetch with credentials",
            "HTTP " + o.r.status + " - response body READABLE",
            "crit",
            "content-type: " + (o.r.headers.get("content-type") || "?") +
            "\nbody length: " + o.len + " chars (body itself not reproduced)" +
            "\n\nconnect-src permits same-origin requests, and they carry the session. Remote code " +
            "can therefore read authenticated same-origin endpoints as the logged-in user. This is " +
            "usually the strongest impact statement available WITHOUT building any outbound channel.");
        res();
      })["catch"](function (e) {
        add("net", "same-origin fetch with credentials", "failed: " + (e && e.name), "info");
        res();
      });
    setTimeout(res, 6000);
  }));

  jobs.push(new Promise(function (res) {
    if (typeof indexedDB === "undefined" || !indexedDB.databases) return res();
    tryFn(function () {
      indexedDB.databases().then(function (dbs) {
        add("storage", "indexedDB database names",
            dbs.length ? names(dbs.map(function (d) { return d.name; })) : "none",
            dbs.length ? "high" : "info", "Names only - no database is opened or read.");
        res();
      })["catch"](function () { res(); });
    });
    setTimeout(res, 4000);
  }));

  jobs.push(new Promise(function (res) {
    if (typeof caches === "undefined") return res();
    tryFn(function () {
      caches.keys().then(function (ks) {
        add("storage", "cache storage names", ks.length ? names(ks) : "none",
            ks.length ? "med" : "info", "Names only - no cached response is read.");
        res();
      })["catch"](function () { res(); });
    });
    setTimeout(res, 4000);
  }));

  globalThis.__caps = C;
  Promise.all(jobs).then(function () {
    globalThis.__caps = C;
    if (typeof globalThis.__capsDone === "function") globalThis.__capsDone(C);
  });
})();
