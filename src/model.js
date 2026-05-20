export const MODEL_METADATA = {
  modelVersion: "v7.3.0",
  modelType: "guild_mixture_rule_model",
  calibrationMethod: "bounded_guild_blend",
  trainedWindow: {
    from: "2024-01-01",
    to: "2026-05-20",
  },
  featureSchemaHash: "ff-v7_3-nonlinear-drydown-20260521",
  targetDefinition: "P(detectable_fruiting_presence_local_window_2_3d)",
  radiusKm: 50,
};

export const SCORING_CONFIG = {
  globalConfig: {
    rainThresholdsMm: {
      light: 1.5,
      medium: 6,
      heavy: 12,
      severe: 22,
      significant: 6,
    },
    scoreBounds: { min: 0.06, max: 0.97 },
    horizonPenaltyMax: 0.13,
    sparseRegionalPenalty: 0.01,
    scoreTransform: {
      center: 0.41,
      slope: 5.2,
      transformedWeight: 0.75,
      rawWeight: 0.25,
    },
  },
  guildConfigs: {
    summer_warm_humid: {
      temperatureWindow: { low: 4, bestLow: 16, bestHigh: 27, high: 36 },
      rain: { peakDayMin: 1.0, peakDayMax: 2.8, peakShiftSevere: 0.45, widthDays: 2.15, baseHalfLife: 3.0, heavyBonus: 1.9, severeBonus: 3.1 },
      drying: { tempMidC: 23, tempHighC: 30, vpdMid: 1.0, vpdHigh: 1.7, tailReductionAtMaxDrying: 0.52 },
      frost: { startC: 2, severeC: -4, maxPenalty: 0.2 },
      weights: { rain: 0.45, temp: 0.35, drying: 0.1, frost: 0.1 },
    },
    fall_cool_moist: {
      temperatureWindow: { low: 0, bestLow: 8, bestHigh: 17, high: 27 },
      rain: { peakDayMin: 1.3, peakDayMax: 3.4, peakShiftSevere: 0.6, widthDays: 2.05, baseHalfLife: 3.35, heavyBonus: 2.15, severeBonus: 3.45 },
      drying: { tempMidC: 20, tempHighC: 27, vpdMid: 0.95, vpdHigh: 1.55, tailReductionAtMaxDrying: 0.47 },
      frost: { startC: 3, severeC: -2, maxPenalty: 0.36 },
      weights: { rain: 0.46, temp: 0.3, drying: 0.08, frost: 0.16 },
    },
    winter_frost_tolerant: {
      temperatureWindow: { low: -10, bestLow: 1, bestHigh: 10, high: 18 },
      rain: { peakDayMin: 1.7, peakDayMax: 4.0, peakShiftSevere: 0.7, widthDays: 2.25, baseHalfLife: 4.1, heavyBonus: 2.35, severeBonus: 3.85 },
      drying: { tempMidC: 15, tempHighC: 23, vpdMid: 0.9, vpdHigh: 1.4, tailReductionAtMaxDrying: 0.38 },
      frost: { startC: 0, severeC: -8, maxPenalty: 0.1 },
      weights: { rain: 0.44, temp: 0.28, drying: 0.1, frost: 0.06 },
    },
  },
  guildPriors: {
    northern: {
      1: { summer_warm_humid: 0.08, fall_cool_moist: 0.2, winter_frost_tolerant: 0.72 },
      2: { summer_warm_humid: 0.1, fall_cool_moist: 0.2, winter_frost_tolerant: 0.7 },
      3: { summer_warm_humid: 0.2, fall_cool_moist: 0.42, winter_frost_tolerant: 0.38 },
      4: { summer_warm_humid: 0.34, fall_cool_moist: 0.46, winter_frost_tolerant: 0.2 },
      5: { summer_warm_humid: 0.52, fall_cool_moist: 0.36, winter_frost_tolerant: 0.12 },
      6: { summer_warm_humid: 0.66, fall_cool_moist: 0.26, winter_frost_tolerant: 0.08 },
      7: { summer_warm_humid: 0.7, fall_cool_moist: 0.22, winter_frost_tolerant: 0.08 },
      8: { summer_warm_humid: 0.62, fall_cool_moist: 0.3, winter_frost_tolerant: 0.08 },
      9: { summer_warm_humid: 0.32, fall_cool_moist: 0.56, winter_frost_tolerant: 0.12 },
      10: { summer_warm_humid: 0.18, fall_cool_moist: 0.62, winter_frost_tolerant: 0.2 },
      11: { summer_warm_humid: 0.1, fall_cool_moist: 0.42, winter_frost_tolerant: 0.48 },
      12: { summer_warm_humid: 0.06, fall_cool_moist: 0.22, winter_frost_tolerant: 0.72 },
    },
    southern: {
      1: { summer_warm_humid: 0.66, fall_cool_moist: 0.26, winter_frost_tolerant: 0.08 },
      2: { summer_warm_humid: 0.7, fall_cool_moist: 0.22, winter_frost_tolerant: 0.08 },
      3: { summer_warm_humid: 0.62, fall_cool_moist: 0.3, winter_frost_tolerant: 0.08 },
      4: { summer_warm_humid: 0.32, fall_cool_moist: 0.56, winter_frost_tolerant: 0.12 },
      5: { summer_warm_humid: 0.18, fall_cool_moist: 0.62, winter_frost_tolerant: 0.2 },
      6: { summer_warm_humid: 0.1, fall_cool_moist: 0.42, winter_frost_tolerant: 0.48 },
      7: { summer_warm_humid: 0.06, fall_cool_moist: 0.22, winter_frost_tolerant: 0.72 },
      8: { summer_warm_humid: 0.08, fall_cool_moist: 0.2, winter_frost_tolerant: 0.72 },
      9: { summer_warm_humid: 0.1, fall_cool_moist: 0.2, winter_frost_tolerant: 0.7 },
      10: { summer_warm_humid: 0.2, fall_cool_moist: 0.42, winter_frost_tolerant: 0.38 },
      11: { summer_warm_humid: 0.34, fall_cool_moist: 0.46, winter_frost_tolerant: 0.2 },
      12: { summer_warm_humid: 0.52, fall_cool_moist: 0.36, winter_frost_tolerant: 0.12 },
    },
  },
};

