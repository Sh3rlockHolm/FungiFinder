const state = {
  allDays: [],
  animationFromIndex: null,
  focusDate: null,
  forestType: "mixed",
  map: null,
  marker: null,
  regionalStats: null,
  scoredDays: [],
  selected: { latitude: 41.0772, longitude: -73.4687, label: "Darien, CT" },
  selectedSuggestion: null,
  suggestionRequestId: 0,
  suggestionTimer: null,
  suggestions: [],
  chartLayout: null,
  touchStartX: null,
};

const elements = {
  analysisCopy: document.querySelector("#analysisCopy"),
  analysisTitle: document.querySelector("#analysisTitle"),
  breakdownStrip: document.querySelector("#breakdownStrip"),
  closeWeightingButton: document.querySelector("#closeWeightingButton"),
  combinedChart: document.querySelector("#combinedChart"),
  confidenceBadge: document.querySelector("#confidenceBadge"),
  contextCopy: document.querySelector("#contextCopy"),
  coordinateForm: document.querySelector("#coordinateForm"),
  dataStatus: document.querySelector("#dataStatus"),
  detailCopy: document.querySelector("#detailCopy"),
  detailDateLabel: document.querySelector("#detailDateLabel"),
  detailMetrics: document.querySelector("#detailMetrics"),
  detailScore: document.querySelector("#detailScore"),
  detailVerdict: document.querySelector("#detailVerdict"),
  forestTypeSelect: document.querySelector("#forestTypeSelect"),
  locationInput: document.querySelector("#locationInput"),
  locationSuggestions: document.querySelector("#locationSuggestions"),
  openWeightingButton: document.querySelector("#openWeightingButton"),
  placeLabel: document.querySelector("#placeLabel"),
  daySelector: document.querySelector("#daySelector"),
  regionalConfidence: document.querySelector("#regionalConfidence"),
  regionalCopy: document.querySelector("#regionalCopy"),
  regionalMetrics: document.querySelector("#regionalMetrics"),
  sampleButton: document.querySelector("#sampleButton"),
  seasonBadge: document.querySelector("#seasonBadge"),
  summaryLabel: document.querySelector("#summaryLabel"),
  todayScore: document.querySelector("#todayScore"),
  todayVerdict: document.querySelector("#todayVerdict"),
  useLocationButton: document.querySelector("#useLocationButton"),
  weightingModal: document.querySelector("#weightingModal"),
};

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  weekday: "short",
});
const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const monthDayFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sum(values) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function mean(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? sum(valid) / valid.length : 0;
}

function parseCoordinateInput(value) {
  const match = value.trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const latitude = Number.parseFloat(match[1]);
  const longitude = Number.parseFloat(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    label: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
    latitude: clamp(latitude, -90, 90),
    longitude: clamp(longitude, -180, 180),
  };
}

async function geocodeLocation(name) {
  const results = await searchLocations(name, 1);
  const result = results[0];
  if (!result) throw new Error("Location not found");
  return result;
}

async function searchLocations(name, count = 6) {
  const params = new URLSearchParams({
    count: String(count),
    language: "en",
    name,
  });
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  if (!response.ok) throw new Error(`Geocoding failed with ${response.status}`);
  const payload = await response.json();
  return (payload.results ?? []).map((result) => {
    const labelParts = [result.name, result.admin1, result.country].filter(Boolean);
    return {
      label: labelParts.join(", "),
      latitude: result.latitude,
      longitude: result.longitude,
    };
  });
}

function rangeScore(value, bestLow, bestHigh, hardLow, hardHigh) {
  if (value >= bestLow && value <= bestHigh) return 100;
  if (value < hardLow || value > hardHigh) return 0;
  if (value < bestLow) return ((value - hardLow) / (bestLow - hardLow)) * 100;
  return ((hardHigh - value) / (hardHigh - bestHigh)) * 100;
}

function verdictForScore(score) {
  if (score >= 82) return "Excellent conditions";
  if (score >= 68) return "Good chance";
  if (score >= 52) return "Mixed but worth a look";
  if (score >= 35) return "Low signal";
  return "Poor conditions";
}

function confidenceForScore({ rainScore, recentRainScore, habitatScore, regionalStats, targetIndex, todayIndex }) {
  if (targetIndex - todayIndex > 7) return "Forecast uncertain";
  if (!regionalStats || regionalStats.confidence === "Sparse data") return "Data limited";
  if (habitatScore < 80) return "Habitat limited";
  if (rainScore < 35 || recentRainScore < 35) return "Weather limited";
  return "High confidence";
}

