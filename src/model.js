export const MODEL_METADATA = {
  modelVersion: "v3.1.0",
  modelType: "regularized_logistic",
  calibrationMethod: "platt",
  trainedWindow: {
    from: "2024-01-01",
    to: "2026-04-30",
  },
  featureSchemaHash: "ff-v3_1-weather-first-observer-neutral-20260519",
  targetDefinition: "P(activity_spike_next_1_3_days)",
  radiusKm: 50,
};

const COEFFICIENTS = {
  intercept: -0.59,
  rainLagWeighted: 1.02,
  rainPrior24To72: 0.67,
  drySpellPenalty: -0.88,
  soilMoistureTop: 0.93,
  vpdStress: -0.82,
  rainCurrentPenalty: -0.47,
  warmingAfterRain: 0.61,
  tempWindow: 0.54,
  frostPenalty: -0.56,
  volatilityPenalty: -0.24,
  habitat: 0.31,
  seasonWeak: 0.14,
  climateProxy: 0.08,
};

const PLATT = { a: 1.18, b: -0.09 };

const FACTOR_LABELS = {
  rainLagWeighted: "Lagged rain effect (1/2/3-day)",
  rainPrior24To72: "Rain 24-72h ago",
  drySpellPenalty: "Dry spell penalty (insufficient recent rain)",
  soilMoistureTop: "Topsoil moisture",
  vpdStress: "Drying-air stress (VPD)",
  rainCurrentPenalty: "Current rain penalty",
  warmingAfterRain: "Warming after rain",
  tempWindow: "Temperature window",
  frostPenalty: "Frost / cold-night risk",
  volatilityPenalty: "Temperature volatility",
  habitat: "Habitat baseline",
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

export function buildModelFeatures({ day, previousWindow, regionalStats, habitatScore, seasonScore, latitude }) {
  const currentRain = day.precipitation;
  const rain72h = previousWindow.recent3Rain;
  const priorRain24To72 = Math.max(0, rain72h - currentRain);
  const rainLagWeighted = (previousWindow.rain1dAgo ?? 0) * 0.2 + (previousWindow.rain2dAgo ?? 0) * 0.5 + (previousWindow.rain3dAgo ?? 0) * 0.3;
  const warmingAfterRain = day.meanTemp - previousWindow.previous3AvgTemp;
  const avgTemp3 = previousWindow.recent3AvgTemp;
  const nightlyMin3 = previousWindow.recent3NightMin;
  const volatility3 = previousWindow.recent3DiurnalRange;
  const topSoilMoisture = previousWindow.recent3TopSoilMoisture ?? day.soilMoistureTop ?? 0;
  const vpd3 = previousWindow.recent3Vpd ?? day.vpdMean ?? 0;

  const climateProxy = 1 - clamp(Math.abs(latitude) / 75, 0, 1);

  return {
    rainLagWeighted: centeredScale(rainLagWeighted, 0, 2.5, 12, 35),
    rainPrior24To72: centeredScale(priorRain24To72, 0, 4, 20, 45),
    drySpellPenalty: scale(Math.max(0, 4 - priorRain24To72), 0, 4),
    soilMoistureTop: centeredScale(topSoilMoisture, 0.08, 0.18, 0.38, 0.55),
    vpdStress: scale(Math.max(0, vpd3 - 1.1), 0, 1.7),
    rainCurrentPenalty: scale(currentRain, 0, 16),
    warmingAfterRain: centeredScale(warmingAfterRain, -4, 1, 5, 10),
    tempWindow: centeredScale(avgTemp3, 0, 8, 18, 30),
    frostPenalty: scale(Math.max(0, 2 - nightlyMin3), 0, 6),
    volatilityPenalty: scale(Math.abs(volatility3 - 9), 0, 10),
    habitat: clamp(habitatScore / 100, 0, 1),
    seasonWeak: clamp(seasonScore / 100, 0, 1),
    climateProxy: clamp(climateProxy, 0, 1),
    diagnostics: {
      avgTemp3,
      currentRain,
      rainLagWeighted,
      nightlyMin3,
      priorRain24To72,
      rain72h,
      topSoilMoisture,
      volatility3,
      vpd3,
      warmingAfterRain,
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
  const horizonPenalty = clamp(daysAhead / 9, 0, 0.15);
  let adjustedProbability = clamp(calibratedProbability * (1 - horizonPenalty), 0.01, 0.99);

  // Physical guardrail: warm temperatures alone should not dominate during very dry conditions.
  const dryState = (featureVector.drySpellPenalty ?? 0) >= 0.9;
  const highDryingStress = (featureVector.vpdStress ?? 0) >= 0.75;
  const weakSoilMoisture = (featureVector.soilMoistureTop ?? 0) <= 0.25;
  if (dryState && (highDryingStress || weakSoilMoisture)) {
    adjustedProbability = Math.min(adjustedProbability, 0.58);
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
      contributionPercent: Math.round(clamp(Math.abs(factor.impact) / 1.6, 0, 1) * 100),
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
  if (score >= 78) return "Strong active fruiting signal";
  if (score >= 62) return "Likely active fruiting";
  if (score >= 46) return "Mixed current fruiting signal";
  if (score >= 30) return "Weak current signal";
  return "Low current fruiting signal";
}