export const CLIMATE_PRESETS = {
  humid: {
    guildPriorMultipliers: { summer_warm_humid: 1.12, fall_cool_moist: 1.04, winter_frost_tolerant: 0.94 },
    rainBoostMultiplier: 1.08,
    dryingPenaltyMultiplier: 0.9,
  },
  temperate: {
    guildPriorMultipliers: { summer_warm_humid: 1, fall_cool_moist: 1, winter_frost_tolerant: 1 },
    rainBoostMultiplier: 1,
    dryingPenaltyMultiplier: 1,
  },
  dry_continental: {
    guildPriorMultipliers: { summer_warm_humid: 0.95, fall_cool_moist: 1.02, winter_frost_tolerant: 1.08 },
    rainBoostMultiplier: 0.96,
    dryingPenaltyMultiplier: 1.14,
  },
};

const FACTOR_LABELS = {
  rainEventComponent: "Rain-event support",
  temperatureComponent: "Temperature suitability",
  dryingPenalty: "Drying penalty",
  coldPenalty: "Cold penalty",
  seasonalComponent: "Seasonal guild prior",
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

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
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
  const z = (daysSince - peakDay) / Math.max(0.25, width);
  return Math.exp(-0.5 * z * z);
}

function tailFromHalfLife(daysSince, halfLifeDays) {
  if (!Number.isFinite(daysSince) || daysSince < 0) return 0;
  return Math.exp((-Math.log(2) * daysSince) / Math.max(0.35, halfLifeDays));
}

function findDaysSinceSignificantRain(rainHistory21d, significantThreshold) {
  for (let index = 0; index < rainHistory21d.length; index += 1) {
    if ((rainHistory21d[index] ?? 0) >= significantThreshold) return index;
  }
  return 999;
}

