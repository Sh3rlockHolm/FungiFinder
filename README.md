# FungiFinder

FungiFinder is an early mushroom-foraging conditions app. The current version is a
static browser prototype that lets a user choose a location by browser geolocation,
manual coordinates, or a map pin, then scores present-day conditions through the
next week using recent and forecast weather.

The app is intentionally narrow right now: it establishes a baseline conditions
rating for a selected location. Larger product directions, field workflows, saved
spots, routing, social layers, or species-specific behavior should be discussed at
the user-experience level before implementation.

## Current Data Sources

- Weather: Open-Meteo forecast API
- Regional observations: iNaturalist observations API
- Map: OpenStreetMap tiles through Leaflet
- Inputs: daily precipitation sum, daily mean temperature, daily maximum
  temperature, daily minimum temperature,
  nearby fungi observation counts
- Window: 7 past days plus today and 7 forecast days
- API keys: none required

Open-Meteo is a strong first source because it is easy to prototype with and can
serve both web and future mobile clients. Later versions should consider a
dedicated weather provider if higher-resolution rainfall history becomes critical.

## Fruiting Signal Model v4.0

Each target day now produces a calibrated probability for:

`P(detectable fruiting presence in local woods over a 2-3 day growth window)`

Displayed app score is `0-100 = calibrated probability (%)`.

### Inference Contract

The scoring pipeline emits:

```json
{
  "probability": 0.64,
  "confidence": "High confidence",
  "topFactors": [],
  "diagnostics": {}
}
```

Model metadata is versioned in `src/model.js` and `src/model-metadata.json`:

- model version
- train window
- calibration method
- feature schema hash

### Feature Priorities

Highest influence:

- moisture physics features:
  - antecedent moisture memory (API-style 1-21 day rainfall decay)
  - topsoil moisture storage (0-7 cm)
  - drying force (VPD + warmth)
  - thermal readiness (temperature window + short degree-day accumulation)
  - cold-shock risk (night minima / frost)

Lower influence:

- seasonality (weak prior only)
- historical depth

The model intentionally does **not** treat "mushroom season" as a hard blocker.

### Implementation Notes

- Interpretable regularized logistic model with Platt calibration.
- Moisture-memory and storm-resilience guardrails reduce unrealistic day-to-day score collapse.
- Regional pooling with location/climate covariates.
- Confidence badge reflects data sparsity and forecast horizon uncertainty.
- Dry-condition guardrail caps over-optimistic scores when moisture is insufficient.
- Nearby iNaturalist report counts are context/confidence only and are not primary score drivers.

## Legacy Heuristic (Retired)

Previous weighted-heuristic model (v0.4) used fixed rainfall/temperature blend:

- 26% previous 7-day rainfall
- 13% recent 72-hour rainfall
- 19% recent average temperature
- 10% recent nightly minimum temperature
- 8% recent day-night stability
- 8% seasonality
- 7% forest type
- 6% empirical regional activity from nearby fungi observations

Initial assumptions:

- Best weekly rainfall: 15-45 mm
- Best recent rainfall: 4-22 mm over roughly 72 hours
- Best average temperature: 8-18 C
- Frost below about -1 C is a strong negative signal
- Moderate day-night spread is usually better than extreme swings
- Autumn is strongest in the general case, with spring as a secondary season
- Forest type is a gentle modifier, not a dominant input
- Nearby observations are used only as a broad regional activity signal; the app
  does not surface likely species or "potential finds" yet

This is retained for historical context only.

## Empirical Regional Signal (v2)

For the selected region, the app queries nearby iNaturalist fungi observations
within a 50 km radius:

- recent 7-day observation count
- recent 14-day observation count
- recent 14-day research-grade count
- current-month regional activity baseline

This produces a conservative regional activity score and data-confidence label.
If observation data is sparse or unavailable, confidence drops and weather timing
features are weighted more heavily.

## Backtesting

Run rolling time-split backtests:

```powershell
npm run backtest
```

The script reports:

- AUC-ROC
- PR-AUC
- Brier score
- ECE (expected calibration error)

Current script location: `scripts/backtest.mjs`.

## Decay Calibration

To keep day-to-day score decline biologically realistic (no overnight cliffs), run:

```powershell
npm run calibrate:decay
```

Script location: `scripts/calibrate-decay.mjs`.

It reports:

- `oneDayDropP50`, `oneDayDropP90`
- `postPeakDropP50`, `postPeakDropP90`
- sample counts used for each metric