function setStatus(message) {
  elements.dataStatus.textContent = message;
}

function formatTimelineLabel(dateString) {
  return dayFormatter.format(new Date(`${dateString}T12:00:00`));
}

function formatTimelineLabelParts(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return {
    weekday: weekdayFormatter.format(date),
    monthDay: monthDayFormatter.format(date),
  };
}

function getSeasonForDate(dateString, latitude) {
  const month = new Date(`${dateString}T12:00:00`).getUTCMonth() + 1;
  const northern = latitude >= 0;
  const seasons = northern
    ? [
        { label: "winter", months: [12, 1, 2] },
        { label: "spring", months: [3, 4, 5] },
        { label: "summer", months: [6, 7, 8] },
        { label: "autumn", months: [9, 10, 11] },
      ]
    : [
        { label: "summer", months: [12, 1, 2] },
        { label: "autumn", months: [3, 4, 5] },
        { label: "winter", months: [6, 7, 8] },
        { label: "spring", months: [9, 10, 11] },
      ];
  return seasons.find((entry) => entry.months.includes(month))?.label ?? "spring";
}

function seasonScoreForDate(dateString, latitude) {
  const season = getSeasonForDate(dateString, latitude);
  if (season === "autumn") return 100;
  if (season === "spring") return 72;
  if (season === "summer") return 56;
  return 24;
}

function forestScore() {
  const scores = {
    mixed: 88,
    deciduous: 84,
    riparian: 92,
    conifer: 80,
  };
  return scores[state.forestType] ?? 84;
}

function buildReasons({ rain7, rain72h, avgTemp, nightlyMin, stabilityScore }) {
  const reasons = [];
  if (rain7 < 5) reasons.push("The previous week looks too dry.");
  else if (rain7 <= 45) reasons.push("Weekly rainfall is in a useful fruiting range.");
  else if (rain7 <= 80) reasons.push("Moisture is high; check well-drained spots.");
  else reasons.push("Rainfall may be excessive for easy foraging.");

  if (rain72h >= 4 && rain72h <= 22) reasons.push("Recent rain timing is favorable.");
  else if (rain72h < 2) reasons.push("Recent rain is limited.");
  else reasons.push("Very recent rain may leave conditions saturated.");

  if (avgTemp >= 8 && avgTemp <= 18) reasons.push("Average temperature is favorable.");
  else if (avgTemp < 5) reasons.push("Temperatures are likely too cold.");
  else reasons.push("Warm conditions may shorten the window.");

  if (nightlyMin < -1) reasons.push("Recent frost is a strong negative signal.");
  else if (nightlyMin < 4) reasons.push("Cold nights reduce confidence.");

  if (stabilityScore > 70) reasons.push("Temperature swings are moderate, which helps general growth.");

  return reasons.slice(0, 3);
}

async function fetchWeather(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    daily: "temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum",
    forecast_days: "11",
    past_days: "7",
    timezone: "auto",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error(`Weather request failed with ${response.status}`);
  return response.json();
}

function isoDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

async function fetchINaturalistCount(latitude, longitude, extraParams = {}) {
  const params = new URLSearchParams({
    iconic_taxa: "Fungi",
    lat: latitude.toFixed(5),
    lng: longitude.toFixed(5),
    per_page: "1",
    radius: "50",
    verifiable: "true",
    ...extraParams,
  });
  const response = await fetch(`https://api.inaturalist.org/v1/observations?${params}`);
  if (!response.ok) throw new Error(`iNaturalist request failed with ${response.status}`);
  const payload = await response.json();
  return payload.total_results ?? 0;
}

function empiricalScoreForStats(stats) {
  if (!stats || stats.totalObservations < 20) return 58;
  let score = 45;

  if (stats.seasonalObservations >= 150) score += 25;
  else if (stats.seasonalObservations >= 60) score += 18;
  else if (stats.seasonalObservations >= 20) score += 10;
  else score -= 8;

  if (stats.recent14Observations >= 10) score += 18;
  else if (stats.recent45Observations >= 25) score += 15;
  else if (stats.recent45Observations >= 8) score += 8;
  else if (stats.recent45Observations === 0) score -= 12;

  if (stats.researchRecent45Observations >= 5) score += 8;
  if (stats.totalObservations >= 300) score += 5;

  return clamp(score, 0, 100);
}

