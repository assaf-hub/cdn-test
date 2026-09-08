// load-verification probe — parses as both classic script and ESM
(() => {
  const tag = 'JSDELIVR-LOAD-OK';
  const src = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || null;
  globalThis.__loadProbe = { tag, at: new Date().toISOString(), src };
  console.log(tag, globalThis.__loadProbe);
})();
