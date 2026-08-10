const API_BASE = "http://localhost:3000/api";

// Maps each category from the database to what the UI expects
const CATEGORY_META = {
  farmers_market: { filter: "farmers-market", label: "Farmers Market", tagClass: "tag-market", color: "#3C6B35" },
  food_bank: { filter: "food-bank", label: "Food Bank", tagClass: "tag-foodbank", color: "#E8C547" },
  retailer: { filter: "retail", label: "Retailer", tagClass: "tag-retail", color: "#D9812F" },
};
const DEFAULT_META = { filter: "retail", label: "Resource", tagClass: "tag-retail", color: "#6B9B5C" };

const DAY_LABELS = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// ---- State ----
let map;
let resources = [];               // everything from GET /api/resources
let savedMap = new Map();         // resourceId -> saved-resource _id
let markersById = new Map();      // resourceId -> Leaflet marker
let activeFilter = "all";         // which chip is selected
let activeTab = "nearby";         // "nearby"
let zipQuery = "";                // current ZIP


function categoryMeta(category) {
  return CATEGORY_META[category] || DEFAULT_META;
}

function formatHours(hours) {
  if (!hours) return "Hours not listed";
  const parts = DAY_ORDER.filter((day) => hours[day]).map((day) => `${DAY_LABELS[day]} ${hours[day]}`);
  return parts.length ? parts.join(" · ") : "Hours not listed";
}

function matchesFilters(resource) {
    if (!resource) return false;
  const meta = categoryMeta(resource.category);

  if (activeFilter !== "all" && meta.filter !== activeFilter) return false;
  if (activeTab === "saved" && !savedMap.has(resource.id)) return false;
  if (zipQuery && !(resource.address || "").includes(zipQuery)) return false;

  return true;
}

function syncFavoriteButtons(resourceId, isSaved) {
  document.querySelectorAll(`.favorite-stamp[data-id="${resourceId}"]`).forEach((btn) => {
    btn.setAttribute("aria-pressed", String(isSaved));
  });
}

function updateSavedCount() {
  const countEl = document.getElementById("savedCount");
  if (countEl) countEl.textContent = savedMap.size;
}

