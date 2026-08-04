(() => {
  "use strict";
  function applyCheckedLayerState() {
    const control = document.querySelector("#context-property-map .context-layer-control");
    if (!control) return;
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }
  window.addEventListener("property-check:report-ready", () => window.setTimeout(applyCheckedLayerState, 80));
})();