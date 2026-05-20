export const MODEL_METADATA = {
  modelVersion: "v4.0.0",
  modelType: "physics_shaped_logistic",
  calibrationMethod: "platt",
  trainedWindow: {
    from: "2024-01-01",
    to: "2026-05-20",
  },
  featureSchemaHash: "ff-v4_0-moisture-memory-thermal-readiness-20260520",
  targetDefinition: "P(detectable_fruiting_presence_local_window_2_3d)",
  radiusKm: 50,
};

const COEFFICIENTS = {
  intercept: -1.02,
  moistureSupply: 1.38,
  moistureStorage: 1.04,
  dryingForce: -1.12,
  thermalReadiness: 0.86,
  coldShock: -0.74,
  saturationStress: -0.22,
  seasonWeak: 0.16,
  climateProxy: 0.09,
};

const PLATT = { a: 1.11, b: -0.04 };

const FACTOR_LABELS = {
  moistureSupply: "Antecedent moisture supply",
  moistureStorage: "Moisture storage (topsoil)",
  dryingForce: "Drying force (VPD + warmth)",
  thermalReadiness: "Thermal readiness",
  coldShock: "Cold-shock / frost risk",
  saturationStress: "Saturation stress",
  seasonWeak: "Seasonal prior (weak)",
  climateProxy: "Regional climate proxy",
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function scale(value, low, high) {
  if (!Number.isFinite(value)) return 0;
  if (high === low) return 0;
  return clamp((value - low) / (high - low), 0, 1);
}

function centeredScale(value, low, bestLow, bestHigh, high) {
  if (!Number.isFinite(value)) return 0;
  if (value <= low || value >= high) return 0;
  if (value >= bestLow && value <= bestHigh) return 1;
  if (value < bestLow) return (value - low) / Math.max(bestLow - low, 1e-9);
  return (high - value) / Math.max(high - bestHigh, 1e-9);
}

function computeApiRain(rainHistory, halfLifeDays = 5) {
  const lambda = Math.log(2) / Math.max(1, halfLifeDays);
  return rainHistory.reduce((total, rain, dayIndex) => {
    if (!Number.isFinite(rain) || rain <= 0) return total;
    const weight = Math.exp(-lambda * dayIndex);
    return total + rain * weight;
  }, 0);
}

function average(array) {
  const valid = array.filter(Number.isFinite);
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function quantile(values, q) {
  const valid = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length) return 0;
  const position = clamp(q, 0, 1) * (valid.length - 1);
  const low = Math.floor(position);
  const high = Math.ceil(position);
  if (low === high) return valid[low];
  const weight = position - low;
  return valid[low] * (1 - weight) + valid[high] * weight;
}

function logistic01(value, midpoint, sharpness) {
  return 1 / (1 + Math.exp(-sharpness * (value - midpoint)));
}

function simulateMoistureStorage({ rainNewestFirst, tempNewestFirst, vpdNewestFirst, initialStorage = 0.28, rainAnchors }) {
  const steps = Math.min(rainNewestFirst.length, tempNewestFirst.length, vpdNewestFirst.length, 7);
  let storage = clamp(initialStorage, 0, 1);
  const p50 = Math.max(0.4, rainAnchors?.p50 ?? 0.8);
  const p85 = Math.max(p50 + 0.6, rainAnchors?.p85 ?? 8);
  const p98 = Math.max(p85 + 0.8, rainAnchors?.p98 ?? 22);
  const midpoint = p85;
  const span = Math.max(1, p98 - p50);
  const sharpness = 6 / span;

  for (let idx = steps - 1; idx >= 0; idx -= 1) {
    const rain = Number.isFinite(rainNewestFirst[idx]) ? Math.max(0, rainNewestFirst[idx]) : 0;
    const temp = Number.isFinite(tempNewestFirst[idx]) ? tempNewestFirst[idx] : 12;
    const vpd = Number.isFinite(vpdNewestFirst[idx]) ? vpdNewestFirst[idx] : 0.8;
    const drying =
      0.58 * scale(Math.max(0, vpd - 0.8), 0, 1.8) +
      0.42 * scale(Math.max(0, temp - 14), 0, 16);
    const retention = clamp(0.955 - 0.24 * drying, 0.66, 0.965);
    const dryLoss = clamp(0.012 + 0.058 * drying, 0.01, 0.09);
    const rechargeShape = logistic01(rain, midpoint, sharpness);
    const extremeBoost = scale(Math.max(0, rain - p98), 0, Math.max(6, p98)) * 0.06;
    const recharge = clamp(0.86 * rechargeShape + extremeBoost, 0, 0.94);
    const baseNext = storage * retention;
    let nextStorage = baseNext - dryLoss + recharge;
    // Guardrail: if effectively dry, storage cannot increase.
    if (rain <= 0.15) nextStorage = Math.min(nextStorage, baseNext - dryLoss);
    storage = clamp(nextStorage, 0, 1);
  }
  return storage;
}

export function buildModelFeatures({ day, previousWindow, seasonScore, latitude }) {
  const currentRain = Number.isFinite(day.precipitation) ? Math.max(0, day.precipitation) : 0;
  const rainHistory21d = Array.isArray(previousWindow.rainHistory21d)
    ? previousWindow.rainHistory21d.map((value) => (Number.isFinite(value) ? Math.max(0, value) : 0))
    : [];
  const rainHistoryForSupply = [...rainHistory21d];
  if (rainHistoryForSupply.length) {
    // Keep same-day rain influence moderate but non-zero so moisture response is immediate.
    rainHistoryForSupply[0] = rainHistoryForSupply[0] * 0.65;
  }

  const rainHistoryNoCurrent = rainHistory21d.slice(1);
  const api7 = computeApiRain(rainHistoryForSupply.slice(0, 7), 3.2);
  const api14 = computeApiRain(rainHistoryForSupply.slice(0, 14), 5.0);
  const api21 = computeApiRain(rainHistoryForSupply.slice(0, 21), 7.0);
  const antecedentRainTotal = rainHistoryNoCurrent.reduce((sum, value) => sum + value, 0);
  const localRainAnchors = {
    p50: quantile(rainHistoryNoCurrent, 0.5),
    p85: quantile(rainHistoryNoCurrent, 0.85),
    p98: quantile(rainHistoryNoCurrent, 0.98),
  };

  const moistureSupply = centeredScale(0.45 * api7 + 0.38 * api14 + 0.17 * api21, 0, 3.5, 17, 48);

  const topSoilRecent = Number.isFinite(previousWindow.recent3TopSoilMoisture)
    ? previousWindow.recent3TopSoilMoisture
    : Number.isFinite(day.soilMoistureTop)
      ? day.soilMoistureTop
      : 0;
  const topSoilHistory = Array.isArray(previousWindow.soilHistory7d) ? previousWindow.soilHistory7d : [];
  const topSoilHistoryMean = average(topSoilHistory);
  const rainHistory7d = rainHistory21d.slice(0, 7);
  const tempHistory7d = Array.isArray(previousWindow.tempHistory7d) ? previousWindow.tempHistory7d : [];
  const vpdHistory7d = Array.isArray(previousWindow.vpdHistory7d) ? previousWindow.vpdHistory7d : [];
  const soilStorageBase = centeredScale(0.7 * topSoilRecent + 0.3 * topSoilHistoryMean, 0.08, 0.18, 0.36, 0.56);
  const storageReservoir = simulateMoistureStorage({
    rainNewestFirst: rainHistory7d,
    tempNewestFirst: tempHistory7d,
    vpdNewestFirst: vpdHistory7d,
    initialStorage: soilStorageBase,
    rainAnchors: localRainAnchors,
  });
  const moistureStorage = clamp(storageReservoir, 0, 1);

  const vpd3 = Number.isFinite(previousWindow.recent3Vpd) ? previousWindow.recent3Vpd : Number.isFinite(day.vpdMean) ? day.vpdMean : 0;
  const meanTemp3 = Number.isFinite(previousWindow.recent3AvgTemp) ? previousWindow.recent3AvgTemp : day.meanTemp;
  const dryingForce = clamp(0.72 * scale(Math.max(0, vpd3 - 0.9), 0, 1.8) + 0.28 * scale(Math.max(0, meanTemp3 - 16), 0, 14), 0, 1);

  const degreeDaysBase5 = Array.isArray(previousWindow.tempHistory7d)
    ? previousWindow.tempHistory7d.reduce((sum, temp) => sum + Math.max(0, (Number.isFinite(temp) ? temp : 0) - 5), 0)
    : 0;
  const thermalReadiness = clamp(
    0.65 * centeredScale(meanTemp3, 0, 8, 19, 30) + 0.35 * centeredScale(degreeDaysBase5, 0, 22, 90, 170),
    0,
    1,
  );

  const nightlyMin3 = Number.isFinite(previousWindow.recent3NightMin) ? previousWindow.recent3NightMin : day.minTemp;
  const coldShock = scale(Math.max(0, 1.5 - nightlyMin3), 0, 8);

  const saturationStress = scale(Math.max(0, currentRain - 12), 0, 28);

  const climateProxy = 1 - clamp(Math.abs(latitude) / 75, 0, 1);

  return {
    moistureSupply,
    moistureStorage,
    dryingForce,
    thermalReadiness,
    coldShock,
    saturationStress,
    seasonWeak: clamp(seasonScore / 100, 0, 1),
    climateProxy: clamp(climateProxy, 0, 1),
    diagnostics: {
      antecedentRainTotal,
      api7,
      api14,
      api21,
      currentRain,
      degreeDaysBase5,
      dryingForce,
      meanTemp3,
      moistureStorage,
      moistureSupply,
      nightlyMin3,
      rainP50: localRainAnchors.p50,
      rainP85: localRainAnchors.p85,
      rainP98: localRainAnchors.p98,
      saturationStress,
      storageReservoir,
      topSoilRecent,
      vpd3,
    },
  };
}

export function inferFruitingSignal({ featureVector, daysAhead = 0, regionalStats }) {
  let linear = COEFFICIENTS.intercept;
  const contributions = [];

  Object.entries(COEFFICIENTS).forEach(([key, coefficient]) => {
    if (key === "intercept") return;
    const value = featureVector[key] ?? 0;
    const signedContribution = coefficient * value;
    linear += signedContribution;
    contributions.push({
      key,
      label: FACTOR_LABELS[key] ?? key,
      value,
      coefficient,
      impact: signedContribution,
    });
  });

  const rawProbability = sigmoid(linear);
  const logit = Math.log(rawProbability / Math.max(1e-9, 1 - rawProbability));
  const calibratedProbability = clamp(sigmoid(PLATT.a * logit + PLATT.b), 0.01, 0.99);
  const horizonPenalty = clamp(daysAhead / 9, 0, 0.16);
  let adjustedProbability = clamp(calibratedProbability * (1 - horizonPenalty), 0.01, 0.99);

  const highMoistureMemory = (featureVector.moistureSupply ?? 0) >= 0.72;
  const strongStorage = (featureVector.moistureStorage ?? 0) >= 0.58;
  const heavySameDayRain = (featureVector.saturationStress ?? 0) >= 0.4;
  if (highMoistureMemory && strongStorage && heavySameDayRain) {
    adjustedProbability = Math.max(adjustedProbability, 0.5);
  }

  const veryDry = (featureVector.moistureSupply ?? 0) <= 0.22 && (featureVector.moistureStorage ?? 0) <= 0.24;
  const strongDrying = (featureVector.dryingForce ?? 0) >= 0.75;
  if (veryDry && strongDrying) {
    adjustedProbability = Math.min(adjustedProbability, 0.52);
  }

  const sparseRegional = !regionalStats || (regionalStats.totalObservations ?? 0) < 20;
  const calibrationRisk = adjustedProbability > 0.9 || adjustedProbability < 0.1;
  let confidence = "High confidence";
  if (daysAhead > 7) confidence = "Forecast uncertain";
  else if (sparseRegional) confidence = "Data limited";
  else if (calibrationRisk) confidence = "Moderate confidence";

  const topFactors = contributions
    .sort((left, right) => Math.abs(right.impact) - Math.abs(left.impact))
    .slice(0, 8)
    .map((factor, index) => ({
      rank: index + 1,
      key: factor.key,
      label: factor.label,
      direction: factor.impact >= 0 ? "supports" : "reduces",
      impact: Math.round(Math.abs(factor.impact) * 100) / 100,
      contributionPercent: Math.round(clamp(Math.abs(factor.impact) / 1.8, 0, 1) * 100),
    }));

  return {
    probability: adjustedProbability,
    confidence,
    topFactors,
    diagnostics: {
      calibration: MODEL_METADATA.calibrationMethod,
      calibrationRisk,
      daysAhead,
      linearScore: linear,
      rawProbability,
      sparseRegional,
    },
  };
}

export function scoreToVerdict(probability) {
  const score = Math.round(clamp(probability, 0, 1) * 100);
  if (score >= 80) return "Strong fruiting presence likely";
  if (score >= 64) return "Fruiting presence likely";
  if (score >= 47) return "Mixed fruiting presence signal";
  if (score >= 32) return "Weak fruiting presence signal";
  return "Low fruiting presence signal";
}
