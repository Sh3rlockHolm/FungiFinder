import { buildModelFeatures, inferFruitingSignal, MODEL_METADATA } from "../src/model.js";

const LOCATIONS = [
  { label: "Darien, CT", latitude: 41.0772, longitude: -73.4687 },
  { label: "Portland, OR", latitude: 45.5152, longitude: -122.6784 },
  { label: "Munich, DE", latitude: 48.1351, longitude: 11.582 },
];

const BACKTEST_MODE = process.env.BACKTEST_MODE === "quick" ? "quick" : "full";
const BACKTEST_CONFIG = BACKTEST_MODE === "quick"
  ? {
      locations: LOCATIONS.slice(0, 1),
      windowDays: 28,
      stepDays: 4,
      maxRowsPerLocation: 12,
      inatDayStride: 2,
      inatPauseMs: 350,
      inatRetryCount: 4,
    }
  : {
      locations: LOCATIONS,
      windowDays: 60,
      stepDays: 10,
      maxRowsPerLocation: Infinity,
      inatDayStride: 1,
      inatPauseMs: 0,
      inatRetryCount: 4,
    };

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

function median(values) {
  const valid = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length) return 0;
  const middle = Math.floor(valid.length / 2);
  if (valid.length % 2 === 1) return valid[middle];
  return (valid[middle - 1] + valid[middle]) / 2;
}

async function fetchWeatherWindow(latitude, longitude, startDate, endDate) {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    start_date: startDate,
    end_date: endDate,
    timezone: "UTC",
    daily: "temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum",
    hourly: "temperature_2m,relative_humidity_2m,soil_moisture_0_to_7cm",
  });
  const response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`);
  if (!response.ok) throw new Error(`Weather archive failed ${response.status}`);
  return response.json();
}

function vpdFromTempRh(tempC, rh) {
  if (!Number.isFinite(tempC) || !Number.isFinite(rh) || rh <= 0) return null;
  const svp = 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  return svp * (1 - rh / 100);
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
  for (let attempt = 0; attempt < BACKTEST_CONFIG.inatRetryCount; attempt += 1) {
    const response = await fetch(`https://api.inaturalist.org/v1/observations?${params}`);
    if (response.ok) {
      const payload = await response.json();
      if (BACKTEST_CONFIG.inatPauseMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, BACKTEST_CONFIG.inatPauseMs));
      }
      return payload.total_results ?? 0;
    }
    if (response.status !== 429 || attempt === BACKTEST_CONFIG.inatRetryCount - 1) {
      throw new Error(`iNaturalist failed ${response.status}`);
    }
    const backoffMs = 500 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }
  return 0;
}

