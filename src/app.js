import { MODEL_METADATA, SCORING_CONFIG, applyBiologicalPersistence, buildModelFeatures, inferFruitingSignal, scoreToVerdict } from "./model.js";

const state = {
  allDays: [],
  animationFromIndex: null,
  focusDate: null,
  map: null,
  marker: null,
  radiusCircle: null,
  observationLayer: null,
  regionalStats: null,
  observationById: new Map(),
  scoredDays: [],
  selected: { latitude: 48.0000, longitude: 8.0000, label: "Black Forest, Germany" },
  regionalPage: 1,
  regionalRenderedPage: 1,
  regionalTilePages: new Map(),
  selectedSuggestion: null,
  suggestionRequestId: 0,
  suggestionTimer: null,
  suggestions: [],
  chartLayout: null,
  touchStartX: null,
  feedbackLog: [],
  feedbackDraftResponse: null,
  feedbackSync: {
    inFlight: false,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    lastErrorEventId: null,
  },
};

const FEEDBACK_STORAGE_KEY = "fungifinder_feedback_log_v1";
const FEEDBACK_PENDING_STORAGE_KEY = "fungifinder_feedback_pending_v1";
const FEEDBACK_SCHEMA_VERSION = 1;
const FEEDBACK_OPTIONS = ["Not at all", "One or Two", "Several", "A ton!"];
const FAVORABLE_FEEDBACK_OPTIONS = new Set(["Several", "A ton!"]);
const TRIP_DURATION_OPTIONS = new Set(["short", "medium", "long"]);
const REMOTE_FEEDBACK_ENDPOINT = window.FUNGI_FEEDBACK_ENDPOINT || "";
const REMOTE_FEEDBACK_API_KEY = window.FUNGI_FEEDBACK_API_KEY || "";
const REMOTE_FEEDBACK_API_KEY_HEADER = window.FUNGI_FEEDBACK_API_KEY_HEADER || "x-api-key";
const FEEDBACK_SCORE_CURVE = {
  "Not at all": { min: 0, max: 39, midpoint: 20 },
  "One or Two": { min: 40, max: 59, midpoint: 50 },
  Several: { min: 60, max: 79, midpoint: 70 },
  "A ton!": { min: 80, max: 100, midpoint: 90 },
};
const FEEDBACK_DURATION_LABELS = {
  short: "Less than 30 mins",
  medium: "Under two hours (30-120 mins)",
  long: "Longer than 2 hrs",
};
const FEEDBACK_ENV_WEIGHTS_5D = [0.15, 0.25, 0.3, 0.2, 0.1];
const FEEDBACK_EXPECTATION_MATCH_DELTA_MAX = 15;
const FORECAST_FUTURE_DAYS = 14;
const FORECAST_PAST_DAYS = 7;
const FORECAST_WINDOW_DAYS = FORECAST_FUTURE_DAYS + 1;
const DEFAULT_INATURALIST_RADIUS_KM = MODEL_METADATA.radiusKm ?? 50;
const INATURALIST_RADIUS_OPTIONS_KM = [25, 50, 100];
const INATURALIST_RADIUS_STORAGE_KEY = "fungifinder_inat_radius_km_v1";
const OBSERVATION_LAYER_STORAGE_KEY = "fungifinder_show_observation_layer_v1";
const INATURALIST_TAXON_ID = MODEL_METADATA.inatTaxonId ?? 50814;
const RAIN_AXIS_BASE_CAP_MM = 40;
const RAIN_AXIS_STEP_MM = 10;
const LOCKED_RAIN_BANDS = {
  lightMax: 10,
  mediumMax: 25,
  heavyMax: 40,
};
const HUMIDITY_CLASS_THRESHOLDS = {
  lowMax: 59,
  mediumMax: 79,
};

const elements = {
  analysisCopy: document.querySelector("#analysisCopy"),
  analysisTitle: document.querySelector("#analysisTitle"),
  combinedChart: document.querySelector("#combinedChart"),
  confidenceBadge: document.querySelector("#confidenceBadge"),
  coordinateForm: document.querySelector("#coordinateForm"),
  dataStatus: document.querySelector("#dataStatus"),
  detailCopy: document.querySelector("#detailCopy"),
  detailConfidenceBadge: document.querySelector("#detailConfidenceBadge"),
  detailDateLabel: document.querySelector("#detailDateLabel"),
  detailAdvancedMetrics: document.querySelector("#detailAdvancedMetrics"),
  detailMetrics: document.querySelector("#detailMetrics"),
  detailScore: document.querySelector("#detailScore"),
  detailStatusBadge: document.querySelector("#detailStatusBadge"),
  detailStatusNote: document.querySelector("#detailStatusNote"),
  detailVerdict: document.querySelector("#detailVerdict"),
  locationInput: document.querySelector("#locationInput"),
  locationSuggestions: document.querySelector("#locationSuggestions"),
  inatRadiusSelect: document.querySelector("#inatRadiusSelect"),
  mobileTabs: document.querySelector("#mobileTabs"),
  mapRadiusCopy: document.querySelector("[data-map-radius-copy]"),
  mobileOverviewSection: document.querySelector("#mobileOverviewSection"),
  mobileDetailsSection: document.querySelector("#mobileDetailsSection"),
  mobileExamplesSection: document.querySelector("#mobileExamplesSection"),
  mobileForecastList: document.querySelector("#mobileForecastList"),
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
  observationLayerToggleButton: document.querySelector("#observationLayerToggleButton"),
  summaryLabel: document.querySelector("#summaryLabel"),
  todayScore: document.querySelector("#todayScore"),
  todayVerdict: document.querySelector("#todayVerdict"),
  useLocationButton: document.querySelector("#useLocationButton"),
  feedbackOptions: document.querySelector("#feedbackOptions"),
  feedbackStatus: document.querySelector("#feedbackStatus"),
  tripDurationSelect: document.querySelector("#tripDurationSelect"),
  exportFeedbackButton: document.querySelector("#exportFeedbackButton"),
  clearFeedbackButton: document.querySelector("#clearFeedbackButton"),
  openFeedbackModalButton: document.querySelector("#openFeedbackModalButton"),
  feedbackModal: document.querySelector("#feedbackModal"),
  closeFeedbackModalButton: document.querySelector("#closeFeedbackModalButton"),
  submitFeedbackButton: document.querySelector("#submitFeedbackButton"),
  feedbackSyncBadge: document.querySelector("#feedbackSyncBadge"),
  copyFeedbackErrorButton: document.querySelector("#copyFeedbackErrorButton"),
};

function loadPreferredInaturalistRadiusKm() {
  try {
    const stored = Number.parseInt(localStorage.getItem(INATURALIST_RADIUS_STORAGE_KEY) ?? "", 10);
    if (INATURALIST_RADIUS_OPTIONS_KM.includes(stored)) return stored;
  } catch {
    return DEFAULT_INATURALIST_RADIUS_KM;
  }
  return DEFAULT_INATURALIST_RADIUS_KM;
}

function savePreferredInaturalistRadiusKm(radiusKm) {
  try {
    localStorage.setItem(INATURALIST_RADIUS_STORAGE_KEY, String(radiusKm));
  } catch (error) {
    console.error("Failed to save iNaturalist radius", error);
  }
}

function loadObservationLayerPreference() {
  try {
    const stored = localStorage.getItem(OBSERVATION_LAYER_STORAGE_KEY);
    if (stored === null) return true;
    return stored === "true";
  } catch {
    return true;
  }
}

function saveObservationLayerPreference(enabled) {
  try {
    localStorage.setItem(OBSERVATION_LAYER_STORAGE_KEY, enabled ? "true" : "false");
  } catch (error) {
    console.error("Failed to save mushroom map preference", error);
  }
}

state.inatRadiusKm = loadPreferredInaturalistRadiusKm();
state.showObservationLayer = loadObservationLayerPreference();