// Non-linear drydown: hold near-plateau for 1-2 days, gentle fade to day 4,
// then stronger decay once dryness persists beyond ~4-5 days.
function drydownPersistenceFactor(daysSinceSignificantRain) {
  if (!Number.isFinite(daysSinceSignificantRain) || daysSinceSignificantRain < 0) return 1;
  if (daysSinceSignificantRain <= 2) return 1;
  if (daysSinceSignificantRain <= 4) {
    const t = (daysSinceSignificantRain - 2) / 2;
    return 1 - 0.14 * t;
  }
  const late = daysSinceSignificantRain - 4;
  return Math.max(0.16, 0.86 * Math.exp(-0.42 * late));
}

function normalizeWeights(raw) {
  const entries = Object.entries(raw).map(([key, value]) => [key, Math.max(0, Number.isFinite(value) ? value : 0)]);
  const sum = entries.reduce((acc, [, value]) => acc + value, 0);
  if (sum <= 0) {
    const n = entries.length || 1;
    return Object.fromEntries(entries.map(([key]) => [key, 1 / n]));
  }
  return Object.fromEntries(entries.map(([key, value]) => [key, value / sum]));
}

function monthFromDate(dateString) {
  const month = new Date(`${dateString}T12:00:00`).getUTCMonth() + 1;
  return Number.isFinite(month) && month >= 1 && month <= 12 ? month : 6;
}

function buildGuildRainSignal({ rainHistory21d, currentRain, meanTemp3, vpd3, guildConfig, climatePreset, thresholds }) {
  const recentWindow = rainHistory21d.slice(0, 11);
  const peakRainAmount = recentWindow.reduce((best, value) => (value > best ? value : best), 0);
  const daysSincePeakRain = recentWindow.indexOf(peakRainAmount);
  const daysSinceSignificantRain = findDaysSinceSignificantRain(rainHistory21d, thresholds.significant);
  const drydownFactor = drydownPersistenceFactor(daysSinceSignificantRain);

  const normalizedEventStrength = clamp(scale(peakRainAmount, thresholds.light, thresholds.severe), 0, 1);
  const severeShare = clamp(scale(peakRainAmount, thresholds.heavy, thresholds.severe), 0, 1);

  const peakDay =
    guildConfig.rain.peakDayMin +
    (guildConfig.rain.peakDayMax - guildConfig.rain.peakDayMin) * severeShare +
    guildConfig.rain.peakShiftSevere * severeShare;
  const laggedBoost = gaussianPeak(daysSincePeakRain, peakDay, guildConfig.rain.widthDays) * normalizedEventStrength;

  const halfLife =
    guildConfig.rain.baseHalfLife +
    guildConfig.rain.heavyBonus * clamp(scale(peakRainAmount, thresholds.medium, thresholds.heavy), 0, 1) +
    guildConfig.rain.severeBonus * severeShare;
  const tailBoost = tailFromHalfLife(daysSincePeakRain, halfLife) * normalizedEventStrength;
  const rainPersistence7d = rainHistory21d
    .slice(0, 7)
    .reduce((sum, rain, idx) => sum + (Number.isFinite(rain) ? rain : 0) * Math.exp(-0.35 * idx), 0);
  const persistenceSupport = centeredScale(rainPersistence7d, 0, 6, 18, 44);

  const laggedBoostAdjusted = laggedBoost * drydownFactor;
  const tailBoostAdjusted = tailBoost * drydownFactor;
  const persistenceAdjusted = persistenceSupport * drydownFactor;

  const tempDrying = Math.max(
    scale(meanTemp3, guildConfig.drying.tempMidC, guildConfig.drying.tempHighC),
    scale(meanTemp3, guildConfig.drying.tempHighC, guildConfig.drying.tempHighC + 5),
  );
  const vpdDrying = Math.max(
    scale(vpd3, guildConfig.drying.vpdMid, guildConfig.drying.vpdHigh),
    scale(vpd3, guildConfig.drying.vpdHigh, guildConfig.drying.vpdHigh + 0.5),
  );
  const dryingIndex = clamp(0.58 * vpdDrying + 0.42 * tempDrying, 0, 1);
  const dryingReduction = guildConfig.drying.tailReductionAtMaxDrying * dryingIndex * climatePreset.dryingPenaltyMultiplier;
  const dryingAdjustedTail = tailBoost * (1 - dryingReduction);

  const rainDaySuppression =
    scale(currentRain, 18, 38) *
    (guildConfig === SCORING_CONFIG.guildConfigs.winter_frost_tolerant ? 0.06 : guildConfig === SCORING_CONFIG.guildConfigs.fall_cool_moist ? 0.1 : 0.12);

  let rainEventComponent = clamp(
    (0.44 * laggedBoostAdjusted + 0.36 * (dryingAdjustedTail * drydownFactor) + 0.2 * persistenceAdjusted) * climatePreset.rainBoostMultiplier - rainDaySuppression,
    0,
    1,
  );
  if (daysSincePeakRain >= 1 && daysSincePeakRain <= 3 && peakRainAmount >= thresholds.heavy) {
    rainEventComponent = clamp(rainEventComponent + 0.07, 0, 1);
  }

  return {
    rainEventClass: classifyRainEvent(peakRainAmount, thresholds),
    daysSincePeakRain,
    laggedBoost,
    tailBoost,
    laggedBoostAdjusted,
    tailBoostAdjusted,
    persistenceSupport,
    persistenceAdjusted,
    daysSinceSignificantRain,
    drydownFactor,
    dryingAdjustedTail,
    dryingIndex,
    peakRainAmount,
    rainEventComponent,
  };
}

