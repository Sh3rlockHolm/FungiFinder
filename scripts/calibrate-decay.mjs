import { readFile } from "node:fs/promises";
import { applyBiologicalPersistence, buildModelFeatures, inferFruitingSignal, MODEL_METADATA } from "../src/model.js";

const CACHE_PATH = process.env.BACKTEST_FETCH_CACHE_PATH ?? "./archive/backtest-fetch-cache.json";

function mean(values) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function percentile(values, p) {
  const valid = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length) return 0;
  const idx = Math.min(valid.length - 1, Math.max(0, Math.floor(p * (valid.length - 1))));
  return valid[idx];
}

function vpdFromTempRh(tempC, rh) {
  if (!Number.isFinite(tempC) || !Number.isFinite(rh) || rh <= 0) return null;
  const svp = 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  return svp * (1 - rh / 100);
}

function normalizeWeatherPayload(payload) {
  const hourlyByDate = new Map();
  const hourlyTime = payload.hourly?.time ?? [];
  const hourlyTemp = payload.hourly?.temperature_2m ?? [];
  const hourlyRh = payload.hourly?.relative_humidity_2m ?? [];
  for (let index = 0; index < hourlyTime.length; index += 1) {
    const stamp = hourlyTime[index];
    if (!stamp) continue;
    const date = stamp.slice(0, 10);
    if (!hourlyByDate.has(date)) hourlyByDate.set(date, { vpdValues: [], rhValues: [] });
    const bucket = hourlyByDate.get(date);
    const vpd = vpdFromTempRh(hourlyTemp[index], hourlyRh[index]);
    if (Number.isFinite(vpd)) bucket.vpdValues.push(vpd);
    if (Number.isFinite(hourlyRh[index])) bucket.rhValues.push(hourlyRh[index]);
  }
  const dates = payload.daily?.time ?? [];
  return dates.map((date, index) => ({
    date,
    meanTemp: payload.daily.temperature_2m_mean[index],
    minTemp: payload.daily.temperature_2m_min[index],
    maxTemp: payload.daily.temperature_2m_max[index],
    precipitation: payload.daily.precipitation_sum[index],
    rhMean: mean(hourlyByDate.get(date)?.rhValues ?? []),
    vpdMean: mean(hourlyByDate.get(date)?.vpdValues ?? []),
  }));
}

function scoreSeries(days, latitude) {
  const scored = [];
  for (let index = 6; index < days.length; index += 1) {
    const day = days[index];
    const recent3 = days.slice(index - 2, index + 1);
    const previous3 = days.slice(index - 5, index - 2);
    const rainHistory21d = Array.from({ length: 21 }, (_, lag) => Math.max(0, days[index - lag]?.precipitation ?? 0));
    const tempHistory7d = Array.from({ length: 7 }, (_, lag) => days[index - lag]?.meanTemp ?? null).filter(Number.isFinite);
    const vpdHistory7d = Array.from({ length: 7 }, (_, lag) => days[index - lag]?.vpdMean ?? null).filter(Number.isFinite);
    const rhHistory7d = Array.from({ length: 7 }, (_, lag) => days[index - lag]?.rhMean ?? null).filter(Number.isFinite);
    const rain1dAgo = days[index - 1]?.precipitation ?? 0;
    const rain2dAgo = days[index - 2]?.precipitation ?? 0;
    const rain3dAgo = days[index - 3]?.precipitation ?? 0;
    const featureBundle = buildModelFeatures({
      day,
      previousWindow: {
        previous3AvgTemp: mean(previous3.map((entry) => entry.meanTemp)),
        recent3AvgTemp: mean(recent3.map((entry) => entry.meanTemp)),
        recent3DiurnalRange: mean(recent3.map((entry) => entry.maxTemp - entry.minTemp)),
        recent3NightMin: Math.min(...recent3.map((entry) => entry.minTemp)),
        recent3Rain: recent3.reduce((sum, entry) => sum + (entry.precipitation ?? 0), 0),
        rain1dAgo,
        rain2dAgo,
        rain3dAgo,
        rainHistory21d,
        tempHistory7d,
        vpdHistory7d,
        rhHistory7d,
        recent3Vpd: mean(recent3.map((entry) => entry.vpdMean)),
      },
      regionalStats: null,
      seasonScore: 55,
      latitude,
    });
    const inference = inferFruitingSignal({
      featureVector: featureBundle,
      daysAhead: 1,
      regionalStats: { totalObservations: 40 },
    });
    const item = {
      date: day.date,
      probability: inference.probability,
      score: Math.round(inference.probability * 100),
      rain: day.precipitation ?? 0,
      crashFactor: featureBundle.diagnostics?.drydownCrashFactor ?? null,
      vpd3: featureBundle.diagnostics?.vpd3 ?? null,
      dryDaysSinceMeaningfulRain: featureBundle.diagnostics?.dryDaysSinceMeaningfulRain ?? null,
    };
    if (scored.length > 0) {
      const previous = scored[scored.length - 1];
      const persisted = applyBiologicalPersistence({
        previousProbability: previous.probability,
        currentProbability: item.probability,
        drydownCrashFactor: item.crashFactor,
        vpd3: item.vpd3,
        dryDaysSinceMeaningfulRain: item.dryDaysSinceMeaningfulRain,
      });
      item.probability = persisted;
      item.score = Math.round(persisted * 100);
    }
    scored.push(item);
  }
  return scored;
}