function loadFeedbackLog() {
  try {
    const raw = localStorage.getItem(FEEDBACK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return Object.values(parsed);
    return [];
  } catch {
    return [];
  }
}

function loadPendingFeedbackQueue() {
  try {
    const raw = localStorage.getItem(FEEDBACK_PENDING_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePendingFeedbackQueue(queue) {
  try {
    localStorage.setItem(FEEDBACK_PENDING_STORAGE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error("Failed to save feedback pending queue", error);
  }
}

function saveFeedbackLog() {
  try {
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(state.feedbackLog));
  } catch (error) {
    console.error("Failed to save feedback log", error);
  }
}

function buildRemoteHeaders() {
  const headers = { "Content-Type": "text/plain;charset=utf-8" };
  const isGoogleScriptEndpoint = REMOTE_FEEDBACK_ENDPOINT.includes("script.google.com/macros/");
  if (REMOTE_FEEDBACK_ENDPOINT && REMOTE_FEEDBACK_API_KEY && !isGoogleScriptEndpoint) {
    headers[REMOTE_FEEDBACK_API_KEY_HEADER] = REMOTE_FEEDBACK_API_KEY;
  }
  return headers;
}

async function pushFeedbackEntryRemote(entry) {
  if (!REMOTE_FEEDBACK_ENDPOINT) return { ok: false, error: "Remote endpoint not configured." };
  let endpoint = REMOTE_FEEDBACK_ENDPOINT;
  if (REMOTE_FEEDBACK_API_KEY && (endpoint.includes("script.google.com/macros/") || !REMOTE_FEEDBACK_API_KEY_HEADER)) {
    const join = endpoint.includes("?") ? "&" : "?";
    endpoint = `${endpoint}${join}api_key=${encodeURIComponent(REMOTE_FEEDBACK_API_KEY)}`;
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildRemoteHeaders(),
    body: JSON.stringify(entry),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (payload && typeof payload === "object") {
    if (payload.ok === true) return { ok: true, duplicate: payload.duplicate === true };
    return { ok: false, error: payload.error || "Server rejected request.", code: payload.code ?? null };
  }
  if (response.ok) return { ok: true, duplicate: false };
  return { ok: false, error: `HTTP ${response.status}` };
}

function generateEventId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function queueFeedbackForRemoteSync(entry) {
  const pending = loadPendingFeedbackQueue();
  pending.push(entry);
  savePendingFeedbackQueue(pending);
}

async function flushPendingFeedbackQueue() {
  if (!REMOTE_FEEDBACK_ENDPOINT) return;
  state.feedbackSync.inFlight = true;
  state.feedbackSync.lastAttemptAt = new Date().toISOString();
  const pending = loadPendingFeedbackQueue();
  if (!pending.length) {
    state.feedbackSync.inFlight = false;
    return;
  }
  const next = [];
  let hadFailure = false;
  for (const entry of pending) {
    try {
      const result = await pushFeedbackEntryRemote(entry);
      if (result.ok) {
        state.feedbackSync.lastSuccessAt = new Date().toISOString();
        if (!hadFailure) {
          state.feedbackSync.lastError = null;
          state.feedbackSync.lastErrorEventId = null;
        }
      } else {
        hadFailure = true;
        next.push(entry);
        state.feedbackSync.lastError = result.error || "Unknown remote sync failure.";
        state.feedbackSync.lastErrorEventId = entry.event_id || "unknown";
      }
    } catch (error) {
      hadFailure = true;
      next.push(entry);
      state.feedbackSync.lastError = error?.message || "Network error during sync.";
      state.feedbackSync.lastErrorEventId = entry.event_id || "unknown";
    }
  }
  savePendingFeedbackQueue(next);
  state.feedbackSync.inFlight = false;
}

function selectedFeedbackEntry() {
  const day = getSelectedDay();
  if (!day || !state.selected) return null;
  const lat = state.selected.latitude.toFixed(4);
  const lon = state.selected.longitude.toFixed(4);
  const matches = state.feedbackLog.filter((entry) => {
    const entryDate = entry.observed_date_local || entry.date;
    return entryDate === day.date && entry.latitude?.toFixed?.(4) === lat && entry.longitude?.toFixed?.(4) === lon;
  });
  if (!matches.length) return null;
  return matches.sort((a, b) => ((a.logged_at_utc || a.loggedAt || "") < (b.logged_at_utc || b.loggedAt || "") ? 1 : -1))[0];
}

function renderFeedbackUI() {
  if (!elements.feedbackOptions || !elements.feedbackStatus) return;
  const current = selectedFeedbackEntry();
  const draftResponse = state.feedbackDraftResponse;
  elements.feedbackOptions.querySelectorAll("[data-feedback-value]").forEach((button) => {
    const value = button.dataset.feedbackValue ?? "";
    const selected = draftResponse ? draftResponse === value : current?.response === value;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  });
  if (elements.tripDurationSelect) {
    const selectedDuration = current?.trip_duration_bucket && TRIP_DURATION_OPTIONS.has(current.trip_duration_bucket) ? current.trip_duration_bucket : "medium";
    elements.tripDurationSelect.value = selectedDuration;
  }
  const pendingCount = loadPendingFeedbackQueue().length;
  const hasFailure = pendingCount > 0 && !!state.feedbackSync.lastError;
  const hasRemote = !!REMOTE_FEEDBACK_ENDPOINT;
  if (elements.feedbackSyncBadge) {
    elements.feedbackSyncBadge.classList.remove("is-success", "is-pending", "is-error");
    if (!hasRemote) {
      elements.feedbackSyncBadge.textContent = "Local only";
    } else if (hasFailure) {
      elements.feedbackSyncBadge.textContent = "Sync issue";
      elements.feedbackSyncBadge.classList.add("is-error");
    } else if (pendingCount > 0 || state.feedbackSync.inFlight) {
      elements.feedbackSyncBadge.textContent = "Sync pending";
      elements.feedbackSyncBadge.classList.add("is-pending");
    } else {
      elements.feedbackSyncBadge.textContent = "Synced";
      elements.feedbackSyncBadge.classList.add("is-success");
    }
  }
  if (elements.copyFeedbackErrorButton) {
    elements.copyFeedbackErrorButton.hidden = !hasFailure;
  }
  if (!current) {
    if (hasFailure) {
      elements.feedbackStatus.textContent = "Upload failed. We will retry automatically when possible.";
    } else if (!hasRemote) {
      elements.feedbackStatus.textContent = `No check-in logged for this day yet. Total check-ins: ${state.feedbackLog.length}. Local-only logging is active.`;
    } else {
      elements.feedbackStatus.textContent = `No check-in logged for this day yet. Total check-ins: ${state.feedbackLog.length}.`;
    }
    return;
  }
  const when = current.logged_at_utc ? new Date(current.logged_at_utc).toLocaleString() : "Unknown time";
  const durationText = current.trip_duration_label ? ` | Duration: ${current.trip_duration_label}` : "";
  const alignmentText = current.prediction_alignment_label ? ` | Alignment: ${current.prediction_alignment_label}` : "";
  const deltaText = Number.isFinite(current.score_delta_from_feedback_curve)
    ? ` | Score vs feedback curve: ${current.score_delta_from_feedback_curve >= 0 ? "+" : ""}${current.score_delta_from_feedback_curve}`
    : "";
  if (hasFailure) {
    elements.feedbackStatus.textContent =
      `Saved for this day and location: ${current.response}${durationText}${alignmentText} (${when}). Upload failed for now and will retry automatically.`;
    return;
  }
  elements.feedbackStatus.textContent = `Saved for this day and location: ${current.response}${durationText}${alignmentText} (${when}). Total check-ins: ${state.feedbackLog.length}.${deltaText}`;
}

function buildFeedbackSyncErrorText() {
  const pendingCount = loadPendingFeedbackQueue().length;
  const attempt = state.feedbackSync.lastAttemptAt || "unknown";
  const err = state.feedbackSync.lastError || "unknown";
  const eventId = state.feedbackSync.lastErrorEventId || "unknown";
  return `Feedback sync failure\npending_count=${pendingCount}\nlast_attempt=${attempt}\nlast_error=${err}\nevent_id=${eventId}`;
}

async function copyFeedbackSyncError() {
  const text = buildFeedbackSyncErrorText();
  try {
    await navigator.clipboard.writeText(text);
    if (elements.feedbackStatus) elements.feedbackStatus.textContent = "Sync error text copied.";
  } catch {
    if (elements.feedbackStatus) elements.feedbackStatus.textContent = "Could not copy sync error text.";
  }
}

function logFeedback(response) {
  if (!FEEDBACK_OPTIONS.includes(response)) return;
  const day = getSelectedDay();
  if (!day || !state.selected) return;
  const tripDuration = TRIP_DURATION_OPTIONS.has(elements.tripDurationSelect?.value ?? "") ? elements.tripDurationSelect.value : "medium";
  const tripDurationLabel = FEEDBACK_DURATION_LABELS[tripDuration] ?? FEEDBACK_DURATION_LABELS.medium;
  const curve = FEEDBACK_SCORE_CURVE[response] ?? { min: 0, max: 100, midpoint: 50 };
  const scoreDeltaFromFeedbackCurve = Math.round(day.score - curve.midpoint);
  const alignmentLabel =
    Math.abs(scoreDeltaFromFeedbackCurve) <= FEEDBACK_EXPECTATION_MATCH_DELTA_MAX
      ? "Matched expectation"
      : scoreDeltaFromFeedbackCurve > 0
        ? "Better than expected"
        : "Lower than expected";
  const observedDateLocal = day.date;
  const loggedAtUtc = new Date().toISOString();
  const entry = {
    schema_version: FEEDBACK_SCHEMA_VERSION,
    event_id: generateEventId(),
    response,
    expected_score_min: curve.min,
    expected_score_max: curve.max,
    expected_score_midpoint: curve.midpoint,
    score_delta_from_feedback_curve: scoreDeltaFromFeedbackCurve,
    prediction_alignment_label: alignmentLabel,
    prediction_alignment_matched: alignmentLabel === "Matched expectation",
    trip_duration_label: tripDurationLabel,
    trip_duration_bucket: tripDuration,
    observed_date_local: observedDateLocal,
    logged_at_utc: loggedAtUtc,
    score: day.score,
    probability: day.probability,
    verdict: day.verdict,
    location_label: state.selected.label,
    latitude: state.selected.latitude,
    longitude: state.selected.longitude,
    rain_3d_mm: day.rainTotal3d,
    temp_avg_3d_c: day.tempAvg3d,
    humidity_avg_3d_pct: day.humidityAvg3d,
    vpd_avg_3d_kpa: day.vpdAvg3d,
    rain_5d_weighted_mm: day.rain5dWeighted,
    temp_5d_weighted_c: day.temp5dWeighted,
    humidity_5d_weighted_pct: day.humidity5dWeighted,
    days_since_meaningful_rain: day.daysSinceMeaningfulRain,
    rain_class_fixed: day.rainClassFixed,
    app_model_version: MODEL_METADATA.modelVersion,
    app_target_definition: MODEL_METADATA.targetDefinition,
  };
  state.feedbackLog.push(entry);
  queueFeedbackForRemoteSync(entry);
  saveFeedbackLog();
  renderFeedbackUI();
  flushPendingFeedbackQueue().then(() => renderFeedbackUI());
  return true;
}

async function copyFeedbackLogToClipboard() {
  const entries = [...state.feedbackLog].sort((a, b) => ((a.logged_at_utc || a.loggedAt || "") < (b.logged_at_utc || b.loggedAt || "") ? -1 : 1));
  const payload = {
    exportedAt: new Date().toISOString(),
    count: entries.length,
    entries,
  };
  try {
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    if (elements.feedbackStatus) elements.feedbackStatus.textContent = `Copied ${entries.length} feedback entries to clipboard.`;
  } catch (error) {
    console.error("Clipboard copy failed", error);
    if (elements.feedbackStatus) elements.feedbackStatus.textContent = "Could not copy feedback log. Clipboard permission may be blocked.";
  }
}

function clearFeedbackLog() {
  state.feedbackLog = [];
  saveFeedbackLog();
  savePendingFeedbackQueue([]);
  renderFeedbackUI();
  if (elements.feedbackStatus) elements.feedbackStatus.textContent = "Feedback log cleared.";
}

function openFeedbackModal() {
  if (!elements.feedbackModal) return;
  const current = selectedFeedbackEntry();
  state.feedbackDraftResponse = current?.response && FEEDBACK_OPTIONS.includes(current.response) ? current.response : null;
  renderFeedbackUI();
  elements.feedbackModal.hidden = false;
  requestAnimationFrame(() => {
    elements.feedbackModal.classList.add("is-open");
  });
}

function closeFeedbackModal() {
  if (!elements.feedbackModal) return;
  state.feedbackDraftResponse = null;
  elements.feedbackModal.classList.remove("is-open");
  window.setTimeout(() => {
    if (!elements.feedbackModal.classList.contains("is-open")) elements.feedbackModal.hidden = true;
  }, 220);
}

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  weekday: "short",
});
const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const monthDayFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const shortDatePartsFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "2-digit" });
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

function minOrNull(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? Math.min(...valid) : null;
}

function maxOrNull(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? Math.max(...valid) : null;
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

function weightedWindow(values, weights) {
  let numerator = 0;
  let denominator = 0;
  for (let idx = 0; idx < weights.length; idx += 1) {
    const weight = weights[idx] ?? 0;
    const value = values[idx];
    if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(value)) continue;
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
  const date = new Date(`${dateString}T12:00:00`);
  const parts = shortDatePartsFormatter.formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  const year = parts.find((part) => part.type === "year")?.value;
  if (!month || !day || !year) return dateString;
  return `${month} ${day}, '${year}`;
}

function buildRainIntensityBands() {
  const { lightMax, mediumMax, heavyMax } = LOCKED_RAIN_BANDS;
  const toMm = (value) => `${value.toFixed(0)} mm`;
  return {
    lightMax,
    mediumMax,
    heavyMax,
    descriptor: `Light <= ${toMm(lightMax)} | Medium <= ${toMm(mediumMax)} | Heavy <= ${toMm(heavyMax)} | Extreme > ${toMm(heavyMax)}`,
  };
}

function computeRainAxisTop(rainMax) {
  if (!Number.isFinite(rainMax) || rainMax <= RAIN_AXIS_BASE_CAP_MM) return RAIN_AXIS_BASE_CAP_MM;
  const nextCap = roundUpToStep(rainMax, RAIN_AXIS_STEP_MM);
  return Math.max(RAIN_AXIS_BASE_CAP_MM + RAIN_AXIS_STEP_MM, nextCap);
}

function classifyRainForMemory(rainMm) {
  const value = Number.isFinite(rainMm) ? Math.max(0, rainMm) : 0;
  if (value <= LOCKED_RAIN_BANDS.lightMax) return "light";
  if (value <= LOCKED_RAIN_BANDS.mediumMax) return "medium";
  if (value <= LOCKED_RAIN_BANDS.heavyMax) return "heavy";
  return "extreme";
}

function classifyHumidityForMemory(humidityPercent) {
  const value = Number.isFinite(humidityPercent) ? humidityPercent : null;
  if (value === null) return "unknown";
  if (value <= HUMIDITY_CLASS_THRESHOLDS.lowMax) return "low";
  if (value <= HUMIDITY_CLASS_THRESHOLDS.mediumMax) return "medium";
  return "high";
}

function buildMemoryKeyFromDay(day) {
  const observedDate = day.observed_date_local || day.date;
  const memoryMonth = new Date(`${observedDate}T12:00:00`).getUTCMonth() + 1;
  const rainValue = day.rain_3d_mm ?? day.rainTotal3d;
  const humidityValue = day.humidity_avg_3d_pct ?? day.humidityAvg3d;
  const memoryRainClass = day.rain_class_fixed || classifyRainForMemory(rainValue);
  const memoryHumidityClass = classifyHumidityForMemory(humidityValue);
  return {
    memoryMonth,
    memoryRainClass,
    memoryHumidityClass,
    key: `${memoryMonth}|${memoryRainClass}|${memoryHumidityClass}`,
  };
}

function computePersonalMemorySignal(day) {
  const targetKey = buildMemoryKeyFromDay(day);
  const matching = state.feedbackLog.filter((entry) => {
    const entryKey = buildMemoryKeyFromDay(entry);
    const month = Number.parseInt(entry.memoryMonth ?? entryKey.memoryMonth, 10);
    const rainClass = entry.memoryRainClass || entryKey.memoryRainClass;
    const humidityClass = entry.memoryHumidityClass || entryKey.memoryHumidityClass;
    if (!Number.isFinite(month) || !rainClass || !humidityClass) return false;
    return month === targetKey.memoryMonth && rainClass === targetKey.memoryRainClass && humidityClass === targetKey.memoryHumidityClass;
  });
  const memorySampleSize = matching.length;
  const favorableCount = matching.filter((entry) => FAVORABLE_FEEDBACK_OPTIONS.has(entry.response)).length;
  const favorableRate = memorySampleSize > 0 ? favorableCount / memorySampleSize : null;
  let memorySignal = "sparse";
  if (memorySampleSize < 3 || favorableRate === null) memorySignal = "sparse";
  else if (favorableRate < 0.35) memorySignal = "weak";
  else if (favorableRate < 0.65) memorySignal = "moderate";
  else memorySignal = "strong";
  return {
    ...targetKey,
    memorySampleSize,
    favorableRate,
    memorySignal,
  };
}

function getBestForecastDate(scoredDays) {
  if (!Array.isArray(scoredDays) || !scoredDays.length) return null;
  let best = scoredDays[0];
  for (let index = 1; index < scoredDays.length; index += 1) {
    const day = scoredDays[index];
    if ((day?.score ?? -1) > (best?.score ?? -1)) best = day;
  }
  return best?.date ?? null;
}

function signalBandFromScore(score) {
  if (!Number.isFinite(score)) {
    return { label: "Unknown signal", shortLabel: "Unknown", className: "signal-unknown" };
  }
  if (score >= 90) return { label: "Exceptional signal", shortLabel: "Exceptional", className: "signal-exceptional" };
  if (score >= 75) return { label: "Strong signal", shortLabel: "Strong", className: "signal-strong" };
  if (score >= 60) return { label: "Moderate signal", shortLabel: "Moderate", className: "signal-moderate" };
  if (score >= 40) return { label: "Limited signal", shortLabel: "Limited", className: "signal-limited" };
  return { label: "Low signal", shortLabel: "Low", className: "signal-low" };
}

function signalBandClass(score) {
  return signalBandFromScore(score).className;
}

function formatScore(score) {
  return Number.isFinite(score) ? `${Math.round(score)}/100` : "--";
}

function moistureSignalLabel(moistureResponse) {
  if (!Number.isFinite(moistureResponse)) return "--";
  if (moistureResponse >= 0.62) return "Strong";
  if (moistureResponse >= 0.4) return "Moderate";
  return "Low";
}

function persistenceLabel({ dryDays, crashPhase }) {
  if (!Number.isFinite(dryDays)) return "--";
  if (crashPhase === "hold" && dryDays <= 2) return "Fresh window";
  if (crashPhase === "taper" || dryDays <= 5) return "Aging window";
  return "Declining window";
}

function metricPillMarkup({ label, value, helper = "", className = "" }) {
  const classes = ["metric-pill", className].filter(Boolean).join(" ");
  return `
    <div class="${classes}">
      <span>${label}</span>
      <strong>${value}</strong>
      ${helper ? `<small>${helper}</small>` : ""}
    </div>
  `;
}

function outlookStatusNote({ isBestDay, persistence, confidence, signalClass }) {
  if (isBestDay && (signalClass === "signal-low" || signalClass === "signal-limited")) {
    return "The best nearby window still looks fairly modest.";
  }
  if (isBestDay) return "This looks like the strongest day coming up.";
  if (persistence === "Fresh window") return "Recent conditions are still working in your favor.";
  if (persistence === "Aging window") return "Worth checking, though the window may be fading.";
  if (confidence === "High") return "A steady outlook, even if chances stay limited.";
  return "Use the week ahead below to compare nearby days.";
}

function buildOutlookNarrative({ isBestDay, verdict, reasons }) {
  const lead = isBestDay ? "Best day in the next 14 days." : "";
  const verdictSentence = verdict && /[.!?]$/.test(verdict) ? verdict : verdict ? `${verdict}.` : "";
  const supportingSentence = (reasons ?? []).slice(0, 2).join(" ");
  return [lead, verdictSentence, supportingSentence].filter(Boolean).join(" ");
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
  humidityCarryoverSupport,
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
  else reasons.push("Recent moisture has helped a little, but not by much.");
  if (Number.isFinite(humidityCarryoverSupport) && humidityCarryoverSupport >= 0.04) {
    reasons.push("Humid air is helping moisture persist after recent rain.");
  }

  if (spoilagePenalty >= 0.35) reasons.push("Warm, wet conditions may increase rot or insect pressure.");
  else if (stalenessPenalty >= 0.35) reasons.push("Heat and drying can age mushrooms quickly.");
  else if (dryingPenalty >= 0.12 || crashPhase === "crash") reasons.push("Drying conditions are reducing mushroom quality and persistence.");

  if (avgTemp >= 30) reasons.push("Sustained heat reduces odds of finding good-condition mushrooms.");
  if (nightlyMin < -1) reasons.push("Recent frost makes a good day in the woods much less likely.");
  else if (nightlyMin < 4) reasons.push("Cold nights reduce near-term foraging confidence.");

  return reasons.slice(0, 3);
}

async function fetchWeather(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    daily: "temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum",
    hourly: "temperature_2m,relative_humidity_2m",
    forecast_days: String(FORECAST_FUTURE_DAYS + 1),
    past_days: String(FORECAST_PAST_DAYS),
    timezone: "auto",
  });
  try {
    return await fetchJsonWithRetry(`https://api.open-meteo.com/v1/forecast?${params}`, {
      retries: 1,
      retryDelayMs: 900,
      errorPrefix: "Weather request failed",
    });
  } catch (error) {
    console.warn("Forecast weather request failed; falling back to previous model run.", error);
    try {
      return await fetchWeatherPreviousRunFallback(latitude, longitude);
    } catch (fallbackError) {
      console.warn("Previous model run request failed; falling back to MET Norway forecast.", fallbackError);
      return fetchWeatherMetFallback(latitude, longitude);
    }
  }
}