async function toggleFavorite(resourceId, buttonEl) {
  const isSaved = buttonEl.getAttribute("aria-pressed") === "true";

  try {
    if (isSaved) {
      const savedId = savedMap.get(resourceId);
      await fetch(`${API_BASE}/saved-resources/${savedId}`, { method: "DELETE" });
      savedMap.delete(resourceId);
      syncFavoriteButtons(resourceId, false);
    } else {
      const res = await fetch(`${API_BASE}/saved-resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceId }),
      });
      const saved = await res.json();
      savedMap.set(resourceId, saved._id);
      syncFavoriteButtons(resourceId, true);
    }

    updateSavedCount();
    applyFilters();
  } catch (err) {
    console.error("Failed to update favorite:", err);
  }
}


function buildDetailElement(resource, marker) {
  const template = document.getElementById("resourceDetailTemplate");
  const node = template.content.cloneNode(true);
  const root = node.querySelector(".resource-detail");
  const meta = categoryMeta(resource.category);

  const typeEl = root.querySelector('[data-field="type"]');
  typeEl.textContent = meta.label;
  typeEl.className = `tag ${meta.tagClass}`;

  root.querySelector('[data-field="name"]').textContent = resource.name;
  root.querySelector('[data-field="hours"]').textContent = formatHours(resource.hours);
  root.querySelector('[data-field="address"]').textContent = resource.address || "";

  const websiteEl = root.querySelector('[data-field="website"]');
  if (resource.website) {
    websiteEl.href = resource.website;
  } else {
    websiteEl.remove();
  }

  const favBtn = root.querySelector('[data-field="favoriteToggle"]');
  favBtn.dataset.id = resource.id;
  favBtn.setAttribute("aria-pressed", String(savedMap.has(resource.id)));
  favBtn.addEventListener("click", () => toggleFavorite(resource.id, favBtn));

  root.querySelector(".detail-close").addEventListener("click", () => marker.closePopup());

  return root;
}

// Map building

function initMap() {
  const mapEl = document.getElementById("map");
  mapEl.innerHTML = "";

  map = L.map(mapEl).setView([47.6062, -122.3321], 11); // centered on Seattle

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);
}

function renderMarkers() {
  resources.forEach((resource) => {
    if (typeof resource.lat !== "number" || typeof resource.lng !== "number") return; // skip things without coordinates

    const meta = categoryMeta(resource.category);
    const marker = L.circleMarker([resource.lat, resource.lng], {
      radius: 8,
      color: "#fff",
      weight: 2,
      fillColor: meta.color,
      fillOpacity: 0.9,
    });

    marker.bindPopup(buildDetailElement(resource, marker));
    markersById.set(resource.id, marker);
  });

  applyFilters();
}

// sidebar

function createResourceCard(resource) {
  const meta = categoryMeta(resource.category);
  const isSaved = savedMap.has(resource.id);

  const li = document.createElement("li");
  li.className = "resource-card";
  li.dataset.id = resource.id;
  li.dataset.type = meta.filter;

  const top = document.createElement("div");
  top.className = "resource-card-top";

  const tag = document.createElement("span");
  tag.className = `tag ${meta.tagClass}`;
  tag.textContent = meta.label;

  const favBtn = document.createElement("button");
  favBtn.className = "favorite-stamp";
  favBtn.type = "button";
  favBtn.dataset.id = resource.id;
  favBtn.setAttribute("aria-pressed", String(isSaved));
  favBtn.setAttribute("aria-label", `Save ${resource.name}`);
  favBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFavorite(resource.id, favBtn);
  });

  top.append(tag, favBtn);

  const heading = document.createElement("h3");
  heading.textContent = resource.name;

  const meta_p = document.createElement("p");
  meta_p.className = "resource-meta";
  const extras = resource.accepts_fresh_bucks ? " · Accepts Fresh Bucks" : "";
  meta_p.textContent = formatHours(resource.hours) + extras;

  li.append(top, heading, meta_p);

  li.addEventListener("click", () => {
    const marker = markersById.get(resource.id);
    if (marker) {
      map.panTo(marker.getLatLng());
      marker.openPopup();
    }
  });

  return li;
}

function renderList() {
  const list = document.getElementById("resourceList");
  list.innerHTML = "";
  resources.forEach((resource) => list.appendChild(createResourceCard(resource)));
}


function applyFilters() {
  // Sidebar cards
  document.querySelectorAll(".resource-card").forEach((card) => {
    const resource = resources.find((r) => r.id === card.dataset.id);
    card.hidden = !matchesFilters(resource);
  });

  // Map markers
  markersById.forEach((marker, id) => {
    const resource = resources.find((r) => r.id === id);
    const shouldShow = matchesFilters(resource);
    if (shouldShow && !map.hasLayer(marker)) marker.addTo(map);
    if (!shouldShow && map.hasLayer(marker)) map.removeLayer(marker);
  });

  const emptyState = document.getElementById("savedEmptyState");
  if (emptyState) {
    emptyState.hidden = !(activeTab === "saved" && savedMap.size === 0);
  }
}

function wireFilterChips() {
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      activeFilter = chip.dataset.filter;
      applyFilters();
    });
  });
}

function wireTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      activeTab = tab.dataset.tab;
      applyFilters();
    });
  });
}

function wireZipSearch() {
  const form = document.getElementById("filterBar");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const zipInput = document.getElementById("zipInput");
    zipQuery = zipInput.value.trim();
    applyFilters();
  });
}

function focusRequestedResource() {
  const params = new URLSearchParams(window.location.search);
  const resourceId = params.get("resource");
  if (!resourceId) {
    return;
  }
  const marker = markersById.get(resourceId);
  map.setView(marker.getLatLng(), 15);
  marker.openPopup();
  const cards = document.querySelectorAll(".resource-card");
  for (let i = 0; i < cards.length; i++) {
    if (cards[i].dataset.id === resourceId) {
      cards[i].scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
      break;
    }
  }
}


async function init() {
  initMap();

  try {
    const [resourcesRes, savedRes] = await Promise.all([
      fetch(`${API_BASE}/resources`),
      fetch(`${API_BASE}/saved-resources`),
    ]);

    resources = await resourcesRes.json();
    const savedList = await savedRes.json();
    savedMap = new Map(savedList.map((s) => [s.resourceId, s._id]));
  } catch (err) {
    console.error("Failed to load data from the API:", err);
    return;
  }

  renderList();
  renderMarkers();
  updateSavedCount();
  wireFilterChips();
  wireTabs();
  wireZipSearch();
  focusRequestedResource();
}

document.addEventListener("DOMContentLoaded", init);