function confidenceForRegionalStats(stats) {
  if (!stats || stats.totalObservations < 20) return "Sparse data";
  if (stats.totalObservations >= 300 && stats.seasonalObservations >= 60) return "Good regional data";
  if (stats.totalObservations >= 100 && stats.seasonalObservations >= 20) return "Moderate data";
  return "Sparse data";
}

function summarizeRegionalStats(stats) {
  if (!stats || stats.status === "unavailable") {
    return "Regional observation data is unavailable, so the rating is using the general weather and season model.";
  }
  if (stats.totalObservations < 20) {
    return "There are too few nearby fungi observations to calibrate this region confidently.";
  }
  if (stats.recent14Observations >= 10) {
    return "Recent nearby fungi reports support the weather signal: the region appears active lately.";
  }
  if (stats.recent45Observations >= 8) {
    return "There are some recent regional fungi reports, so the model has empirical support beyond weather alone.";
  }
  if (stats.seasonalObservations < 20) {
    return "This month is historically quiet in nearby observations, so the model keeps the general score cautious.";
  }
  return "Historical nearby records support this season, but recent observation activity is limited.";
}

async function fetchRegionalObservationStats(latitude, longitude, dateString) {
  const month = String(new Date(`${dateString}T12:00:00`).getUTCMonth() + 1);
  try {
    const [totalObservations, seasonalObservations, recent45Observations, recent14Observations, researchRecent45Observations] =
      await Promise.all([
        fetchINaturalistCount(latitude, longitude),
        fetchINaturalistCount(latitude, longitude, { month }),
        fetchINaturalistCount(latitude, longitude, { d1: isoDaysAgo(45) }),
        fetchINaturalistCount(latitude, longitude, { d1: isoDaysAgo(14) }),
        fetchINaturalistCount(latitude, longitude, { d1: isoDaysAgo(45), quality_grade: "research" }),
      ]);
    const stats = {
      confidence: "",
      empiricalScore: 0,
      recent14Observations,
      recent45Observations,
      researchRecent45Observations,
      seasonalObservations,
      source: "iNaturalist",
      status: "available",
      totalObservations,
    };
    stats.empiricalScore = empiricalScoreForStats(stats);
    stats.confidence = confidenceForRegionalStats(stats);
    stats.summary = summarizeRegionalStats(stats);
    return stats;
  } catch (error) {
    console.error(error);
    return {
      confidence: "Unavailable",
      empiricalScore: 58,
      recent14Observations: 0,
      recent45Observations: 0,
      researchRecent45Observations: 0,
      seasonalObservations: 0,
      source: "iNaturalist",
      status: "unavailable",
      summary: summarizeRegionalStats(null),
      totalObservations: 0,
    };
  }
}

function normalizeWeather(payload) {
  return payload.daily.time.map((date, index) => ({
    date,
    expectedRainfall: payload.daily.precipitation_sum[index],
    maxTemp: payload.daily.temperature_2m_max[index],
    meanTemp: payload.daily.temperature_2m_mean[index],
    minTemp: payload.daily.temperature_2m_min[index],
    precipitation: payload.daily.precipitation_sum[index],
  }));
}

function findTodayIndex(days) {
  const today = new Date().toISOString().slice(0, 10);
  const index = days.findIndex((day) => day.date === today);
  return index >= 0 ? index : Math.min(7, days.length - 1);
}

function windowSlice(days, index, lookbackDays) {
  return days.slice(Math.max(0, index - lookbackDays), index + 1);
}