Recommended guardrails for this model family:

- `postPeakDropP90` should typically stay near single digits
- `oneDayDropP50` should remain modest (gradual taper, not collapse)
- tune model persistence/drydown constants only when these drift materially

## Product Discussion Needed

Before adding major workflows, decide what FungiFinder is actually trying to be:

- A simple local conditions rating?
- A trip-planning assistant?
- A species-aware research tool?
- A personal field journal?
- A community/reporting product?

Those are different products with different UX, trust boundaries, data needs, and
liability concerns. The current prototype should stay focused until that purpose is
chosen deliberately.

Execution guide: see `docs/market-gap-execution-playbook.md` for a concrete 30-day
pilot plan, KPI framework, and weekly shipping cadence.

## Quality-First Scope Reset (Current Focus)

For the current 6-8 week cycle, FungiFinder is intentionally narrow:

- primary value: near-term foraging conditions outlook with transparent factors
- iNaturalist role: nearby context only (not ID/social replacement)
- feedback role: calibration signal for downstream model tuning

In scope:

- score stability and confidence-label quality
- clearer timing-factor explanations
- reliable feedback logging and sync

Out of scope:

- route/trip planning
- habitat/tree-distribution tooling
- species ID or edibility advice
- major new workflows outside the current loop

## Suggested Architecture

The best long-term shape is a shared TypeScript domain core:

- `weather`: provider adapters and normalized daily weather records
- `predictor`: scoring model, species profiles, regional seasonality
- `ui-web`: browser/desktop interface
- `ui-mobile`: Expo/React Native interface for iOS and Android

The current prototype keeps the predictor logic isolated in `src/app.js` so it can
be lifted into a shared package when the app moves to React Native.

## Running Locally

Any static web server can host this folder. For example:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:4173
```

## Shared Feedback Log Setup

The app now supports a shared empirical feedback log for many users.
Each feedback answer is still saved locally, and also queued for remote sync.

### Fastest free setup (Google Sheets + Apps Script)

1. Open Google Sheets and create a new sheet.
2. Open `Extensions -> Apps Script`.
3. Paste `scripts/google-apps-script/feedback_logger.gs` into the script editor.
4. Save, then `Deploy -> New deployment -> Web app`:
   - Execute as: `Me`
   - Who has access: `Anyone`
5. Copy the deployed Web App URL.
6. In `scripts/google-apps-script/feedback_logger.gs`, set:
   - `API_KEY_VALUE = "<your-strong-shared-secret>"`
7. In `src/runtime-config.js`, set:
   - `window.FUNGI_FEEDBACK_ENDPOINT = "<your-web-app-url>"`
   - `window.FUNGI_FEEDBACK_API_KEY = "<same-shared-secret>"`
   - optional: `window.FUNGI_FEEDBACK_API_KEY_HEADER = "x-api-key"`
8. Redeploy your static site.

If endpoint is empty, feedback remains local-only.

### Remote endpoint contract

The app sends `POST` JSON body (one record per request). Expected JSON response:

- `{ ok: true, duplicate: false|true }`: success, entry removed from pending queue
- `{ ok: false, error: "..." }`: failure, entry remains queued and retries later

Note: Google Apps Script Web Apps may still return HTTP 200 on logical failures, so the client checks JSON `ok` and not HTTP status alone.

Payload includes:
- `schema_version`, `event_id`
- `response`
- `expected_score_min`, `expected_score_max`, `expected_score_midpoint`
- `score_delta_from_feedback_curve`
- `prediction_alignment_label`, `prediction_alignment_matched`
- `trip_duration_label`, `trip_duration_bucket`
- `observed_date_local`, `logged_at_utc`
- `location_label`, `latitude`, `longitude`
- `score`, `probability`, `verdict`
- `rain_3d_mm`, `temp_avg_3d_c`, `humidity_avg_3d_pct`, `vpd_avg_3d_kpa`
- `rain_5d_weighted_mm`, `temp_5d_weighted_c`, `humidity_5d_weighted_pct`
- `days_since_meaningful_rain`, `rain_class_fixed`
- `app_model_version`, `app_target_definition`

Recommended KPI for small pilot samples:
- prediction trust match rate (`prediction_alignment_matched=true`) over time
- weekly false-positive / false-negative notes from feedback exports

### Why this is lightweight

- Free tier
- No server to run
- Shared multi-user log across devices
- Spreadsheet is easy to inspect/export for later model retuning
