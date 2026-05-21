import { MODEL_METADATA, buildModelFeatures, inferFruitingSignal, scoreToVerdict } from "./model.js";

const state = {
  allDays: [],
  animationFromIndex: null,
  focusDate: null,
  map: null,
  marker: null,
  regionalStats: null,
  scoredDays: [],
  selected: { latitude: 41.0772, longitude: -73.4687, label: "Darien, CT" },
  regionalPage: 1,
  regionalRenderedPage: 1,
  regionalTilePages: new Map(),
  selectedSuggestion: null,
  suggestionRequestId: 0,
  suggestionTimer: null,
  suggestions: [],
  chartLayout: null,
  touchStartX: null,
};

const elements = {
  analysisCopy: document.querySelector("#analysisCopy"),
  analysisTitle: document.querySelector("#analysisTitle"),
  combinedChart: document.querySelector("#combinedChart"),
  confidenceBadge: document.querySelector("#confidenceBadge"),
  coordinateForm: document.querySelector("#coordinateForm"),
  dataStatus: document.querySelector("#dataStatus"),
  detailCopy: document.querySelector("#detailCopy"),
  detailDateLabel: document.querySelector("#detailDateLabel"),
  detailMetrics: document.querySelector("#detailMetrics"),
  detailScore: document.querySelector("#detailScore"),
  detailVerdict: document.querySelector("#detailVerdict"),
  locationInput: document.querySelector("#locationInput"),
  locationSuggestions: document.querySelector("#locationSuggestions"),
  mobileTabs: document.querySelector("#mobileTabs"),
  mobileOverviewSection: document.querySelector("#mobileOverviewSection"),
  mobileDetailsSection: document.querySelector("#mobileDetailsSection"),
  mobileExamplesSection: document.querySelector("#mobileExamplesSection"),
  openMapsLink: document.querySelector("#openMapsLink"),
  placeLabel: document.querySelector("#placeLabel"),
  daySelector: document.querySelector("#daySelector"),
  regionalConfidence: document.querySelector("#regionalConfidence"),
  regionalCopy: document.querySelector("#regionalCopy"),
  regionalMetrics: document.querySelector("#regionalMetrics"),
  regionalPagination: document.querySelector("#regionalPagination"),
  regionalTiles: document.querySelector("#regionalTiles"),
  imageModal: document.querySelector("#imageModal"),
  closeImageModalButton: document.querySelector("#closeImageModalButton"),
  imageModalPreview: document.querySelector("#imageModalPreview"),
  imageModalTitle: document.querySelector("#imageModalTitle"),
  sampleButton: document.querySelector("#sampleButton"),
  seasonBadge: document.querySelector("#seasonBadge"),
  summaryLabel: document.querySelector("#summaryLabel"),
  todayScore: document.querySelector("#todayScore"),
  todayVerdict: document.querySelector("#todayVerdict"),
  useLocationButton: document.querySelector("#useLocationButton"),
};

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  weekday: "short",
});
const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const monthDayFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const shortDateFormatter = new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit" });
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundDownToStep(value, step) {
  return Math.floor(value / step) * step;
}

function roundUpToStep(value, step) {
  return Math.ceil(value / step) * step;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function mean(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? sum(valid) / valid.length : 0;
}

function weightedMean(values, weights) {
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const weight = weights[index] ?? 0;
    if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) continue;
    numerator += value * weight;
    denominator += weight;
  }
  return denominator > 0 ? numerator / denominator : 0;
}

function weightedMeanOrNull(values, weights) {
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const weight = weights[index] ?? 0;
    if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) continue;
    numerator += value * weight;
    denominator += weight;
  }
  return denominator > 0 ? numerator / denominator : null;
}

function parseCoordinateInput(value) {
  const match = value.trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const latitude = Number.parseFloat(match[1]);
  const longitude = Number.parseFloat(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    label: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
    latitude: clamp(latitude, -90, 90),
    longitude: clamp(longitude, -180, 180),
  };
}

async function geocodeLocation(name) {
  const results = await searchLocations(name, 1);
  const result = results[0];
  if (!result) throw new Error("Location not found");
  return result;
}

async function searchLocations(name, count = 6) {
  const params = new URLSearchParams({
    count: String(count),
    language: "en",
    name,
  });
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  if (!response.ok) throw new Error(`Geocoding failed with ${response.status}`);
  const payload = await response.json();
  return (payload.results ?? []).map((result) => {
    const labelParts = [result.name, result.admin1, result.country].filter(Boolean);
    return {
      label: labelParts.join(", "),
      latitude: result.latitude,
      longitude: result.longitude,
    };
  });
}

function rangeScore(value, bestLow, bestHigh, hardLow, hardHigh) {
  if (value >= bestLow && value <= bestHigh) return 100;
  if (value < hardLow || value > hardHigh) return 0;
  if (value < bestLow) return ((value - hardLow) / (bestLow - hardLow)) * 100;
  return ((hardHigh - value) / (hardHigh - bestHigh)) * 100;
}

function setStatus(message) {
  elements.dataStatus.textContent = message;
}

function updateGoogleMapsLink(latitude, longitude) {
  if (!elements.openMapsLink) return;
  const query = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  elements.openMapsLink.href = `https://www.google.com/maps?q=${encodeURIComponent(query)}`;
}

function formatTimelineLabel(dateString) {
  return dayFormatter.format(new Date(`${dateString}T12:00:00`));
}

function formatTimelineLabelParts(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return {
    weekday: weekdayFormatter.format(date),
    monthDay: monthDayFormatter.format(date),
  };
}

function formatShortDate(dateString) {
  return shortDateFormatter.format(new Date(`${dateString}T12:00:00`));
}

function buildRainIntensityBands(rainValues) {
  const nonZero = rainValues
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (!nonZero.length) {
    return {
      lightMax: 0,
      mediumMax: 0,
      heavyMin: 0,
      descriptor: "No rain in timeline",
    };
  }
  const quantileAt = (q) => {
    const position = Math.max(0, Math.min(nonZero.length - 1, Math.floor((nonZero.length - 1) * q)));
    return nonZero[position];
  };
  const lightMax = quantileAt(0.5);
  const mediumMax = Math.max(lightMax, quantileAt(0.85));
  const heavyMin = mediumMax;
  const toMm = (value) => `${value.toFixed(1)} mm`;
  return {
    lightMax,
    mediumMax,
    heavyMin,
    descriptor: `Light <= ${toMm(lightMax)} | Medium <= ${toMm(mediumMax)} | Heavy > ${toMm(heavyMin)}`,
  };
}

function getSeasonForDate(dateString, latitude) {
  const month = new Date(`${dateString}T12:00:00`).getUTCMonth() + 1;
  const northern = latitude >= 0;
  const seasons = northern
    ? [
        { label: "winter", months: [12, 1, 2] },
        { label: "spring", months: [3, 4, 5] },
        { label: "summer", months: [6, 7, 8] },
        { label: "autumn", months: [9, 10, 11] },
      ]
    : [
        { label: "summer", months: [12, 1, 2] },
        { label: "autumn", months: [3, 4, 5] },
        { label: "winter", months: [6, 7, 8] },
        { label: "spring", months: [9, 10, 11] },
      ];
  return seasons.find((entry) => entry.months.includes(month))?.label ?? "spring";
}