function addDaysIso(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url, { retries = 0, retryDelayMs = 700, errorPrefix = "Request failed" } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`${errorPrefix} with ${response.status}`);
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await delay(retryDelayMs * (attempt + 1));
    } finally {
      window.clearTimeout(timeout);
    }
  }
  throw lastError ?? new Error(errorPrefix);
}

async function fetchWeatherPreviousRunFallback(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    daily: "temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum",
    hourly: "temperature_2m,relative_humidity_2m",
    forecast_days: String(FORECAST_FUTURE_DAYS + 1),
    past_days: String(FORECAST_PAST_DAYS),
    timezone: "auto",
  });
  const payload = await fetchJsonWithRetry(`https://previous-runs-api.open-meteo.com/v1/forecast?${params}`, {
    retries: 1,
    retryDelayMs: 700,
    errorPrefix: "Previous model run weather request failed",
  });
  return {
    ...payload,
    forecastFallback: true,
    forecastFallbackSource: "Open-Meteo previous model run",
  };
}

async function fetchWeatherMetFallback(latitude, longitude) {
  const today = new Date().toISOString().slice(0, 10);
  const startDate = addDaysIso(today, -7);
  const archiveParams = new URLSearchParams({
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    start_date: startDate,
    end_date: today,
    daily: "temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum",
    hourly: "temperature_2m,relative_humidity_2m",
    timezone: "auto",
  });
  const metParams = new URLSearchParams({
    lat: latitude.toFixed(5),
    lon: longitude.toFixed(5),
  });
  const [archivePayload, metPayload] = await Promise.all([
    fetchJsonWithRetry(`https://archive-api.open-meteo.com/v1/archive?${archiveParams}`, {
      retries: 1,
      retryDelayMs: 700,
      errorPrefix: "Archive weather request failed",
    }),
    fetchJsonWithRetry(`https://api.met.no/weatherapi/locationforecast/2.0/compact?${metParams}`, {
      retries: 1,
      retryDelayMs: 700,
      errorPrefix: "MET forecast request failed",
    }),
  ]);
  return mergeArchiveWithMetForecast(archivePayload, metPayload, today, FORECAST_FUTURE_DAYS);
}

