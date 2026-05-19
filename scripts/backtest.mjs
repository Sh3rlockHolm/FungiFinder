import { buildModelFeatures, inferFruitingSignal, MODEL_METADATA } from "../src/model.js";

const LOCATIONS = [
  { label: "Darien, CT", latitude: 41.0772, longitude: -73.4687 },
  { label: "Portland, OR", latitude: 45.5152, longitude: -122.6784 },
  { label: "Munich, DE", latitude: 48.1351, longitude: 11.582 },
];

const WINDOW_DAYS = 60;
const STEP_DAYS = 10;

function iso(date) {
  return date.toISOString().slice(0, 10);
}

function shift(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}

function sum(values) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function mean(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? sum(valid) / valid.length : 0;
}

function aucRoc(rows) {
  const sorted = [...rows].sort((a, b) => b.probability - a.probability);
  const positives = sorted.filter((row) => row.label === 1).length;
  const negatives = Math.max(1, sorted.length - positives);
  if (positives === 0) return 0.5;
  let tp = 0;
  let fp = 0;
  let prevFpr = 0;
  let prevTpr = 0;
  let auc = 0;
  sorted.forEach((row) => {
    if (row.label === 1) tp += 1;
    else fp += 1;
    const tpr = tp / positives;
    const fpr = fp / negatives;
    auc += (fpr - prevFpr) * ((tpr + prevTpr) / 2);
    prevFpr = fpr;
    prevTpr = tpr;
  });
  return auc;
}

function aucPr(rows) {
  const sorted = [...rows].sort((a, b) => b.probability - a.probability);
  const positives = sorted.filter((row) => row.label === 1).length;
  if (positives === 0) return 0;
  let tp = 0;
  let fp = 0;
  let prevRecall = 0;
  let auc = 0;
  sorted.forEach((row) => {
    if (row.label === 1) tp += 1;
    else fp += 1;
    const precision = tp / Math.max(1, tp + fp);
    const recall = tp / positives;
    auc += (recall - prevRecall) * precision;
    prevRecall = recall;
  });
  return auc;
}

function brier(rows) {
  return mean(rows.map((row) => (row.probability - row.label) ** 2));
}

function ece(rows, bins = 10) {
  const buckets = Array.from({ length: bins }, () => []);
  rows.forEach((row) => {
    const idx = Math.min(bins - 1, Math.floor(row.probability * bins));
    buckets[idx].push(row);
  });
  let error = 0;
  buckets.forEach((bucket) => {
    if (!bucket.length) return;
    const conf = mean(bucket.map((row) => row.probability));
    const acc = mean(bucket.map((row) => row.label));
    error += (bucket.length / rows.length) * Math.abs(conf - acc);
  });
  return error;
}

async function fetchWeatherWindow(latitude, longitude, startDate, endDate) {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    start_date: startDate,
    end_date: endDate,
    timezone: "UTC",
    daily: "temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum",
  });
  const response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`);
  if (!response.ok) throw new Error(`Weather archive failed ${response.status}`);
  return response.json();
}

async function fetchINatCount(latitude, longitude, d1, d2, extraParams = {}) {
  const params = new URLSearchParams({
    iconic_taxa: "Fungi",
    lat: latitude.toFixed(5),
    lng: longitude.toFixed(5),
    radius: "50",
    per_page: "1",
    verifiable: "true",
    d1,
    d2,
    ...extraParams,
  });
  const response = await fetch(`https://api.inaturalist.org/v1/observations?${params}`);
  if (!response.ok) throw new Error(`iNaturalist failed ${response.status}`);
  const payload = await response.json();
  return payload.total_results ?? 0;
}