function scoreDay(days, index, todayIndex) {
  const target = days[index];
  const sevenDayWindow = windowSlice(days, index, 7);
  const threeDayWindow = windowSlice(days, index, 3);
  const rain7 = sum(sevenDayWindow.map((day) => day.precipitation));
  const rain72h = sum(threeDayWindow.map((day) => day.precipitation));
  const avgTemp = mean(threeDayWindow.map((day) => day.meanTemp));
  const nightlyMin = Math.min(...threeDayWindow.map((day) => day.minTemp));
  const diurnalRange = mean(threeDayWindow.map((day) => day.maxTemp - day.minTemp));

  const rainScore = rangeScore(rain7, 15, 45, 2, 90);
  const recentRainScore = rangeScore(rain72h, 4, 22, 0, 55);
  const tempScore = rangeScore(avgTemp, 8, 18, 1, 27);
  const nightScore = nightlyMin < -1 ? 0 : rangeScore(nightlyMin, 4, 13, -1, 20);
  const stabilityScore = rangeScore(diurnalRange, 6, 12, 2, 18);
  const season = getSeasonForDate(target.date, state.selected.latitude);
  const seasonScore = seasonScoreForDate(target.date, state.selected.latitude);
  const habitatScore = forestScore();
  const empiricalScore = state.regionalStats?.empiricalScore ?? 58;

  const score = Math.round(
    rainScore * 0.26 +
      recentRainScore * 0.13 +
      tempScore * 0.19 +
      nightScore * 0.1 +
      stabilityScore * 0.08 +
      seasonScore * 0.08 +
      habitatScore * 0.1 +
      empiricalScore * 0.06,
  );

  return {
    ...target,
    avgTemp,
    breakdown: {
      regional: Math.round(empiricalScore),
      habitat: habitatScore,
      moisture: Math.round(rainScore * 0.65 + recentRainScore * 0.35),
      nights: Math.round(nightScore),
      season: Math.round(seasonScore),
      stability: Math.round(stabilityScore),
      temperature: Math.round(tempScore),
    },
    confidence: confidenceForScore({
      habitatScore,
      rainScore,
      recentRainScore,
      regionalStats: state.regionalStats,
      targetIndex: index,
      todayIndex,
    }),
    diurnalRange,
    nightlyMin,
    rain7,
    rain72h,
    score: clamp(score, 0, 100),
    season,
    verdict: verdictForScore(score),
    reasons: buildReasons({ rain7, rain72h, avgTemp, nightlyMin, stabilityScore }),
  };
}

function getSelectedDay() {
  return state.scoredDays.find((day) => day.date === state.focusDate) ?? state.scoredDays[0] ?? null;
}

function setSelectedLocation(latitude, longitude, label, shouldMoveMap = true) {
  state.selected = { latitude, longitude, label };
  elements.locationInput.value = label;
  elements.placeLabel.textContent = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
  if (state.marker) state.marker.setLatLng([latitude, longitude]);
  if (shouldMoveMap && state.map) state.map.setView([latitude, longitude], Math.max(state.map.getZoom(), 9));
}

function buildSmoothPath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const controlX = (current.x + next.x) / 2;
    path += ` C ${controlX} ${current.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`;
  }
  return path;
}

