export const MODEL_METADATA = {
  modelVersion: "v5.0.0",
  modelType: "weather_logistic_no_moisture",
  calibrationMethod: "platt",
  trainedWindow: {
    from: "2024-01-01",
    to: "2026-05-20",
  },
  featureSchemaHash: "ff-v5_0-no-moisture-20260520",
  targetDefinition: "P(detectable_fruiting_presence_local_window_2_3d)",
  radiusKm: 50,
};

const COEFFICIENTS = {
  intercept: -0.78,
  rainPulse: 0.92,
  dryingForce: -1.16,
  thermalReadiness: 0.92,
  coldShock: -0.78,
  saturationStress: -0.24,
  seasonWeak: 0.2,
  climateProxy: 0.09,
};

const PLATT = { a: 1.08, b: -0.02 };

const FACTOR_LABELS = {
  rainPulse: "Recent rain pulse",
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

export function buildModelFeatures({ day, previousWindow, seasonScore, latitude }) {
  const currentRain = Number.isFinite(day.precipitation) ? Math.max(0, day.precipitation) : 0;
  const rain1dAgo = Number.isFinite(previousWindow.rain1dAgo) ? Math.max(0, previousWindow.rain1dAgo) : 0;
  const rain2dAgo = Number.isFinite(previousWindow.rain2dAgo) ? Math.max(0, previousWindow.rain2dAgo) : 0;
  const rain3dAgo = Number.isFinite(previousWindow.rain3dAgo) ? Math.max(0, previousWindow.rain3dAgo) : 0;
  const recent3Rain = Number.isFinite(previousWindow.recent3Rain) ? Math.max(0, previousWindow.recent3Rain) : currentRain;

  const rainPulse = clamp(
    0.65 * centeredScale(rain1dAgo + rain2dAgo, 0, 1.2, 14, 38) +
      0.35 * centeredScale(recent3Rain, 0, 2, 19, 55),
    0,
    1,
  );

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
    rainPulse,
    dryingForce,
    thermalReadiness,
    coldShock,
    saturationStress,
    seasonWeak: clamp(seasonScore / 100, 0, 1),
    climateProxy: clamp(climateProxy, 0, 1),
    diagnostics: {
      currentRain,
      degreeDaysBase5,
      dryingForce,
      meanTemp3,
      nightlyMin3,
      rain1dAgo,
      rain2dAgo,
      rain3dAgo,
      rainPulse,
      recent3Rain,
      saturationStress,
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

  const highRainPulse = (featureVector.rainPulse ?? 0) >= 0.7;
  const strongDrying = (featureVector.dryingForce ?? 0) >= 0.75;
  if (highRainPulse && strongDrying) {
    adjustedProbability = Math.min(adjustedProbability, 0.62);
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
