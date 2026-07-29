(() => {
  "use strict";
  const pendingData = () => ({ property_id: "pending", metrics: [] });
  const ensurePendingState = () => {
    if (!window.PROPERTY_DATA) window.PROPERTY_DATA = pendingData();
  };
  ensurePendingState();
  window.addEventListener("hashchange", ensurePendingState);
  document.addEventListener("DOMContentLoaded", ensurePendingState);
})();
