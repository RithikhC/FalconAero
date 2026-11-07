# FalconAero — Research Notes (compiled 2026-11-07)

Every figure below was seen on the URL given unless it is marked **unverified**. "Last updated" dates are the ones the portal displays.

## 1. Official UAE open datasets (aviation and fog)

**Key finding:** Bayanat (federal) republishes GCAA's own open data as XLSX. All three GCAA files were downloaded and read for this report.

| Dataset | Publisher | Page | Format / coverage | Last updated | Key figures (read from the file) |
|---|---|---|---|---|---|
| **Aircraft Movements Per Emirate Yearly** (id `GCAA_Aircraft_Movements_Per_Emirate_Yearly_2024`) | GCAA | https://bayanat.ae/en/Datasets/Dataset-info?id=kxuZ3oMVtzE4Y81JnazA9mimspukxqTE2PkLqk0_aHY · file: https://bayanat.ae/api/File/Get?fileID=eba6fe41-7067-42f5-b746-f74f5a5a45ed | XLSX (Emirate, Year, Type = Arrivals/Departures/Transit, Count). Covers 2014–2023. Licence CC BY-SA 4.0 | 18/03/2025 | Dubai 2023: 450,691 movements (2019: 403,073). Abu Dhabi 2023: 138,615. Sharjah 2023: 98,937. The large "Other" category has no definition in the file (**meaning unverified**). |
| **Passengers Per Emirate Yearly** | GCAA | https://bayanat.ae/en/Datasets/Dataset-info?id=raIY5qaSUK-sIdyuF0PToYl1x5nSINLVXadeztkQgyk · file: https://bayanat.ae/api/File/Get?fileID=53690308-d634-46d3-a441-6246d43eafea | XLSX, 2016–2023. Covers Abu Dhabi, Dubai, Sharjah, RAK, Fujairah and other airports | 19/03/2025 | UAE total 2023: **132.5 M**. Dubai 94.7 M, Abu Dhabi 23.6 M, Sharjah 13.8 M, RAK 340,559, Fujairah 29,636. |
| **International Aircraft Movements** (handled by Sheikh Zayed Air Navigation Centre; excludes domestic movements and overflights) | GCAA | https://bayanat.ae/en/Datasets/Dataset-info?id=SPineUQC-jJj32JHqshQ_NkgTg-M0TG0bpBucVBkcOg · file: https://bayanat.ae/api/File/Get?fileID=9fa7f4e4-0340-4f26-b8be-ee1b85034c81 | XLSX, monthly, Jan 2018 – Feb 2026. Also includes a sheet **"DailyWiseMvmts Jan98-Apr23"** with daily Arrival, Departure, Local, Overfly and Total counts | Portal 13/05/2025. File metadata says 2026-04-27 | 2024: 775,248. **2025: 833,789** international movements. The daily series is useful for fog-day impact analysis. |
| Aircrafts Movement By Emirate 2014–2017 | FCSC | https://bayanat.ae/en/Datasets/Dataset-info?id=yLwHu1Z9n68O-TQx5ZLCfI7k8f5S1FT3E6l1xqrRFBc | XLSX | 20/10/2019 | Dubai arrivals 2014: 190,208 (same as the GCAA figure) |
| Passengers Movement Through Airports Categorized by Emirate (2008–2016) | FCSC | https://bayanat.ae/en/Datasets/Dataset-info?id=Tb2JBzpEroHKpUbGug8TeGQfc3-p1bzfycLGan5BeKc | XLSX | 03/08/2023 | Abu Dhabi arrivals 2008: 4,456,580 |
| Passengers at All Abu Dhabi Airports by Year, Airport, and Status | SCAD | https://bayanat.ae/en/Datasets/Dataset-info?id=o5gMrAzLHlNtWz6zU0QhlKaRzLCNmBbd_ADl_R7DO_k (mirror: opendata.fcsc.gov.ae/@statistics-centre-abu-dhabi/…) | XLSX, 2013–2016 (AUH and Al Ain) | 28/06/2026 | AUH 2013 arrivals: 8,084,348 |
| Aircraft Movement by Airport and Month at Abu Dhabi Emirate Airports | SCAD | https://bayanat.ae/en/Datasets/Dataset-info?id=9jhmmBA16SpJScZOgXzpHbkhC0nIjv-e3FA3-A1PB6E | XLSX, monthly, 2013 onward (AUH and Al Ain) | 05/11/2019 | AUH Jan 2013: 13,351 movements |
| **Number of Fog Days by Station and Month** | FCSC (NCM data) | https://bayanat.ae/en/Datasets/Dataset-info?id=X0y7KIXasWuUW8i-lEmNURZJOAEuilU1t-3RBP1zkOs | XLSX, 2017 only (72 rows: 6 airport stations × 12 months). The download link points to a legacy data.bayanat.ae host that did not respond | 03/01/2019 | Jan 2017 (from the portal preview): Abu Dhabi Airport 6, Al Ain 6, Dubai 1, Sharjah 1, RAK 0 fog days |