function deriveDecayStats(seriesByLocation) {
  const dayDrops = [];
  const postPeakDrops = [];
  const postStormDryDrops = [];
  for (const series of seriesByLocation) {
    for (let i = 1; i < series.length; i += 1) {
      const prev = series[i - 1];
      const curr = series[i];
      const drop = prev.score - curr.score;
      if (drop > 0) dayDrops.push(drop);
      const isLocalPeak = i >= 2 && prev.score > series[i - 2].score && prev.score > curr.score;
      if (isLocalPeak && drop > 0) postPeakDrops.push(drop);
      if ((prev.rain ?? 0) >= 12 && (curr.rain ?? 0) <= 1 && drop > 0) postStormDryDrops.push(drop);
    }
  }
  return {
    oneDayDropMean: mean(dayDrops),
    oneDayDropP50: percentile(dayDrops, 0.5),
    oneDayDropP90: percentile(dayDrops, 0.9),
    postPeakDropP50: percentile(postPeakDrops, 0.5),
    postPeakDropP90: percentile(postPeakDrops, 0.9),
    postStormDryDropP50: percentile(postStormDryDrops, 0.5),
    postStormDryDropP90: percentile(postStormDryDrops, 0.9),
    samples: {
      dayDrops: dayDrops.length,
      postPeakDrops: postPeakDrops.length,
      postStormDryDrops: postStormDryDrops.length,
    },
  };
}

async function main() {
  const raw = await readFile(CACHE_PATH, "utf8");
  const parsed = JSON.parse(raw);
  const byUrl = parsed?.byUrl ?? {};
  const weatherEntries = Object.entries(byUrl).filter(([url, payload]) => {
    if (!url.includes("archive-api.open-meteo.com/v1/archive?")) return false;
    return Array.isArray(payload?.daily?.time) && Array.isArray(payload?.hourly?.time);
  });
  const seriesByLocation = [];
  for (const [, payload] of weatherEntries) {
    const latitude = Number(payload.latitude ?? payload?.metadata?.latitude ?? 45);
    const days = normalizeWeatherPayload(payload);
    if (days.length < 12) continue;
    const series = scoreSeries(days, latitude);
    if (series.length >= 5) seriesByLocation.push(series);
  }
  const stats = deriveDecayStats(seriesByLocation);
  console.log(`Model: ${MODEL_METADATA.modelVersion}`);
  console.log(`Weather series used: ${seriesByLocation.length}`);
  console.table(stats);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
