const SUPPORTED_LOCALES = ["en", "de", "ru"];
const DEFAULT_LOCALE = "en";
const STORAGE_KEY = "fungifinder_locale_v1";
const LOCALE_MAP = {
  en: "en-US",
  de: "de-DE",
  ru: "ru-RU",
};

const catalogUrls = {
  en: new URL("./i18n/en.json", import.meta.url),
  de: new URL("./i18n/de.json", import.meta.url),
  ru: new URL("./i18n/ru.json", import.meta.url),
};

const catalogs = new Map();
const listeners = new Set();
let activeLocale = DEFAULT_LOCALE;

function normalizeLocale(locale) {
  const candidate = String(locale || "").toLowerCase();
  if (SUPPORTED_LOCALES.includes(candidate)) return candidate;
  const prefix = candidate.split("-")[0];
  return SUPPORTED_LOCALES.includes(prefix) ? prefix : DEFAULT_LOCALE;
}

function browserPreferredLocale() {
  const candidates = Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages : [navigator.language];
  for (const candidate of candidates) {
    const normalized = normalizeLocale(candidate);
    if (SUPPORTED_LOCALES.includes(normalized)) return normalized;
  }
  return DEFAULT_LOCALE;
}

function readStoredLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? normalizeLocale(stored) : null;
  } catch {
    return null;
  }
}

function persistLocale(locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore persistence errors
  }
}

async function loadCatalog(locale) {
  const normalized = normalizeLocale(locale);
  if (catalogs.has(normalized)) return catalogs.get(normalized);
  const response = await fetch(catalogUrls[normalized]);
  if (!response.ok) throw new Error(`Failed to load catalog for ${normalized}`);
  const catalog = await response.json();
  catalogs.set(normalized, catalog);
  return catalog;
}

function getCatalogValue(catalog, key) {
  return key.split(".").reduce((value, part) => (value && typeof value === "object" ? value[part] : undefined), catalog);
}

function interpolate(template, vars = {}) {
  return String(template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, token) => {
    const value = token.split(".").reduce((current, part) => (current && typeof current === "object" ? current[part] : undefined), vars);
    return value === undefined || value === null ? "" : String(value);
  });
}

export function t(key, vars = {}) {
  const activeCatalog = catalogs.get(activeLocale) || {};
  const fallbackCatalog = catalogs.get(DEFAULT_LOCALE) || {};
  const value = getCatalogValue(activeCatalog, key) ?? getCatalogValue(fallbackCatalog, key);
  if (value === undefined) return key;
  return typeof value === "string" ? interpolate(value, vars) : value;
}

export function getLocale() {
  return activeLocale;
}

export function getIntlLocale(locale = activeLocale) {
  return LOCALE_MAP[normalizeLocale(locale)] || LOCALE_MAP[DEFAULT_LOCALE];
}

export function formatDate(value, options) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(getIntlLocale(), options).format(date);
}

export function formatDateToParts(value, options) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(getIntlLocale(), options).formatToParts(date);
}

export function formatNumber(value, options) {
  return new Intl.NumberFormat(getIntlLocale(), options).format(value);
}

export function applyTranslations(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-html]").forEach((element) => {
    element.innerHTML = t(element.dataset.i18nHtml);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
  });
  root.querySelectorAll("[data-i18n-title]").forEach((element) => {
    element.setAttribute("title", t(element.dataset.i18nTitle));
  });
  root.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  });
  document.title = t("meta.title");
  document.documentElement.lang = activeLocale;
}

export function onLocaleChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function setLocale(locale) {
  const normalized = normalizeLocale(locale);
  await loadCatalog(DEFAULT_LOCALE);
  await loadCatalog(normalized);
  activeLocale = normalized;
  persistLocale(normalized);
  applyTranslations(document);
  listeners.forEach((listener) => listener(normalized));
}

export async function initI18n() {
  await loadCatalog(DEFAULT_LOCALE);
  const initialLocale = readStoredLocale() || browserPreferredLocale() || DEFAULT_LOCALE;
  await setLocale(initialLocale);
  return activeLocale;
}

export { DEFAULT_LOCALE, SUPPORTED_LOCALES };