function seasonScoreForDate(dateString, latitude) {
  const season = getSeasonForDate(dateString, latitude);
  if (season === "autumn") return 100;
  if (season === "spring") return 72;
  if (season === "summer") return 56;
  return 24;
}

function buildReasons({
  rainEventClass,
  rain5dResponse,
  crashPhase,
  dryingPenalty,
  harvestWindowComponent,
  spoilagePenalty,
  stalenessPenalty,
  avgTemp,
  nightlyMin,
}) {
  const reasons = [];
  if (harvestWindowComponent >= 0.62) reasons.push("Timing looks favorable for finding harvestable mushrooms now.");
  else if (harvestWindowComponent >= 0.42) reasons.push("Timing is decent, but likely outside the best harvest window.");
  else reasons.push("Timing is likely early or late for peak harvestable mushrooms.");

  if (rain5dResponse >= 0.62) reasons.push("Recent moisture strongly supports mushrooms in the woods.");
  else if (rain5dResponse >= 0.4) reasons.push("Recent moisture support is moderate and still helpful.");
  else if (rainEventClass === "none") reasons.push("No recent meaningful rain is supporting woodland mushrooms.");
  else reasons.push("Moisture support is present but limited.");

  if (spoilagePenalty >= 0.35) reasons.push("Warm, wet conditions may increase rot or insect pressure.");
  else if (stalenessPenalty >= 0.35) reasons.push("Heat and drying can age mushrooms quickly.");
  else if (dryingPenalty >= 0.12 || crashPhase === "crash") reasons.push("Drying conditions are reducing mushroom quality and persistence.");

  if (avgTemp >= 30) reasons.push("Sustained heat reduces odds of finding good-condition mushrooms.");
  if (nightlyMin < -1) reasons.push("Recent frost is a strong negative signal.");
  else if (nightlyMin < 4) reasons.push("Cold nights reduce near-term foraging confidence.");

  return reasons.slice(0, 3);
}

async function fetchWeather(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    daily: "temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum",
    hourly: "temperature_2m,relative_humidity_2m",
    forecast_days: "11",
    past_days: "7",
    timezone: "auto",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error(`Weather request failed with ${response.status}`);
  return response.json();
}

function isoDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

async function fetchINaturalistCount(latitude, longitude, extraParams = {}) {
  const params = new URLSearchParams({
    iconic_taxa: "Fungi",
    lat: latitude.toFixed(5),
    lng: longitude.toFixed(5),
    per_page: "1",
    radius: "50",
    verifiable: "true",
    ...extraParams,
  });
  const response = await fetch(`https://api.inaturalist.org/v1/observations?${params}`);
  if (!response.ok) throw new Error(`iNaturalist request failed with ${response.status}`);
  const payload = await response.json();
  return payload.total_results ?? 0;
}

async function fetchINaturalistRecentResearch(latitude, longitude, extraParams = {}) {
  const params = new URLSearchParams({
    iconic_taxa: "Fungi",
    lat: latitude.toFixed(5),
    lng: longitude.toFixed(5),
    per_page: "8",
    radius: "50",
    verifiable: "true",
    quality_grade: "research",
    order: "desc",
    order_by: "observed_on",
    ...extraParams,
  });
  const response = await fetch(`https://api.inaturalist.org/v1/observations?${params}`);
  if (!response.ok) throw new Error(`iNaturalist request failed with ${response.status}`);
  const payload = await response.json();
  const results = payload.results ?? [];
  const observations = results.map((item) => {
    const taxon = item.taxon ?? {};
    const speciesRaw =
      taxon.preferred_common_name ||
      taxon.name ||
      item.species_guess ||
      "Unidentified fungus";
    const species = speciesRaw
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    const observedOn = item.observed_on || item.time_observed_at?.slice(0, 10) || "";
    const photo = item.photos?.[0]?.url?.replace("square", "medium") ?? "";
    return {
      id: item.id,
      observedOn,
      photo,
      species,
      url: item.uri || `https://www.inaturalist.org/observations/${item.id}`,
      wikipediaUrl: taxon.wikipedia_url || "",
      scientificName: taxon.name || "",
      qualityGrade: item.quality_grade || "",
      taxonKey: taxon.id ? `taxon:${taxon.id}` : `label:${(taxon.name || speciesRaw || "unknown").toLowerCase()}`,
      identifications_count: item.identifications_count ?? 0,
      identifications_most_agree: item.identifications_most_agree ?? false,
      identifications_some_agree: item.identifications_some_agree ?? false,
      identifications_most_disagree: item.identifications_most_disagree ?? false,
      num_identification_agreements: item.num_identification_agreements ?? 0,
      num_identification_disagreements: item.num_identification_disagreements ?? 0,
    };
  });
  return {
    observations,
    totalResults: payload.total_results ?? observations.length,
  };
}

async function fetchINaturalistRecentNonResearch(latitude, longitude, extraParams = {}) {
  const params = new URLSearchParams({
    iconic_taxa: "Fungi",
    lat: latitude.toFixed(5),
    lng: longitude.toFixed(5),
    per_page: "200",
    radius: "50",
    verifiable: "true",
    quality_grade: "needs_id",
    order: "desc",
    order_by: "observed_on",
    ...extraParams,
  });
  const response = await fetch(`https://api.inaturalist.org/v1/observations?${params}`);
  if (!response.ok) throw new Error(`iNaturalist request failed with ${response.status}`);
  const payload = await response.json();
  const results = payload.results ?? [];
  const observations = results.map((item) => {
      const taxon = item.taxon ?? {};
      const speciesRaw =
        taxon.preferred_common_name ||
        taxon.name ||
        item.species_guess ||
        "Unidentified fungus";
      const species = speciesRaw
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
      const observedOn = item.observed_on || item.time_observed_at?.slice(0, 10) || "";
      const photo = item.photos?.[0]?.url?.replace("square", "medium") ?? "";
      return {
        id: item.id,
        observedOn,
        photo,
        species,
        url: item.uri || `https://www.inaturalist.org/observations/${item.id}`,
        wikipediaUrl: taxon.wikipedia_url || "",
        scientificName: taxon.name || "",
        qualityGrade: item.quality_grade || "",
        taxonKey: taxon.id ? `taxon:${taxon.id}` : `label:${(taxon.name || speciesRaw || "unknown").toLowerCase()}`,
        identifications_count: item.identifications_count ?? 0,
        identifications_most_agree: item.identifications_most_agree ?? false,
        identifications_some_agree: item.identifications_some_agree ?? false,
        identifications_most_disagree: item.identifications_most_disagree ?? false,
        num_identification_agreements: item.num_identification_agreements ?? 0,
        num_identification_disagreements: item.num_identification_disagreements ?? 0,
      };
    });
  return {
    observations,
    totalResults: payload.total_results ?? observations.length,
  };
}

