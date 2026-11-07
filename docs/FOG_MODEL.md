# FalconAero fog nowcast model card (OMDB, Dubai International)

> **Status:** hackathon prototype for decision support only. It is **not** a certified meteorological
> forecast. A human forecaster, ATCO or airport duty manager stays in the loop and the official
> METAR, TAF and NCM warnings take precedence.

| | |
|---|---|
| Model | L2-regularised **logistic regression** on standardised features, trained in plain Node.js with full-batch gradient descent (Adam step sizes) |
| Primary target | Fog onset: **prevailing visibility < 1000 m in any METAR or SPECI within the next 60 min**, given no fog at time *t* |
| Secondary models | Fog onset within 120 min, and fog **persistence** over the next 60 min when fog is already present |
| Station | OMDB, Dubai International. OMAA (Abu Dhabi) and OMDW (Al Maktoum) are used for climatology, the network test and the persistence model |
| Training data | 2015-01 to 2022-12 |
| Test data | 2023-01 to 2025-12, a strict time split with no shuffling |
| Browser artefact | `js/fogmodel.js` (`FA.fogModel`), auto-generated |
| Reproduce | `node tools/fetch_metars.mjs` then `node tools/train_fog_model.mjs` (Node ≥ 18, no dependencies, about 15 min) |

## 1. Data source

- **Iowa Environmental Mesonet (IEM) ASOS/AWOS/METAR archive**, Iowa State University. It archives
  international METARs from the global GTS feed. Documentation:
  <https://mesonet.agron.iastate.edu/request/download.phtml>
- The script fetches one request per station-year, for example:
  `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=OMDB&data=tmpc&data=dwpc&data=relh&data=sknt&data=drct&data=vsby&data=wxcodes&data=metar&year1=2015&month1=1&day1=1&year2=2016&month2=1&day2=1&tz=Etc/UTC&format=onlycomma&latlon=no&missing=M&trace=T&direct=no&report_type=3&report_type=4`
  (report_type 3 = routine METAR, 4 = SPECI)
- The raw files are stored gzip-compressed in `data/raw/<ICAO>_<YEAR>.csv.gz`. All 33 files total 5.5 MB.

| Station | Reports 2015–2025 | On-the-hour METARs | Reports with vis < 1000 m | of which sand/dust | of which rain/TS | **Fog-type** | Reports with RVR groups |
|---|---|---|---|---|---|---|---|
| OMDB | 109,786 | 96,090 | 331 | 45 | 10 | **276** | 539 |
| OMAA | 100,422 | 96,073 | 856 | 30 | 3 | **823** | 1,585 |
| OMDW | 106,524 | 95,928 | 854 | 107 | 5 | **742** | 1,359 |

Data notes:

- Hourly coverage is better than 99.6 % for every year at every station.
- Before 2024, IEM holds OMDB's **on-the-hour** METARs plus SPECIs. It does not hold the :30
  half-hourly METARs, which only appear from 2024–2025. The effective resolution is therefore
  hourly, refined by SPECIs during fog. Section 3 explains how the label is kept consistent across years.
- Visibility comes from the raw METAR text, not from IEM's `vsby` field. The parser reads the
  4-digit group (`0150`, `9999` → 10 km, `CAVOK` → 10 km), the directional minimum (`0800E`), RVR
  groups (`R12L/0300D`, `P2000`/`M0050`) and present weather before any trend group. Only 0.1 % of
  reports fell back to the statute-mile `vsby` field.

## 2. Definition of "fog"

A report counts as **fog-type low visibility** when prevailing visibility is below 1000 m, **unless**
the reduction is clearly caused by something else:

- sand or dust (`DU`, `SA`, `DS`, `SS`, `PO`) with no `FG` or `BR`, or
- precipitation or thunderstorm (`RA`, `DZ`, `TS`, …) with no `FG` or `BR`. Example: the 16 April 2024 storm.

`BCFG` or `PRFG` with prevailing visibility ≥ 1000 m is **not** counted. Prevailing visibility is the
operational criterion.

## 3. Dataset and target

