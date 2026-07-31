(() => {
  "use strict";

  let lastPropertyId = "";
  let lastAddress = "";

  function synchronise() {
    const data = window.PROPERTY_DATA;
    const assessment = window.LEMONCHECK_ASSESSMENT;
    if (!data?.property_id || !data?.canonical_address || !assessment?.objective) return;

    const propertyId = String(data.property_id);
    const address = String(data.canonical_address);
    const renderedAddress = document.querySelector('.lc-v2-property-title h1')?.textContent?.trim() || "";
    const currentVersion = document.querySelector('[data-ux-version="LC-UX-v0.2.0"]');

    if (!currentVersion || renderedAddress !== address || propertyId !== lastPropertyId || address !== lastAddress) {
      lastPropertyId = propertyId;
      lastAddress = address;
      window.dispatchEvent(new CustomEvent("lemoncheck:governance-ready", { detail: assessment }));
    }
  }

  window.addEventListener("hashchange", () => {
    lastPropertyId = "";
    lastAddress = "";
    setTimeout(synchronise, 50);
  });
  window.addEventListener("lemoncheck:assessment-ready", () => setTimeout(synchronise, 0));
  window.addEventListener("lemoncheck:governance-ready", () => setTimeout(synchronise, 0));
  window.addEventListener("lemoncheck:pricing-ready", () => setTimeout(synchronise, 0));
  setInterval(synchronise, 250);
  setTimeout(synchronise, 0);
})();
