export const MODEL_METADATA = {
  modelVersion: "v6.1.0",
  modelType: "rule_driven_rain_event_scoring",
  calibrationMethod: "bounded_component_blend",
  trainedWindow: {
    from: "2024-01-01",
    to: "2026-05-20",
  },
  featureSchemaHash: "ff-v6_1-rain-event-lag-tail-tuned-20260520",
  targetDefinition: "P(detectable_fruiting_presence_local_window_2_3d)",
  radiusKm: 50,
};

export const SCORING_CONFIG = {
  rainThresholdsMm: {
    light: 1.5,
    medium: 6,
    heavy: 12,
    severe: 22,
    significant: 6,
  },
  lagDefaults: {
    peakDayMin: 1.1,
    peakDayMax: 3.2,
    widthDays: 1.8,
    severePeakShift: 0.55,
  },
  tailDefaults: {
    baseHalfLifeDays: 2.8,
    severeHalfLifeBonusDays: 3.1,
    heavyHalfLifeBonusDays: 1.8,
    maxTailDays: 10,
  },
  dryingMultipliers: {
    tempMidC: 22,
    tempHighC: 28,
    vpdMid: 1.05,
    vpdHigh: 1.6,
    tailReductionAtMaxDrying: 0.48,
  },
  saturationSuppression: {
    startMm: 18,
    fullMm: 38,
    maxPenalty: 0.14,
  },
  temperatureWindow: {
    low: 0,
    bestLow: 9,
    bestHigh: 24,
    high: 34,
  },
  coldPenalty: {
    startC: 3,
    severeC: -3,
    maxPenalty: 0.34,
  },
  componentWeights: {
    rainEvent: 0.5,
    temperature: 0.3,
    drying: 0.08,
    cold: 0.08,
    seasonal: 0.04,
  },
  scoreBounds: {
    min: 0.03,
    max: 0.97,
  },
};

export const CLIMATE_PRESETS = {
  humid: {
    lagPeakShiftDays: -0.2,
    tailHalfLifeMultiplier: 1.18,
    dryingPenaltyMultiplier: 0.88,
    rainBoostMultiplier: 1.1,
    temperaturePenaltyMultiplier: 0.95,
  },
  temperate: {
    lagPeakShiftDays: 0,
    tailHalfLifeMultiplier: 1,
    dryingPenaltyMultiplier: 1,
    rainBoostMultiplier: 1,
    temperaturePenaltyMultiplier: 1,
  },
  dry_continental: {
    lagPeakShiftDays: 0.25,
    tailHalfLifeMultiplier: 0.88,
    dryingPenaltyMultiplier: 1.14,
    rainBoostMultiplier: 0.96,
    temperaturePenaltyMultiplier: 1.06,
  },
};

