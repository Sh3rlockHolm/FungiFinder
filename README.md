# FungiFinder

FungiFinder is an early mushroom-foraging conditions app. The current version is a
static browser prototype that lets a user choose a location by browser geolocation,
manual coordinates, or a map pin, then scores present-day conditions through the
next week using recent and forecast weather.

The app is intentionally narrow right now: it establishes a baseline conditions
rating for a selected location. Larger product directions, field workflows, saved
spots, routing, social layers, or species-specific behavior should be discussed at
the user-experience level before implementation.

## Current Data Sources

- Weather: Open-Meteo forecast API
- Elevation: Open-Meteo Elevation API
- Regional observations: iNaturalist observations API
- Map: OpenStreetMap tiles through Leaflet
- Inputs: daily precipitation sum, daily mean temperature, daily maximum
  temperature, daily minimum temperature, selected forest type, elevation,
  nearby fungi observation counts
- Window: 7 past days plus today and 7 forecast days
- API keys: none required

Open-Meteo is a strong first source because it is easy to prototype with and can
serve both web and future mobile clients. Later versions should consider a
dedicated weather provider if higher-resolution rainfall history becomes critical.

## Scoring Model v0.4

Each target day is scored from a rolling window ending on that day:

- 26% previous 7-day rainfall
- 13% recent 72-hour rainfall
- 19% recent average temperature
- 10% recent nightly minimum temperature
- 8% recent day-night stability
- 8% seasonality
- 7% forest type
- 3% elevation
- 6% empirical regional activity from nearby fungi observations

Initial assumptions:

- Best weekly rainfall: 15-45 mm
- Best recent rainfall: 4-22 mm over roughly 72 hours
- Best average temperature: 8-18 C
- Frost below about -1 C is a strong negative signal
- Moderate day-night spread is usually better than extreme swings
- Autumn is strongest in the general case, with spring as a secondary season
- Forest type and elevation are gentle modifiers, not dominant inputs
- Nearby observations are used only as a broad regional activity signal; the app
  does not surface likely species or "potential finds" yet

This is intentionally general. It estimates broad fruiting conditions, not
species-specific abundance or safety.

## Empirical Regional Signal

For the selected region, the app queries nearby iNaturalist fungi observations
within a 50 km radius:

- recent 14-day observation count
- recent 45-day observation count
- all historical observations in the current calendar month
- recent research-grade observation count

This produces a conservative regional activity score and data-confidence label.
If observation data is sparse or unavailable, the app falls back to the general
weather/season baseline rather than pretending to know more than it does.

## Product Discussion Needed

Before adding major workflows, decide what FungiFinder is actually trying to be:

- A simple local conditions rating?
- A trip-planning assistant?
- A species-aware research tool?
- A personal field journal?
- A community/reporting product?

Those are different products with different UX, trust boundaries, data needs, and
liability concerns. The current prototype should stay focused until that purpose is
chosen deliberately.

## Suggested Architecture

The best long-term shape is a shared TypeScript domain core:

- `weather`: provider adapters and normalized daily weather records
- `terrain`: elevation and future terrain context
- `predictor`: scoring model, species profiles, regional seasonality
- `ui-web`: browser/desktop interface
- `ui-mobile`: Expo/React Native interface for iOS and Android

The current prototype keeps the predictor logic isolated in `src/app.js` so it can
be lifted into a shared package when the app moves to React Native.

## Running Locally

Any static web server can host this folder. For example:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:4173
```
