/**
 * FungiFinder feedback logger (production-grade lightweight v1 schema).
 *
 * Deploy as Web App:
 * - Execute as: Me
 * - Who has access: Anyone
 *
 * Security:
 * - REQUIRE_API_KEY=true
 * - Clients must send x-api-key header value matching API_KEY_VALUE
 */

const SHEET_NAME = "feedback_log";
const SPREADSHEET_ID = ""; // Optional: set if this script is standalone (not bound to a Sheet)
const REQUIRE_API_KEY = true;
const API_KEY_HEADER = "x-api-key";
const API_KEY_QUERY_PARAM = "api_key";
const API_KEY_VALUE = "CHANGE_ME_STRONG_SECRET";

const ALLOWED_RESPONSES = ["Not at all", "One or Two", "Several", "A ton!"];
const ALLOWED_BUCKETS = ["short", "medium", "long"];
const ALLOWED_RAIN_CLASSES = ["light", "medium", "heavy", "extreme"];
const SCHEMA_VERSION = 1;

const HEADER = [
  "received_at_utc",
  "schema_version",
  "event_id",
  "response",
  "expected_score_min",
  "expected_score_max",
  "expected_score_midpoint",
  "score_delta_from_feedback_curve",
  "trip_duration_label",
  "trip_duration_bucket",
  "observed_date_local",
  "logged_at_utc",
  "location_label",
  "latitude",
  "longitude",
  "score",
  "probability",
  "verdict",
  "rain_3d_mm",
  "temp_avg_3d_c",
  "humidity_avg_3d_pct",
  "vpd_avg_3d_kpa",
  "rain_5d_weighted_mm",
  "temp_5d_weighted_c",
  "humidity_5d_weighted_pct",
  "days_since_meaningful_rain",
  "rain_class_fixed",
  "app_model_version",
  "app_target_definition",
];

function doPost(e) {
  try {
    if (REQUIRE_API_KEY) {
      const incoming = getHeaderCaseInsensitive_(e, API_KEY_HEADER) || getParamCaseInsensitive_(e, API_KEY_QUERY_PARAM);
      if (!incoming || incoming !== API_KEY_VALUE) {
        return jsonResponse_(401, { ok: false, code: 401, error: "Unauthorized" });
      }
    }

    const payload = parsePayload_(e);
    const validation = validatePayload_(payload);
    if (!validation.ok) return jsonResponse_(400, { ok: false, code: 400, error: validation.error });

    const sheet = getOrCreateSheet_(SHEET_NAME);
    ensureHeader_(sheet);

    if (eventIdExists_(sheet, payload.event_id)) {
      return jsonResponse_(200, { ok: true, code: 200, duplicate: true, event_id: payload.event_id });
    }

    const row = buildRow_(payload);
    sheet.appendRow(row);
    return jsonResponse_(200, { ok: true, code: 200, duplicate: false, event_id: payload.event_id });
  } catch (error) {
    return jsonResponse_(500, { ok: false, code: 500, error: String(error) });
  }
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  return JSON.parse(e.postData.contents);
}

function validatePayload_(p) {
  if (!p || typeof p !== "object") return { ok: false, error: "Invalid JSON payload" };
  if (Number(p.schema_version) !== SCHEMA_VERSION) return { ok: false, error: "Unsupported schema_version" };
  if (!isNonEmptyString_(p.event_id)) return { ok: false, error: "Missing event_id" };
  if (!ALLOWED_RESPONSES.includes(p.response)) return { ok: false, error: "Invalid response" };
  if (!ALLOWED_BUCKETS.includes(p.trip_duration_bucket)) return { ok: false, error: "Invalid trip_duration_bucket" };

  const requiredNumbers = [
    "expected_score_min",
    "expected_score_max",
    "expected_score_midpoint",
    "score_delta_from_feedback_curve",
    "latitude",
    "longitude",
    "score",
    "probability",
    "rain_3d_mm",
    "temp_avg_3d_c",
    "humidity_avg_3d_pct",
    "rain_5d_weighted_mm",
    "temp_5d_weighted_c",
    "humidity_5d_weighted_pct",
  ];
  for (var i = 0; i < requiredNumbers.length; i += 1) {
    if (!isFiniteNumber_(p[requiredNumbers[i]])) return { ok: false, error: "Invalid number field: " + requiredNumbers[i] };
  }

  if (!isFiniteNumberOrNull_(p.vpd_avg_3d_kpa)) return { ok: false, error: "Invalid vpd_avg_3d_kpa" };
  if (!isFiniteNumberOrNull_(p.days_since_meaningful_rain)) return { ok: false, error: "Invalid days_since_meaningful_rain" };
  if (!isNonEmptyString_(p.observed_date_local)) return { ok: false, error: "Missing observed_date_local" };
  if (!isNonEmptyString_(p.logged_at_utc)) return { ok: false, error: "Missing logged_at_utc" };
  if (!ALLOWED_RAIN_CLASSES.includes(p.rain_class_fixed)) return { ok: false, error: "Invalid rain_class_fixed" };
  if (!isNonEmptyString_(p.app_model_version)) return { ok: false, error: "Missing app_model_version" };
  if (!isNonEmptyString_(p.app_target_definition)) return { ok: false, error: "Missing app_target_definition" };

  if (p.score < 0 || p.score > 100) return { ok: false, error: "score out of range" };
  if (p.expected_score_min < 0 || p.expected_score_min > 100) return { ok: false, error: "expected_score_min out of range" };
  if (p.expected_score_max < 0 || p.expected_score_max > 100) return { ok: false, error: "expected_score_max out of range" };
  if (p.expected_score_midpoint < 0 || p.expected_score_midpoint > 100) return { ok: false, error: "expected_score_midpoint out of range" };
  if (p.expected_score_min > p.expected_score_max) return { ok: false, error: "expected score bounds invalid" };
  if (p.probability < 0 || p.probability > 1) return { ok: false, error: "probability out of range" };
  if (p.latitude < -90 || p.latitude > 90) return { ok: false, error: "latitude out of range" };
  if (p.longitude < -180 || p.longitude > 180) return { ok: false, error: "longitude out of range" };
  if (p.humidity_avg_3d_pct < 0 || p.humidity_avg_3d_pct > 100) return { ok: false, error: "humidity_avg_3d_pct out of range" };
  if (p.humidity_5d_weighted_pct < 0 || p.humidity_5d_weighted_pct > 100) return { ok: false, error: "humidity_5d_weighted_pct out of range" };

  return { ok: true };
}