const FACTOR_LABELS = {
  rainEventComponent: "Rain-event support",
  temperatureComponent: "Temperature suitability",
  dryingPenalty: "Drying penalty",
  coldPenalty: "Cold penalty",
  seasonalComponent: "Seasonal context",
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

function chooseClimatePreset(latitude) {
  const absLat = Math.abs(Number.isFinite(latitude) ? latitude : 45);
  if (absLat <= 23) return "humid";
  if (absLat >= 52) return "dry_continental";
  return "temperate";
}

function classifyRainEvent(amountMm, thresholds) {
  if (amountMm >= thresholds.severe) return "severe";
  if (amountMm >= thresholds.heavy) return "heavy";
  if (amountMm >= thresholds.medium) return "medium";
  if (amountMm >= thresholds.light) return "light";
  return "none";
}

function gaussianPeak(daysSince, peakDay, width) {
  if (!Number.isFinite(daysSince)) return 0;
  const z = (daysSince - peakDay) / Math.max(0.25, width);
  return Math.exp(-0.5 * z * z);
}

function tailFromHalfLife(daysSince, halfLifeDays) {
  if (!Number.isFinite(daysSince) || daysSince < 0) return 0;
  return Math.exp((-Math.log(2) * daysSince) / Math.max(0.35, halfLifeDays));
}

function findMostRecentSignificantRain(rainHistory21d, significantThreshold) {
  for (let index = 0; index < rainHistory21d.length; index += 1) {
    if ((rainHistory21d[index] ?? 0) >= significantThreshold) return index;
  }
  return null;
}

function buildRainEventSignal({ day, previousWindow, preset }) {
  const thresholds = SCORING_CONFIG.rainThresholdsMm;
  const rainHistory21d = Array.isArray(previousWindow.rainHistory21d)
    ? previousWindow.rainHistory21d.map((value) => (Number.isFinite(value) ? Math.max(0, value) : 0))
    : [];
  const currentRain = Number.isFinite(day.precipitation) ? Math.max(0, day.precipitation) : 0;
  if (!rainHistory21d.length) rainHistory21d.push(currentRain);

  const recentWindow = rainHistory21d.slice(0, SCORING_CONFIG.tailDefaults.maxTailDays + 1);
  const peakRainAmount = recentWindow.reduce((best, value) => (value > best ? value : best), 0);
  const daysSincePeakRain = recentWindow.indexOf(peakRainAmount);
  const rainEventClass = classifyRainEvent(peakRainAmount, thresholds);

  const daysSinceLastSignificantRain = findMostRecentSignificantRain(rainHistory21d, thresholds.significant);
  const normalizedEventStrength = clamp(scale(peakRainAmount, thresholds.light, thresholds.severe), 0, 1);

  const severeShare = clamp(scale(peakRainAmount, thresholds.heavy, thresholds.severe), 0, 1);
  const peakDayBase =
    SCORING_CONFIG.lagDefaults.peakDayMin +
    (SCORING_CONFIG.lagDefaults.peakDayMax - SCORING_CONFIG.lagDefaults.peakDayMin) * severeShare;
  const lagPeakDay = clamp(
    peakDayBase + SCORING_CONFIG.lagDefaults.severePeakShift * severeShare + (preset.lagPeakShiftDays ?? 0),
    0.8,
    5,
  );

  const laggedBoost =
    gaussianPeak(daysSincePeakRain, lagPeakDay, SCORING_CONFIG.lagDefaults.widthDays) * normalizedEventStrength;

  const halfLifeDaysBase =
    SCORING_CONFIG.tailDefaults.baseHalfLifeDays +
    SCORING_CONFIG.tailDefaults.heavyHalfLifeBonusDays * clamp(scale(peakRainAmount, thresholds.medium, thresholds.heavy), 0, 1) +
    SCORING_CONFIG.tailDefaults.severeHalfLifeBonusDays * severeShare;
  const tailHalfLifeDays = halfLifeDaysBase * (preset.tailHalfLifeMultiplier ?? 1);
  const tailBoost = tailFromHalfLife(daysSincePeakRain, tailHalfLifeDays) * normalizedEventStrength;

  const meanTemp3 = Number.isFinite(previousWindow.recent3AvgTemp) ? previousWindow.recent3AvgTemp : day.meanTemp;
  const vpd3 = Number.isFinite(previousWindow.recent3Vpd)
    ? previousWindow.recent3Vpd
    : Number.isFinite(day.vpdMean)
      ? day.vpdMean
      : 0;
  const tempDrying = Math.max(
    scale(meanTemp3, SCORING_CONFIG.dryingMultipliers.tempMidC, SCORING_CONFIG.dryingMultipliers.tempHighC),
    scale(meanTemp3, SCORING_CONFIG.dryingMultipliers.tempHighC, SCORING_CONFIG.dryingMultipliers.tempHighC + 5),
  );
  const vpdDrying = Math.max(
    scale(vpd3, SCORING_CONFIG.dryingMultipliers.vpdMid, SCORING_CONFIG.dryingMultipliers.vpdHigh),
    scale(vpd3, SCORING_CONFIG.dryingMultipliers.vpdHigh, SCORING_CONFIG.dryingMultipliers.vpdHigh + 0.5),
  );
  const dryingIndex = clamp(0.55 * vpdDrying + 0.45 * tempDrying, 0, 1);
  const dryingReduction = SCORING_CONFIG.dryingMultipliers.tailReductionAtMaxDrying * dryingIndex;
  const dryingAdjustedTail = tailBoost * (1 - dryingReduction);

  const rainDaySuppression =
    scale(
      currentRain,
      SCORING_CONFIG.saturationSuppression.startMm,
      SCORING_CONFIG.saturationSuppression.fullMm,
    ) * SCORING_CONFIG.saturationSuppression.maxPenalty;

  let rainEventComponent = clamp(
    (0.58 * laggedBoost + 0.42 * dryingAdjustedTail) * (preset.rainBoostMultiplier ?? 1) - rainDaySuppression,
    0,
    1,
  );
  // Explicit post-rain trigger bonus for classic flush windows after meaningful rain.
  if (daysSincePeakRain >= 1 && daysSincePeakRain <= 3 && peakRainAmount >= thresholds.heavy) {
    rainEventComponent = clamp(rainEventComponent + 0.08, 0, 1);
  }

  return {
    rainEventClass,
    rainEventComponent,
    daysSincePeakRain,
    daysSinceLastSignificantRain,
    dryingAdjustedTail,
    dryingIndex,
    laggedBoost,
    peakRainAmount,
    rainDaySuppression,
    tailBoost,
  };
}

export function buildModelFeatures({ day, previousWindow, seasonScore, latitude }) {
  const presetKey = chooseClimatePreset(latitude);
  const preset = CLIMATE_PRESETS[presetKey] ?? CLIMATE_PRESETS.temperate;

  const rainSignal = buildRainEventSignal({ day, previousWindow, preset });

  const meanTemp3 = Number.isFinite(previousWindow.recent3AvgTemp) ? previousWindow.recent3AvgTemp : day.meanTemp;
  const nightlyMin3 = Number.isFinite(previousWindow.recent3NightMin) ? previousWindow.recent3NightMin : day.minTemp;
  const degreeDaysBase5 = Array.isArray(previousWindow.tempHistory7d)
    ? previousWindow.tempHistory7d.reduce((sum, temp) => sum + Math.max(0, (Number.isFinite(temp) ? temp : 0) - 5), 0)
    : 0;

  const tempWindow = SCORING_CONFIG.temperatureWindow;
  const temperatureBase = centeredScale(meanTemp3, tempWindow.low, tempWindow.bestLow, tempWindow.bestHigh, tempWindow.high);
  const degreeDaySupport = centeredScale(degreeDaysBase5, 0, 20, 95, 180);
  const temperatureComponent = clamp(
    (0.74 * temperatureBase + 0.26 * degreeDaySupport) * (preset.temperaturePenaltyMultiplier ?? 1),
    0,
    1,
  );

  const vpd3 = Number.isFinite(previousWindow.recent3Vpd)
    ? previousWindow.recent3Vpd
    : Number.isFinite(day.vpdMean)
      ? day.vpdMean
      : 0;
  const dryingPenaltyBase = clamp(
    0.65 * scale(vpd3, SCORING_CONFIG.dryingMultipliers.vpdMid, SCORING_CONFIG.dryingMultipliers.vpdHigh + 0.35) +
      0.35 * scale(meanTemp3, SCORING_CONFIG.dryingMultipliers.tempMidC, SCORING_CONFIG.dryingMultipliers.tempHighC + 4),
    0,
    1,
  );
  const dryingPenalty = clamp(dryingPenaltyBase * (preset.dryingPenaltyMultiplier ?? 1), 0, 1);

  const coldPenalty =
    scale(SCORING_CONFIG.coldPenalty.startC - nightlyMin3, 0, SCORING_CONFIG.coldPenalty.startC - SCORING_CONFIG.coldPenalty.severeC) *
    SCORING_CONFIG.coldPenalty.maxPenalty;

  const seasonalComponent = clamp(seasonScore / 100, 0, 1);
  const climateProxy = 1 - clamp(Math.abs(latitude) / 75, 0, 1);

  return {
    rainEventClass: rainSignal.rainEventClass,
    rainEventComponent: rainSignal.rainEventComponent,
    laggedFruitingBoost: rainSignal.laggedBoost,
    moistureTailBoost: rainSignal.tailBoost,
    rainDaySuppression: rainSignal.rainDaySuppression,
    dryingAdjustedTail: rainSignal.dryingAdjustedTail,
    temperatureComponent,
    dryingPenalty,
    coldPenalty,
    seasonalComponent,
    climateProxy,
    diagnostics: {
      climatePreset: presetKey,
      currentRain: Number.isFinite(day.precipitation) ? Math.max(0, day.precipitation) : 0,
      daysSinceLastSignificantRain: rainSignal.daysSinceLastSignificantRain,
      daysSincePeakRain: rainSignal.daysSincePeakRain,
      degreeDaysBase5,
      dryingAdjustedTail: rainSignal.dryingAdjustedTail,
      dryingIndex: rainSignal.dryingIndex,
      dryingPenalty,
      laggedBoost: rainSignal.laggedBoost,
      meanTemp3,
      nightlyMin3,
      peakRainAmount: rainSignal.peakRainAmount,
      rainDaySuppression: rainSignal.rainDaySuppression,
      rainEventClass: rainSignal.rainEventClass,
      rainEventComponent: rainSignal.rainEventComponent,
      tailBoost: rainSignal.tailBoost,
      temperatureComponent,
      vpd3,
    },
  };
}

export function inferFruitingSignal({ featureVector, daysAhead = 0, regionalStats }) {
  const weights = SCORING_CONFIG.componentWeights;
  const rainEventSupport = clamp((featureVector.rainEventComponent ?? 0) * weights.rainEvent, 0, 1);
  const temperatureSupport = clamp((featureVector.temperatureComponent ?? 0) * weights.temperature, 0, 1);
  const dryingPenaltyWeighted = clamp((featureVector.dryingPenalty ?? 0) * weights.drying, 0, 1);
  const coldPenaltyWeighted = clamp((featureVector.coldPenalty ?? 0) * weights.cold, 0, 1);
  const seasonalSupport = clamp((featureVector.seasonalComponent ?? 0) * weights.seasonal, 0, 1);

  const rawComponentScore = clamp(
    rainEventSupport + temperatureSupport + seasonalSupport - dryingPenaltyWeighted - coldPenaltyWeighted,
    0,
    1,
  );

  const horizonPenalty = clamp(daysAhead / 10, 0, 0.16);
  const sparseRegional = !regionalStats || (regionalStats.totalObservations ?? 0) < 20;
  const regionalPenalty = sparseRegional ? 0.03 : 0;

  const bounded = SCORING_CONFIG.scoreBounds;
  const adjustedProbability = clamp(
    rawComponentScore * (1 - horizonPenalty) - regionalPenalty,
    bounded.min,
    bounded.max,
  );

  const calibrationRisk = adjustedProbability > 0.9 || adjustedProbability < 0.1;
  let confidence = "High confidence";
  if (daysAhead > 7) confidence = "Forecast uncertain";
  else if (sparseRegional) confidence = "Data limited";
  else if (calibrationRisk) confidence = "Moderate confidence";

  const componentBreakdown = {
    coldPenalty: coldPenaltyWeighted,
    dryingPenalty: dryingPenaltyWeighted,
    finalScore: adjustedProbability,
    rainEventComponent: rainEventSupport,
    seasonalComponent: seasonalSupport,
    temperatureComponent: temperatureSupport,
  };

  const topFactors = [
    { key: "rainEventComponent", impact: rainEventSupport },
    { key: "temperatureComponent", impact: temperatureSupport },
    { key: "seasonalComponent", impact: seasonalSupport },
    { key: "dryingPenalty", impact: -dryingPenaltyWeighted },
    { key: "coldPenalty", impact: -coldPenaltyWeighted },
  ]
    .sort((left, right) => Math.abs(right.impact) - Math.abs(left.impact))
    .map((factor, index) => ({
      rank: index + 1,
      key: factor.key,
      label: FACTOR_LABELS[factor.key] ?? factor.key,
      direction: factor.impact >= 0 ? "supports" : "reduces",
      impact: Math.round(Math.abs(factor.impact) * 100) / 100,
      contributionPercent: Math.round(clamp(Math.abs(factor.impact), 0, 1) * 100),
    }));

  return {
    probability: adjustedProbability,
    confidence,
    topFactors,
    diagnostics: {
      calibration: MODEL_METADATA.calibrationMethod,
      calibrationRisk,
      componentBreakdown,
      daysAhead,
      horizonPenalty,
      rawComponentScore,
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