async function buildRowsForLocation(location) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 4);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - BACKTEST_CONFIG.windowDays);
  const weatherPayload = await fetchWeatherWindow(location.latitude, location.longitude, iso(start), iso(end));
  const hourlyByDate = new Map();
  const hourlyTime = weatherPayload.hourly?.time ?? [];
  const hourlyTemp = weatherPayload.hourly?.temperature_2m ?? [];
  const hourlyRh = weatherPayload.hourly?.relative_humidity_2m ?? [];
  const hourlyTopSoil = weatherPayload.hourly?.soil_moisture_0_to_7cm ?? [];

  for (let index = 0; index < hourlyTime.length; index += 1) {
    const stamp = hourlyTime[index];
    if (!stamp) continue;
    const date = stamp.slice(0, 10);
    if (!hourlyByDate.has(date)) hourlyByDate.set(date, { vpdValues: [], topSoilValues: [] });
    const bucket = hourlyByDate.get(date);
    const vpd = vpdFromTempRh(hourlyTemp[index], hourlyRh[index]);
    if (Number.isFinite(vpd)) bucket.vpdValues.push(vpd);
    if (Number.isFinite(hourlyTopSoil[index])) bucket.topSoilValues.push(hourlyTopSoil[index]);
  }

  const days = weatherPayload.daily.time.map((date, index) => ({
    date,
    meanTemp: weatherPayload.daily.temperature_2m_mean[index],
    minTemp: weatherPayload.daily.temperature_2m_min[index],
    maxTemp: weatherPayload.daily.temperature_2m_max[index],
    precipitation: weatherPayload.daily.precipitation_sum[index],
    soilMoistureTop: mean(hourlyByDate.get(date)?.topSoilValues ?? []),
    vpdMean: mean(hourlyByDate.get(date)?.vpdValues ?? []),
  }));

  const rows = [];
  for (let index = 6; index < days.length - 4; index += BACKTEST_CONFIG.inatDayStride) {
    if (rows.length >= BACKTEST_CONFIG.maxRowsPerLocation) break;
    const day = days[index];
    const recent3 = days.slice(index - 2, index + 1);
    const previous3 = days.slice(index - 5, index - 2);
    const rainHistory21d = Array.from({ length: 21 }, (_, lag) => Math.max(0, days[index - lag]?.precipitation ?? 0));
    const soilHistory7d = Array.from({ length: 7 }, (_, lag) => days[index - lag]?.soilMoistureTop ?? null).filter(Number.isFinite);
    const tempHistory7d = Array.from({ length: 7 }, (_, lag) => days[index - lag]?.meanTemp ?? null).filter(Number.isFinite);
    const rain1dAgo = days[index - 1]?.precipitation ?? 0;
    const rain2dAgo = days[index - 2]?.precipitation ?? 0;
    const rain3dAgo = days[index - 3]?.precipitation ?? 0;
    const d1Future = shift(day.date, 1);
    const d2Future = shift(day.date, 3);
    const d1Past30 = shift(day.date, -30);
    const d2Past1 = shift(day.date, -1);
    const d1Recent7 = shift(day.date, -6);
    const d1Recent14 = shift(day.date, -13);

    let future3dCount;
    let baseline30Count;
    let recent7Observations;
    let recent14Observations;
    let researchRecent14Observations;
    let seasonalObservations;
    if (BACKTEST_MODE === "quick") {
      [future3dCount, baseline30Count] = await Promise.all([
        fetchINatCount(location.latitude, location.longitude, d1Future, d2Future),
        fetchINatCount(location.latitude, location.longitude, d1Past30, d2Past1),
      ]);
      recent7Observations = Math.round((baseline30Count / 30) * 7);
      recent14Observations = Math.round((baseline30Count / 30) * 14);
      researchRecent14Observations = Math.round(recent14Observations * 0.55);
      seasonalObservations = baseline30Count;
    } else {
      [future3dCount, baseline30Count, recent7Observations, recent14Observations, researchRecent14Observations, seasonalObservations] =
        await Promise.all([
          fetchINatCount(location.latitude, location.longitude, d1Future, d2Future),
          fetchINatCount(location.latitude, location.longitude, d1Past30, d2Past1),
          fetchINatCount(location.latitude, location.longitude, d1Recent7, day.date),
          fetchINatCount(location.latitude, location.longitude, d1Recent14, day.date),
          fetchINatCount(location.latitude, location.longitude, d1Recent14, day.date, { quality_grade: "research" }),
          fetchINatCount(location.latitude, location.longitude, shift(day.date, -30), day.date),
        ]);
    }

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
        rain1dAgo,
        rain2dAgo,
        rain3dAgo,
        rainHistory21d,
        soilHistory7d,
        tempHistory7d,
        recent3TopSoilMoisture: mean(recent3.map((entry) => entry.soilMoistureTop)),
        recent3Vpd: mean(recent3.map((entry) => entry.vpdMean)),
      },
      regionalStats: {
        recent7Observations,
        recent14Observations,
        researchRecent14Observations,
        seasonalObservations,
        totalObservations: Math.max(recent14Observations, baseline30Count),
      },
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
      rainToday: day.precipitation,
      recent3Rain: sum(recent3.map((entry) => entry.precipitation)),
      moistureSupply: featureBundle.moistureSupply,
      moistureStorage: featureBundle.moistureStorage,
      dryingForce: featureBundle.dryingForce,
    });
  }
  return rows;
}

function rollingTimeSplits(rows) {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const splits = [];
  for (let start = 0; start + BACKTEST_CONFIG.stepDays * 2 < sorted.length; start += BACKTEST_CONFIG.stepDays) {
    const trainEnd = start + BACKTEST_CONFIG.stepDays;
    const testEnd = Math.min(sorted.length, trainEnd + BACKTEST_CONFIG.stepDays);
    splits.push({
      train: sorted.slice(0, trainEnd),
      test: sorted.slice(trainEnd, testEnd),
    });
  }
  const minTestRows = BACKTEST_MODE === "quick" ? 3 : 5;
  return splits.filter((split) => split.test.length >= minTestRows);
}

async function main() {
  console.log(`Model: ${MODEL_METADATA.modelVersion} (${MODEL_METADATA.modelType}, ${MODEL_METADATA.calibrationMethod})`);
  console.log(`Backtest mode: ${BACKTEST_MODE}`);
  const allRows = [];
  for (const location of BACKTEST_CONFIG.locations) {
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

  const sortedRows = [...allRows].sort((a, b) => `${a.location}-${a.date}`.localeCompare(`${b.location}-${b.date}`));
  const dayToDayDeltas = [];
  const postRainDecayDeltas = [];
  for (let index = 1; index < sortedRows.length; index += 1) {
    const previous = sortedRows[index - 1];
    const current = sortedRows[index];
    if (previous.location !== current.location) continue;
    const delta = Math.abs(current.probability - previous.probability);
    dayToDayDeltas.push(delta);
    const stormYesterday = (previous.rainToday ?? 0) >= 12;
    const dryToday = (current.rainToday ?? 0) <= 1;
    if (stormYesterday && dryToday) postRainDecayDeltas.push(previous.probability - current.probability);
  }

  const transitionDiagnostics = {
    medianDayToDayDelta: median(dayToDayDeltas),
    p90DayToDayDelta: dayToDayDeltas.length
      ? [...dayToDayDeltas].sort((a, b) => a - b)[Math.floor(dayToDayDeltas.length * 0.9)]
      : 0,
    medianPostStormOneDayDrop: median(postRainDecayDeltas),
  };

  console.log("Backtest summary:");
  console.table(summary);
  console.log("Transition diagnostics:");
  console.table(transitionDiagnostics);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