function getHeaderCaseInsensitive_(e, name) {
  if (!e || !e.parameter) return null;
  const headers = e.parameter;
  const target = String(name || "").toLowerCase();
  const keys = Object.keys(headers);
  for (var i = 0; i < keys.length; i += 1) {
    if (keys[i].toLowerCase() === target) return headers[keys[i]];
  }
  return null;
}

function getParamCaseInsensitive_(e, name) {
  if (!e || !e.parameter) return null;
  const params = e.parameter;
  const target = String(name || "").toLowerCase();
  const keys = Object.keys(params);
  for (var i = 0; i < keys.length; i += 1) {
    if (keys[i].toLowerCase() === target) return params[keys[i]];
  }
  return null;
}

function getOrCreateSheet_(name) {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  return sheet;
}

function getSpreadsheet_() {
  if (SPREADSHEET_ID && String(SPREADSHEET_ID).trim()) {
    return SpreadsheetApp.openById(String(SPREADSHEET_ID).trim());
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error("No active spreadsheet found. Set SPREADSHEET_ID for standalone deployments.");
}

function ensureHeader_(sheet) {
  const existing = sheet.getRange(1, 1, 1, HEADER.length).getValues()[0];
  let needsHeader = false;
  for (var i = 0; i < HEADER.length; i += 1) {
    if (existing[i] !== HEADER[i]) {
      needsHeader = true;
      break;
    }
  }
  if (needsHeader) {
    sheet.getRange(1, 1, 1, HEADER.length).setValues([HEADER]);
    sheet.getRange(1, 1, 1, HEADER.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}

function eventIdExists_(sheet, eventId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const eventIdColumn = 3;
  const values = sheet.getRange(2, eventIdColumn, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i += 1) {
    if (String(values[i][0]) === String(eventId)) return true;
  }
  return false;
}

function buildRow_(p) {
  return [
    new Date().toISOString(),
    value_(p.schema_version),
    value_(p.event_id),
    value_(p.response),
    value_(p.expected_score_min),
    value_(p.expected_score_max),
    value_(p.expected_score_midpoint),
    value_(p.score_delta_from_feedback_curve),
    value_(p.trip_duration_label),
    value_(p.trip_duration_bucket),
    value_(p.observed_date_local),
    value_(p.logged_at_utc),
    value_(p.location_label),
    value_(p.latitude),
    value_(p.longitude),
    value_(p.score),
    value_(p.probability),
    value_(p.verdict),
    value_(p.rain_3d_mm),
    value_(p.temp_avg_3d_c),
    value_(p.humidity_avg_3d_pct),
    value_(p.vpd_avg_3d_kpa),
    value_(p.rain_5d_weighted_mm),
    value_(p.temp_5d_weighted_c),
    value_(p.humidity_5d_weighted_pct),
    value_(p.days_since_meaningful_rain),
    value_(p.rain_class_fixed),
    value_(p.app_model_version),
    value_(p.app_target_definition),
  ];
}

function isFiniteNumber_(x) {
  return typeof x === "number" && isFinite(x);
}

function isFiniteNumberOrNull_(x) {
  return x === null || x === "" || isFiniteNumber_(x);
}

function isNonEmptyString_(x) {
  return typeof x === "string" && x.trim().length > 0;
}

function value_(x) {
  return x === undefined || x === null ? "" : x;
}

function jsonResponse_(status, bodyObj) {
  return ContentService.createTextOutput(JSON.stringify(bodyObj)).setMimeType(ContentService.MimeType.JSON);
}
