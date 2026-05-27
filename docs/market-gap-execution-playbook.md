# FungiFinder Market-Gap Execution Playbook

## Goal
Validate and win a clear gap in mycological foraging tools:
- reliable day-level foraging timing
- local confidence and transparency
- feedback loop that gets smarter from field outcomes

## Target User Segments
1. Beginner hobby foragers:
- Need confidence and simple "go / wait" guidance.
2. Intermediate weekend foragers:
- Need trip timing and location consistency.
3. Community educators / club leaders:
- Need evidence-backed planning and shareable guidance.

## Core Positioning
FungiFinder should be the "timing engine" for mushroom foraging, not a species ID app.
- Most tools answer "what is this mushroom?"
- FungiFinder answers "is today worth going out, and why?"

## 30-Day Pilot Plan
1. Recruit 30-50 pilot users from:
- local mushroom clubs
- Reddit communities
- iNaturalist heavy users
2. Require at least 6 field check-ins per user over 30 days.
3. Capture each check-in with:
- location
- chosen day score
- found outcome (existing 4-level feedback)
- optional notes and photo link

## Product Metrics That Prove the Gap
- Activation: user gives first field feedback within 7 days.
- Retention: user logs feedback in 3 different weeks.
- Trust: share of users saying score matched real conditions ("Several" or "A ton!").
- Lift: improvement in score-to-outcome alignment over time.

## Near-Term Build Priorities
1. Feedback quality:
- add optional "trip duration" and "forest type" to feedback payload.
2. Trust UX:
- show a simple confidence explainer near each score.
3. User value loop:
- weekly summary card:
  - "Best predicted day"
  - "What users actually found"
4. Community wedge:
- enable shareable day cards for club/group planning.

## Data and Ops Workflow
1. Keep using the shared remote feedback endpoint.
2. Export weekly feedback JSON.
3. Compute weekly:
- score bucket vs outcome conversion
- location-level reliability
- false positives and false negatives
4. Log decisions made from data in a changelog.

## Decision Gates
- Continue consumer app focus if:
  - 35%+ weekly retained pilots
  - 60%+ "Several/A ton!" outcomes on days scored 70+
- Pivot to B2B/community tooling if:
  - clubs/leaders show stronger retention than solo users
  - group planning/sharing is requested repeatedly

## Risks to Manage
- Safety and liability:
  - keep clear "foraging conditions only, not edibility advice" framing.
- Regional climate variance:
  - avoid overfitting early model changes to one geography.
- Sparse feedback:
  - incentivize lightweight check-ins after every trip.

## Weekly Cadence
1. Monday: review pilot metrics and error buckets.
2. Tuesday: ship one model/UX change.
3. Thursday: run user interviews (3-5 users).
4. Friday: publish changelog and next experiment.