function renderCombinedChart() {
  if (!state.allDays.length) {
    elements.combinedChart.innerHTML = `<div class="chart-empty">Timeline will appear here.</div>`;
    return;
  }

  const containerWidth = Math.round(elements.combinedChart.clientWidth || 920);
  const mobile = containerWidth <= 620;
  const tablet = containerWidth > 620 && containerWidth <= 900;
  const width = containerWidth;
  const height = mobile ? 332 : tablet ? 306 : 292;
  const margin = mobile
    ? { top: 14, right: 36, bottom: 62, left: 36 }
    : tablet
      ? { top: 16, right: 62, bottom: 54, left: 58 }
      : { top: 18, right: 88, bottom: 42, left: 74 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const visibleSlots = 15;
  const slotWidth = plotWidth / visibleSlots;
  const tempValues = state.allDays.flatMap((day) => [day.minTemp, day.meanTemp, day.maxTemp]);
  const tempMin = Math.floor(Math.min(...tempValues) - 2);
  const tempMax = Math.ceil(Math.max(...tempValues) + 2);
  const rainMax = Math.max(...state.allDays.map((day) => day.expectedRainfall), 4);
  const rainTop = Math.ceil(rainMax / 5) * 5;
  const barWidth = Math.max(14, slotWidth - 10);
  const centerIndex = 7;
  const todayDate = new Date().toISOString().slice(0, 10);
  const focusIndex = state.allDays.findIndex((day) => day.date === state.focusDate);
  const clipId = `timeline-clip-${state.selected.latitude.toFixed(3)}-${state.selected.longitude.toFixed(3)}`.replace(
    /[^a-zA-Z0-9_-]/g,
    "",
  );
  const todayIndex = state.allDays.findIndex((day) => day.date === todayDate);

  const xAt = (index) => margin.left + slotWidth / 2 + index * slotWidth;
  const barXAt = (index) => xAt(index) - barWidth / 2;
  const yTempAt = (value) => margin.top + plotHeight - ((value - tempMin) / Math.max(tempMax - tempMin, 8)) * plotHeight;
  const yRainAt = (value) => margin.top + plotHeight - (value / rainTop) * plotHeight;

  const minPoints = state.allDays.map((day, index) => ({ x: xAt(index), y: yTempAt(day.minTemp) }));
  const avgPoints = state.allDays.map((day, index) => ({ x: xAt(index), y: yTempAt(day.meanTemp) }));
  const maxPoints = state.allDays.map((day, index) => ({ x: xAt(index), y: yTempAt(day.maxTemp) }));
  const centerX = xAt(centerIndex);
  const leftPinnedTranslate = margin.left + slotWidth / 2 - xAt(0);
  const rightPinnedTranslate = width - margin.right - slotWidth / 2 - xAt(state.allDays.length - 1);
  const unclampedTranslate = focusIndex >= 0 ? centerX - xAt(focusIndex) : 0;
  const targetTranslate = clamp(unclampedTranslate, rightPinnedTranslate, leftPinnedTranslate);
  const fromUnclamped = state.animationFromIndex !== null ? centerX - xAt(state.animationFromIndex) : targetTranslate;
  const fromTranslate = clamp(fromUnclamped, rightPinnedTranslate, leftPinnedTranslate);
  const markerX = focusIndex >= 0 ? xAt(focusIndex) + targetTranslate : centerX;
  const pastShadeTrackX = todayIndex >= 0 ? xAt(todayIndex) - slotWidth / 2 : null;

  const xLabelStep = mobile ? 4 : tablet ? 2 : 1;
  const yTickCount = mobile ? 4 : 5;

  elements.combinedChart.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Combined weather timeline">
      <defs>
        <clipPath id="${clipId}">
          <rect x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}"></rect>
        </clipPath>
      </defs>
      ${Array.from({ length: yTickCount }, (_, index) => {
        const ratio = yTickCount === 1 ? 0 : index / (yTickCount - 1);
        const y = margin.top + ratio * plotHeight;
        const tempValue = Math.round(tempMax - ratio * (tempMax - tempMin));
        const rainValue = Math.round(rainTop - ratio * rainTop);
        return `
          <line class="grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>
          <text class="y-label" x="${margin.left - 16}" y="${y + 4}" text-anchor="end">${tempValue} C</text>
          <text class="y-label" x="${width - margin.right + 16}" y="${y + 4}" text-anchor="start">${rainValue} mm</text>
        `;
      }).join("")}
      <g clip-path="url(#${clipId})">
        <g class="combined-chart-track" style="transform: translateX(${fromTranslate}px); transform-box: fill-box; transform-origin: center;">
          ${
            pastShadeTrackX !== null
              ? `<rect class="past-window-shade" x="${xAt(0) - slotWidth / 2}" y="${margin.top}" width="${Math.max(0, pastShadeTrackX - (xAt(0) - slotWidth / 2))}" height="${plotHeight}"></rect>`
              : ""
          }
        ${state.allDays.map((day, index) => `
          <rect
            class="${index === focusIndex ? "combined-bar selected" : "combined-bar"}"
            x="${barXAt(index)}"
            y="${yRainAt(day.expectedRainfall)}"
            rx="4"
            ry="4"
            width="${barWidth}"
            height="${Math.max(2, margin.top + plotHeight - yRainAt(day.expectedRainfall))}"
          ></rect>
        `).join("")}
        <path class="combined-line-min" d="${buildSmoothPath(minPoints)}"></path>
        <path class="combined-line-avg" d="${buildSmoothPath(avgPoints)}"></path>
        <path class="combined-line-max" d="${buildSmoothPath(maxPoints)}"></path>
        ${minPoints.map((point, index) => `<circle class="combined-point min" cx="${point.x}" cy="${point.y}" r="${index === focusIndex ? 5 : 4}"></circle>`).join("")}
        ${avgPoints.map((point, index) => `<circle class="combined-point avg" cx="${point.x}" cy="${point.y}" r="${index === focusIndex ? 5 : 4}"></circle>`).join("")}
        ${maxPoints.map((point, index) => `<circle class="combined-point max" cx="${point.x}" cy="${point.y}" r="${index === focusIndex ? 5 : 4}"></circle>`).join("")}
        ${state.allDays.map((day, index) => {
          if (index % xLabelStep !== 0 && index !== focusIndex && index !== state.allDays.length - 1) return "";
          if (mobile) {
            const label = formatTimelineLabelParts(day.date);
            return `
              <text class="x-label x-label-mobile" x="${xAt(index)}" y="${height - 26}" text-anchor="middle">
                <tspan x="${xAt(index)}" dy="0">${label.weekday}</tspan>
                <tspan class="x-label-sub" x="${xAt(index)}" dy="12">${label.monthDay}</tspan>
              </text>
            `;
          }
          return `<text class="x-label" x="${xAt(index)}" y="${height - 12}" text-anchor="middle">${formatTimelineLabel(day.date)}</text>`;
        }).join("")}
        </g>
      </g>
      <line class="target-marker" x1="${markerX}" y1="${margin.top}" x2="${markerX}" y2="${margin.top + plotHeight}"></line>
    </svg>
  `;
  state.chartLayout = {
    focusIndex,
    slotWidth,
    targetTranslate,
    xAt,
  };
  const track = elements.combinedChart.querySelector(".combined-chart-track");
  if (track) {
    requestAnimationFrame(() => {
      track.style.transform = `translateX(${targetTranslate}px)`;
    });
  }
  state.animationFromIndex = null;
}

function renderDaySelector() {
  if (!state.scoredDays.length) {
    elements.daySelector.innerHTML = "";
    return;
  }
  elements.daySelector.innerHTML = state.scoredDays
    .map((day) => {
      const parts = formatTimelineLabelParts(day.date);
      const isActive = day.date === state.focusDate;
      return `
        <button class="day-chip${isActive ? " is-active" : ""}" type="button" data-day="${day.date}" aria-pressed="${isActive}">
          <span>${parts.weekday}</span>
          <strong>${parts.monthDay}</strong>
        </button>
      `;
    })
    .join("");
}

function renderSelectedDay() {
  const selectedDay = getSelectedDay();
  if (!selectedDay) return;

  const label = formatTimelineLabel(selectedDay.date);
  elements.summaryLabel.textContent = label;
  elements.todayScore.textContent = `${selectedDay.score}/100`;
  elements.todayVerdict.textContent = selectedDay.verdict;
  elements.confidenceBadge.textContent = selectedDay.confidence;
  elements.analysisTitle.textContent = `${label} evidence`;
  elements.analysisCopy.textContent = "Tap any day to compare conditions while keeping the selected day centered.";
  elements.seasonBadge.textContent = `${selectedDay.season} season`;
  elements.detailDateLabel.textContent = label;
  elements.detailScore.textContent = `${selectedDay.score}/100`;
  elements.detailVerdict.textContent = selectedDay.verdict;
  elements.detailCopy.textContent = selectedDay.reasons.join(" ");
  elements.detailMetrics.innerHTML = `
    <div class="metric-pill"><span>Min temp</span><strong>${selectedDay.minTemp.toFixed(1)} C</strong></div>
    <div class="metric-pill"><span>Avg temp</span><strong>${selectedDay.meanTemp.toFixed(1)} C</strong></div>
    <div class="metric-pill"><span>Max temp</span><strong>${selectedDay.maxTemp.toFixed(1)} C</strong></div>
    <div class="metric-pill"><span>Rainfall</span><strong>${selectedDay.expectedRainfall.toFixed(1)} mm</strong></div>
  `;
  elements.breakdownStrip.innerHTML = Object.entries(selectedDay.breakdown)
    .map(([key, value]) => `<div class="breakdown-pill"><span>${key}</span><strong>${value}</strong></div>`)
    .join("");
  renderRegionalStats();
  renderDaySelector();
}

function renderRegionalStats() {
  const stats = state.regionalStats;
  if (!stats) {
    elements.regionalConfidence.textContent = "Loading";
    elements.regionalMetrics.innerHTML = "";
    elements.regionalCopy.textContent = "Nearby observation data will lightly calibrate the broad conditions read.";
    return;
  }
  elements.regionalConfidence.textContent = stats.confidence;
  elements.regionalMetrics.innerHTML = `
    <div class="metric-pill"><span>Recent 14d</span><strong>${stats.recent14Observations}</strong></div>
    <div class="metric-pill"><span>Recent 45d</span><strong>${stats.recent45Observations}</strong></div>
    <div class="metric-pill"><span>This month</span><strong>${stats.seasonalObservations}</strong></div>
    <div class="metric-pill"><span>Regional</span><strong>${Math.round(stats.empiricalScore)}</strong></div>
  `;
  elements.regionalCopy.textContent = `${stats.summary} Source: ${stats.source}; 50 km radius.`;
}

function moveFocus(step) {
  const index = state.scoredDays.findIndex((day) => day.date === state.focusDate);
  if (index < 0) return;
  const next = clamp(index + step, 0, state.scoredDays.length - 1);
  if (next === index) return;
  state.animationFromIndex = state.allDays.findIndex((day) => day.date === state.focusDate);
  state.focusDate = state.scoredDays[next].date;
  renderCombinedChart();
  renderSelectedDay();
}

function setFocusDate(date) {
  const nextIndex = state.scoredDays.findIndex((day) => day.date === date);
  if (nextIndex < 0 || state.scoredDays[nextIndex].date === state.focusDate) return;
  state.animationFromIndex = state.allDays.findIndex((day) => day.date === state.focusDate);
  state.focusDate = state.scoredDays[nextIndex].date;
  renderCombinedChart();
  renderSelectedDay();
}

function openWeightingModal() {
  elements.weightingModal.hidden = false;
  requestAnimationFrame(() => {
    elements.weightingModal.classList.add("is-open");
  });
}

function closeWeightingModal() {
  elements.weightingModal.classList.remove("is-open");
  window.setTimeout(() => {
    if (!elements.weightingModal.classList.contains("is-open")) elements.weightingModal.hidden = true;
  }, 220);
}

function hideSuggestions() {
  state.suggestions = [];
  elements.locationSuggestions.hidden = true;
  elements.locationSuggestions.innerHTML = "";
}

function chooseSuggestion(index) {
  const choice = state.suggestions[index];
  if (!choice) return;
  state.selectedSuggestion = choice;
  elements.locationInput.value = choice.label;
  hideSuggestions();
}

function renderSuggestions() {
  if (!state.suggestions.length) {
    hideSuggestions();
    return;
  }
  elements.locationSuggestions.hidden = false;
  elements.locationSuggestions.innerHTML = state.suggestions
    .map((suggestion, index) => `
      <button class="suggestion-option" type="button" data-suggestion-index="${index}">
        <strong>${suggestion.label.split(",")[0]}</strong>
        <span>${suggestion.label}</span>
      </button>
    `)
    .join("");
}

function queueSuggestionSearch(value) {
  const query = value.trim();
  state.selectedSuggestion = null;

  if (state.suggestionTimer) window.clearTimeout(state.suggestionTimer);

  if (!query || parseCoordinateInput(query)) {
    hideSuggestions();
    return;
  }

  const requestId = ++state.suggestionRequestId;
  state.suggestionTimer = window.setTimeout(async () => {
    try {
      const results = await searchLocations(query, 6);
      if (requestId !== state.suggestionRequestId) return;
      state.suggestions = results;
      renderSuggestions();
    } catch (error) {
      console.error(error);
      hideSuggestions();
    }
  }, 220);
}

async function resolveLocationInput(value) {
  if (state.selectedSuggestion && state.selectedSuggestion.label === value.trim()) return state.selectedSuggestion;
  const coordinates = parseCoordinateInput(value);
  if (coordinates) return coordinates;
  return geocodeLocation(value.trim());
}

async function analyzeLocation(location, shouldMoveMap = true) {
  setSelectedLocation(location.latitude, location.longitude, location.label, shouldMoveMap);
  setStatus("Loading");
  elements.combinedChart.innerHTML = `<div class="loading">Building the weather timeline...</div>`;
  elements.detailCopy.textContent = "Refreshing weather context for the selected location.";
  state.regionalStats = null;
  renderRegionalStats();

  try {
    const today = new Date().toISOString().slice(0, 10);
    const [payload, regionalStats] = await Promise.all([
      fetchWeather(location.latitude, location.longitude),
      fetchRegionalObservationStats(location.latitude, location.longitude, today),
    ]);
    state.regionalStats = regionalStats;
    const days = normalizeWeather(payload);
    const todayIndex = findTodayIndex(days);
    state.allDays = days.map((_, index) => scoreDay(days, index, todayIndex));
    state.scoredDays = state.allDays.slice(todayIndex, todayIndex + 11);
    state.focusDate = state.scoredDays[0]?.date ?? null;
    renderCombinedChart();
    renderSelectedDay();
    elements.contextCopy.textContent = `${state.forestType.replace("-", " ")} forest gently modifies the broad conditions signal.`;
    setStatus("Updated");
  } catch (error) {
    console.error(error);
    setStatus("Error");
    elements.combinedChart.innerHTML = `<div class="chart-empty">Weather data could not be loaded. Check the location and connection.</div>`;
    elements.detailCopy.textContent = "Timeline data is unavailable right now.";
  }
}

function initMap() {
  state.map = L.map("map", { zoomControl: true }).setView([state.selected.latitude, state.selected.longitude], 9);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 18,
  }).addTo(state.map);

  const markerIcon = L.divIcon({
    className: "",
    html: `<div class="fungi-pin"></div>`,
    iconAnchor: [11, 26],
    iconSize: [22, 30],
  });

  state.marker = L.marker([state.selected.latitude, state.selected.longitude], {
    draggable: true,
    icon: markerIcon,
  }).addTo(state.map);

  state.map.on("click", (event) => {
    analyzeLocation({
      label: `${event.latlng.lat.toFixed(4)}, ${event.latlng.lng.toFixed(4)}`,
      latitude: event.latlng.lat,
      longitude: event.latlng.lng,
    }, false);
  });

  state.marker.on("dragend", () => {
    const point = state.marker.getLatLng();
    analyzeLocation({
      label: `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`,
      latitude: point.lat,
      longitude: point.lng,
    }, false);
  });
}

elements.coordinateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const location = await resolveLocationInput(elements.locationInput.value);
    hideSuggestions();
    analyzeLocation(location);
  } catch (error) {
    console.error(error);
    setStatus("Not found");
  }
});

elements.locationInput.addEventListener("input", () => queueSuggestionSearch(elements.locationInput.value));
elements.locationInput.addEventListener("blur", () => window.setTimeout(hideSuggestions, 120));
elements.locationSuggestions.addEventListener("click", (event) => {
  const option = event.target.closest("[data-suggestion-index]");
  if (!option) return;
  chooseSuggestion(Number.parseInt(option.dataset.suggestionIndex, 10));
});
elements.sampleButton.addEventListener("click", () => analyzeLocation({ label: "Darien, CT", latitude: 41.0772, longitude: -73.4687 }));
elements.useLocationButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    setStatus("No GPS");
    return;
  }
  setStatus("Locating");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      analyzeLocation({
        label: "My location",
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    },
    () => setStatus("Denied"),
    { enableHighAccuracy: true, maximumAge: 300000, timeout: 10000 },
  );
});
elements.forestTypeSelect.addEventListener("change", () => {
  state.forestType = elements.forestTypeSelect.value;
  analyzeLocation(state.selected, false);
});
elements.daySelector.addEventListener("click", (event) => {
  const button = event.target.closest("[data-day]");
  if (!button) return;
  setFocusDate(button.dataset.day);
});
elements.combinedChart.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveFocus(-1);
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    moveFocus(1);
  }
});
elements.combinedChart.addEventListener("touchstart", (event) => {
  state.touchStartX = event.changedTouches[0]?.clientX ?? null;
});
elements.combinedChart.addEventListener("touchend", (event) => {
  if (state.touchStartX === null) return;
  const endX = event.changedTouches[0]?.clientX ?? state.touchStartX;
  const delta = endX - state.touchStartX;
  if (Math.abs(delta) > 24) moveFocus(delta < 0 ? 1 : -1);
  state.touchStartX = null;
});
elements.combinedChart.addEventListener("click", (event) => {
  if (!state.chartLayout || !state.allDays.length) return;
  const rect = elements.combinedChart.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const trackX = localX - state.chartLayout.targetTranslate;
  const firstX = state.chartLayout.xAt(0);
  const index = Math.round((trackX - firstX) / state.chartLayout.slotWidth);
  const clamped = clamp(index, 0, state.allDays.length - 1);
  const clicked = state.allDays[clamped];
  if (!clicked) return;
  const inSelectableRange = state.scoredDays.some((day) => day.date === clicked.date);
  if (inSelectableRange) setFocusDate(clicked.date);
});
elements.openWeightingButton.addEventListener("click", openWeightingModal);
elements.closeWeightingButton.addEventListener("click", closeWeightingModal);
elements.weightingModal.addEventListener("click", (event) => {
  if (event.target === elements.weightingModal) closeWeightingModal();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.weightingModal.hidden) closeWeightingModal();
});
window.addEventListener("resize", renderCombinedChart);

initMap();
analyzeLocation(state.selected);