async function buildRowsForLocation(location) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 4);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - WINDOW_DAYS);
  const weatherPayload = await fetchWeatherWindow(location.latitude, location.longitude, iso(start), iso(end));
  const days = weatherPayload.daily.time.map((date, index) => ({
    date,
    meanTemp: weatherPayload.daily.temperature_2m_mean[index],
    minTemp: weatherPayload.daily.temperature_2m_min[index],
    maxTemp: weatherPayload.daily.temperature_2m_max[index],
    precipitation: weatherPayload.daily.precipitation_sum[index],
  }));

  const rows = [];
  for (let index = 6; index < days.length - 4; index += 1) {
    const day = days[index];
    const recent3 = days.slice(index - 2, index + 1);
    const previous3 = days.slice(index - 5, index - 2);
    const d1Future = shift(day.date, 1);
    const d2Future = shift(day.date, 3);
    const d1Past30 = shift(day.date, -30);
    const d2Past1 = shift(day.date, -1);
    const d1Recent7 = shift(day.date, -6);
    const d1Recent14 = shift(day.date, -13);

    const [future3dCount, baseline30Count, recent7Observations, recent14Observations, researchRecent14Observations, seasonalObservations] =
      await Promise.all([
        fetchINatCount(location.latitude, location.longitude, d1Future, d2Future),
        fetchINatCount(location.latitude, location.longitude, d1Past30, d2Past1),
        fetchINatCount(location.latitude, location.longitude, d1Recent7, day.date),
        fetchINatCount(location.latitude, location.longitude, d1Recent14, day.date),
        fetchINatCount(location.latitude, location.longitude, d1Recent14, day.date, { quality_grade: "research" }),
        fetchINatCount(location.latitude, location.longitude, shift(day.date, -30), day.date),
      ]);

    const baselinePer3d = Math.max(0.5, (baseline30Count / 30) * 3);
    const label = future3dCount > baselinePer3d * 1.2 ? 1 : 0;
    const featureBundle = buildModelFeatures({
      day,
      previousWindow: {
        previous3AvgTemp: mean(previous3.map((entry) => entry.meanTemp)),
        recent3AvgTemp: mean(recent3.map((entry) => entry.meanTemp)),
        recent3DiurnalRange: mean(recent3.map((entry) => entry.maxTemp - entry.minTemp)),
        recent3NightMin: Math.min(...recent3.map((entry) => entry.minTemp)),
        recent3Rain: sum(recent3.map((entry) => entry.precipitation)),
      },
      regionalStats: {
        recent7Observations,
        recent14Observations,
        researchRecent14Observations,
        seasonalObservations,
        totalObservations: Math.max(recent14Observations, baseline30Count),
      },
      habitatScore: 88,
      seasonScore: 55,
      latitude: location.latitude,
    });

    const inference = inferFruitingSignal({
      featureVector: featureBundle,
      daysAhead: 1,
      regionalStats: { totalObservations: Math.max(recent14Observations, baseline30Count) },
    });

    rows.push({
      date: day.date,
      label,
      location: location.label,
      probability: inference.probability,
    });
  }
  return rows;
}

function rollingTimeSplits(rows) {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const splits = [];
  for (let start = 0; start + STEP_DAYS * 2 < sorted.length; start += STEP_DAYS) {
    const trainEnd = start + STEP_DAYS;
    const testEnd = Math.min(sorted.length, trainEnd + STEP_DAYS);
    splits.push({
      train: sorted.slice(0, trainEnd),
      test: sorted.slice(trainEnd, testEnd),
    });
  }
  return splits.filter((split) => split.test.length >= 5);
}

async function main() {
  console.log(`Model: ${MODEL_METADATA.modelVersion} (${MODEL_METADATA.modelType}, ${MODEL_METADATA.calibrationMethod})`);
  const allRows = [];
  for (const location of LOCATIONS) {
    console.log(`Collecting ${location.label}...`);
    const rows = await buildRowsForLocation(location);
    allRows.push(...rows);
  }
  const splits = rollingTimeSplits(allRows);
  const metrics = splits.map((split) => ({
    aucRoc: aucRoc(split.test),
    aucPr: aucPr(split.test),
    brier: brier(split.test),
    ece: ece(split.test, 10),
  }));

  const summary = {
    rows: allRows.length,
    splits: splits.length,
    aucRoc: mean(metrics.map((m) => m.aucRoc)),
    aucPr: mean(metrics.map((m) => m.aucPr)),
    brier: mean(metrics.map((m) => m.brier)),
    ece: mean(metrics.map((m) => m.ece)),
  };
  console.log("Backtest summary:");
  console.table(summary);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