function mergeArchiveWithMetForecast(archivePayload, metPayload, today, futureDays) {
  const metDaily = dailyWeatherFromMetForecast(metPayload, today, futureDays);
  if (!metDaily.time.length) throw new Error("MET forecast response did not include daily forecast data.");
  const archiveDaily = archivePayload.daily ?? {};
  const archiveTimes = archiveDaily.time ?? [];
  const pastIndexes = archiveTimes
    .map((date, index) => ({ date, index }))
    .filter((entry) => entry.date < today);
  const daily = {
    time: [
      ...pastIndexes.map((entry) => entry.date),
      ...metDaily.time,
    ],
    temperature_2m_mean: [
      ...pastIndexes.map((entry) => archiveDaily.temperature_2m_mean?.[entry.index] ?? null),
      ...metDaily.temperature_2m_mean,
    ],
    temperature_2m_max: [
      ...pastIndexes.map((entry) => archiveDaily.temperature_2m_max?.[entry.index] ?? null),
      ...metDaily.temperature_2m_max,
    ],
    temperature_2m_min: [
      ...pastIndexes.map((entry) => archiveDaily.temperature_2m_min?.[entry.index] ?? null),
      ...metDaily.temperature_2m_min,
    ],
    precipitation_sum: [
      ...pastIndexes.map((entry) => archiveDaily.precipitation_sum?.[entry.index] ?? 0),
      ...metDaily.precipitation_sum,
    ],
  };
  return {
    ...archivePayload,
    forecastFallback: true,
    forecastFallbackSource: "MET Norway",
    daily,
    hourly: mergeArchiveHourlyWithMetHourly(archivePayload.hourly ?? {}, metDaily.hourly, today),
  };
}

function dailyWeatherFromMetForecast(payload, today, futureDays) {
  const buckets = new Map();
  const endDate = addDaysIso(today, futureDays);
  for (const entry of payload.properties?.timeseries ?? []) {
    const time = entry.time;
    const date = time?.slice(0, 10);
    if (!date || date < today || date > endDate) continue;
    if (!buckets.has(date)) buckets.set(date, { temps: [], rhs: [], rain: 0, hourlyTime: [], hourlyTemp: [], hourlyRh: [] });
    const bucket = buckets.get(date);
    const details = entry.data?.instant?.details ?? {};
    const temp = details.air_temperature;
    const rh = details.relative_humidity;
    if (Number.isFinite(temp)) bucket.temps.push(temp);
    if (Number.isFinite(rh)) bucket.rhs.push(rh);
    bucket.hourlyTime.push(time.slice(0, 16));
    bucket.hourlyTemp.push(Number.isFinite(temp) ? temp : null);
    bucket.hourlyRh.push(Number.isFinite(rh) ? rh : null);
    const rain1h = entry.data?.next_1_hours?.details?.precipitation_amount;
    const rain6h = entry.data?.next_6_hours?.details?.precipitation_amount;
    if (Number.isFinite(rain1h)) bucket.rain += rain1h;
    else if (Number.isFinite(rain6h)) bucket.rain += rain6h;
  }
  const dates = [...buckets.keys()].sort().slice(0, futureDays + 1);
  const hourly = { time: [], temperature_2m: [], relative_humidity_2m: [] };
  dates.forEach((date) => {
    const bucket = buckets.get(date);
    hourly.time.push(...bucket.hourlyTime);
    hourly.temperature_2m.push(...bucket.hourlyTemp);
    hourly.relative_humidity_2m.push(...bucket.hourlyRh);
  });
  return {
    time: dates,
    temperature_2m_mean: dates.map((date) => mean(buckets.get(date).temps)),
    temperature_2m_max: dates.map((date) => maxOrNull(buckets.get(date).temps) ?? mean(buckets.get(date).temps)),
    temperature_2m_min: dates.map((date) => minOrNull(buckets.get(date).temps) ?? mean(buckets.get(date).temps)),
    precipitation_sum: dates.map((date) => buckets.get(date).rain),
    hourly,
  };
}

function mergeArchiveHourlyWithMetHourly(archiveHourly, metHourly, today) {
  const archiveTime = archiveHourly.time ?? [];
  const archiveTemp = archiveHourly.temperature_2m ?? [];
  const archiveRh = archiveHourly.relative_humidity_2m ?? [];
  const pastIndexes = archiveTime
    .map((time, index) => ({ time, index }))
    .filter((entry) => entry.time?.slice(0, 10) < today);
  return {
    time: [...pastIndexes.map((entry) => entry.time), ...(metHourly.time ?? [])],
    temperature_2m: [...pastIndexes.map((entry) => archiveTemp[entry.index] ?? null), ...(metHourly.temperature_2m ?? [])],
    relative_humidity_2m: [...pastIndexes.map((entry) => archiveRh[entry.index] ?? null), ...(metHourly.relative_humidity_2m ?? [])],
  };
}

function isoDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function buildINaturalistParams(latitude, longitude, radiusKm, extraParams = {}) {
  return new URLSearchParams({
    taxon_id: String(INATURALIST_TAXON_ID),
    lat: latitude.toFixed(5),
    lng: longitude.toFixed(5),
    per_page: "1",
    radius: String(radiusKm),
    verifiable: "true",
    ...extraParams,
  });
}

async function fetchINaturalistCount(latitude, longitude, radiusKm, extraParams = {}) {
  const params = buildINaturalistParams(latitude, longitude, radiusKm, extraParams);
  const response = await fetch(`https://api.inaturalist.org/v1/observations?${params}`);
  if (!response.ok) throw new Error(`iNaturalist request failed with ${response.status}`);
  const payload = await response.json();
  return payload.total_results ?? 0;
}