- **One sample per on-the-hour METAR** at time *t*. OMDB yields 95,770 samples with a verifying observation.
- **Label for 60 min:** 1 if any report (METAR or SPECI) in (t, t+60 min] is fog-type. Routine :30
  METARs, which exist only in 2024–2025, are excluded from the label pool so the label means the same
  thing in the training and test years. Samples are dropped when there is no report in [t+45, t+60] min.
- **Label for 120 min:** the same rule over (t, t+120 min].
- **Onset vs persistence.** Rows with fog already present at *t* (157 OMDB rows) are removed from the
  onset models. Otherwise the model would mostly learn "fog now ⇒ fog soon", which is trivial and
  useless for early warning. Those rows train a separate **persistence** model. `predict()` switches to
  it automatically when `visM < 1000`.

## 4. Features

All features use only information available at time *t*. In the browser, missing values are imputed with
the training mean, which is 0 after standardisation.

| Key | Definition | Raw input in `predict()` |
|---|---|---|
| `dpd` | T − Td (°C) | `tempC`, `dewC` |
| `dpdLow` | max(0, 3 − (T−Td)), a near-saturation hinge | `tempC`, `dewC` |
| `rh` | Relative humidity (%) from IEM. If missing, computed from T and Td (Magnus) | `rh` |
| `wind` | Wind speed (kt) | `windKt` |
| `windSin`, `windCos` | Unit vector of wind direction. Set to 0 when calm or VRB | `windDir` |
| `hourSin`, `hourCos` | Local hour (UTC+4) on a circle | `localHour` |
| `monthSin`, `monthCos` | Month on a circle (seasonality) | `month` |
| `logVis` | log10 of visibility in m, clipped to 50–10,000 | `visM` |
| `visTrend` | log10(vis now / vis 1 h ago) | `visTrend1h` = vis now − vis 1 h ago (m) |
| `dpdTrend2h` | (T−Td) now − (T−Td) 2 h ago | `dpdTrend2h` |
| `tempDrop3h` | T 3 h ago − T now (positive = cooling) | `tempDrop3h` |
| `stOMAA`, `stOMDW` | Station offsets. Used only in the pooled persistence model (OMDB = 0) | `station` |

## 5. Training and model selection

- **Split.** Train on 2015–2022 and test on 2023–2025. Inside the training period, 2015–2020 is
  inner-train and **2021–2022 is validation**. The test years were not used for any choice.
- **Hyper-parameters chosen on validation** by OMDB log-loss over this grid:
  - training pool: OMDB only, or OMDB + OMAA + OMDW with station offsets
  - feature set: with or without the `dpdLow` hinge
  - λ ∈ {1e-5, 1e-4, 1e-3}
- **Chosen configurations:**
  - Onset models (60 and 120 min): **OMDB-only, with hinge, λ = 1e-5**. The pooled variants were within
    1 % on validation log-loss.
  - Persistence model: **pooled 3-station, λ = 1e-3**. OMDB alone has only about 150 fog-at-t rows.
- **Class imbalance.** The positive rate is about 0.1 %. The model is trained **unweighted**, so its
  probabilities stay calibrated. Rarity is handled with the **operating threshold**, which maximises
  F1 on the training set only: 0.10 for 60 min and 0.15 for 120 min.
- **Optimiser.** Full-batch gradient descent with Adam step sizes on mean log-loss + λ/2‖w‖², with an
  unpenalised intercept. It stops when the largest gradient component is below 1e-7 or after 4,000 iterations.
- **Integrity check.** After writing `js/fogmodel.js`, the script loads it and checks that
  `FA.fogModel.predict()` reproduces the pipeline probabilities. The maximum |Δp| is about 3e-6, from rounding.

## 6. Results on the held-out test set (2023–2025)

> **Read this first.** 2023–2025 was an unusually fog-poor period at OMDB: 2, 1 and 2 fog days, against
> about 7 per year in 2015–2022. The OMDB test set therefore contains only **6 onset events (60 min)**
> and **11 (120 min)**. Every OMDB number below has wide uncertainty, so 95 % day-block bootstrap
> intervals are shown. The three-station "network" test, with 61 events, is a more stable check of how
> the same OMDB-trained model transfers.

