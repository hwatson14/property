(() => {
  "use strict";

  function metric(data, id) {
    return (data?.metrics || []).find((item) => item.metric_id === id);
  }

  function areaLabel(data) {
    const value = metric(data, "property.parcel_area")?.value;
    const numbers = [];
    const collect = (item) => {
      if (Number.isFinite(Number(item))) numbers.push(Number(item));
      else if (item && typeof item === "object") {
        const candidate = item.area ?? item.value ?? item.square_metres ?? item.squareMeters;
        if (Number.isFinite(Number(candidate))) numbers.push(Number(candidate));
      }
    };
    if (Array.isArray(value)) value.forEach(collect); else collect(value);
    if (!numbers.length) return "Area unavailable";
    const total = Math.round(numbers.reduce((sum, number) => sum + number, 0));
    return `${new Intl.NumberFormat("en-AU").format(total)} m²`;
  }

  function zoneLabel(data) {
    const value = metric(data, "planning.zone")?.value;
    if (Array.isArray(value)) return value.filter(Boolean).join(", ") || "Zone unavailable";
    return value ? String(value) : "Zone unavailable";
  }

  function patch() {
    const data = window.PROPERTY_DATA;
    const summary = document.querySelector(".lc-v2-summary");
    if (!summary || !data?.property_id) return;

    const map = document.querySelector(".report-overview-section");
    if (map && summary.nextElementSibling !== map) summary.insertAdjacentElement("afterend", map);

    const parcelCount = Number(metric(data, "property.parcel_count")?.value || data.parcels?.length || 1);
    const facts = summary.querySelector(".lc-v2-property-title p");
    if (facts) facts.textContent = `${parcelCount} parcel${parcelCount === 1 ? "" : "s"} · ${areaLabel(data)} · ${zoneLabel(data)}`;
  }

  window.addEventListener("lemoncheck:ux-v2-ready", () => setTimeout(patch, 0));
  window.addEventListener("hashchange", () => setTimeout(patch, 100));
  setInterval(patch, 500);
  setTimeout(patch, 0);
})();