Other portals:
- **GCAA's own open-data page:** https://gcaa.gov.ae/en/epublication/open-data-sets. The list is rendered in JavaScript and can be exported as CSV, JSON or XLSX. Terms are at https://www.gcaa.gov.ae/en/Pages/Open-Data-Guideline.aspx (free to use; cite GCAA).
- **Data.Dubai / Dubai Pulse:** the old Dubai Airports dataset `dans_e_dwc_monthly_movement_stats-open` (dubaipulse.gov.ae) now redirects to https://data.dubai/, and searching that portal requires a login. Its contents and dates are **unverified**. Use the GCAA "Dubai" rows instead.
- **NCM:** ncm.gov.ae is reachable, but no fog dataset or API was found. Fog data reaches open data only through the FCSC dataset above.

## 2. Headline figures

- **DXB 2025:** 95.2 M passengers (+3.1%) and 454,800 movements (+3.3%). Dubai Airports forecasts about 99.5 M passengers in 2026. Source: Dubai Media Office, 11 Feb 2026, https://mediaoffice.ae/en/news/2026/february/11-02/dxb-sets-new-global
- **DXB 2024:** 92.3 M passengers and 440,300 movements (+5.7%). Source: https://aaco.org/media-center/news/industry/dubai-international-airport-handles-92-million-passengers-in-2024
- **UAE totals (FCSC via WAM, 9 Sep 2025):** 147.8 M passengers in 2024 and ">800,000" aircraft movements. Cumulative 2015–2024: over 1 billion passengers and over 6.4 M movements. Source: https://www.khaleejtimes.com/business/aviation/uae-airports-1-billion-passengers
- **UAE 2025:** 156.87 M passengers and 828,570 movements, as reported in a Gulf News summary of FCSC data. **Not verified on the article page itself.** Source: https://gulfnews.com/business/aviation/uae-airports-handle-more-than-113-billion-passengers-in-ten-years-1.500637684
- **DXB stand count:** no official source found (**unverified**). The authoritative source would be the AIP for OMDB.
- **Emirates A380 fleet:** 95–96 active, with a target of 110 active by end-2026; 116 were originally acquired. Source: AFM, 14 Nov 2025, https://afm.aero/emirates-to-grow-active-a380-fleet-to-110-in-2026. These are trade-press figures, not from Emirates' annual report.
- **Fog season:**
  - The National (26 Feb 2026) reports that at AUH, 1983–2018 averaged just under 24 fog days a year (range 8–51). December and January are the peak months, most fog falls between September and March, and the monthly record is 13 days (March 2004). Most fog events last an hour or less; the longest recorded lasted 16 hours. Source: https://www.thenationalnews.com/news/uae/2026/02/26/how-this-uae-fog-season-compares-to-previous-years
  - The NCM December summary (via news coverage) gives a record of 20 fog days in December 2014 (**not checked on the WAM page**).
- **Fog disruption events:**
  - 20 Nov 2025: 19 inbound DXB flights diverted by 09:00. Source: https://gulfnews.com/business/aviation/19-inbound-flights-diverted-as-fog-causes-flight-disruptions-at-dubai-international-airport-1.500353607
  - 3 Jan 2026: 23 inbound diversions (21 DXB, 2 DWC), with flydubai cancellations and delays. Source: https://www.khaleejtimes.com/business/aviation/23-inbound-flights-diverted-dubai-airports-fog-jan-3-morning

## 3. Real-time APIs: CORS check (curl with `Origin: https://rithikhc.github.io`, 2026-11-07)

| API | HTTP status | `Access-Control-Allow-Origin` | Works from a github.io page? | Response shape |
|---|---|---|---|---|
| aviationweather.gov METAR JSON | 200 | **none** (also none on the OPTIONS preflight) | **No.** Use a proxy, or a GitHub Action that saves a snapshot to the repo | Array of `{icaoId, obsTime, reportTime, temp, dewp, wdir, wspd, visib ("6+"), altim, rawOb, fltCat, cover, clouds[], lat, lon, name}` |
| OpenSky `/api/states/all` (bounding box) | 200 | `https://opensky-network.org` only | **No** | `{time, states:[[icao24, callsign, origin_country, time_position, last_contact, lon, lat, baro_alt, on_ground, velocity, true_track, vertical_rate, sensors, geo_alt, squawk, spi, position_source]]}`. The live sample included UAE2519 and AXB494 |
| Open-Meteo forecast | 200 | **`*`** | **Yes** | `{latitude, longitude, timezone, hourly_units{…}, hourly{time[], visibility[] (m), dew_point_2m[], temperature_2m[], relative_humidity_2m[], wind_speed_10m[]}}`. Free tier is non-commercial; see https://open-meteo.com/en/terms |
| Bayanat `api/File/Get?fileID=…` | 200 (XLSX) | **none** | **No.** Bundle a CSV snapshot in the repo | XLSX with sheets: Metadata / Data Dictionary / Data Set |