### 6.1 Fog onset within 60 min (primary model)

| Metric | OMDB test | 3-station network test |
|---|---|---|
| Samples / onset events | 26,245 / 6 | 78,558 / 61 |
| Base rate | 0.023 % | 0.078 % |
| **AUC-ROC** | **0.9998** (95% CI 0.9996–1) | 0.981 (95% CI 0.946–0.998) |
| **PR-AUC (average precision)** | **0.534** (95% CI 0.185–0.877) | 0.182 (95% CI 0.120–0.290) |
| Brier score | 0.0001583 (climatology 0.0002362) | 0.0007855 (climatology 0.00078) |
| Brier skill vs climatology | **+0.33** | −0.01 (over-confident at OMAA/OMDW) |
| Threshold | 0.10 | 0.10 |
| Hits / false alarms / misses | 5 / 11 / 1 | 39 / 265 / 22 |
| Precision / Recall (POD) / F1 | 0.31 / 0.83 / 0.45 | 0.13 / 0.64 / 0.21 |
| CSI | 0.29 | 0.12 |

**Baselines, all fitted on 2015–2022 OMDB and scored on the same OMDB test rows:**

| Baseline | AUC | PR-AUC | Comment |
|---|---|---|---|
| Climatology P(fog onset \| month, local hour) | 0.697 | 0.0025 | "Fog season, early morning" alone |
| Forecaster rule of thumb: rank by small T−Td | 0.996 | 0.163 | Strong, because most hours are clearly dry |
| Persistence (no fog now ⇒ no fog) | 0.5 | — | Detects nothing (F1 = 0) by construction for onset |
| **Logistic model** | **0.9998** | **0.534** | |

**Why PR-AUC matters more than AUC here.** About 98 % of test hours have RH < 80 % and are trivially fog-free (daytime, or
T−Td > 5 °C). Any sensible ranking therefore gets an AUC near 1. The useful question is whether the model
separates the humid nights that do produce fog from the ones that don't.

- **Humid hours only (RH ≥ 80 %):**
  - OMDB: 605 samples, 6 events. Model AUC **0.992**, T−Td rule AUC 0.844.
  - Network: 4,922 samples, 58 events. Model AUC 0.948, T−Td rule 0.874.
- The model's PR-AUC is about 3× the T−Td rule's (0.53 vs 0.16 on OMDB, 0.18 vs 0.07 on the network).

**Calibration** (equal-width bins, OMDB test; empty bins omitted):

| Predicted bin | mean p | observed frequency | n |
|---|---|---|---|
| 0.0–0.1 | 0.0004 | 0.000 | 26,229 |
| 0.1–0.2 | 0.147 | 0.000 | 6 |
| 0.2–0.3 | 0.258 | 0.667 | 3 |
| 0.3–0.4 | 0.397 | 1.000 | 1 |
| 0.4–0.5 | 0.433 | 0.333 | 3 |
| 0.5–0.6 | 0.546 | 0.000 | 2 |
| 0.6–0.7 | 0.651 | 1.000 | 1 |

The bins above 0.1 hold only 16 cases, so OMDB calibration cannot be judged finely. The network test,
with 304 alerts, is clearer: the model is **over-confident when transferred to OMAA and OMDW**. At
predicted 0.2–0.5, the observed rate is 0.15–0.19. Those stations need their own fit or recalibration
(see section 9). Full tables are in `FA.fogModel.calibration` and `FA.fogModel.calibrationNetwork`.

### 6.2 Fog onset within 120 min

| Metric | OMDB test |
|---|---|
| Events | 11 of 26,221 |
| AUC | 0.9987 (95% CI 0.9973–0.9996) |
| PR-AUC | 0.346 (95% CI 0.103–0.617) |
| Brier skill vs climatology | +0.19 |
| Threshold | 0.15 |
| Precision / Recall / F1 | 0.27 / 0.55 / 0.36 |
| Baselines (T−Td rule) | AUC 0.995, PR-AUC 0.112 |

### 6.3 Fog persistence over the next 60 min (fog present at *t*)

This model is evaluated on the 3-station test set (130 cases, 62 % persist). OMDB alone has only 5 test cases.