async function fetchINaturalistRecentNonResearchAll(latitude, longitude, extraParams = {}) {
  const perPage = 200;
  let page = 1;
  let totalResults = 0;
  const all = [];
  while (page <= 5) {
    const result = await fetchINaturalistRecentNonResearch(latitude, longitude, {
      ...extraParams,
      per_page: String(perPage),
      page: String(page),
    });
    if (page === 1) totalResults = result.totalResults;
    all.push(...result.observations);
    if (!result.observations.length || all.length >= totalResults) break;
    page += 1;
  }
  return { observations: all, totalResults };
}

function nonResearchConfidenceScore(item) {
  const agree = item.identifications_most_agree === true ? 1 : 0;
  const someAgree = item.identifications_some_agree === true ? 1 : 0;
  const disagree = item.identifications_most_disagree === true ? 1 : 0;
  const idCount = Number.isFinite(item.identifications_count) ? item.identifications_count : 0;
  const agreements = Number.isFinite(item.num_identification_agreements) ? item.num_identification_agreements : 0;
  const disagreements = Number.isFinite(item.num_identification_disagreements) ? item.num_identification_disagreements : 0;
  const hasScientific = item.scientificName ? 1 : 0;
  return agree * 90 + someAgree * 45 + agreements * 12 + idCount * 7 + hasScientific * 8 - disagreements * 10 - disagree * 90;
}

function isSufficientNonResearch(item) {
  const idCount = item.identifications_count ?? 0;
  const agreements = item.num_identification_agreements ?? 0;
  const disagreements = item.num_identification_disagreements ?? 0;
  const supportive = item.identifications_some_agree === true || item.identifications_most_agree === true || agreements >= 1;
  const stronglyConflicted = item.identifications_most_disagree === true && disagreements > agreements;
  return idCount >= 1 && supportive && !stronglyConflicted;
}

function observationConfidenceScore(item) {
  const agree = item.identifications_most_agree === true ? 1 : 0;
  const someAgree = item.identifications_some_agree === true ? 1 : 0;
  const disagree = item.identifications_most_disagree === true ? 1 : 0;
  const idCount = Number.isFinite(item.identifications_count) ? item.identifications_count : 0;
  const agreements = Number.isFinite(item.num_identification_agreements) ? item.num_identification_agreements : 0;
  const disagreements = Number.isFinite(item.num_identification_disagreements) ? item.num_identification_disagreements : 0;
  return agree * 1000 + someAgree * 200 + agreements * 10 + idCount - disagreements * 6 - disagree * 120;
}

function dedupeByBestConfidence(observations) {
  const bestByKey = new Map();
  observations.forEach((item) => {
    const key = item.taxonKey || `label:${(item.scientificName || item.species || "unknown").toLowerCase()}`;
    const current = bestByKey.get(key);
    if (!current) {
      bestByKey.set(key, item);
      return;
    }
    const currentScore = observationConfidenceScore(current);
    const nextScore = observationConfidenceScore(item);
    if (nextScore > currentScore || (nextScore === currentScore && (item.id ?? 0) > (current.id ?? 0))) {
      bestByKey.set(key, item);
    }
  });
  return [...bestByKey.values()];
}

async function fetchINaturalistRecentResearchAll(latitude, longitude, extraParams = {}) {
  const perPage = 200;
  let page = 1;
  let totalResults = 0;
  const all = [];
  while (page <= 5) {
    const result = await fetchINaturalistRecentResearch(latitude, longitude, {
      ...extraParams,
      per_page: String(perPage),
      page: String(page),
    });
    if (page === 1) totalResults = result.totalResults;
    all.push(...result.observations);
    if (!result.observations.length || all.length >= totalResults) break;
    page += 1;
  }
  return { observations: all, totalResults };
}

function summarizeRegionalStats(stats) {
  if (!stats || stats.status === "unavailable") return "";
  return "";
}

async function fetchRegionalObservationStats(latitude, longitude, dateString) {
  try {
    const [researchRecent14Observations, researchAll, nonResearchAll] =
      await Promise.all([
        fetchINaturalistCount(latitude, longitude, { d1: isoDaysAgo(14), quality_grade: "research" }),
        fetchINaturalistRecentResearchAll(latitude, longitude, { d1: isoDaysAgo(14) }),
        fetchINaturalistRecentNonResearchAll(latitude, longitude, { d1: isoDaysAgo(14) }),
      ]);
    const dedupedResearch = dedupeByBestConfidence(researchAll.observations);
    const dedupedNonResearch = dedupeByBestConfidence(nonResearchAll.observations)
      .filter((item) => isSufficientNonResearch(item))
      .sort((a, b) => {
        const scoreDelta = nonResearchConfidenceScore(b) - nonResearchConfidenceScore(a);
        if (scoreDelta !== 0) return scoreDelta;
        return (b.id ?? 0) - (a.id ?? 0);
      });
    const used = new Set(dedupedResearch.map((item) => item.taxonKey));
    const blended = [...dedupedResearch];
    for (const item of dedupedNonResearch) {
      if (blended.length >= 80) break;
      if (used.has(item.taxonKey)) continue;
      blended.push(item);
      used.add(item.taxonKey);
    }
    const stats = {
      confidence: "",
      researchRecent14Observations,
      researchRecent14Total: researchAll.totalResults,
      uniqueResearchObservations: blended,
      uniqueResearchOnlyCount: dedupedResearch.length,
      source: "iNaturalist",
      status: "available",
      totalObservations: researchAll.totalResults,
      recentResearchObservations: blended.slice(0, 8),
    };
    stats.summary = summarizeRegionalStats(stats);
    return stats;
  } catch (error) {
    console.error(error);
    return {
      confidence: "Unavailable",
      recent7Observations: 0,
      recent14Observations: 0,
      researchRecent14Observations: 0,
      seasonalObservations: 0,
      source: "iNaturalist",
      status: "unavailable",
      summary: summarizeRegionalStats(null),
      totalObservations: 0,
      recentResearchObservations: [],
      researchRecent14Total: 0,
      uniqueResearchObservations: [],
      uniqueResearchOnlyCount: 0,
    };
  }
}

async function fetchRegionalObservationPage(page) {
  if (!state.selected) return;
  if (!state.regionalStats || state.regionalStats.status !== "available") return;
  const safePage = Math.max(1, page);
  const all = state.regionalStats.uniqueResearchObservations ?? [];
  const pageSize = 8;
  const start = (safePage - 1) * pageSize;
  state.regionalStats.recentResearchObservations = all.slice(start, start + pageSize);
  state.regionalPage = safePage;
  renderRegionalStats();
}