## 4. Policy and standards anchors

- **UAE National Strategy for AI 2031** (UAE AI Office). https://ai.gov.ae/strategy/ (the site blocked automated access). Logistics and Transport is listed as a priority sector.
- **UAE Charter for the Development and Use of AI** (2024; the legislation portal lists issue date 10 Jun 2024). https://u.ae/en/about-the-uae/strategies-initiatives-and-awards/policies/Ai/The-UAE-Charter-for-the-Development-and-Use-of-Artificial-Intelligence · PDF: https://ai.gov.ae/wp-content/uploads/2024/07/UAEAI-Methaq-EN2-3.pdf
- **Dubai AI Principles & Ethics** (Digital Dubai). https://www.digitaldubai.ae/initiatives/ai-principles-ethics
- **UAE Digital Government Strategy 2025** (owned by TDRA; built on 8 dimensions including "data-driven" and "open by default"). https://u.ae/en/about-the-uae/strategies-initiatives-and-awards/strategies-plans-and-visions/government-services-and-digital-transformation/uae-national-digital-government-strategy
- **PDPL, Federal Decree-Law No. 45 of 2021** (in force 2 Jan 2022). https://uaelegislation.gov.ae/en/legislations/1972/download · https://u.ae/en/about-the-uae/digital-uae/data/data-protection-laws
- **UAE Net Zero 2050 Strategic Initiative** (announced Oct 2021). Context: https://u.ae/en/about-the-uae/strategies-initiatives-and-awards/strategies-plans-and-visions/environment-and-energy/uae-energy-strategy-2050. A dedicated u.ae page URL was not confirmed.
- **GCAA regulations:**
  - CAR Part VIII (Air Navigation Services), cited in CAAP 25: https://www.gcaa.gov.ae/en/epublication/EPublications/Civil%20Aviation%20Advisory%20Publication%20(CAAP)/CAAP25%20AIR%20NAVIGATION%20FACILITIES%20AND%20SERVICES%20APPROVALS.pdf
  - GCAA ANS department: https://www.gcaa.gov.ae/en/departments/ANS
- **ICAO and EUROCONTROL documents:** Doc 4444 PANS-ATM, Annex 14 Vol I (aerodrome reference code letters A–F), Doc 9365 Manual of All-Weather Operations, Doc 9971 Manual on Collaborative ATFM, and the EUROCONTROL A-CDM concept (https://www.eurocontrol.int/concept/airport-collaborative-decision-making). The editions and years are **unverified**; I did not check them on the ICAO store.
- **GCAA "QAFAZAT":** the only public trace is one line on the GCAA achievements page, "QAFAZAT Obtain the IP Registration" (https://www.gcaa.gov.ae/en/about-gcaa/achievements). **"BrainMiners": nothing public found.** Related: in Oct 2025 GCAA presented projects from its AI Lab at the ICAO Assembly (Gulf Today, via Magzter; **unverified detail**).

## 5. Market sizing (all figures are vendor estimates; treat with caution)

- **A-CDM airport decision support (global):** about US$2.8 B in 2025, rising to about US$5.9 B by 2034 (8.6% CAGR). Source: Dataintelo, https://dataintelo.com/report/acdm-airport-decision-support-market. Methodology unverified.
- **A-CDM software (North America):** US$262.9 M in 2024, rising to US$344.5 M by 2029 (4.6% CAGR). Source: MarketsandMarkets, https://www.marketsandmarkets.com/Market-Reports/geography/airports-information-systems-market/North-America
- **Airport information systems (global):** US$4.245 B in 2024 (4.05% CAGR). Source: Credence Research (via search results; **unverified**).
- **Airport counts:** ACI Asia-Pacific & Middle East has 132 members operating 623 airports in 47 countries (end-2023, https://aci-asiapac.aero/media-centre/news). ACI projected 449 M Middle East passengers in 2024 (https://khaleejtimes.com/business/aviation/middle-east-air-passenger-traffic-to-reach-449-million-in-2024). **No sourced count of GCC/MENA commercial airports was found.**