| Measure | Model | Persistence ("fog continues", p = 1) |
|---|---|---|
| AUC | 0.784 (95% CI 0.700–0.871) | — |
| Brier | 0.1772 | 0.3769 |
| F1 (model threshold 0.43) | 0.82 | 0.77 |

The fog-dissipation signal is mostly carried by time of day (sunrise heating), current visibility and station.

### 6.4 Fitted coefficients (onset 60 min, standardised features)

| Feature | Coefficient | Reading |
|---|---|---|
| rh | **+3.26** | Moister air means more fog |
| hourSin / hourCos | +2.21 / +1.72 | Peak risk in the hours around sunrise (05–08 local) |
| dpd | **−1.73** | Smaller T−Td means more fog |
| dpdTrend2h | +1.93 | Partial effect *given* current T−Td and RH: air that was already near saturation 2 h ago is more fog-prone. Not a causal "drying" effect. RH, T−Td and their trends are strongly collinear |
| tempDrop3h | +0.84 | Night-time radiative cooling |
| wind | −0.60 | Stronger wind means more mixing and less fog |
| logVis / visTrend | −0.39 / −0.13 | Falling or low visibility (haze, mist) precedes fog |
| windSin / windCos | +0.27 / −0.23 | Weak onshore and southerly components |
| monthSin / monthCos | +0.24 / −0.22 | Seasonality |

Per-feature contributions (coef × standardised value) are returned by `predict()` for explainability.
They are associations, not causal attributions.

### 6.5 Real test-period cases (embedded in `FA.fogModel.examples`)

| Date, local time (OMDB) | METAR at *t* (abridged) | p (60 min) | Outcome |
|---|---|---|---|
| 2024-02-24 06:00 | `18006KT 1200 0600NW R12L/1400D BCFG BKN002 18/18` | 0.65 | Hit: fog at 06:33, vis 700 m |
| 2025-11-20 07:00 | `11006KT 1400 0700E R30L/0500D BCFG 20/20` | 0.45 | Hit: fog at 07:08, vis 700 m, RVR 30L 600 m |
| 2023-02-22 07:00 | `19007KT 1500 BR SCT002 17/16` | 0.40 | Hit: fog at 07:07, vis 800 m |
| 2025-03-18 07:00 | `15004KT 2000 HZ NSC 20/17` | 0.10 (just below 0.10 threshold) | **Miss**: fog at 07:36, vis 500 m, RVR 650 m |
| 2024-04-01 07:00 | `19006KT 1200 0800E BCFG FEW007 19/18` | 0.55 | **False alarm**: no fog within 60 min. The TEMPO FG trend in the METAR also did not verify |

The examples show the honest picture. The model is strongest when a humid night is **already
degrading**, with mist or patchy fog and T−Td ≤ 1 °C. It gives little lead time for fog that forms
abruptly out of haze with T−Td ≈ 3 °C.

## 7. Climatology from the same data (2015–2025, on-the-hour METARs)

These figures count fog-type reports with vis < 1000 m. A **fog day** is a local calendar day with at
least one such report, including SPECIs. An **event** is a run of fog reports, with a new event starting
after a gap of 3 h or more.

**Fog days per month (mean over 11 years):**

| | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec | **Year** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| OMDB | 0.64 | 1.00 | 0.64 | 0.82 | 0 | 0.27 | 0 | 0 | 0.64 | 0.36 | 0.09 | **1.09** | **≈ 5.5** |
| OMAA | 2.36 | **2.45** | 1.55 | 1.00 | 0.09 | 0.45 | 0.09 | 0.36 | 1.64 | 1.36 | 0.27 | 1.73 | ≈ 13.3 |
| OMDW | 1.82 | **2.36** | 1.82 | 2.09 | 1.27 | 1.55 | 0.45 | 0.55 | 1.82 | 2.00 | 0.82 | 1.91 | ≈ 18.5 |

**Percentage of hourly observations in fog:**

- OMDB peaks in Dec (0.65 %), then Jan (0.41 %) and Feb (0.32 %). May, Jul and Aug are zero.

**By local hour at OMDB:**