function buildObservationTilesMarkup(observations) {
  if (!observations.length) return `<div class="chart-empty">No recent research-grade observations to show.</div>`;
  return observations
    .map(
      (obs) => `
      <div class="observation-tile">
        <a class="observation-main-link" href="${obs.url}" target="_blank" rel="noopener noreferrer">
        <div class="observation-thumb">
          ${obs.qualityGrade === "research" ? `<span class="grade-badge">Research Grade</span>` : ""}
          ${
            obs.photo
              ? `<img src="${obs.photo}" alt="${obs.species}" data-popup-image="${obs.photo}" data-popup-title="${obs.species.replace(/"/g, "&quot;")}">`
              : `<span>No photo</span>`
          }
        </div>
        <div class="observation-meta">
          <strong>${obs.species}</strong>
          ${obs.scientificName ? `<em>${obs.scientificName}</em>` : ""}
          <span>${obs.observedOn || "Date unknown"}</span>
        </div>
        </a>
        <div class="observation-links">
          <a href="${obs.url}" target="_blank" rel="noopener noreferrer">View on iNaturalist</a>
          ${obs.wikipediaUrl ? `<a href="${obs.wikipediaUrl}" target="_blank" rel="noopener noreferrer">Wikipedia</a>` : ""}
        </div>
      </div>
    `,
    )
    .join("");
}

function ensureRegionalPageMarkup(stats, page, pageSize = 8) {
  if (state.regionalTilePages.has(page)) return state.regionalTilePages.get(page);
  const all = stats.uniqueResearchObservations ?? [];
  const start = (page - 1) * pageSize;
  const pageItems = all.slice(start, start + pageSize);
  const markup = buildObservationTilesMarkup(pageItems);
  state.regionalTilePages.set(page, markup);
  return markup;
}

function renderRegionalTilesWithSlide(stats, targetPage) {
  const total = (stats.uniqueResearchObservations ?? []).length;
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, targetPage), pageCount);
  const nextMarkup = ensureRegionalPageMarkup(stats, safePage, pageSize);
  ensureRegionalPageMarkup(stats, Math.max(1, safePage - 1), pageSize);
  ensureRegionalPageMarkup(stats, Math.min(pageCount, safePage + 1), pageSize);

  const previousPage = state.regionalRenderedPage || 1;
  const direction = safePage > previousPage ? "forward" : safePage < previousPage ? "backward" : "none";
  const currentTrack = elements.regionalTiles.querySelector(".regional-tiles-track.current");

  const incoming = document.createElement("div");
  const incomingSide = direction === "backward" ? "from-left" : "from-right";
  incoming.className = `regional-tiles-track incoming ${incomingSide}${direction === "backward" ? " slower" : ""}`;
  incoming.innerHTML = nextMarkup;
  elements.regionalTiles.appendChild(incoming);

  if (!currentTrack) {
    incoming.classList.remove("incoming", "from-right", "from-left");
    incoming.classList.add("current");
    state.regionalRenderedPage = safePage;
    return;
  }

  if (direction === "none") {
    currentTrack.remove();
    incoming.classList.remove("incoming", "from-right", "from-left", "slower");
    incoming.classList.add("current");
    state.regionalRenderedPage = safePage;
    return;
  }

  currentTrack.classList.add(direction === "forward" ? "to-left" : "to-right");
  if (direction === "backward") currentTrack.classList.add("slower");
  requestAnimationFrame(() => {
    incoming.classList.add("enter");
    incoming.classList.remove("from-right", "from-left");
  });
  window.setTimeout(() => {
    currentTrack.remove();
    incoming.classList.remove("incoming", "enter", "slower");
    incoming.classList.add("current");
  }, direction === "backward" ? 620 : 500);
  state.regionalRenderedPage = safePage;
}

function openImageModal(src, title) {
  if (!src || !elements.imageModal || !elements.imageModalPreview) return;
  elements.imageModalPreview.src = src;
  elements.imageModalPreview.alt = title || "Observation preview";
  if (elements.imageModalTitle) elements.imageModalTitle.textContent = title || "Observation";
  elements.imageModal.hidden = false;
  requestAnimationFrame(() => {
    elements.imageModal.classList.add("is-open");
  });
}

function closeImageModal() {
  if (!elements.imageModal) return;
  elements.imageModal.classList.remove("is-open");
  window.setTimeout(() => {
    if (!elements.imageModal.classList.contains("is-open")) elements.imageModal.hidden = true;
  }, 220);
}

function normalizeWeather(payload) {
  const hourlyByDate = new Map();
  const hourlyTime = payload.hourly?.time ?? [];
  const hourlyTemp = payload.hourly?.temperature_2m ?? [];
  const hourlyRh = payload.hourly?.relative_humidity_2m ?? [];

  for (let index = 0; index < hourlyTime.length; index += 1) {
    const stamp = hourlyTime[index];
    if (!stamp) continue;
    const date = stamp.slice(0, 10);
    if (!hourlyByDate.has(date)) hourlyByDate.set(date, { rhValues: [], vpdValues: [] });
    const bucket = hourlyByDate.get(date);
    const t = hourlyTemp[index];
    const rh = hourlyRh[index];
    if (Number.isFinite(rh)) bucket.rhValues.push(rh);
    if (Number.isFinite(t) && Number.isFinite(rh) && rh > 0) {
      const svp = 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
      const vpd = svp * (1 - rh / 100);
      if (Number.isFinite(vpd)) bucket.vpdValues.push(vpd);
    }
  }

  return payload.daily.time.map((date, index) => ({
    date,
    expectedRainfall: payload.daily.precipitation_sum[index],
    maxTemp: payload.daily.temperature_2m_max[index],
    meanTemp: payload.daily.temperature_2m_mean[index],
    minTemp: payload.daily.temperature_2m_min[index],
    precipitation: payload.daily.precipitation_sum[index],
    rhMean: mean(hourlyByDate.get(date)?.rhValues ?? []),
    vpdMean: mean(hourlyByDate.get(date)?.vpdValues ?? []),
  }));
}

function findTodayIndex(days) {
  const today = new Date().toISOString().slice(0, 10);
  const index = days.findIndex((day) => day.date === today);
  return index >= 0 ? index : Math.min(7, days.length - 1);
}

function windowSlice(days, index, lookbackDays) {
  return days.slice(Math.max(0, index - lookbackDays), index + 1);
}

function scoreDay(days, index, todayIndex) {
  const target = days[index];
  const threeDayWindow = windowSlice(days, index, 2);
  const previousThreeDayWindow = days.slice(Math.max(0, index - 5), Math.max(0, index - 2));
  const rainHistory21d = Array.from({ length: 21 }, (_, lag) => Math.max(0, days[index - lag]?.precipitation ?? 0));
  const tempHistory7d = Array.from({ length: 7 }, (_, lag) => days[index - lag]?.meanTemp ?? null).filter(Number.isFinite);
  const vpdHistory7d = Array.from({ length: 7 }, (_, lag) => days[index - lag]?.vpdMean ?? null).filter(Number.isFinite);
  const rhHistory7d = Array.from({ length: 7 }, (_, lag) => days[index - lag]?.rhMean ?? null).filter(Number.isFinite);
  const day1Ago = days[index - 1] ?? null;
  const day2Ago = days[index - 2] ?? null;
  const day3Ago = days[index - 3] ?? null;
  const rain1dAgo = day1Ago?.precipitation ?? 0;
  const rain2dAgo = day2Ago?.precipitation ?? 0;
  const rain3dAgo = day3Ago?.precipitation ?? 0;
  const rainLast3d = sum(threeDayWindow.map((day) => day.precipitation));
  const weightedTemp72hMin = weightedMeanOrNull([day1Ago?.minTemp, day2Ago?.minTemp, day3Ago?.minTemp], [0.2, 0.5, 0.3]);
  const weightedTemp72hAvg = weightedMeanOrNull([day1Ago?.meanTemp, day2Ago?.meanTemp, day3Ago?.meanTemp], [0.2, 0.5, 0.3]);
  const weightedTemp72hMax = weightedMeanOrNull([day1Ago?.maxTemp, day2Ago?.maxTemp, day3Ago?.maxTemp], [0.2, 0.5, 0.3]);
  const rain3dTotal = rainLast3d;
  const humidity72hAvg = weightedMeanOrNull([day1Ago?.rhMean, day2Ago?.rhMean, day3Ago?.rhMean], [0.2, 0.5, 0.3]);
  const avgTemp = mean(threeDayWindow.map((day) => day.meanTemp));
  const nightlyMin = Math.min(...threeDayWindow.map((day) => day.minTemp));
  const diurnalRange = mean(threeDayWindow.map((day) => day.maxTemp - day.minTemp));

  const season = getSeasonForDate(target.date, state.selected.latitude);
  const seasonScore = seasonScoreForDate(target.date, state.selected.latitude);
  const previousWindow = {
    previous3AvgTemp: mean(previousThreeDayWindow.map((day) => day.meanTemp)),
    recent3AvgTemp: avgTemp,
    recent3DiurnalRange: diurnalRange,
    recent3NightMin: nightlyMin,
    recent3Rain: rainLast3d,
    rain1dAgo,
    rain2dAgo,
    rain3dAgo,
    rainHistory21d,
    tempHistory7d,
    vpdHistory7d,
    rhHistory7d,
    recent3Vpd: mean(threeDayWindow.map((day) => day.vpdMean)),
  };
  const featureBundle = buildModelFeatures({
    day: target,
    previousWindow,
    regionalStats: state.regionalStats,
    seasonScore,
    latitude: state.selected.latitude,
  });
  const modelInference = inferFruitingSignal({
    featureVector: featureBundle,
    daysAhead: Math.max(0, index - todayIndex),
    regionalStats: state.regionalStats,
  });
  const score = Math.round(modelInference.probability * 100);

  return {
    ...target,
    avgTemp,
    confidence: modelInference.confidence,
    diagnostics: {
      ...modelInference.diagnostics,
      ...featureBundle.diagnostics,
      modelVersion: MODEL_METADATA.modelVersion,
    },
    factorImportance: modelInference.topFactors,
    diurnalRange,
    nightlyMin,
    rain72h: rainLast3d,
    rain1dAgo,
    rain2dAgo,
    rain3dAgo,
    weightedTemp72hMin,
    weightedTemp72hAvg,
    weightedTemp72hMax,
    weightedRain72h: rain3dTotal,
    humidity72hAvg,
    probability: modelInference.probability,
    score: clamp(score, 0, 100),
    season,
    verdict: scoreToVerdict(modelInference.probability),
    reasons: buildReasons({
      rainEventClass: featureBundle.diagnostics.rainEventClass,
      rain5dResponse: featureBundle.diagnostics.rain5d_response,
      crashPhase: featureBundle.diagnostics.crashPhase,
      dryingPenalty: featureBundle.dryingPenalty,
      harvestWindowComponent: featureBundle.harvestWindowComponent,
      spoilagePenalty: featureBundle.spoilagePenalty,
      stalenessPenalty: featureBundle.stalenessPenalty,
      avgTemp,
      nightlyMin,
    }),
  };
}

function scoreAllDays(days, todayIndex) {
  const scored = [];
  for (let index = 0; index < days.length; index += 1) {
    const scoredDay = scoreDay(days, index, todayIndex);
    scored.push(scoredDay);
  }
  return scored;
}

function getSelectedDay() {
  return state.scoredDays.find((day) => day.date === state.focusDate) ?? state.scoredDays[0] ?? null;
}

function setSelectedLocation(latitude, longitude, label, shouldMoveMap = true) {
  state.selected = { latitude, longitude, label };
  elements.locationInput.value = label;
  elements.placeLabel.textContent = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
  updateGoogleMapsLink(latitude, longitude);
  if (state.marker) state.marker.setLatLng([latitude, longitude]);
  if (shouldMoveMap && state.map) state.map.setView([latitude, longitude], Math.max(state.map.getZoom(), 9));
}

function buildSmoothPath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const controlX = (current.x + next.x) / 2;
    path += ` C ${controlX} ${current.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`;
  }
  return path;
}

function renderCombinedChart() {
  if (!state.allDays.length) {
    elements.combinedChart.innerHTML = `<div class="chart-empty">Timeline will appear here.</div>`;
    return;
  }

  const containerWidth = Math.round(elements.combinedChart.clientWidth || 920);
  const mobile = containerWidth <= 620;
  const tablet = containerWidth > 620 && containerWidth <= 900;
  const width = containerWidth;
  const height = mobile ? 332 : tablet ? 306 : 292;
  const margin = mobile
    ? { top: 14, right: 36, bottom: 62, left: 36 }
    : tablet
      ? { top: 16, right: 62, bottom: 54, left: 58 }
      : { top: 18, right: 88, bottom: 42, left: 74 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const visibleSlots = 15;
  const slotWidth = plotWidth / visibleSlots;
  const tempValues = state.allDays.flatMap((day) => [day.minTemp, day.meanTemp, day.maxTemp]);
  const rawTempMin = Math.min(...tempValues);
  const rawTempMax = Math.max(...tempValues);
  const tempMin = rawTempMin < 0 ? roundDownToStep(rawTempMin, 10) : 0;
  const tempMax = rawTempMax > 30 ? roundUpToStep(rawTempMax, 10) : 30;
  const rainValues = state.allDays.map((day) => day.expectedRainfall);
  const rainMax = Math.max(...rainValues, 0);
  const rainTop = rainMax > 10 ? roundUpToStep(rainMax, 10) : 10;
  const rainBands = buildRainIntensityBands(rainValues);
  const rainDescriptor = mobile
    ? `L<=${rainBands.lightMax.toFixed(1)} M<=${rainBands.mediumMax.toFixed(1)} H>${rainBands.heavyMin.toFixed(1)} mm`
    : rainBands.descriptor;
  const barWidth = Math.max(14, slotWidth - 10);
  const centerIndex = 7;
  const todayDate = new Date().toISOString().slice(0, 10);
  const focusIndex = state.allDays.findIndex((day) => day.date === state.focusDate);
  const clipId = `timeline-clip-${state.selected.latitude.toFixed(3)}-${state.selected.longitude.toFixed(3)}`.replace(
    /[^a-zA-Z0-9_-]/g,
    "",
  );
  const todayIndex = state.allDays.findIndex((day) => day.date === todayDate);

  const xAt = (index) => margin.left + slotWidth / 2 + index * slotWidth;
  const barXAt = (index) => xAt(index) - barWidth / 2;
  const yTempAt = (value) => margin.top + plotHeight - ((value - tempMin) / Math.max(tempMax - tempMin, 8)) * plotHeight;
  const yRainAt = (value) => margin.top + plotHeight - (value / rainTop) * plotHeight;
  const freezingLineY = yTempAt(0);
  const showFreezingLine = tempMin < 0 && tempMax >= 0;
  const focusDateShort = state.focusDate ? formatShortDate(state.focusDate) : "";

  const minPoints = state.allDays.map((day, index) => ({ x: xAt(index), y: yTempAt(day.minTemp) }));
  const avgPoints = state.allDays.map((day, index) => ({ x: xAt(index), y: yTempAt(day.meanTemp) }));
  const maxPoints = state.allDays.map((day, index) => ({ x: xAt(index), y: yTempAt(day.maxTemp) }));
  const centerX = xAt(centerIndex);
  const leftPinnedTranslate = margin.left + slotWidth / 2 - xAt(0);
  const rightPinnedTranslate = width - margin.right - slotWidth / 2 - xAt(state.allDays.length - 1);
  const unclampedTranslate = focusIndex >= 0 ? centerX - xAt(focusIndex) : 0;
  const targetTranslate = clamp(unclampedTranslate, rightPinnedTranslate, leftPinnedTranslate);
  const fromUnclamped = state.animationFromIndex !== null ? centerX - xAt(state.animationFromIndex) : targetTranslate;
  const fromTranslate = clamp(fromUnclamped, rightPinnedTranslate, leftPinnedTranslate);
  const markerX = focusIndex >= 0 ? xAt(focusIndex) + targetTranslate : centerX;
  const pastShadeTrackX = todayIndex >= 0 ? xAt(todayIndex) - slotWidth / 2 : null;

  const tempTickValues = [];
  for (let tick = tempMax; tick >= tempMin; tick -= 10) {
    tempTickValues.push(tick);
  }
  const yTickCount = Math.max(2, tempTickValues.length);

  elements.combinedChart.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Combined weather timeline">
      <defs>
        <clipPath id="${clipId}">
          <rect x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}"></rect>
        </clipPath>
      </defs>
      ${tempTickValues.map((tempValue, index) => {
        const ratio = yTickCount === 1 ? 0 : index / (yTickCount - 1);
        const y = margin.top + ratio * plotHeight;
        const rainValue = Math.max(0, Math.round((1 - ratio) * rainTop));
        return `
          <line class="grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>
          <text class="y-label" x="${margin.left - 16}" y="${y + 4}" text-anchor="end">${tempValue} C</text>
          <text class="y-label" x="${width - margin.right + 16}" y="${y + 4}" text-anchor="start">${rainValue} mm</text>
        `;
      }).join("")}
      ${
        showFreezingLine
          ? `<line class="freezing-line" x1="${margin.left}" y1="${freezingLineY}" x2="${width - margin.right}" y2="${freezingLineY}"></line>
      <text class="freezing-label" x="${margin.left - 16}" y="${freezingLineY - 6}" text-anchor="end">0 C</text>`
          : ""
      }
      <g clip-path="url(#${clipId})">
        <g class="combined-chart-track" style="transform: translateX(${fromTranslate}px); transform-box: fill-box; transform-origin: center;">
          ${
            pastShadeTrackX !== null
              ? `<rect class="past-window-shade" x="${xAt(0) - slotWidth / 2}" y="${margin.top}" width="${Math.max(0, pastShadeTrackX - (xAt(0) - slotWidth / 2))}" height="${plotHeight}"></rect>`
              : ""
          }
        ${state.allDays.map((day, index) => `
          <rect
            class="${index === focusIndex ? "combined-bar selected" : "combined-bar"}"
            x="${barXAt(index)}"
            y="${yRainAt(day.expectedRainfall)}"
            rx="4"
            ry="4"
            width="${barWidth}"
            height="${Math.max(2, margin.top + plotHeight - yRainAt(day.expectedRainfall))}"
          ></rect>
        `).join("")}
        <path class="combined-line-min" d="${buildSmoothPath(minPoints)}"></path>
        <path class="combined-line-avg" d="${buildSmoothPath(avgPoints)}"></path>
        <path class="combined-line-max" d="${buildSmoothPath(maxPoints)}"></path>
        ${minPoints.map((point, index) => `<circle class="combined-point min" cx="${point.x}" cy="${point.y}" r="${index === focusIndex ? 5 : 4}"></circle>`).join("")}
        ${avgPoints.map((point, index) => `<circle class="combined-point avg" cx="${point.x}" cy="${point.y}" r="${index === focusIndex ? 5 : 4}"></circle>`).join("")}
        ${maxPoints.map((point, index) => `<circle class="combined-point max" cx="${point.x}" cy="${point.y}" r="${index === focusIndex ? 5 : 4}"></circle>`).join("")}
        ${state.allDays.map((day, index) => {
          const activeClass = index === focusIndex ? " is-active" : "";
          if (mobile) {
            const label = formatTimelineLabelParts(day.date);
            return `
              <text class="x-label x-label-mobile${activeClass}" x="${xAt(index)}" y="${height - 26}" text-anchor="middle">
                <tspan x="${xAt(index)}" dy="0">${label.weekday}</tspan>
                <tspan class="x-label-sub${activeClass}" x="${xAt(index)}" dy="12">${label.monthDay}</tspan>
              </text>
            `;
          }
          return `<text class="x-label${activeClass}" x="${xAt(index)}" y="${height - 12}" text-anchor="middle">${formatTimelineLabel(day.date)}</text>`;
        }).join("")}
        </g>
      </g>
      <line class="target-marker" x1="${markerX}" y1="${margin.top}" x2="${markerX}" y2="${margin.top + plotHeight}"></line>
      <text class="target-date-label" x="${markerX}" y="${height - 4}" text-anchor="middle">${focusDateShort}</text>
      <text class="rain-intensity-note" x="${width - margin.right}" y="${margin.top + 12}" text-anchor="end">${rainDescriptor}</text>
    </svg>
  `;
  state.chartLayout = {
    focusIndex,
    slotWidth,
    targetTranslate,
    xAt,
  };
  const track = elements.combinedChart.querySelector(".combined-chart-track");
  if (track) {
    requestAnimationFrame(() => {
      track.style.transform = `translateX(${targetTranslate}px)`;
    });
  }
  state.animationFromIndex = null;
}