async function fetchINaturalistRecentResearch(latitude, longitude, radiusKm, extraParams = {}) {
  const params = buildINaturalistParams(latitude, longitude, radiusKm, {
    per_page: "8",
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
    const observedOnRaw = item.observed_on || item.time_observed_at?.slice(0, 10) || "";
    const observedOn = observedOnRaw ? formatShortDate(observedOnRaw) : "";
    const photo = item.photos?.[0]?.url?.replace("square", "medium") ?? "";
    const coordinates = item.geojson?.coordinates;
    const longitudeValue = Array.isArray(coordinates) ? Number(coordinates[0]) : NaN;
    const latitudeValue = Array.isArray(coordinates) ? Number(coordinates[1]) : NaN;
    return {
      id: item.id,
      latitude: Number.isFinite(latitudeValue) ? latitudeValue : null,
      longitude: Number.isFinite(longitudeValue) ? longitudeValue : null,
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

async function fetchINaturalistRecentNonResearch(latitude, longitude, radiusKm, extraParams = {}) {
  const params = buildINaturalistParams(latitude, longitude, radiusKm, {
    per_page: "200",
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
      const observedOnRaw = item.observed_on || item.time_observed_at?.slice(0, 10) || "";
      const observedOn = observedOnRaw ? formatShortDate(observedOnRaw) : "";
      const photo = item.photos?.[0]?.url?.replace("square", "medium") ?? "";
      const coordinates = item.geojson?.coordinates;
      const longitudeValue = Array.isArray(coordinates) ? Number(coordinates[0]) : NaN;
      const latitudeValue = Array.isArray(coordinates) ? Number(coordinates[1]) : NaN;
      return {
        id: item.id,
        latitude: Number.isFinite(latitudeValue) ? latitudeValue : null,
        longitude: Number.isFinite(longitudeValue) ? longitudeValue : null,
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

async function fetchINaturalistRecentNonResearchAll(latitude, longitude, radiusKm, extraParams = {}) {
  const perPage = 200;
  let page = 1;
  let totalResults = 0;
  const all = [];
  while (page <= 5) {
    const result = await fetchINaturalistRecentNonResearch(latitude, longitude, radiusKm, {
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

async function fetchINaturalistRecentResearchAll(latitude, longitude, radiusKm, extraParams = {}) {
  const perPage = 200;
  let page = 1;
  let totalResults = 0;
  const all = [];
  while (page <= 5) {
    const result = await fetchINaturalistRecentResearch(latitude, longitude, radiusKm, {
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

async function fetchRegionalObservationStats(latitude, longitude, dateString, radiusKm) {
  try {
    const [researchRecent14Observations, researchAll, nonResearchAll] =
      await Promise.all([
        fetchINaturalistCount(latitude, longitude, radiusKm, { d1: isoDaysAgo(14), quality_grade: "research" }),
        fetchINaturalistRecentResearchAll(latitude, longitude, radiusKm, { d1: isoDaysAgo(14) }),
        fetchINaturalistRecentNonResearchAll(latitude, longitude, radiusKm, { d1: isoDaysAgo(14) }),
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
      <div class="observation-tile" role="button" tabindex="0" data-observation-id="${obs.id}">
        <div class="observation-thumb">
          ${obs.qualityGrade === "research" ? `<span class="grade-badge">Research Grade</span>` : ""}
          ${
            obs.photo
              ? `<img src="${obs.photo}" alt="${obs.species}">`
              : `<span>No photo</span>`
          }
        </div>
        <div class="observation-meta">
          <strong>${obs.species}</strong>
          ${obs.scientificName ? `<em>${obs.scientificName}</em>` : ""}
          <span>${obs.observedOn || "Date unknown"}</span>
        </div>
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

function openObservationModal(observation) {
  if (!observation || !elements.imageModal) return;
  if (elements.imageModalPreview) {
    elements.imageModalPreview.src = observation.photo || "";
    elements.imageModalPreview.alt = observation.species || "Observation preview";
  }
  if (elements.imageModalTitle) elements.imageModalTitle.textContent = observation.species || "Observation";
  const modalPhoto = elements.imageModal.querySelector("[data-modal-photo]");
  const modalSpecies = elements.imageModal.querySelector("[data-modal-species]");
  const modalScientific = elements.imageModal.querySelector("[data-modal-scientific]");
  const modalObservedOn = elements.imageModal.querySelector("[data-modal-observed-on]");
  const modalGrade = elements.imageModal.querySelector("[data-modal-grade]");
  const modalLinks = elements.imageModal.querySelector("[data-modal-links]");
  if (modalPhoto) {
    modalPhoto.src = observation.photo || "";
    modalPhoto.alt = observation.species || "Observation preview";
  }
  if (modalSpecies) modalSpecies.textContent = observation.species || "Unknown mushroom";
  if (modalScientific) modalScientific.textContent = observation.scientificName || "";
  if (modalObservedOn) modalObservedOn.textContent = observation.observedOn || "Date unknown";
  if (modalGrade) modalGrade.textContent = observation.qualityGrade === "research" ? "Research Grade" : "Needs ID";
  if (modalLinks) {
    modalLinks.innerHTML = `
      <a href="${observation.url}" target="_blank" rel="noopener noreferrer">View on iNaturalist</a>
      ${observation.wikipediaUrl ? `<a href="${observation.wikipediaUrl}" target="_blank" rel="noopener noreferrer">Wikipedia</a>` : ""}
    `;
  }
  elements.imageModal.hidden = false;
  requestAnimationFrame(() => {
    elements.imageModal.classList.add("is-open");
  });
}

function closeObservationModal() {
  if (!elements.imageModal) return;
  elements.imageModal.classList.remove("is-open");
  window.setTimeout(() => {
    if (!elements.imageModal.classList.contains("is-open")) elements.imageModal.hidden = true;
  }, 220);
}

function renderObservationMapLayer(observations) {
  if (!state.map) return;
  if (!state.observationLayer) {
    state.observationLayer = L.layerGroup().addTo(state.map);
  }
  state.observationLayer.clearLayers();
  if (!state.showObservationLayer) return;
  const markerCount = Math.min(observations.length, 40);
  observations
    .slice(0, markerCount)
    .filter((observation) => Number.isFinite(observation.latitude) && Number.isFinite(observation.longitude))
    .forEach((observation) => {
      const markerSize = observation.photo ? 30 : 24;
      const photoUrl = observation.photo || "";
      const safePhotoUrl = encodeURI(photoUrl);
      const markerHtml = observation.photo
        ? `<div class="map-observation-marker has-photo" style="background-image:url('${safePhotoUrl}')"></div>`
        : `<div class="map-observation-marker no-photo"></div>`;
      const icon = L.divIcon({
        className: "map-observation-icon",
        html: markerHtml,
        iconSize: [markerSize, markerSize],
        iconAnchor: [markerSize / 2, markerSize / 2],
      });
      const marker = L.marker([observation.latitude, observation.longitude], {
        icon,
        keyboard: false,
      });
      marker.on("click", () => openObservationModal(observation));
      marker.addTo(state.observationLayer);
    });
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
  renderObservationMapLayer(state.regionalStats?.uniqueResearchObservations ?? []);
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
  const tempMin3d = minOrNull(threeDayWindow.map((day) => day.minTemp));
  const tempAvg3d = mean(threeDayWindow.map((day) => day.meanTemp));
  const tempMax3d = maxOrNull(threeDayWindow.map((day) => day.maxTemp));
  const rainTotal3d = rainLast3d;
  const rainAvg3d = rainTotal3d / Math.max(1, threeDayWindow.length);
  const humidityMin3d = minOrNull(threeDayWindow.map((day) => day.rhMean));
  const humidityAvg3d = mean(threeDayWindow.map((day) => day.rhMean));
  const humidityMax3d = maxOrNull(threeDayWindow.map((day) => day.rhMean));
  const vpdAvg3d = mean(threeDayWindow.map((day) => day.vpdMean));
  const rainWindow5d = Array.from({ length: 5 }, (_, lag) => Math.max(0, days[index - (lag + 1)]?.precipitation ?? 0));
  const tempWindow5d = Array.from({ length: 5 }, (_, lag) => days[index - (lag + 1)]?.meanTemp ?? null);
  const humidityWindow5d = Array.from({ length: 5 }, (_, lag) => days[index - (lag + 1)]?.rhMean ?? null);
  const rain5dWeighted = weightedWindow(rainWindow5d, FEEDBACK_ENV_WEIGHTS_5D);
  const temp5dWeighted = weightedWindow(tempWindow5d, FEEDBACK_ENV_WEIGHTS_5D);
  const humidity5dWeighted = weightedWindow(humidityWindow5d, FEEDBACK_ENV_WEIGHTS_5D);
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
  const daysSinceMeaningfulRain =
    Number.isFinite(featureBundle?.diagnostics?.dryDaysSinceMeaningfulRain)
      ? featureBundle.diagnostics.dryDaysSinceMeaningfulRain
      : null;
  const rainClassFixed = classifyRainForMemory(rainTotal3d);

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
    tempMin3d,
    tempAvg3d,
    tempMax3d,
    rainTotal3d,
    rainAvg3d,
    humidityMin3d,
    humidityAvg3d,
    humidityMax3d,
    vpdAvg3d,
    rain5dWeighted,
    temp5dWeighted,
    humidity5dWeighted,
    daysSinceMeaningfulRain,
    rainClassFixed,
    probability: modelInference.probability,
    score: clamp(score, 0, 100),
    season,
    verdict: scoreToVerdict(modelInference.probability),
    reasons: buildReasons({
      rainEventClass: featureBundle.diagnostics.rainEventClass,
      rain5dResponse: featureBundle.diagnostics.rain5d_response,
      humidityCarryoverSupport: featureBundle.diagnostics.humidityCarryoverSupport,
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
    if (scored.length > 0) {
      const previous = scored[scored.length - 1];
      const persistedProbability = applyBiologicalPersistence({
        previousProbability: previous.probability,
        currentProbability: scoredDay.probability,
        drydownCrashFactor: scoredDay?.diagnostics?.drydownCrashFactor,
        vpd3: scoredDay?.diagnostics?.vpd3,
        dryDaysSinceMeaningfulRain: scoredDay?.diagnostics?.dryDaysSinceMeaningfulRain,
      });
      scoredDay.probability = persistedProbability;
      scoredDay.score = Math.round(clamp(persistedProbability * 100, 0, 100));
      scoredDay.verdict = scoreToVerdict(persistedProbability);
      scoredDay.diagnostics = {
        ...(scoredDay.diagnostics ?? {}),
        persistenceAdjusted: true,
      };
    }
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
  if (state.radiusCircle) {
    state.radiusCircle.setLatLng([latitude, longitude]);
    state.radiusCircle.setRadius(state.inatRadiusKm * 1000);
  }
  if (state.map) fitMapToRadius();
}

function setInaturalistRadiusKm(radiusKm, shouldRefresh = true) {
  if (!INATURALIST_RADIUS_OPTIONS_KM.includes(radiusKm)) return;
  if (state.inatRadiusKm === radiusKm) return;
  state.inatRadiusKm = radiusKm;
  savePreferredInaturalistRadiusKm(radiusKm);
  if (elements.inatRadiusSelect && elements.inatRadiusSelect.value !== String(radiusKm)) {
    elements.inatRadiusSelect.value = String(radiusKm);
  }
  if (state.radiusCircle) state.radiusCircle.setRadius(radiusKm * 1000);
  if (state.map) fitMapToRadius();
  updateRadiusLegend();
  updateRegionalScopeCopy();
  if (shouldRefresh && state.selected) {
    refreshRegionalObservationContext();
  }
}

function setObservationLayerEnabled(enabled, shouldRefresh = true) {
  state.showObservationLayer = Boolean(enabled);
  saveObservationLayerPreference(state.showObservationLayer);
  updateObservationLayerUI();
  renderObservationMapLayer(state.regionalStats?.uniqueResearchObservations ?? []);
  if (shouldRefresh) renderRegionalStats();
}

function fitMapToRadius() {
  if (!state.map || !state.radiusCircle) return;
  state.map.invalidateSize(false);
  state.map.fitBounds(state.radiusCircle.getBounds().pad(0.18), {
    animate: false,
    padding: [24, 24],
  });
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
      ? { top: 16, right: 62, bottom: 60, left: 58 }
      : { top: 18, right: 88, bottom: 58, left: 74 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const signalLaneHeight = mobile ? 44 : 42;
  const weatherTop = margin.top + signalLaneHeight;
  const weatherHeight = plotHeight - signalLaneHeight;
  const visibleSlots = 15;
  const slotWidth = plotWidth / visibleSlots;
  const tempValues = state.allDays.flatMap((day) => [day.minTemp, day.meanTemp, day.maxTemp]);
  const rawTempMin = Math.min(...tempValues);
  const rawTempMax = Math.max(...tempValues);
  const tempMin = rawTempMin < 0 ? roundDownToStep(rawTempMin, 10) : 0;
  const tempMax = rawTempMax > 30 ? roundUpToStep(rawTempMax, 10) : 30;
  const rainValues = state.allDays.map((day) => day.expectedRainfall);
  const rainMax = Math.max(...rainValues, 0);
  const rainTop = computeRainAxisTop(rainMax);
  const rainBands = buildRainIntensityBands();
  const rainDescriptor = mobile
    ? `L<=${rainBands.lightMax} M<=${rainBands.mediumMax} H<=${rainBands.heavyMax} X>${rainBands.heavyMax} mm`
    : rainBands.descriptor;
  const chartDescriptor = rainDescriptor;
  const barWidth = Math.max(14, slotWidth - 10);
  const opportunityRibbonHeight = mobile ? 30 : 28;
  const opportunityRibbonY = margin.top + (mobile ? 6 : 7);
  const centerIndex = 7;
  const todayDate = new Date().toISOString().slice(0, 10);
  const focusIndex = state.allDays.findIndex((day) => day.date === state.focusDate);
  const clipId = `timeline-clip-${state.selected.latitude.toFixed(3)}-${state.selected.longitude.toFixed(3)}`.replace(
    /[^a-zA-Z0-9_-]/g,
    "",
  );
  const todayIndex = state.allDays.findIndex((day) => day.date === todayDate);
  const bestForecastDate = getBestForecastDate(state.scoredDays);

  const xAt = (index) => margin.left + slotWidth / 2 + index * slotWidth;
  const barXAt = (index) => xAt(index) - barWidth / 2;
  const yTempAt = (value) => weatherTop + weatherHeight - ((value - tempMin) / Math.max(tempMax - tempMin, 8)) * weatherHeight;
  const yRainAt = (value) => weatherTop + weatherHeight - (value / rainTop) * weatherHeight;
  const freezingLineY = yTempAt(0);
  const showFreezingLine = tempMin < 0 && tempMax >= 0;
  const focusDateShort = state.focusDate ? formatShortDate(state.focusDate) : "";

  const minPoints = state.allDays.map((day, index) => ({ x: xAt(index), y: yTempAt(day.minTemp) }));
  const avgPoints = state.allDays.map((day, index) => ({ x: xAt(index), y: yTempAt(day.meanTemp) }));
  const maxPoints = state.allDays.map((day, index) => ({ x: xAt(index), y: yTempAt(day.maxTemp) }));
  const scoredDateSet = new Set(state.scoredDays.map((day) => day.date));
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
        const y = weatherTop + ratio * weatherHeight;
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
      <line class="signal-lane-divider" x1="${margin.left}" y1="${weatherTop}" x2="${width - margin.right}" y2="${weatherTop}"></line>
      <g clip-path="url(#${clipId})">
        <g class="combined-chart-track" style="transform: translateX(${fromTranslate}px); transform-box: fill-box; transform-origin: center;">
          ${
            pastShadeTrackX !== null
              ? `<rect class="past-window-shade" x="${xAt(0) - slotWidth / 2}" y="${weatherTop}" width="${Math.max(0, pastShadeTrackX - (xAt(0) - slotWidth / 2))}" height="${weatherHeight}"></rect>`
              : ""
          }
        ${state.allDays.map((day, index) => {
          if (!scoredDateSet.has(day.date)) return "";
          const signal = signalBandFromScore(day.score);
          const isActive = index === focusIndex;
          const isBestDay = day.date === bestForecastDate;
          return `
            <g class="opportunity-day${isActive ? " is-active" : ""}${isBestDay ? " is-best" : ""}" data-opportunity-date="${day.date}">
              <rect
                class="opportunity-block ${signal.className}"
                x="${xAt(index) - slotWidth / 2 + 2}"
                y="${opportunityRibbonY}"
                rx="7"
                ry="7"
                width="${Math.max(7, slotWidth - 4)}"
                height="${opportunityRibbonHeight}"
              ></rect>
              ${isBestDay ? `<text class="opportunity-best-marker" x="${xAt(index)}" y="${opportunityRibbonY - 3}" text-anchor="middle">Best</text>` : ""}
            </g>
          `;
        }).join("")}
        ${state.allDays.map((day, index) => `
          <rect
            class="${index === focusIndex ? "combined-bar selected" : "combined-bar"}${day.date === bestForecastDate ? " best-day" : ""}"
            x="${barXAt(index)}"
            y="${yRainAt(day.expectedRainfall)}"
            rx="4"
            ry="4"
            width="${barWidth}"
            height="${Math.max(2, margin.top + plotHeight - yRainAt(day.expectedRainfall))}"
          ></rect>
        `).join("")}
        ${false && bestForecastDate
          ? state.allDays
              .map((day, index) => {
                if (day.date !== bestForecastDate) return "";
                const medalY = weatherTop + 18;
                return `<text class="best-day-medal" x="${xAt(index)}" y="${medalY}" text-anchor="middle" aria-label="Best day in next 14 days" title="Best day in next 14 days">🥇</text>`;
              })
              .join("")
          : ""}
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
      <line class="target-marker" x1="${markerX}" y1="${weatherTop}" x2="${markerX}" y2="${margin.top + plotHeight}"></line>
      <text class="target-date-label" x="${markerX}" y="${height - 4}" text-anchor="middle">${focusDateShort}</text>
    </svg>
  `;
  elements.combinedChart.dataset.rainDescriptor = chartDescriptor;
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
      const isBestDay = day.date === getBestForecastDate(state.scoredDays);
      const signal = signalBandFromScore(day.score);
      return `
        <button class="day-chip ${signal.className}${isActive ? " is-active" : ""}" type="button" data-day="${day.date}" aria-pressed="${isActive}">
          <span class="day-chip-date">${parts.weekday}${isBestDay ? ' <span class="day-chip-medal" aria-label="Best day in next 14 days" title="Best day in next 14 days">🥇</span>' : ""}</span>
          <strong>${signal.shortLabel}</strong>
          <span class="day-chip-score">${parts.monthDay} · ${formatScore(day.score)}</span>
        </button>
      `;
    })
    .join("");
}

function renderMobileForecastList() {
  if (!elements.mobileForecastList) return;
  if (!state.scoredDays.length) {
    elements.mobileForecastList.innerHTML = "";
    return;
  }
  const bestForecastDate = getBestForecastDate(state.scoredDays);
  elements.mobileForecastList.innerHTML = state.scoredDays
    .map((day) => {
      const parts = formatTimelineLabelParts(day.date);
      const signal = signalBandFromScore(day.score);
      const isActive = day.date === state.focusDate;
      const isBestDay = day.date === bestForecastDate;
      const rain = Number.isFinite(day.expectedRainfall) ? `${day.expectedRainfall.toFixed(day.expectedRainfall >= 10 ? 0 : 1)} mm` : "--";
      const avgTemp = Number.isFinite(day.meanTemp) ? `${day.meanTemp.toFixed(0)}&deg;C avg` : "--";
      const minMax =
        Number.isFinite(day.minTemp) && Number.isFinite(day.maxTemp)
          ? `${day.minTemp.toFixed(0)}-${day.maxTemp.toFixed(0)}&deg;C`
          : "--";
      return `
        <button class="mobile-forecast-day ${signal.className}${isActive ? " is-active" : ""}" type="button" data-mobile-forecast-day="${day.date}" aria-pressed="${isActive}">
          <span class="mobile-forecast-date">
            <span>${parts.weekday}</span>
            <strong>${parts.monthDay}</strong>
          </span>
          <span class="mobile-forecast-main">
            <span class="mobile-forecast-signal">${signal.label}</span>
            <span class="mobile-forecast-score">${formatScore(day.score)}${isBestDay ? " · Best window" : ""}</span>
          </span>
          <span class="mobile-forecast-weather" aria-label="Weather context">
            <span>${rain}</span>
            <span>${avgTemp}</span>
            <span>${minMax}</span>
          </span>
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

function renderSelectedDayLegacy() {
  const selectedDay = getSelectedDay();
  if (!selectedDay) return;
  const moistureResponse = Number.isFinite(selectedDay?.diagnostics?.rain5dResponse)
    ? selectedDay.diagnostics.rain5dResponse
    : Number.isFinite(selectedDay?.diagnostics?.rain5d_response)
      ? selectedDay.diagnostics.rain5d_response
      : null;
  const dryDays = selectedDay?.diagnostics?.dryDaysSinceMeaningfulRain;
  const crashPhase = selectedDay?.diagnostics?.crashPhase ?? null;
  const signal = signalBandFromScore(selectedDay.score);
  const moistureSignal = moistureSignalLabel(moistureResponse);
  const persistence = persistenceLabel({ dryDays, crashPhase });

  const label = formatTimelineLabel(selectedDay.date);
  elements.summaryLabel.textContent = "Today";
  elements.todayScore.textContent = signal.label;
  elements.todayVerdict.textContent = `${formatScore(selectedDay.score)} · ${selectedDay.verdict}`;
  elements.confidenceBadge.textContent = selectedDay.confidence;
  elements.analysisTitle.textContent = `${label}: at a glance`;
  elements.analysisCopy.textContent = "Start with today’s outlook above, then compare the rest of the week below.";
  if (elements.seasonBadge) elements.seasonBadge.textContent = `${selectedDay.season} seasonal context`;
  elements.detailDateLabel.textContent = label;
  elements.detailScore.textContent = signal.label;
  elements.detailVerdict.textContent = `${formatScore(selectedDay.score)} · ${selectedDay.verdict}`;
  const isBestDay = selectedDay.date === getBestForecastDate(state.scoredDays);
  const topReasons = (selectedDay.reasons ?? []).slice(0, 2).join(" ");
  elements.detailCopy.textContent = `${isBestDay ? "Best day in next 14 days. " : ""}${topReasons}`;
  elements.detailMetrics.innerHTML = `
    <p class="metric-method-note">A quick summary first, with extra weather detail underneath.</p>
    <div class="metric-pill ${signal.className}"><span>Overall outlook</span><strong>${signal.label}</strong></div>
    <div class="metric-pill"><span>Day rating</span><strong>${formatScore(selectedDay.score)}</strong></div>
    <div class="metric-pill"><span>Recent moisture</span><strong>${moistureSignal}</strong></div>
    <div class="metric-pill"><span>How long it may last</span><strong>${persistence}</strong></div>
    <div class="metric-pill"><span>Recent temperatures</span><strong>${Number.isFinite(selectedDay.tempMin3d) ? selectedDay.tempMin3d.toFixed(1) : "--"} / ${Number.isFinite(selectedDay.tempAvg3d) ? selectedDay.tempAvg3d.toFixed(1) : "--"} / ${Number.isFinite(selectedDay.tempMax3d) ? selectedDay.tempMax3d.toFixed(1) : "--"}&deg;C</strong></div>
    <div class="metric-pill"><span>Peak humidity</span><strong>${Number.isFinite(selectedDay.humidityMax3d) ? selectedDay.humidityMax3d.toFixed(0) : "--"} %</strong></div>
  `;
  renderFeedbackUI();
  renderRegionalStats();
  renderDaySelector();
  renderMobileForecastList();
}

function renderSelectedDay() {
  const selectedDay = getSelectedDay();
  if (!selectedDay) return;
  const moistureResponse = Number.isFinite(selectedDay?.diagnostics?.rain5dResponse)
    ? selectedDay.diagnostics.rain5dResponse
    : Number.isFinite(selectedDay?.diagnostics?.rain5d_response)
      ? selectedDay.diagnostics.rain5d_response
      : null;
  const dryDays = selectedDay?.diagnostics?.dryDaysSinceMeaningfulRain;
  const crashPhase = selectedDay?.diagnostics?.crashPhase ?? null;
  const signal = signalBandFromScore(selectedDay.score);
  const moistureSignal = moistureSignalLabel(moistureResponse);
  const persistence = persistenceLabel({ dryDays, crashPhase });
  const label = formatTimelineLabel(selectedDay.date);
  const isBestDay = selectedDay.date === getBestForecastDate(state.scoredDays);
  const outlookNarrative = buildOutlookNarrative({
    isBestDay,
    verdict: selectedDay.verdict,
    reasons: selectedDay.reasons,
  });

  elements.summaryLabel.textContent = "Today";
  elements.todayScore.textContent = formatScore(selectedDay.score);
  elements.todayVerdict.textContent = `${signal.shortLabel} outlook`;
  elements.confidenceBadge.textContent = selectedDay.confidence;
  elements.analysisTitle.textContent = `${label}: at a glance`;
  elements.analysisCopy.textContent = "Start with today’s outlook above, then compare the rest of the week below.";
  if (elements.seasonBadge) elements.seasonBadge.textContent = `${selectedDay.season} seasonal context`;

  elements.detailDateLabel.textContent = label;
  elements.detailScore.textContent = formatScore(selectedDay.score);
  elements.detailVerdict.textContent = selectedDay.verdict;
  if (elements.detailConfidenceBadge) elements.detailConfidenceBadge.textContent = selectedDay.confidence;
  if (elements.detailStatusBadge) {
    elements.detailStatusBadge.textContent = signal.shortLabel;
    elements.detailStatusBadge.className = `detail-status-badge ${signal.className}`;
  }
  if (elements.detailStatusNote) {
    elements.detailStatusNote.textContent = outlookStatusNote({
      isBestDay,
      persistence,
      confidence: selectedDay.confidence,
      signalClass: signal.className,
    });
  }
  elements.detailCopy.textContent = outlookNarrative;
  elements.detailMetrics.innerHTML = [
    metricPillMarkup({
      label: "Overall signal",
      value: signal.shortLabel,
      helper: "A quick read on how promising the day looks.",
      className: signal.className,
    }),
    metricPillMarkup({
      label: "Day rating",
      value: formatScore(selectedDay.score),
      helper: "Useful for comparing one day with another.",
    }),
    metricPillMarkup({
      label: "Recent moisture",
      value: moistureSignal,
      helper: "How helpful recent wet weather has been.",
    }),
  ].join("");
  if (elements.detailAdvancedMetrics) {
    elements.detailAdvancedMetrics.innerHTML = [
      metricPillMarkup({
        label: "How long it may last",
        value: persistence,
        helper: "Whether the current pattern feels fresh, fading, or already slipping.",
      }),
      metricPillMarkup({
        label: "Recent temperatures",
        value: `${Number.isFinite(selectedDay.tempMin3d) ? selectedDay.tempMin3d.toFixed(1) : "--"} / ${Number.isFinite(selectedDay.tempAvg3d) ? selectedDay.tempAvg3d.toFixed(1) : "--"} / ${Number.isFinite(selectedDay.tempMax3d) ? selectedDay.tempMax3d.toFixed(1) : "--"}&deg;C`,
        helper: "Low, average, and high temperatures over the past three days.",
      }),
      metricPillMarkup({
        label: "Peak humidity",
        value: `${Number.isFinite(selectedDay.humidityMax3d) ? selectedDay.humidityMax3d.toFixed(0) : "--"} %`,
        helper: "The highest humidity reached in the past three days.",
      }),
    ].join("");
  }

  renderFeedbackUI();
  renderRegionalStats();
  renderDaySelector();
  renderMobileForecastList();
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
    state.observationById = new Map();
    renderObservationMapLayer([]);
    updateRegionalScopeCopy();
    return;
  }
  state.observationById = new Map((stats.uniqueResearchObservations ?? []).map((observation) => [String(observation.id), observation]));
  elements.regionalConfidence.textContent = "";
  elements.regionalConfidence.hidden = true;
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
  elements.regionalMetrics.innerHTML = `
    <div class="metric-pill"><span>Search radius</span><strong>${state.inatRadiusKm} km</strong></div>
    <div class="metric-pill"><span>Mushrooms on map</span><strong>${state.showObservationLayer ? "Yes" : "No"}</strong></div>
    <div class="metric-pill"><span>Research-grade (14d)</span><strong>${stats.researchRecent14Total ?? stats.researchRecent14Observations}</strong></div>
    <div class="metric-pill"><span>Unique species</span><strong>${(stats.uniqueResearchObservations ?? []).length}</strong></div>
  `;
  updateRegionalScopeCopy();
  renderObservationMapLayer(stats.uniqueResearchObservations ?? []);
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

function updateRadiusLegend() {
  const label = elements.mapRadiusCopy;
  if (label) label.textContent = `${state.inatRadiusKm} km around the selected point`;
}

function updateRegionalScopeCopy() {
  if (!elements.regionalCopy) return;
  elements.regionalCopy.textContent = `Recent mushroom reports within ${state.inatRadiusKm} km offer extra local perspective around your chosen area.`;
}

function updateObservationLayerUI() {
  if (elements.observationLayerToggleButton) {
    elements.observationLayerToggleButton.classList.toggle("is-active", state.showObservationLayer);
    elements.observationLayerToggleButton.setAttribute("aria-pressed", state.showObservationLayer ? "true" : "false");
    elements.observationLayerToggleButton.textContent = state.showObservationLayer ? "Hide finds" : "Show finds";
  }
}

async function refreshRegionalObservationContext() {
  if (!state.selected) return;
  state.regionalStats = null;
  state.regionalPage = 1;
  state.regionalRenderedPage = 1;
  state.regionalTilePages.clear();
  renderRegionalStats();
  try {
    const today = new Date().toISOString().slice(0, 10);
    state.regionalStats = await fetchRegionalObservationStats(
      state.selected.latitude,
      state.selected.longitude,
      today,
      state.inatRadiusKm,
    );
    renderRegionalStats();
    renderSelectedDay();
  } catch (error) {
    console.error(error);
    state.regionalStats = {
      confidence: "Unavailable",
      recent7Observations: 0,
      recent14Observations: 0,
      researchRecent14Observations: 0,
      seasonalObservations: 0,
      source: "iNaturalist",
      status: "unavailable",
      summary: "",
      totalObservations: 0,
      recentResearchObservations: [],
      researchRecent14Total: 0,
      uniqueResearchObservations: [],
      uniqueResearchOnlyCount: 0,
    };
    renderRegionalStats();
  }
}

async function analyzeLocation(location, shouldMoveMap = true) {
  setSelectedLocation(location.latitude, location.longitude, location.label, shouldMoveMap);
  setStatus("Loading");
  elements.combinedChart.innerHTML = `<div class="loading">Building the weather timeline...</div>`;
  elements.detailCopy.textContent = "Loading the latest outlook for this location.";
  state.regionalStats = null;
  state.regionalPage = 1;
  state.regionalRenderedPage = 1;
  state.regionalTilePages.clear();
  renderRegionalStats();

  try {
    const today = new Date().toISOString().slice(0, 10);
    const [payload, regionalStats] = await Promise.all([
      fetchWeather(location.latitude, location.longitude),
      fetchRegionalObservationStats(location.latitude, location.longitude, today, state.inatRadiusKm),
    ]);
    const usedWeatherFallback = payload.forecastFallback === true;
    state.regionalStats = regionalStats;
    const days = normalizeWeather(payload);
    const todayIndex = findTodayIndex(days);
    state.allDays = scoreAllDays(days, todayIndex);
    const forecastStart = Math.min(state.allDays.length, todayIndex);
    state.scoredDays = state.allDays.slice(forecastStart, forecastStart + FORECAST_WINDOW_DAYS);
    if (!state.scoredDays.length) {
      state.scoredDays = state.allDays.slice(todayIndex, todayIndex + FORECAST_WINDOW_DAYS);
    }
    state.focusDate = state.scoredDays[0]?.date ?? null;
    renderCombinedChart();
    renderSelectedDay();
    setStatus(usedWeatherFallback ? "Limited" : "Updated");
    if (usedWeatherFallback) {
      elements.analysisCopy.textContent =
        payload.forecastFallbackSource === "MET Norway"
          ? "Live forecast coverage is limited right now, so a backup forecast is being shown instead."
          : "Live forecast coverage is limited right now, so the latest available forecast is being shown instead.";
    }
  } catch (error) {
    console.error(error);
    setStatus("Error");
    elements.combinedChart.innerHTML = `<div class="chart-empty">Weather data could not be loaded. Check the location and connection.</div>`;
    elements.detailCopy.textContent = "Today’s outlook is unavailable right now.";
  }
}

function initMap() {
  state.map = L.map("map", { zoomControl: true }).setView([state.selected.latitude, state.selected.longitude], 9);
  window.__leaflet_map_instance = state.map;

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

  state.radiusCircle = L.circle([state.selected.latitude, state.selected.longitude], {
    radius: state.inatRadiusKm * 1000,
    color: "#1f5f2d",
    weight: 2,
    opacity: 0.95,
    fillColor: "#61b85a",
    fillOpacity: 0.18,
    interactive: false,
  }).addTo(state.map);
  window.__leaflet_radius_circle = state.radiusCircle;

  fitMapToRadius();

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

  window.addEventListener("resize", () => {
    if (!state.map) return;
    fitMapToRadius();
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
elements.inatRadiusSelect?.addEventListener("change", (event) => {
  const nextRadius = Number.parseInt(event.target.value, 10);
  setInaturalistRadiusKm(nextRadius);
});
elements.observationLayerToggleButton?.addEventListener("click", () => {
  setObservationLayerEnabled(!state.showObservationLayer);
});
elements.locationSuggestions.addEventListener("click", (event) => {
  const option = event.target.closest("[data-suggestion-index]");
  if (!option) return;
  chooseSuggestion(Number.parseInt(option.dataset.suggestionIndex, 10));
});
elements.sampleButton.addEventListener("click", () => analyzeLocation({ label: "Black Forest, Germany", latitude: 48.0000, longitude: 8.0000 }));
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
elements.mobileForecastList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-mobile-forecast-day]");
  if (!button) return;
  setFocusDate(button.dataset.mobileForecastDay);
  const detailPanel = elements.mobileDetailsSection?.querySelector("#detailPanel");
  if (window.matchMedia("(max-width: 620px)").matches && detailPanel) {
    detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});
elements.feedbackOptions?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-feedback-value]");
  if (!button) return;
  const value = button.dataset.feedbackValue ?? "";
  state.feedbackDraftResponse = FEEDBACK_OPTIONS.includes(value) ? value : null;
  renderFeedbackUI();
});
elements.openFeedbackModalButton?.addEventListener("click", () => {
  openFeedbackModal();
});
elements.closeFeedbackModalButton?.addEventListener("click", () => {
  closeFeedbackModal();
});
elements.submitFeedbackButton?.addEventListener("click", () => {
  if (!state.feedbackDraftResponse) {
    if (elements.feedbackStatus) elements.feedbackStatus.textContent = "Select a trip result before submitting feedback.";
    return;
  }
  const saved = logFeedback(state.feedbackDraftResponse);
  if (saved) closeFeedbackModal();
});
elements.feedbackModal?.addEventListener("click", (event) => {
  if (event.target === elements.feedbackModal) closeFeedbackModal();
});
elements.exportFeedbackButton?.addEventListener("click", () => {
  copyFeedbackLogToClipboard();
});
elements.copyFeedbackErrorButton?.addEventListener("click", () => {
  copyFeedbackSyncError();
});
elements.clearFeedbackButton?.addEventListener("click", () => {
  clearFeedbackLog();
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
  const tile = event.target.closest("[data-observation-id]");
  if (!tile) return;
  const observation = state.observationById.get(tile.dataset.observationId ?? "");
  if (!observation) return;
  if (event.target.closest("a")) return;
  event.preventDefault();
  openObservationModal(observation);
});
elements.regionalTiles.addEventListener("keydown", (event) => {
  const tile = event.target.closest("[data-observation-id]");
  if (!tile || (event.key !== "Enter" && event.key !== " ")) return;
  const observation = state.observationById.get(tile.dataset.observationId ?? "");
  if (!observation) return;
  event.preventDefault();
  openObservationModal(observation);
});
elements.closeImageModalButton.addEventListener("click", closeObservationModal);
elements.imageModal.addEventListener("click", (event) => {
  if (event.target === elements.imageModal) closeObservationModal();
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
  const opportunityDay = event.target.closest("[data-opportunity-date]");
  if (opportunityDay?.dataset.opportunityDate) {
    setFocusDate(opportunityDay.dataset.opportunityDate);
    return;
  }
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
  if (event.key === "Escape" && elements.imageModal && !elements.imageModal.hidden) closeObservationModal();
  if (event.key === "Escape" && elements.feedbackModal && !elements.feedbackModal.hidden) closeFeedbackModal();
});

if (elements.inatRadiusSelect) {
  elements.inatRadiusSelect.value = String(state.inatRadiusKm);
}
updateObservationLayerUI();
updateRadiusLegend();
updateRegionalScopeCopy();

state.feedbackLog = loadFeedbackLog();
flushPendingFeedbackQueue().then(() => renderFeedbackUI());
window.setInterval(() => {
  flushPendingFeedbackQueue().then(() => renderFeedbackUI());
}, 30000);
initMap();
setMobileTab("overview");
analyzeLocation(state.selected);