function blendGuildScores({ guildScores, guildWeights, monthlyPriors }) {
  const blended = {
    rainEventComponent: 0,
    temperatureComponent: 0,
    dryingPenalty: 0,
    coldPenalty: 0,
    ecologicalScore: 0,
  };

  Object.keys(guildScores).forEach((guildKey) => {
    const w = guildWeights[guildKey] ?? 0;
    const score = guildScores[guildKey];
    blended.rainEventComponent += w * score.rainEventComponent;
    blended.temperatureComponent += w * score.temperatureComponent;
    blended.dryingPenalty += w * score.dryingPenalty;
    blended.coldPenalty += w * score.coldPenalty;
    blended.ecologicalScore += w * score.guildScore;
  });

  blended.seasonalComponent = Object.keys(monthlyPriors).reduce((acc, guildKey) => {
    const prior = monthlyPriors[guildKey] ?? 0;
    const weight = guildWeights[guildKey] ?? 0;
    return acc + prior * weight;
  }, 0);

  return blended;
}

export function buildModelFeatures({ day, previousWindow, seasonScore, latitude }) {
  const currentRain = Number.isFinite(day.precipitation) ? Math.max(0, day.precipitation) : 0;
  const rainHistory21d = Array.isArray(previousWindow.rainHistory21d)
    ? previousWindow.rainHistory21d.map((value) => (Number.isFinite(value) ? Math.max(0, value) : 0))
    : [currentRain];

  const meanTemp3 = Number.isFinite(previousWindow.recent3AvgTemp) ? previousWindow.recent3AvgTemp : day.meanTemp;
  const nightlyMin3 = Number.isFinite(previousWindow.recent3NightMin) ? previousWindow.recent3NightMin : day.minTemp;
  const vpd3 = Number.isFinite(previousWindow.recent3Vpd)
    ? previousWindow.recent3Vpd
    : Number.isFinite(day.vpdMean)
      ? day.vpdMean
      : 0;

  const degreeDaysBase5 = Array.isArray(previousWindow.tempHistory7d)
    ? previousWindow.tempHistory7d.reduce((sum, temp) => sum + Math.max(0, (Number.isFinite(temp) ? temp : 0) - 5), 0)
    : 0;

  const climatePresetKey = chooseClimatePreset(latitude);
  const climatePreset = CLIMATE_PRESETS[climatePresetKey] ?? CLIMATE_PRESETS.temperate;

  const month = monthFromDate(day.date);
  const hemisphere = latitude >= 0 ? "northern" : "southern";
  const monthlyPriors = SCORING_CONFIG.guildPriors[hemisphere][month];

  const guildScores = {};
  Object.entries(SCORING_CONFIG.guildConfigs).forEach(([guildKey, guildConfig]) => {
    const rainSignal = buildGuildRainSignal({
      rainHistory21d,
      currentRain,
      meanTemp3,
      vpd3,
      guildConfig,
      climatePreset,
      thresholds: SCORING_CONFIG.globalConfig.rainThresholdsMm,
    });

    const tempWindow = guildConfig.temperatureWindow;
    const baseTemp = centeredScale(meanTemp3, tempWindow.low, tempWindow.bestLow, tempWindow.bestHigh, tempWindow.high);
    const degreeSupport = centeredScale(degreeDaysBase5, 0, 22, 105, 180);
    const temperatureComponent = clamp(0.78 * baseTemp + 0.22 * degreeSupport, 0, 1);

    const dryingPenalty = clamp(
      0.62 * scale(vpd3, guildConfig.drying.vpdMid, guildConfig.drying.vpdHigh + 0.35) +
        0.38 * scale(meanTemp3, guildConfig.drying.tempMidC, guildConfig.drying.tempHighC + 4),
      0,
      1,
    );

    const coldPenalty =
      scale(guildConfig.frost.startC - nightlyMin3, 0, guildConfig.frost.startC - guildConfig.frost.severeC) * guildConfig.frost.maxPenalty;

    const guildScore = clamp(
      guildConfig.weights.rain * rainSignal.rainEventComponent +
        guildConfig.weights.temp * temperatureComponent -
        guildConfig.weights.drying * dryingPenalty -
        guildConfig.weights.frost * coldPenalty,
      0,
      1,
    );

    guildScores[guildKey] = {
      ...rainSignal,
      temperatureComponent,
      dryingPenalty,
      coldPenalty,
      guildScore,
    };
  });

  const evidenceNudgeRaw = {
    summer_warm_humid:
      (monthlyPriors.summer_warm_humid ?? 0) *
      (1 + 0.34 * scale(meanTemp3, 16, 24) * scale(guildScores.summer_warm_humid.rainEventComponent, 0.35, 1)),
    fall_cool_moist:
      (monthlyPriors.fall_cool_moist ?? 0) *
      (1 + 0.26 * scale(meanTemp3, 8, 16) * scale(guildScores.fall_cool_moist.rainEventComponent, 0.3, 1)),
    winter_frost_tolerant:
      (monthlyPriors.winter_frost_tolerant ?? 0) * (1 + 0.44 * scale(2 - nightlyMin3, 0, 10)),
  };

  if (nightlyMin3 < 0) {
    evidenceNudgeRaw.fall_cool_moist *= 0.74;
    evidenceNudgeRaw.summer_warm_humid *= 0.78;
  }

  Object.keys(evidenceNudgeRaw).forEach((guildKey) => {
    evidenceNudgeRaw[guildKey] *= climatePreset.guildPriorMultipliers[guildKey] ?? 1;
  });

  const guildWeights = normalizeWeights(evidenceNudgeRaw);
  const blended = blendGuildScores({ guildScores, guildWeights, monthlyPriors });

  const dominantGuild = Object.entries(guildWeights).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "summer_warm_humid";

  return {
    rainEventClass: guildScores[dominantGuild].rainEventClass,
    rainEventComponent: blended.rainEventComponent,
    laggedFruitingBoost: guildScores[dominantGuild].laggedBoost,
    moistureTailBoost: guildScores[dominantGuild].tailBoost,
    rainDaySuppression: 0,
    dryingAdjustedTail: guildScores[dominantGuild].dryingAdjustedTail,
    temperatureComponent: blended.temperatureComponent,
    dryingPenalty: blended.dryingPenalty,
    coldPenalty: blended.coldPenalty,
    seasonalComponent: blended.seasonalComponent,
    climateProxy: 1 - clamp(Math.abs(latitude) / 75, 0, 1),
    diagnostics: {
      climatePreset: climatePresetKey,
      currentRain,
      daysSinceLastSignificantRain: rainHistory21d.findIndex((rain) => rain >= SCORING_CONFIG.globalConfig.rainThresholdsMm.significant),
      daysSincePeakRain: guildScores[dominantGuild].daysSincePeakRain,
      degreeDaysBase5,
      dryingAdjustedTail: guildScores[dominantGuild].dryingAdjustedTail,
      dryingIndex: guildScores[dominantGuild].dryingIndex,
      dryingPenalty: blended.dryingPenalty,
      guildScores,
      guildWeights,
      dominantGuild,
      laggedBoost: guildScores[dominantGuild].laggedBoost,
      meanTemp3,
      nightlyMin3,
      peakRainAmount: guildScores[dominantGuild].peakRainAmount,
      rainEventClass: guildScores[dominantGuild].rainEventClass,
      rainEventComponent: blended.rainEventComponent,
      tailBoost: guildScores[dominantGuild].tailBoost,
      temperatureComponent: blended.temperatureComponent,
      vpd3,
      monthlyPriors,
      seasonScore,
    },
  };
}