- Fog is essentially confined to **02–10 local**.
- It peaks at **07:00 local (1.0 % of all 07:00 observations)**, with 06:00 at 0.70 % and 08:00 at 0.77 %.
- Fog onset clusters around and just after sunrise, a known feature of Gulf coastal fog.
- 11:00–18:00 local is zero.

**Inter-annual variability** (OMDB fog days per year, by calendar year):

- 2015: 8, 2016: 10, 2017: 7, 2018: 3, 2019: 4, 2020: 6, 2021: 12, 2022: 6, 2023: 2, 2024: 1, 2025: 2.
- Fog events per Jul–Jun season run from 1 to 15. The peak was 2020/21 with 15 events, and the mean
  event duration is about 2.1 h.

**Network:** OMDW, inland and closer to the desert, fogs **about 3.4× as often** as coastal-urban OMDB. OMAA
fogs **2.4× as often**. This is the operational case for a network view, for example choosing diversion
airports during an OMDB fog event.

Arrays are in `FA.fogModel.climatology.{OMDB,OMAA,OMDW}`: `byMonth`, `fogDaysByMonth`, `byHour`,
`byHourFogSeason`, `fogDaysByYear` and `eventsPerSeason`.

## 8. Limitations

- **Very few events.** OMDB had about 60 fog onsets in training and 6 in test. Test metrics carry wide
  confidence intervals, and a single season can swing them.
- **Non-stationarity.** Fog frequency at OMDB fell sharply in 2023–2025, possibly reflecting warmer
  winters, urban heat-island growth or variability. A model trained on 2015–2022 may be mis-calibrated
  for the current regime.
- **Single-station, surface-only inputs.** There is no boundary-layer profile, soil moisture, sea-surface
  temperature, NWP guidance or satellite night-fog product.
- **Temporal resolution.** The archive is hourly METARs plus SPECIs before 2024. Onset timing is only
  resolved to the nearest report, and the "next 60 min" label depends on SPECI practice.
- **Prevailing visibility only.** Patchy fog with RVR < 550 m on one runway while prevailing visibility
  stays ≥ 1000 m is not labelled as fog.
- **Linear model.** Interactions such as calm wind × high RH × pre-dawn are only captured additively.
- **Not certified.** The model is not validated to ICAO Annex 3 or WMO standards. It is intended as an
  advisory "heads-up" for humans and not as an automated trigger for LVP or flow restrictions.

## 9. How production would improve this

1. **Authoritative data.** Use NCM (UAE National Center of Meteorology) station data at 1-minute
   resolution, and the AWOS/RVR transmissometer and forward-scatter sensor streams for every runway
   (RVR-based targets for CAT II/III).
2. **NWP and remote sensing.** Add ensemble NWP fog and low-cloud guidance (for example the NCM WRF
   ensemble or ECMWF ENS visibility), the SEVIRI or MTG night-fog RGB product, and sea-surface temperature.
3. **Better learners.** Gradient-boosted trees (LightGBM or XGBoost) or monotonic GAMs to capture
   non-linear interactions. Probabilistic calibration with isotonic or Platt scaling per station and
   season. Rolling-origin back-testing over many seasons.
4. **Network learning.** Train on every UAE and Gulf aerodrome with station embeddings, and
   recalibrate per site.
5. **Operations.** Continuous verification dashboards (POD, FAR, CSI and lead time per event), drift
   monitoring, and forecaster feedback loops. Thresholds should be tied to cost-loss for specific
   decisions such as LVP preparation, arrival-rate reduction and diversion planning.

## 10. Using it in the browser

```js
const r = FA.fogModel.predict({
  tempC: 18, dewC: 17.5, windKt: 4, windDir: 140, localHour: 5.5, month: 1,
  visM: 3000, visTrend1h: -2000, dpdTrend2h: -1, tempDrop3h: 2
});            // optional 2nd argument: 120 for the 2-hour onset model
r.p;            // probability of fog (< 1000 m) within 60 min
r.alert;        // p >= operating threshold
r.model;        // 'onset-60' | 'onset-120' | 'persistence-60' (auto when visM < 1000)
r.contributions // [{key, label, value, contrib}] sorted by |contrib|
```
