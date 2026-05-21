export const MODEL_METADATA = {
  modelVersion: "v8.1.3",
  modelType: "guild_mixture_rain5d_model",
  calibrationMethod: "bounded_guild_blend_rain5d",
  trainedWindow: {
    from: "2024-01-01",
    to: "2026-05-20",
  },
  featureSchemaHash: "ff-v8_1_3-memory-dynamic-blend-soft-calibration-20260521",
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
    meaningfulRainThreshold: 3,
    rain5d: {
      dayWeights: [0.22, 0.28, 0.24, 0.16, 0.1],
      saturating: {
        inflectionMm: 7.5,
        slope: 0.26,
        maxSupport: 1,
      },
      oversaturation: {
        startMm: 65,
        fullMm: 105,
        maxPenalty: 0.08,
      },
    },
    antecedentRainMemory: {
      windowDays: 10,
      halfLifeDays: 3.5,
      inflectionMm: 14,
      slope: 0.19,
      blendWeight: 0.16,
      decayStartDryDays: 1,
      decayRate: 0.24,
      tempGate: { coolC: 8, warmC: 16 },
      vpdDecayMultiplier: 0.75,
    },
    drydown: {
      dryday_breakpoints: {
        light: { strongStart: 4, crashStart: 5 },
        medium: { strongStart: 7, crashStart: 9 },
        heavy: { strongStart: 8, crashStart: 10 },
        severe: { strongStart: 9, crashStart: 11 },
      },
      vpd_gate: { soft: 0.85, hard: 1.6 },
      rain_class_delay: {
        none: 0,
        light: 0,
        medium: 2,
        heavy: 4,
        severe: 5,
      },
      minFactor: 0.1,
    },
    scoreBounds: { min: 0.06, max: 0.97 },
    horizonPenaltyMax: 0.13,
    sparseRegionalPenalty: 0.01,
    scoreTransform: {
      center: 0.43,
      slope: 4.8,
      transformedWeight: 0.68,
      rawWeight: 0.32,
    },
  },
  guildConfigs: {
    summer_warm_humid: {
      temperatureWindow: { low: 4, bestLow: 16, bestHigh: 27, high: 36 },
      drying: { tempMidC: 23, tempHighC: 30, vpdMid: 1.0, vpdHigh: 1.7 },
      frost: { startC: 2, severeC: -4, maxPenalty: 0.2 },
      weights: { rain: 0.5, temp: 0.33, drying: 0.1, frost: 0.07 },
    },
    fall_cool_moist: {
      temperatureWindow: { low: 0, bestLow: 8, bestHigh: 17, high: 27 },
      drying: { tempMidC: 20, tempHighC: 27, vpdMid: 0.95, vpdHigh: 1.55 },
      frost: { startC: 3, severeC: -2, maxPenalty: 0.36 },
      weights: { rain: 0.5, temp: 0.28, drying: 0.08, frost: 0.14 },
    },
    winter_frost_tolerant: {
      temperatureWindow: { low: -10, bestLow: 1, bestHigh: 10, high: 18 },
      drying: { tempMidC: 15, tempHighC: 23, vpdMid: 0.9, vpdHigh: 1.4 },
      frost: { startC: 0, severeC: -8, maxPenalty: 0.1 },
      weights: { rain: 0.48, temp: 0.29, drying: 0.09, frost: 0.06 },
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

function computeApiRain(rainHistory, halfLifeDays) {
  const decay = Math.log(2) / Math.max(0.5, halfLifeDays);
  return rainHistory.reduce((total, rainMm, dayIndex) => {
    const rain = Number.isFinite(rainMm) ? Math.max(0, rainMm) : 0;
    if (rain <= 0) return total;
    const weight = Math.exp(-decay * dayIndex);
    return total + rain * weight;
  }, 0);
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

function findDaysSinceMeaningfulRain(rainHistory21d, meaningfulThreshold) {
  for (let index = 0; index < rainHistory21d.length; index += 1) {
    if ((rainHistory21d[index] ?? 0) >= meaningfulThreshold) return index;
  }
  return 999;
}

function rain5dFeatures(rainHistory21d, config) {
  const r = Array.from({ length: 5 }, (_, idx) => Math.max(0, rainHistory21d[idx] ?? 0));
  const rain5d_mm = r.reduce((sum, value) => sum + value, 0);
  const weights = config.dayWeights;
  const rain5d_weighted = r.reduce((sum, value, idx) => sum + value * (weights[idx] ?? 0), 0);

  const sat = config.saturating;
  const rise = sigmoid((rain5d_weighted - sat.inflectionMm) * sat.slope) * sat.maxSupport;

  const over = config.oversaturation;
  const oversatPenalty = scale(rain5d_mm, over.startMm, over.fullMm) * over.maxPenalty;

  const rain5d_response = clamp(rise - oversatPenalty, 0, 1);

  return {
    rain5d_mm,
    rain5d_weighted,
    rain5d_response,
    oversatPenalty,
  };
}

function antecedentRainMemoryFeatures({ rainHistory21d, dryDaysSinceMeaningfulRain, vpd3, meanTemp3, config, vpdGate }) {
  const window = Math.max(5, config.windowDays ?? 10);
  const rainWindow = rainHistory21d.slice(0, window);
  const apiMm = computeApiRain(rainWindow, config.halfLifeDays ?? 3.5);
  const normalizedMemory = sigmoid((apiMm - (config.inflectionMm ?? 14)) * (config.slope ?? 0.19));

  const vpdSoft = scale(vpd3, vpdGate.soft, vpdGate.hard);
  const dryDaysLate = Math.max(0, dryDaysSinceMeaningfulRain - (config.decayStartDryDays ?? 1));
  const vpdDecayMultiplier = config.vpdDecayMultiplier ?? 0.75;
  const decayRate = (config.decayRate ?? 0.24) * (1 + vpdDecayMultiplier * vpdSoft);
  const retention = Math.exp(-decayRate * dryDaysLate);
  const tempGate = config.tempGate ?? { coolC: 8, warmC: 16 };
  const thermalGate = scale(meanTemp3, tempGate.coolC, tempGate.warmC);
  const memorySignal = clamp(normalizedMemory * retention * (0.55 + 0.45 * thermalGate), 0, 1);

  return {
    memoryApiMm: apiMm,
    normalizedMemory,
    memoryRetention: retention,
    memorySignal,
  };
}

function hybridDrydownCrash({ dryDaysSinceMeaningfulRain, vpd3, rainMagnitudeClass, drydownConfig }) {
  const base = drydownConfig.dryday_breakpoints[rainMagnitudeClass] ?? drydownConfig.dryday_breakpoints.medium;
  const delay = drydownConfig.rain_class_delay[rainMagnitudeClass] ?? 0;

  const strongStart = base.strongStart + delay;
  const crashStart = base.crashStart + delay;

  const vpdSoft = scale(vpd3, drydownConfig.vpd_gate.soft, drydownConfig.vpd_gate.hard);
  if (dryDaysSinceMeaningfulRain <= strongStart) {
    return { drydownCrashFactor: 1, vpdDrynessState: vpdSoft, crashPhase: "hold" };
  }

  if (dryDaysSinceMeaningfulRain <= crashStart) {
    const t = (dryDaysSinceMeaningfulRain - strongStart) / Math.max(1, crashStart - strongStart);
    const factor = 1 - 0.16 * t * (0.5 + 0.5 * vpdSoft);
    return { drydownCrashFactor: clamp(factor, drydownConfig.minFactor, 1), vpdDrynessState: vpdSoft, crashPhase: "taper" };
  }

  const late = dryDaysSinceMeaningfulRain - crashStart;
  const decayRate = 0.35 + 0.45 * vpdSoft;
  const factor = (1 - 0.16 * (0.5 + 0.5 * vpdSoft)) * Math.exp(-decayRate * late);
  return { drydownCrashFactor: clamp(factor, drydownConfig.minFactor, 1), vpdDrynessState: vpdSoft, crashPhase: "crash" };
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

  const rain5 = rain5dFeatures(rainHistory21d, SCORING_CONFIG.globalConfig.rain5d);
  const rainMagnitudeClass = classifyRainEvent(rain5.rain5d_mm, SCORING_CONFIG.globalConfig.rainThresholdsMm);

  const dryDaysSinceMeaningfulRain = findDaysSinceMeaningfulRain(rainHistory21d, SCORING_CONFIG.globalConfig.meaningfulRainThreshold);
  const drydown = hybridDrydownCrash({
    dryDaysSinceMeaningfulRain,
    vpd3,
    rainMagnitudeClass,
    drydownConfig: SCORING_CONFIG.globalConfig.drydown,
  });
  const antecedentMemory = antecedentRainMemoryFeatures({
    rainHistory21d,
    dryDaysSinceMeaningfulRain,
    vpd3,
    meanTemp3,
    config: SCORING_CONFIG.globalConfig.antecedentRainMemory,
    vpdGate: SCORING_CONFIG.globalConfig.drydown.vpd_gate,
  });
  const baseMemoryWeight = clamp(SCORING_CONFIG.globalConfig.antecedentRainMemory.blendWeight ?? 0.16, 0, 0.35);
  const dynamicMemoryWeight = clamp(0.04 + baseMemoryWeight * scale(rain5.rain5d_response, 0.15, 0.55), 0.04, 0.28);
  const rainMoistureSignal = clamp(
    (1 - dynamicMemoryWeight) * rain5.rain5d_response + dynamicMemoryWeight * antecedentMemory.memorySignal,
    0,
    1,
  );

  const guildScores = {};
  Object.entries(SCORING_CONFIG.guildConfigs).forEach(([guildKey, guildConfig]) => {
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

    const rainSupport = clamp(rainMoistureSignal * drydown.drydownCrashFactor * climatePreset.rainBoostMultiplier, 0, 1);

    const guildScore = clamp(
      guildConfig.weights.rain * rainSupport +
        guildConfig.weights.temp * temperatureComponent -
        guildConfig.weights.drying * dryingPenalty -
        guildConfig.weights.frost * coldPenalty,
      0,
      1,
    );

    guildScores[guildKey] = {
      rainEventClass: rainMagnitudeClass,
      rainEventComponent: rainSupport,
      temperatureComponent,
      dryingPenalty,
      coldPenalty,
      guildScore,
      rain5d_response: rain5.rain5d_response,
      drydownCrashFactor: drydown.drydownCrashFactor,
    };
  });

  const evidenceNudgeRaw = {
    summer_warm_humid:
      (monthlyPriors.summer_warm_humid ?? 0) *
      (1 + 0.4 * scale(meanTemp3, 16, 24) * scale(rain5.rain5d_response, 0.35, 1)),
    fall_cool_moist:
      (monthlyPriors.fall_cool_moist ?? 0) *
      (1 + 0.25 * scale(meanTemp3, 8, 16) * scale(rain5.rain5d_response, 0.3, 1)),
    winter_frost_tolerant:
      (monthlyPriors.winter_frost_tolerant ?? 0) * (1 + 0.42 * scale(2 - nightlyMin3, 0, 10)),
  };

  if (nightlyMin3 < 0) {
    evidenceNudgeRaw.fall_cool_moist *= 0.76;
    evidenceNudgeRaw.summer_warm_humid *= 0.8;
  }

  Object.keys(evidenceNudgeRaw).forEach((guildKey) => {
    evidenceNudgeRaw[guildKey] *= climatePreset.guildPriorMultipliers[guildKey] ?? 1;
  });

  let guildWeights = normalizeWeights(evidenceNudgeRaw);
  const weatherDominanceAdjustment = scale(rain5.rain5d_response, 0.35, 1) * 0.16;
  guildWeights = normalizeWeights(
    Object.fromEntries(
      Object.entries(guildWeights).map(([guildKey, w]) => {
        const boost = guildScores[guildKey].rainEventComponent * weatherDominanceAdjustment;
        return [guildKey, w + boost];
      }),
    ),
  );

  const blended = blendGuildScores({ guildScores, guildWeights, monthlyPriors });

  const dominantGuild = Object.entries(guildWeights).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "summer_warm_humid";

  return {
    rainEventClass: rainMagnitudeClass,
    rainEventComponent: blended.rainEventComponent,
    laggedFruitingBoost: guildScores[dominantGuild].rainEventComponent,
    moistureTailBoost: rain5.rain5d_response,
    antecedentMoistureMemory: antecedentMemory.memorySignal,
    rainDaySuppression: rain5.oversatPenalty,
    dryingAdjustedTail: rainMoistureSignal * drydown.drydownCrashFactor,
    temperatureComponent: blended.temperatureComponent,
    dryingPenalty: blended.dryingPenalty,
    coldPenalty: blended.coldPenalty,
    seasonalComponent: blended.seasonalComponent,
    climateProxy: 1 - clamp(Math.abs(latitude) / 75, 0, 1),
    diagnostics: {
      climatePreset: climatePresetKey,
      currentRain,
      degreeDaysBase5,
      dryingPenalty: blended.dryingPenalty,
      guildScores,
      guildWeights,
      dominantGuild,
      meanTemp3,
      nightlyMin3,
      rainEventClass: rainMagnitudeClass,
      rainEventComponent: blended.rainEventComponent,
      temperatureComponent: blended.temperatureComponent,
      vpd3,
      monthlyPriors,
      seasonScore,
      rain5d_mm: rain5.rain5d_mm,
      rain5d_weighted: rain5.rain5d_weighted,
      rain5d_response: rain5.rain5d_response,
      rainMemoryApiMm: antecedentMemory.memoryApiMm,
      rainMemoryNormalized: antecedentMemory.normalizedMemory,
      rainMemoryRetention: antecedentMemory.memoryRetention,
      rainMemorySignal: antecedentMemory.memorySignal,
      memoryBlendWeight: dynamicMemoryWeight,
      rainMoistureSignal,
      dryDaysSinceMeaningfulRain,
      vpdDrynessState: drydown.vpdDrynessState,
      drydownCrashFactor: drydown.drydownCrashFactor,
      crashPhase: drydown.crashPhase,
      rainMagnitudeClass,
      weatherDominanceAdjustment,
    },
  };
}

export function inferFruitingSignal({ featureVector, daysAhead = 0, regionalStats }) {
  const rawEcologicalScore = clamp(
    0.6 * (featureVector.rainEventComponent ?? 0) +
      0.33 * (featureVector.temperatureComponent ?? 0) +
      0.04 * (featureVector.seasonalComponent ?? 0) -
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