function renderDaySelector() {
  if (!state.scoredDays.length) {
    elements.daySelector.innerHTML = "";
    return;
  }
  elements.daySelector.innerHTML = state.scoredDays
    .map((day) => {
      const parts = formatTimelineLabelParts(day.date);
      const isActive = day.date === state.focusDate;
      return `
        <button class="day-chip${isActive ? " is-active" : ""}" type="button" data-day="${day.date}" aria-pressed="${isActive}">
          <span>${parts.weekday}</span>
          <strong>${parts.monthDay}</strong>
        </button>
      `;
    })
    .join("");
}

function setMobileTab(tab) {
  const available = ["overview", "details", "examples"];
  const target = available.includes(tab) ? tab : "overview";
  const isMobile = window.matchMedia("(max-width: 860px)").matches;
  const sectionMap = {
    overview: elements.mobileOverviewSection,
    details: elements.mobileDetailsSection,
    examples: elements.mobileExamplesSection,
  };
  Object.entries(sectionMap).forEach(([key, section]) => {
    if (!section) return;
    if (!isMobile) {
      section.classList.add("is-active");
      return;
    }
    // Mobile uses a single scroll narrative instead of tabbed panes.
    section.classList.add("is-active");
  });
  if (!elements.mobileTabs) return;
  if (isMobile) {
    elements.mobileTabs.hidden = true;
    return;
  }
  elements.mobileTabs.hidden = false;
  elements.mobileTabs.querySelectorAll("[data-mobile-tab]").forEach((button) => {
    const active = button.dataset.mobileTab === target;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function renderSelectedDay() {
  const selectedDay = getSelectedDay();
  if (!selectedDay) return;

  const label = formatTimelineLabel(selectedDay.date);
  elements.summaryLabel.textContent = label;
  elements.todayScore.textContent = `${selectedDay.score}/100`;
  elements.todayVerdict.textContent = selectedDay.verdict;
  elements.confidenceBadge.textContent = selectedDay.confidence;
  elements.analysisTitle.textContent = `${label} evidence`;
  elements.analysisCopy.textContent = "Select a day to inspect conditions.";
  if (elements.seasonBadge) elements.seasonBadge.textContent = `${selectedDay.season} seasonal context`;
  elements.detailDateLabel.textContent = label;
  elements.detailScore.textContent = `${selectedDay.score}/100`;
  elements.detailVerdict.textContent = selectedDay.verdict;
  elements.detailCopy.textContent = selectedDay.reasons.join(" ");
  elements.detailMetrics.innerHTML = `
    <p class="metric-method-note">Window: recent 72h for temperature and humidity; rain is 3-day total.</p>
    <div class="metric-pill"><span>Temp min</span><strong>${Number.isFinite(selectedDay.weightedTemp72hMin) ? selectedDay.weightedTemp72hMin.toFixed(1) : "--"}&deg;C</strong></div>
    <div class="metric-pill"><span>Temp avg</span><strong>${Number.isFinite(selectedDay.weightedTemp72hAvg) ? selectedDay.weightedTemp72hAvg.toFixed(1) : "--"}&deg;C</strong></div>
    <div class="metric-pill"><span>Temp max</span><strong>${Number.isFinite(selectedDay.weightedTemp72hMax) ? selectedDay.weightedTemp72hMax.toFixed(1) : "--"}&deg;C</strong></div>
    <div class="metric-pill"><span>Rain</span><strong>${Number.isFinite(selectedDay.weightedRain72h) ? selectedDay.weightedRain72h.toFixed(1) : "--"} mm</strong></div>
    <div class="metric-pill"><span>Humidity</span><strong>${Number.isFinite(selectedDay.humidity72hAvg) ? selectedDay.humidity72hAvg.toFixed(0) : "--"} %</strong></div>
  `;
  renderRegionalStats();
  renderDaySelector();
}

function renderRegionalStats() {
  const stats = state.regionalStats;
  if (!stats) {
    elements.regionalConfidence.textContent = "";
    elements.regionalConfidence.hidden = true;
    elements.regionalMetrics.innerHTML = "";
    elements.regionalTiles.innerHTML = "";
    elements.regionalPagination.innerHTML = "";
    state.regionalTilePages.clear();
    elements.regionalCopy.textContent = "";
    return;
  }
  elements.regionalConfidence.textContent = "";
  elements.regionalConfidence.hidden = true;
  elements.regionalMetrics.innerHTML = `
    <div class="metric-pill"><span>Research-grade (14d)</span><strong>${stats.researchRecent14Total ?? stats.researchRecent14Observations}</strong></div>
    <div class="metric-pill"><span>Unique species</span><strong>${(stats.uniqueResearchObservations ?? []).length}</strong></div>
  `;
  const total = (stats.uniqueResearchObservations ?? []).length;
  const pageSize = 8;
  const pageCount = Math.max(1, Math.min(10, Math.ceil(total / pageSize)));
  const currentPage = Math.min(Math.max(1, state.regionalPage || 1), pageCount);
  renderRegionalTilesWithSlide(stats, currentPage);
  elements.regionalPagination.innerHTML = `
    <button class="ghost-button" type="button" data-regional-page="${Math.max(1, currentPage - 1)}" ${currentPage <= 1 ? "disabled" : ""}>Previous</button>
    <span class="chart-unit">Page ${currentPage} / ${pageCount}</span>
    <button class="ghost-button" type="button" data-regional-page="${Math.min(pageCount, currentPage + 1)}" ${currentPage >= pageCount ? "disabled" : ""}>Next</button>
  `;
  elements.regionalCopy.textContent = "";
}

function moveFocus(step) {
  const index = state.scoredDays.findIndex((day) => day.date === state.focusDate);
  if (index < 0) return;
  const next = clamp(index + step, 0, state.scoredDays.length - 1);
  if (next === index) return;
  state.animationFromIndex = state.allDays.findIndex((day) => day.date === state.focusDate);
  state.focusDate = state.scoredDays[next].date;
  renderCombinedChart();
  renderSelectedDay();
}

function setFocusDate(date) {
  const nextIndex = state.scoredDays.findIndex((day) => day.date === date);
  if (nextIndex < 0 || state.scoredDays[nextIndex].date === state.focusDate) return;
  state.animationFromIndex = state.allDays.findIndex((day) => day.date === state.focusDate);
  state.focusDate = state.scoredDays[nextIndex].date;
  renderCombinedChart();
  renderSelectedDay();
}

function hideSuggestions() {
  state.suggestions = [];
  elements.locationSuggestions.hidden = true;
  elements.locationSuggestions.innerHTML = "";
}

function chooseSuggestion(index) {
  const choice = state.suggestions[index];
  if (!choice) return;
  state.selectedSuggestion = choice;
  elements.locationInput.value = choice.label;
  hideSuggestions();
}

function renderSuggestions() {
  if (!state.suggestions.length) {
    hideSuggestions();
    return;
  }
  elements.locationSuggestions.hidden = false;
  elements.locationSuggestions.innerHTML = state.suggestions
    .map((suggestion, index) => `
      <button class="suggestion-option" type="button" data-suggestion-index="${index}">
        <strong>${suggestion.label.split(",")[0]}</strong>
        <span>${suggestion.label}</span>
      </button>
    `)
    .join("");
}

function queueSuggestionSearch(value) {
  const query = value.trim();
  state.selectedSuggestion = null;

  if (state.suggestionTimer) window.clearTimeout(state.suggestionTimer);

  if (!query || parseCoordinateInput(query)) {
    hideSuggestions();
    return;
  }

  const requestId = ++state.suggestionRequestId;
  state.suggestionTimer = window.setTimeout(async () => {
    try {
      const results = await searchLocations(query, 6);
      if (requestId !== state.suggestionRequestId) return;
      state.suggestions = results;
      renderSuggestions();
    } catch (error) {
      console.error(error);
      hideSuggestions();
    }
  }, 220);
}

async function resolveLocationInput(value) {
  if (state.selectedSuggestion && state.selectedSuggestion.label === value.trim()) return state.selectedSuggestion;
  const coordinates = parseCoordinateInput(value);
  if (coordinates) return coordinates;
  return geocodeLocation(value.trim());
}

async function analyzeLocation(location, shouldMoveMap = true) {
  setSelectedLocation(location.latitude, location.longitude, location.label, shouldMoveMap);
  setStatus("Loading");
  elements.combinedChart.innerHTML = `<div class="loading">Building the weather timeline...</div>`;
  elements.detailCopy.textContent = "Loading weather context for the selected location.";
  state.regionalStats = null;
  state.regionalPage = 1;
  state.regionalRenderedPage = 1;
  state.regionalTilePages.clear();
  renderRegionalStats();

  try {
    const today = new Date().toISOString().slice(0, 10);
    const [payload, regionalStats] = await Promise.all([
      fetchWeather(location.latitude, location.longitude),
      fetchRegionalObservationStats(location.latitude, location.longitude, today),
    ]);
    state.regionalStats = regionalStats;
    const days = normalizeWeather(payload);
    const todayIndex = findTodayIndex(days);
    state.allDays = scoreAllDays(days, todayIndex);
    state.scoredDays = state.allDays.slice(todayIndex, todayIndex + 11);
    state.focusDate = state.scoredDays[0]?.date ?? null;
    renderCombinedChart();
    renderSelectedDay();
    setStatus("Updated");
  } catch (error) {
    console.error(error);
    setStatus("Error");
    elements.combinedChart.innerHTML = `<div class="chart-empty">Weather data could not be loaded. Check the location and connection.</div>`;
    elements.detailCopy.textContent = "Timeline data is unavailable right now.";
  }
}

function initMap() {
  state.map = L.map("map", { zoomControl: true }).setView([state.selected.latitude, state.selected.longitude], 9);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; OpenStreetMap contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
  }).addTo(state.map);

  const markerIcon = L.divIcon({
    className: "",
    html: `<div class="fungi-pin"></div>`,
    iconAnchor: [11, 26],
    iconSize: [22, 30],
  });

  state.marker = L.marker([state.selected.latitude, state.selected.longitude], {
    draggable: true,
    icon: markerIcon,
  }).addTo(state.map);

  state.map.on("click", (event) => {
    analyzeLocation({
      label: `${event.latlng.lat.toFixed(4)}, ${event.latlng.lng.toFixed(4)}`,
      latitude: event.latlng.lat,
      longitude: event.latlng.lng,
    }, false);
  });

  state.marker.on("dragend", () => {
    const point = state.marker.getLatLng();
    analyzeLocation({
      label: `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`,
      latitude: point.lat,
      longitude: point.lng,
    }, false);
  });
}

elements.coordinateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const location = await resolveLocationInput(elements.locationInput.value);
    hideSuggestions();
    analyzeLocation(location);
  } catch (error) {
    console.error(error);
    setStatus("Not found");
  }
});

