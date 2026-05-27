/**
 * FungiFinder feedback logger (free + lightweight).
 *
 * Deploy this Apps Script as a Web App:
 * - Execute as: Me
 * - Who has access: Anyone
 *
 * Then set window.FUNGI_FEEDBACK_ENDPOINT to the deployed URL in
 * src/runtime-config.js.
 */

const SHEET_NAME = "feedback_log";
const REQUIRE_API_KEY = false;
const API_KEY_HEADER = "x-api-key";
const API_KEY_VALUE = ""; // Optional if REQUIRE_API_KEY is true

function doPost(e) {
  try {
    if (REQUIRE_API_KEY) {
      const incoming = getHeaderCaseInsensitive_(e, API_KEY_HEADER);
      if (!incoming || incoming !== API_KEY_VALUE) {
        return jsonResponse_(401, { ok: false, error: "Unauthorized" });
      }
    }

    const payload = parsePayload_(e);
    if (!payload || typeof payload !== "object") {
      return jsonResponse_(400, { ok: false, error: "Invalid JSON payload" });
    }

    const sheet = getOrCreateSheet_(SHEET_NAME);
    ensureHeader_(sheet);

    const row = buildRow_(payload);
    sheet.appendRow(row);

    return jsonResponse_(200, { ok: true, id: payload.id || null });
  } catch (error) {
    return jsonResponse_(500, { ok: false, error: String(error) });
  }
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  return JSON.parse(e.postData.contents);
}

function getHeaderCaseInsensitive_(e, name) {
  const headers = (e && e.parameter) ? e.parameter : {};
  const target = String(name || "").toLowerCase();
  const keys = Object.keys(headers);
  for (let i = 0; i < keys.length; i += 1) {
    if (keys[i].toLowerCase() === target) return headers[keys[i]];
  }
  return null;
}

function getOrCreateSheet_(name) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  return sheet;
}

function ensureHeader_(sheet) {
  const header = [
    "received_at",
    "id",
    "response",
    "expected_score_min",
    "expected_score_max",
    "expected_score_midpoint",
    "score_delta_from_feedback_curve",
    "date",
    "score",
    "probability",
    "verdict",
    "location_label",
    "latitude",
    "longitude",
    "logged_at",
    "app_model_version",
    "app_target_definition",
    "user_agent",
  ];

  const existing = sheet.getRange(1, 1, 1, header.length).getValues()[0];
  let needsHeader = false;
  for (let i = 0; i < header.length; i += 1) {
    if (existing[i] !== header[i]) {
      needsHeader = true;
      break;
    }
  }
  if (needsHeader) {
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
    sheet.getRange(1, 1, 1, header.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}

function buildRow_(p) {
  return [
    new Date(),
    value_(p.id),
    value_(p.response),
    value_(p.expectedScoreMin),
    value_(p.expectedScoreMax),
    value_(p.expectedScoreMidpoint),
    value_(p.scoreDeltaFromFeedbackCurve),
    value_(p.date),
    value_(p.score),
    value_(p.probability),
    value_(p.verdict),
    value_(p.locationLabel),
    value_(p.latitude),
    value_(p.longitude),
    value_(p.loggedAt),
    value_(p.appModelVersion),
    value_(p.appTargetDefinition),
    value_(p.userAgent),
  ];
}

function value_(x) {
  return x === undefined || x === null ? "" : x;
}

function jsonResponse_(status, bodyObj) {
  const out = ContentService
    .createTextOutput(JSON.stringify(bodyObj))
    .setMimeType(ContentService.MimeType.JSON);
  return out;
}