export function inferFruitingSignal({ featureVector, daysAhead = 0, regionalStats }) {
  const rawEcologicalScore = clamp(
    0.58 * (featureVector.rainEventComponent ?? 0) +
      0.34 * (featureVector.temperatureComponent ?? 0) +
      0.05 * (featureVector.seasonalComponent ?? 0) -
      0.05 * (featureVector.dryingPenalty ?? 0) -
      0.05 * (featureVector.coldPenalty ?? 0),
    0,
    1,
  );

  const transform = SCORING_CONFIG.globalConfig.scoreTransform;
  const transformedScore = sigmoid((rawEcologicalScore - transform.center) * transform.slope);
  const calibratedEcologicalScore = clamp(
    transform.transformedWeight * transformedScore + transform.rawWeight * rawEcologicalScore,
    0,
    1,
  );

  const horizonPenalty = clamp(daysAhead / 10, 0, SCORING_CONFIG.globalConfig.horizonPenaltyMax);
  const sparseRegional = !regionalStats || (regionalStats.totalObservations ?? 0) < 20;
  const regionalPenalty = sparseRegional ? SCORING_CONFIG.globalConfig.sparseRegionalPenalty : 0;

  const warmRainSynergy = clamp(
    0.12 * scale(featureVector.temperatureComponent ?? 0, 0.7, 1) * scale(featureVector.rainEventComponent ?? 0, 0.42, 1),
    0,
    0.12,
  );

  const bounds = SCORING_CONFIG.globalConfig.scoreBounds;
  const adjustedProbability = clamp(
    (calibratedEcologicalScore + warmRainSynergy) * (1 - horizonPenalty) - regionalPenalty,
    bounds.min,
    bounds.max,
  );

  const calibrationRisk = adjustedProbability > 0.9 || adjustedProbability < 0.1;
  let confidence = "High confidence";
  if (daysAhead > 7) confidence = "Forecast uncertain";
  else if (sparseRegional) confidence = "Data limited";
  else if (calibrationRisk) confidence = "Moderate confidence";

  const componentBreakdown = {
    rainEventComponent: featureVector.rainEventComponent ?? 0,
    temperatureComponent: featureVector.temperatureComponent ?? 0,
    dryingPenalty: featureVector.dryingPenalty ?? 0,
    coldPenalty: featureVector.coldPenalty ?? 0,
    seasonalComponent: featureVector.seasonalComponent ?? 0,
    warmRainSynergy,
    finalScore: adjustedProbability,
  };

  const signedFactors = [
    { key: "rainEventComponent", impact: 0.52 * (featureVector.rainEventComponent ?? 0) },
    { key: "temperatureComponent", impact: 0.31 * (featureVector.temperatureComponent ?? 0) },
    { key: "seasonalComponent", impact: 0.04 * (featureVector.seasonalComponent ?? 0) },
    { key: "dryingPenalty", impact: -0.07 * (featureVector.dryingPenalty ?? 0) },
    { key: "coldPenalty", impact: -0.06 * (featureVector.coldPenalty ?? 0) },
  ];

  const topFactors = signedFactors
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
      calibratedEcologicalScore,
      daysAhead,
      horizonPenalty,
      rawEcologicalScore,
      transformedScore,
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
