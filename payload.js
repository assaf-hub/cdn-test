// load-verification probe
(() => {
  const tag = 'JSDELIVR-LOAD-OK';
  globalThis.__loadProbe = { tag, at: new Date().toISOString(), url: import.meta?.url ?? document.currentScript?.src };
  console.log(tag, globalThis.__loadProbe);
})();