elements.locationInput.addEventListener("input", () => queueSuggestionSearch(elements.locationInput.value));
elements.locationInput.addEventListener("blur", () => window.setTimeout(hideSuggestions, 120));
elements.locationSuggestions.addEventListener("click", (event) => {
  const option = event.target.closest("[data-suggestion-index]");
  if (!option) return;
  chooseSuggestion(Number.parseInt(option.dataset.suggestionIndex, 10));
});
elements.sampleButton.addEventListener("click", () => analyzeLocation({ label: "Darien, CT", latitude: 41.0772, longitude: -73.4687 }));
elements.useLocationButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    setStatus("No GPS");
    return;
  }
  setStatus("Locating");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      analyzeLocation({
        label: "My location",
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    },
    () => setStatus("Denied"),
    { enableHighAccuracy: true, maximumAge: 300000, timeout: 10000 },
  );
});
elements.daySelector.addEventListener("click", (event) => {
  const button = event.target.closest("[data-day]");
  if (!button) return;
  setFocusDate(button.dataset.day);
});
elements.mobileTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-mobile-tab]");
  if (!button) return;
  setMobileTab(button.dataset.mobileTab);
});
elements.regionalPagination.addEventListener("click", (event) => {
  const button = event.target.closest("[data-regional-page]");
  if (!button) return;
  const page = Number.parseInt(button.dataset.regionalPage ?? "", 10);
  if (!Number.isFinite(page)) return;
  fetchRegionalObservationPage(page);
});
elements.regionalTiles.addEventListener("click", (event) => {
  const image = event.target.closest("[data-popup-image]");
  if (!image) return;
  event.preventDefault();
  openImageModal(image.dataset.popupImage, image.dataset.popupTitle);
});
elements.closeImageModalButton.addEventListener("click", closeImageModal);
elements.imageModal.addEventListener("click", (event) => {
  if (event.target === elements.imageModal) closeImageModal();
});
elements.combinedChart.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveFocus(-1);
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    moveFocus(1);
  }
});
elements.combinedChart.addEventListener("touchstart", (event) => {
  state.touchStartX = event.changedTouches[0]?.clientX ?? null;
});
elements.combinedChart.addEventListener("touchend", (event) => {
  if (state.touchStartX === null) return;
  const endX = event.changedTouches[0]?.clientX ?? state.touchStartX;
  const delta = endX - state.touchStartX;
  if (Math.abs(delta) > 24) moveFocus(delta < 0 ? 1 : -1);
  state.touchStartX = null;
});
elements.combinedChart.addEventListener("click", (event) => {
  if (!state.chartLayout || !state.allDays.length) return;
  const rect = elements.combinedChart.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const trackX = localX - state.chartLayout.targetTranslate;
  const firstX = state.chartLayout.xAt(0);
  const index = Math.round((trackX - firstX) / state.chartLayout.slotWidth);
  const clamped = clamp(index, 0, state.allDays.length - 1);
  const clicked = state.allDays[clamped];
  if (!clicked) return;
  const inSelectableRange = state.scoredDays.some((day) => day.date === clicked.date);
  if (inSelectableRange) setFocusDate(clicked.date);
});
window.addEventListener("resize", renderCombinedChart);
window.addEventListener("resize", () => {
  const active = elements.mobileTabs.querySelector(".is-active")?.dataset.mobileTab ?? "overview";
  setMobileTab(active);
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && elements.imageModal && !elements.imageModal.hidden) closeImageModal();
});

initMap();
setMobileTab("overview");
analyzeLocation(state.selected);
