/* ---------- Boot ---------- */
applyZoom(); hInit();
if (typeof demoSeedOnce === 'function') demoSeedOnce(); /* designer's copy only: adds the test sample once */
if (needLogin()) lockScreen(); else render();
