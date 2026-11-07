# FalconAero: 3-minute pitch and Q&A prep

**Setup:** open https://rithikhc.github.io/FalconAero/ on the laptop (full screen, browser zoom 90% on a 1080p projector). Press **▶ Guided Demo**, which advances by itself, or use **→ / ←** to control timing, **Esc** to exit, and **Space** to play/pause the simulation.
Backup: a local copy (open `index.html`) works fully offline.

---

## Script (≈ 3:00)

| Time | Demo step | Say (adapt, don't read) |
|---|---|---|
| 0:00–0:20 | Step 1: Ops Center | "Twice this winter, fog closed in on Dubai International. On 20 November, 19 flights diverted; on 3 January, 23. Controllers had minutes to re-plan runways, stands and diversions, with phones and separate systems. We built **FalconAero**, an AI co-pilot for that moment." |
| 0:20–0:40 | Step 2: Fog nowcast | "First, we predict. Our fog model is trained on **11 years of real Dubai airport weather reports**. It flags fog about 30 minutes before visibility collapses, and it shows *why*: dew point closing, mist, calm wind." |
| 0:40–1:00 | Step 3: Projected impact | "Here's the worst case: fog, a MAYDAY low-fuel aircraft, a medical emergency, and a broken jet bridge. Under current practice: diversions into airports that are *also* fogged in, 22 stand conflicts, and the emergency waits." |
| 1:00–1:25 | Steps 4–5: Generate | "One click. FalconAero plans runways, stands, taxiing, towing and UAE-wide diversions **together**, three complete plans in under a tenth of a second, each stress-tested. It even proposes opening the second runway to arrivals and absorbs the knock-on effects." |
| 1:25–1:45 | Steps 6–7: Explain + approve | "Every decision is explained: why this stand, which alternatives were rejected, what we'd do today. And **a human decides**. Approve, modify or reject. Every action goes into a tamper-evident audit log." |
| 1:45–2:00 | Step 8: Outcome | "Result for this morning: delay down about 70%, zero diversions, zero conflicts, the emergency lands immediately. Across 32 simulated disruption days: **delay −54%, CO₂ −61%**." |
| 2:00–2:20 | Steps 10–11: Network + Data | "It works at national level, choosing alternates by weather and stand capacity. And it's built on **official GCAA data from Bayanat**. Our own study found fog barely cuts flight *numbers*; the damage is delays and diversions, exactly what we fix." |
| 2:20–2:45 | Step 12: Innovation Lab | "The GCAA problem statement says good ideas never get tested. So the same digital twin is an **Innovation Sandbox**. Any employee can test an idea on dozens of disruption days, get confidence intervals and a safety check, and walk into a pilot with evidence." |
| 2:45–3:00 | Steps 13–14: Responsible AI + Roadmap | "Responsible by design, aligned with the UAE AI Charter. A 90-day path: shadow mode, advisory, validated pilot. **FalconAero: safer skies, fewer delays, faster innovation.** Thank you." |

---

## Likely judge questions (2 minutes)

**Is the data real?**
The traffic is synthetic but calibrated to official GCAA volumes (Dubai 2023 is 450,691 movements). The fog model is trained on real METARs (2015–2025), with real GCAA datasets from Bayanat and live METAR/ADS-B. We don't have stand-level airport data; requesting it is step one of the pilot (see the Data & Evidence → Data gaps table).

**How accurate is the fog model?**
On a time-based test (2023–2025, never seen in training) ROC-AUC is 0.999 and it caught 5 of 6 fog onsets an hour ahead. But fog is rare (only 6 test events) and roughly 2 of 3 alerts are false alarms, so precision is modest. That's why it's an *alert* for humans, not an automatic action. Production would add NCM observations, RVR sensors and NWP ensembles. The model card is in the app.

**What stops the AI from doing something unsafe?**
Hard constraints (ICAO separation, stand code letters, fuel guardrails), a human must approve every plan, the AI never issues clearances, and everything is audited. The sandbox automatically blocks ideas that erode fuel margins.

**Why not just buy an A-CDM system?**
A-CDM shares milestones. FalconAero *decides across* runway, stands, towing and diversions jointly during disruption, and explains it. It plugs into existing A-CDM/AODB feeds (AIDX/ACRIS/SWIM) rather than replacing them.

**How is this different from what controllers do today?**
Today it's first-come-first-served plus phone calls, with diversions decided at minimum fuel. We move decisions 25 minutes earlier and coordinate them nationally.

**Who pays?**
Airports and ANSPs (SaaS per airport), regulators (Sandbox licence), airline OCCs. Pilot first with GCAA plus one airport. Sharjah or RAK is a low-risk testbed before DXB.

**What does the 90 days need from GCAA?**
A data-sharing MoU (AODB, A-CDM, METAR/RVR), one partner airport, a safety/SMS reviewer, and controller time for advisory-mode evaluation.

**Is the optimisation optimal?**
It's a fast heuristic (lookahead + regret + local rules), which matters when decisions are needed in seconds. Plans are stress-tested and scored on 7 objectives. A MILP/CP-SAT solver can be added offline for benchmarking.

**Fairness between airlines?**
Position shifts are bounded (±3), and we report an airline fairness index for every plan. Emirates' transfer flows are valued, but no airline can be starved.
