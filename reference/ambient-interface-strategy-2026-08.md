# HYBRID — The Ambient Interface
### A first-principles strategy review of the "chat and gestures in, chat and video out" thesis
*August 2026. Written against the repo at `claude/zen-turing-bcy1tp`.*

---

## 0. The verdict, before the argument

Naval's thesis is **half right, and the right half is not the half that is exciting.**

- **"Chat in" is real, near, and cheap.** It ships in 2026.
- **"Gestures in" is real but tiny.** Gestures answer questions. They do not issue commands. Anyone designing a mid-air hand-gesture vocabulary for a person holding a loaded barbell is designing for a demo reel.
- **"Video out" is right for *review* and wrong for *training*.** You cannot watch a video mid-set. The 20-second technique film is a post-hoc artifact, not an interface.
- **"Camera as the interface" is the most seductive and most fatal idea in the brief.** HYBRID already built markerless motion analysis, shipped ten unit tests for it, and deleted it in August 2026. The reasoning recorded in `packages/core/src/capabilities.ts` under `video-intel` is still correct: *"Real ML cost, real accuracy risk, and the credible players are hardware-adjacent. Buy or integrate, never build. The one form of CV worth revisiting is plate-counting for ATTESTATION — not form coaching, which is a graveyard."*

And the harder verdict, which is the actual point of this document:

> **The 10x product hidden in this shift is not a new input method. It is a new output posture.**

HYBRID's problem is not that logging costs too many taps. Hevy solved logging at roughly four taps a set and has tens of millions of users; nobody churns out of a lifting app because the number pad was tedious. HYBRID's problem is that it **already knows more about the athlete than the athlete does, and it currently expresses that knowledge as sixty screens the athlete has to go and find.**

The repo contains an effort model that scores itself leave-one-out against an unpersonalised baseline. It contains per-athlete recovery clearance rates measured against a population curve. It contains an adaptive MRV estimator that reports whether its own ceiling estimate has settled. It contains tissue-level injury risk and return-to-play rails. That is a genuinely rare asset — and its current user interface is a tab bar.

The change worth making is this:

**Chat is the command line. The screen is the receipt. Voice is the channel. The engine is the product.**

Stop publishing dashboards. Start issuing one defensible instruction at a time, with the evidence one tap away.

---

## 1. What the thesis gets right, and where it breaks

### Right: input entropy is collapsing
Forms exist because software could not parse intent. That constraint is gone. `"third set, hundred for eight, two left in the tank"` carries exercise, set index, load, reps and RPE in one breath, and a 2026 model parses it into a `StrengthBlock` with high reliability. Every field-per-fact form in the app is now a legacy artifact of a solved problem.

### Right: the coach relationship is conversational
Training is not data entry, it is a sequence of *decisions* — go heavier, stop here, swap this, sleep instead. Decisions are natural language. A dashboard makes the athlete derive the decision from the evidence. A coach states the decision and holds the evidence in reserve. The second is strictly better and it is what a conversational surface is actually for.

### Wrong: video as an output channel during training
Video is **linear and non-addressable**. Its weaknesses are exactly the strengths a training interface needs:

| Need | Screen/chart | Video |
|---|---|---|
| Glanceable in 200 ms between sets | ✅ | ❌ |
| Scrub, sort, compare | ✅ | ❌ |
| Consumable with a barbell in your hands | ⚠️ (audio only) | ❌ |
| Show a movement over time | ❌ | ✅ |
| Show *change* in a movement | ❌ | ✅ |

Video wins in exactly one category — **communicating movement and its change** — and that category is real and valuable. It is just not an interface. It is a *deliverable*, produced after the fact, watched on a sofa.

### Wrong: the screen going away
Navigation is not only wayfinding. It is **browsing, discovery, and accountability**. A pure conversational home has the blank-page problem (the user does not know what to ask) and the accountability problem (an AI that only speaks cannot be audited). The moment your app tells someone to drop 5 kg off their squat, they will want to see why — and "trust me" is not an answer you can build a subscription on.

The synthesis is not "screen disappears." It is:

> **The AI decides the default. The screen exists so the athlete can inspect and override it.**

---

## 2. The actual bottleneck (this is the part that reframes everything)

Rank the friction in a serious lifter's week, honestly:

1. **Not knowing what to do today** given yesterday's 18 km, a bad night's sleep and a race in six weeks. — *Enormous, unsolved, and the reason people pay coaches £150/month.*
2. **Not knowing whether the last set was enough.** — *Large, unsolved, the reason RPE was invented and the reason it doesn't work.*
3. **Not knowing whether anything is working over months.** — *Large, badly served by every app; charts are not answers.*
4. **Logging the sets.** — *Small. Solved. Four taps.*

The industry has spent a decade optimising #4 because it is the only one that is a UI problem. #1–#3 are *modelling* problems, and HYBRID has spent a year building the models. The thesis in this brief points at #4 with a camera. **That is aiming an extraordinarily expensive technology at the cheapest problem on the list.**

Reframe the whole exercise:

> **We are not trying to remove taps. We are trying to remove the need for the athlete to be their own analyst.**

Everything below is judged against that.

---

## 3. The interaction model — inputs ranked by honesty

Every input from the brief, graded on **signal value × reliability × willingness to use**.

### Tier 1 — build on these (high value, works today, people will actually do it)

| Input | Why it earns its place |
|---|---|
| **Voice via earbuds** | Hands chalked, eyes on the bar, phone in a pocket. Short utterances, push-to-talk. The only conversational channel that survives a gym. |
| **The plan itself** | The single highest-bandwidth "input" is what we already prescribed. See §7 — this is the whole trick. |
| **Wearable passive stream** (HR, HRV, resting HR, sleep, workouts) | Zero user effort, high physiological signal, and it is *already* the input to `readiness.ts`, `effort.ts` and the injury engine. Currently **blocked** on one TestFlight verification (`apple-healthkit`). |
| **Phone/watch IMU for session structure** | Rest periods, set boundaries, superset grouping, session start/stop. Nearly free, nobody does it well, and it removes the most annoying real friction (the rest timer you forgot to start). |
| **Text** | The fallback for everyone who will not talk in a gym — which is a large minority, see §19. |
| **Confirmation gestures** (AirPods nod/shake, Watch double-tap) | Shipping Apple APIs. Answer yes/no with no hands and no screen. Genuinely magical, genuinely cheap. |

### Tier 2 — real, but buy or integrate, never build

| Input | Verdict |
|---|---|
| **Barbell velocity sensors** (Enode, Vitruve, RepOne, Perch, Output) | The data is excellent and `engines/velocity.ts` is *already written to consume it*, capture-agnostic. Integrate. Do not manufacture. |
| **Connected equipment / gym machines** | Valuable in commercial-gym partnerships, irrelevant to the consumer wedge. Later. |
| **Camera for attestation only** (plate counting on a declared PR) | The one CV bet worth taking. See §8. |

### Tier 3 — gimmicks; say no now and save a year

| Input | Why it dies |
|---|---|
| **Camera for form coaching** | Already retired here once. Occlusion, propping, monocular depth error, gym filming bans, liability. §19. |
| **Mid-air hand gestures** | Your hands are holding the thing. A camera that can see your hand can see your bar; use the bar. |
| **Continuous ambient camera in a gym** | Illegal-adjacent in many venues, socially unacceptable, thermally impossible, and it films strangers. |
| **AR glasses UX** | No installed base among lifters before 2030. Designing for it now is cosplay. |
| **"Movement digital twin" 3D avatar** | Beautiful in a pitch deck. Answers no question an athlete asks. |

**The rule that falls out of this table:**

> **Voice commands. Gestures answer. Sensors observe. The screen shows the receipt.**

Four channels, four jobs, no overlap. Every interaction in the product should be assignable to exactly one.

---

## 4. "Chat + gestures in" — what it actually looks like in a gym

Forget the walk-up-to-the-squat-rack fantasy for a moment. Here is the real physical situation: loud room, hands occupied or chalked, phone in a pocket or on the floor, forty seconds of usable attention between sets, other people around, and a strong social cost to looking like you are filming.

The interaction that survives that environment is **audio-first, screen-optional, and pre-filled**.

### The Session Line
Replace the workout screen's grid of exercises and sets with **one line at a time**, the way a coach standing next to you works.

```
IN EAR:   "Squat. Hundred, five reps. Go when you're ready."
          [athlete lifts]
          [IMU detects bar racked + movement stops → rest timer auto-starts]
IN EAR:   "Got it. Two ten."
ATHLETE:  "That was heavy — two left."
IN EAR:   "Noted. Next set same weight, then we'll decide."
```

Zero taps. Zero screen. The athlete said one thing, and it was the *only* thing the system could not have predicted.

### The escalation ladder
Each rung is used only when the one above fails:

1. **Silence** — the prescription was right, the athlete did it, the IMU saw the rest gap. Logged.
2. **A gesture** — "Same as last week?" → nod. (AirPods head gesture, Watch double-tap.)
3. **A word** — "eight" / "two left" / "skip" / "add five."
4. **A sentence** — "my shoulder's cranky, give me something else."
5. **The screen** — the athlete wants to see the numbers, change the plan, browse.

Most sets terminate at rung 1 or 2. That is the entire product idea.

### What the athlete says, ranked by frequency (design the grammar for these)
```
"done"                        → accept the prescription verbatim
"eight" / "eight reps"        → rep delta only
"two left" / "RPE eight"      → effort only
"hundred for eight"           → load + reps
"add five" / "drop ten"       → load delta, next set
"last set"                    → close the exercise
"skip" / "swap this"          → structural change
"how was that?"               → request a verdict (§6)
```
Eight utterances cover ~95% of a strength session. This is not an open-ended chatbot; it is a **small, closed grammar with an LLM fallback for the tail**. That distinction is the difference between a reliable product and a demo.

### Why not "the camera recognises you walking to the squat rack"
Because the plan already said you were squatting. Environment recognition solves a problem that scheduling solved for free. This is the recurring error in the brief: **using perception to recover information we already have.**

---

## 5. "Video out" — what to actually generate

Ask the correct question: *what is fundamentally better communicated through motion than through text or a chart?*

Honest list:

1. **Change in a movement over time** — your squat in January vs your squat now, aligned and superimposed.
2. **A moment of failure** — the exact frame the bar drifted forward, held for a beat.
3. **A drill you have never done** — a coach's demonstration, which is a *content* problem, not a generation problem.
4. **The shape of a season** — twelve weeks of load, fatigue and form as a curve that moves.

Notice that only #1 and #2 need *your* footage, and neither needs *generated* footage. They need **your real video, aligned, annotated, and cut**. That is editing, not generative AI, and it is a hundred times cheaper and infinitely more trustworthy.

### The killer distinction, and it is a trust argument
**Never generate video of the athlete doing something the athlete did not do.** A photoreal clip of "you, but with better depth" is:
- unverifiable,
- uncanny,
- and if the model is wrong about what good looks like for *this* body, actively harmful.

One hallucinated rep destroys the credibility of every number in the app. There is no upside that justifies it.

### What to build instead: **the app rendering its own reasoning as motion**
The high-value "video out" is not footage of a human. It is a **narrated data film** — deterministic motion graphics driven by real engine output, with a synthesised voice, rendered server-side.

Four products, in order of value:

| Cadence | Artifact | Length | Content |
|---|---|---|---|
| **Weekly** | *The Ledger* | 40 s | What you did, what it cost, what changed in the model of you, one instruction for next week. |
| **Post-session** | *The Receipt* | 15 s | Tonnage, the PR, the one set that mattered, tomorrow's implication. |
| **Monthly** | *What We Learned About You* | 60 s | `engines/learned.ts` already computes exactly this, with provenance and confidence intervals, and currently renders it as cards. |
| **On demand** | *The Comparison* | 20 s | Your lift now vs your own best rep of the same lift, aligned, with the divergence marked. |

Three of those four require **no computer vision at all**, and `recap.ts`, `session-wrapped.ts` and `learned.ts` already produce the content. The missing piece is a renderer and a voice — a weekend of work compared to a year of pose estimation.

**And this is a genuinely new content category**, because it is the first fitness media that is *about you and true*. Not a highlight reel with a filter. A film of your own physiology, narrated in the second person, that you could not have made yourself and cannot get anywhere else. That is shareable, and it is the retention loop.

### The one place real video earns its cost: your best rep as the reference
When you do compare footage, **compare the athlete to their own best rep, not to an ideal.**

This single design choice:
- dodges the entire "what is correct form" liability surface,
- is robust where classification is fragile (difference detection is far easier than absolute judgement),
- is more useful, because *your* good rep is achievable and a model's ideal is not,
- and it is honest, which is this company's stated posture everywhere else in the codebase.

> **We never tell you what correct looks like. We show you what changed.**

---

## 6. The AI coach — memory, perception, agency, and a speech budget

A ChatGPT wrapper answers questions. A coach **holds state, forms opinions between conversations, and takes positions you did not ask for.** The difference is four things: memory, perception, decision rights, and restraint.

### What the coach knows (and HYBRID mostly already has)
| Layer | Contents | Status in repo |
|---|---|---|
| **Capacity** | e1RM per lift with confidence, load–velocity profile, endurance thresholds, HPI + its limiting pillar | `hpi.ts`, `velocity.ts`, `fitness-level.ts` — shipped |
| **State** | Acute:chronic load, per-muscle fatigue, readiness, personal clearance rate, adaptive MRV | `fatigue.ts`, `readiness.ts`, `recovery-pairs.ts`, `landmark-*.ts` — shipped |
| **Bias** | This athlete's own effort residual — what a given session actually costs *them* | `engines/effort.ts` — shipped, leave-one-out validated |
| **Constraint** | Injuries, RTP stage, equipment, schedule, environment | `injury.ts`, `rtp.ts` — shipped |
| **Intent** | Goals, sport, event dates, preferences, tone | Partial |
| **Technique** | Per-lift movement fingerprint | Not built. Needs sensors. Lowest priority. |

The uncomfortable observation: **the coach's knowledge layer is ~80% built and ~20% expressed.** No new intelligence is needed to make the coach feel dramatically smarter. It needs a voice and a schedule.

### What it observes
Passively, without asking: sleep and HRV overnight, session start and end, rest intervals, load-velocity drift within a set (when a sensor exists), compliance (did the prescribed session happen), and the gap between what it prescribed and what occurred. **That last one is the most underrated signal in the product** — the delta between prescription and reality is a direct measurement of whether the model of this athlete is any good.

### Decision rights — draw this line explicitly
| The coach decides | The athlete decides |
|---|---|
| Load within a prescribed band (±10%) | Goals, events, priorities |
| Set/rep adjustments inside a session | Whether to train at all today |
| Calling a set or an exercise done | Pushing through pain |
| Exercise substitution for available equipment | Anything with medical implications |
| When to deload | Body composition targets |
| What to say and when to stay quiet | Overriding any of the left column |

**The left column must be reversible and inspectable.** Every autonomous decision carries a one-line "why" and an undo. That is what makes agency tolerable instead of creepy.

### When it speaks — the speech budget
This is a design constraint, not a guideline. An AI that comments on everything is uninstalled within a fortnight.

```
DURING A SET          never. not once. no exceptions.
BETWEEN SETS          ≤ 1 line, and only if it changes the NEXT set.
END OF SESSION        1 line + the receipt.
DAILY                 ≤ 1 proactive message, and only if it changes TODAY.
WEEKLY                1 recap.
EVERYTHING ELSE       available on request, silent by default.
```

**The test every proactive utterance must pass:** *does this change a decision the athlete makes in the next 24 hours?* "You haven't trained posterior chain in nine days" passes — it changes today. "Your bench velocity is up 11% over six weeks" fails as a notification and belongs in the weekly film. "Your squat is down today, drop 5%" passes and is the single highest-value sentence the product can say.

### When it stays silent
- When the athlete is mid-effort.
- When the observation is interesting but not actionable.
- When it has said something similar in the last 48 hours.
- When its confidence is low — **and it should say so rather than hedge**. `learned.ts` already carries provenance and intervals on every claim; the coach must inherit that discipline. "I don't have enough data on your deadlift yet" builds more trust than a confident guess.

---

## 7. Zero-logging — and the cheap trick everyone misses

The brief asks whether sensing can determine exercise, sets, reps, weight, tempo, rest, ROM, velocity, technique, RPE, failure and superset structure.

Answer, field by field, in 2026:

| Field | Best available method | Reliability today |
|---|---|---|
| Session start/end | Watch + IMU + HR | ✅ high |
| Rest periods | IMU + HR recovery | ✅ high |
| Superset structure | Timing inference | ✅ high |
| Exercise identity | **The plan** | ✅ high |
| Weight | **The plan**, or the athlete | ⚠️ nothing else works |
| Reps | Wrist IMU / bar sensor / camera | ⚠️ 80–95%, exercise-dependent |
| Velocity, ROM | Bar sensor (excellent), camera (fair) | ⚠️ sensor-gated |
| RPE / effort | Reported, then *corrected by* `effort.ts` | ✅ (this is a modelling win, not a sensing one) |
| Failure | Velocity drop-off | ✅ with a sensor |
| Technique | — | ❌ do not attempt |

Two things jump out.

**First: weight is unsolvable by perception.** Iron plates are unlabelled, sleeves are occluded by the athlete's own body, dumbbells sit in racks with worn stickers, and a 2.5 kg change is invisible and physiologically significant. Any roadmap that assumes automatic load detection is fiction.

**Second, and this is the whole insight: the highest-accuracy sensor for every hard field is the prescription we already made.**

> ### Zero-logging is not a perception problem. It is a prediction problem.
> **Prescribe the session. Assume it happened. Capture only the delta.**

The system already knows you are squatting, that it is set three, and that it told you to use 100 kg. The only genuinely new information in the entire set is *what differed* — and most sets differ in nothing. This is **confirm-by-exception**, and it is how a human coach with a clipboard has always worked.

The arithmetic, on a 5-exercise / 20-set session:

| Model | Interactions |
|---|---|
| Today (Hevy-class manual logging) | 60–100 taps |
| HYBRID today | ~40–60 taps (already better; see `tap-budget.ts`) |
| **Prescribe + confirm-by-exception** | **~5 taps, or 3 spoken words, or one nod per exercise** |

That is a 10x on interaction cost using **zero new sensors, zero computer vision and zero hardware.** It is available this quarter. Every camera-based path to the same outcome is more expensive, less accurate, and years away.

Perception then becomes what it should always have been: **not the primary capture path, but the corroboration layer.** The watch confirms the session happened. The bar sensor confirms the reps were real. That is exactly the ladder `attestation.ts` already defines.

### The roadmap

| Horizon | What becomes real | Confidence |
|---|---|---|
| **NOW — 2026** | Voice capture with a closed grammar; prescribe + confirm-by-exception; passive HR/HRV/sleep; auto rest timers and session boundaries from IMU; superset inference; narrated data films; integrations with existing bar sensors; nod/shake confirmation. | High. All of it is engineering, not research. |
| **NEXT — 2027–28** | On-device rep counting from the wrist at useful accuracy for a *subset* of lifts; monocular bar-path and velocity within ~8% of a linear encoder for camera-friendly barbell lifts with a propped phone; on-device VLM naming the exercise from a still; reliable auto-alignment of two clips of the same lift for the comparison film. | Medium. Demos exist; products do not. |
| **FUTURE — 2029–32** | Egocentric capture from glasses removing the phone-propping problem entirely — *this is the unlock that makes the camera thesis actually work*; continuous fatigue estimation from movement signature; trustworthy generated instructional video. | Low-medium, and gated on hardware adoption we do not control. |
| **SCI-FI — beyond 2032** | Continuous non-invasive biochemistry (glucose, lactate, cortisol); muscle-level load attribution without electrodes; closed-loop nutrition and training. | Speculative. Do not plan around it. |

**The line to hold:** a demo of pose estimation is not a product. A product is a thing that works in a badly lit gym, at an arbitrary angle, with a stranger walking through frame, on a phone that is also playing music, without draining the battery, every single time — because the first time it is confidently wrong about a number the athlete cares about, they stop believing all the other numbers too.

---

## 8. The camera — take exactly one bet

Not form coaching. **Attestation.**

`packages/core/src/attestation.ts` already declares a six-tier evidence ladder for a strength claim: *0 claimed → 1 sensed → 2 witnessed → 3 recorded → 4 instrumented → 5 sanctioned.* Tiers 0–2 have shipped. Tier 3 is a camera problem — and it is a **narrow, bounded, verifiable** camera problem:

> A single declared PR attempt. Fixed framing, because the athlete *wants* it framed well. One question: **how many plates are on the bar, and did the rep complete?** Not "was it good." Just "did it happen."

Why this is the right bet where form coaching was the wrong one:

- **The failure mode is benign.** "Couldn't verify, try again" costs nothing. "Your knee is caving" costs trust and invites liability.
- **The athlete is cooperating.** They set the phone up deliberately, once, for a lift that matters. This is the only moment in training when the propping problem disappears.
- **It is verifiable.** A plate count is either right or wrong; a technique score is an opinion nobody can grade.
- **It creates something scarce.** Every strength number on the internet is self-reported and therefore worth nothing. There is no strength equivalent of a verified marathon time. Whoever creates one owns a credential.
- **It is the only camera feature with network effects.** A verified record is only valuable if others recognise it — which means co-signers, leaderboards, and comparison. That is a graph, and graphs are moats. A form score is a feature, and features are copied.

Everything else the camera could do should be answered with: *no, and here is the retired capability entry explaining why we already know that.*

---

## 9. Gestures — small, and that is fine

The useful gesture vocabulary is about four items long, and it ships today on hardware the target athlete already owns:

| Gesture | Hardware | Meaning |
|---|---|---|
| **Nod** | AirPods (iOS 17+ head gestures) | yes / accept the prescription |
| **Shake** | AirPods | no / not that |
| **Double-tap** | Apple Watch Series 9+ | confirm / advance |
| **Put the phone down** | Phone IMU | the set is starting; go quiet |
| **Pick the phone up** | Phone IMU + raise-to-wake | show me the current state |

The last two are the interesting ones because they are **gestures nobody thinks of as gestures.** Setting the phone on the bench is already a universal, unconscious signal that a set is about to happen. Reading it costs an accelerometer callback and it makes the app feel like it is paying attention.

The principle:

> **Gestures are a one-bit channel. Use them to answer, never to command.**

You cannot compose an instruction with your head. You can say yes. Design the conversation so that the overwhelming majority of turns are yes/no questions the athlete can answer without hands, and the gesture vocabulary is sufficient forever.

Kill: mid-air hand signals, "draw a shape to start a set", camera-read thumbs-up, any gesture requiring the phone to be watching you.

---

## 10. The screen after the screen

### What survives
1. **Now** — the live session line. One exercise, one set, one number, one action. Big enough to read from four feet away on a bench.
2. **The receipt** — what the coach just decided, and why, one tap from the evidence.
3. **The films** — weekly and monthly, the review surface.
4. **The record** — the athlete's verified lifts and their trajectory. This is the trophy cabinet, and it is the emotional core of a strength product.
5. **The override** — plan editing, exercise browsing, food logging. Full traditional UI, unapologetically, because these are *authoring* tasks and authoring is a screen job.

### What dies
- The tab bar as the primary organising metaphor.
- Dashboards you must interpret. Every chart must carry its own verdict sentence or it does not ship.
- Any screen that exists to *display state the coach should have told you about*.
- Manual per-set entry as the default path — it stays as a fallback, not the road.
- Anything reachable only by navigation. If it matters, the coach raises it.

### The home screen
Not "What are we doing today?" — that is an open question to a user who came to be told. And not a blank page.

**One card, one instruction, one action, with the reasoning collapsed underneath:**

```
┌─────────────────────────────────────────┐
│  TUESDAY                                │
│                                         │
│  Squat, and go lighter than the plan.   │
│                                         │
│  100 → 92.5 kg  –  5 × 3                │
│                                         │
│  ⌄ Because you slept 5h12 and your      │
│    resting HR is 7 bpm above baseline.  │
│                                         │
│           [ Start ]                     │
└─────────────────────────────────────────┘
```

Below it: the week strip, and nothing else above the fold. Everything else is reached by asking, or by pulling.

The subtle part: **the home screen is a claim, not a menu.** It commits to a position and shows its working. That is what makes it feel like a coach rather than a database, and it is entirely achievable with engines that already exist in this repo.

---

## 11. Proactive AI — the interruption budget

Proactivity is where AI products die. The failure is never "it wasn't smart enough." It is "it would not shut up."

### The three-part test — a proactive message must pass all three
1. **Decision-changing** — it alters what the athlete does in the next 24 hours.
2. **Non-obvious** — the athlete would not have concluded it themselves.
3. **Defensible** — we can show the evidence in one line.

Apply it:

| Candidate message | 1 | 2 | 3 | Verdict |
|---|---|---|---|---|
| "Slept poorly, RHR elevated — I've cut today's load 5%." | ✅ | ✅ | ✅ | **Send.** The flagship. |
| "You haven't trained posterior chain in 9 days." | ✅ | ✅ | ✅ | **Send.** |
| "Your squat is trending down over 3 sessions — deload week?" | ✅ | ✅ | ✅ | **Send.** |
| "Bench velocity +11% over six weeks." | ❌ | ✅ | ✅ | Weekly film, not a push. |
| "You hit a PR!" | ❌ | ❌ | — | In-app celebration, never a notification. |
| "Time to work out!" | ❌ | ❌ | ❌ | **Never.** This is what everyone else sends. |
| "Great job yesterday!" | ❌ | ❌ | ❌ | **Never.** Flattery from software is worthless. |

### Structural guards
- **Hard cap: one proactive message per day, one per week for the recap.** No exceptions, no settings screen full of toggles to fix a problem we should not create.
- **Escalation earns silence.** If the athlete ignores three consecutive proactive messages of a type, that type stops. Permanently. No re-prompting.
- **Time it to the decision.** The load adjustment arrives when they wake, not when we compute it at 3 a.m.
- **Never invent a reason to speak.** If the day is unremarkable, say nothing. A coach who is quiet when there is nothing to say is a coach you believe when they speak.

---

## 12. The Athlete Model — what it must be to be an asset

HYBRID calls it the Athlete Twin, surfaced as Performance State. It exists. To become the company's core asset it needs three properties it does not fully have yet.

### 1. It must be an estimator, not a record
Every quantity carries a **value, a confidence interval, and a provenance tier.** `learned.ts` already does this with a four-layer vocabulary (population → profile → observed → measured), and `attestation.ts` does it for claims. Generalise that everywhere. The model should be able to say *"your deadlift e1RM is 182 kg ± 14, inferred from volume work, never tested"* — and behave differently from a tested max.

This is also just the codebase's own device-truth rule taken to its conclusion: **measured outranks typed, everywhere.** The Athlete Model is that principle made into a data structure.

### 2. It must be outcome-closed
This is the part that turns data into a moat, and it is the part almost nobody does.

A model that records what you did is a diary. A model that can answer **"for athletes like you, in this state, did prescription A produce more adaptation than prescription B?"** is an asset. That requires:
- prescriptions stored as first-class objects (what we told them, not just what they did),
- outcomes attached to prescriptions (what happened over the following four weeks),
- and the willingness to **deliberately vary** prescriptions and measure the difference.

The repo already has the intellectual habit — `effort.ts` refits leave-one-out and *reports when personalisation does not help*. That is a rare and valuable instinct. Point it at prescriptions and you have a compounding learning system rather than a large table.

### 3. It must be portable and inspectable
Counter-intuitive but correct: **let the athlete export the whole model.** Two reasons. It is the strongest possible trust signal in a category built on hoarding. And in practice nobody leaves, because the value is not the file — it is the years of continuous updating and the engines that read it. Exportability costs nothing and buys the right to be believed.

### Why this becomes the proprietary asset
Not because the data is secret. Because it is **longitudinal, cross-modal, and labelled with outcomes**. Anyone can buy a fitness dataset. Nobody can buy four years of one athlete's strength, endurance, sleep, effort bias, injuries and responses to specific prescriptions, reconciled into a single state object that updates every night. That takes calendar time, and calendar time is the only input a competitor cannot purchase.

---

## 13. The moat — separating the real from the flattering

If Claude, GPT, Gemini, Apple and Meta all ship competent AI coaches — and they will, several already have — why does HYBRID exist?

### Fake moats (do not build a strategy on these)
| Claim | Why it fails |
|---|---|
| "Our exercise database" | Commodity. Free datasets, and a frontier model knows more exercises than any database. |
| "Our AI coach / our prompts" | A prompt is not an asset. It is a text file that a competitor can approximate in an afternoon. |
| "Our video content library" | YouTube exists and is free and better. |
| "Fine-tuned on fitness content" | Content is not scarce. Frontier general models already out-reason a fitness-tuned small model. |
| "We have a lot of data" | Unlabelled longitudinal data is a storage cost, not a moat. Data without outcomes teaches nothing. |
| "Beautiful UX" | Real advantage, ~18 months of lead, zero defensibility. |
| "Community" | Everyone says this. Almost nobody has one. Fitness communities live on Instagram and Reddit and will not move. |

### Real, defensible advantages, ranked

**1. Cross-modal load reconciliation (12–36 month lead, and it is the wedge).**
The hybrid athlete's actual unanswerable question is: *"I ran 18 km yesterday, I'm squatting today, I race in six weeks — what do I do right now?"* No general model can answer it, because the answer requires continuous physiological state, not reasoning. And no incumbent will: Strava has no strength model, Hevy has no endurance model, WHOOP measures recovery but refuses to prescribe, Garmin does endurance load and treats lifting as a rounding error. HYBRID's fatigue, readiness, effort and HPI engines already reconcile both sides. **This is the sharpest thing the company owns and it should be the entire marketing message.**

**2. The verified strength record (network effects — the only true one on this list).**
See §8. A credential is worth exactly what its recognition is worth, which makes it a graph, which makes it defensible in a way no feature is. It also happens to be the only asset here that gets *more* valuable as competitors grow.

**3. Outcome-closed personalisation (3–5 years, compounding, hardest to copy).**
Per-athlete effort bias, measured clearance rates, adaptive MRV that reports its own convergence. This is real proprietary technology and it is unusual. It becomes a moat only when it is closed on outcomes (§12.2). Until then it is excellent engineering with an unproven commercial edge.

**4. Coach-mediated distribution (economic, not technical).**
A coach with 40 athletes is 40 users acquired at once, with retention underwritten by a human relationship. This is a distribution moat, which is the kind that actually survives.

### The honest summary
> **The model layer is defensible for a few years. The credential layer is defensible indefinitely. The interface layer is defensible for about eighteen months.**

Which means: **do not spend the company's next year on the interface.** Spend it on the two layers that hold.

---

## 14. Business model

Start with the fact that outranks every strategic opinion in this document:

> **`full-billing` is `blocked`. 538 shipped capabilities and no way to take money.**

The code is complete — Stripe checkout, portal, webhooks, entitlement mirroring, IAP — and it is blocked on external credentials and one SQL script. Nothing in this memo matters more than unblocking that. A product with no price has no market feedback, and every roadmap written without revenue data is fiction.

### The options, graded

| Model | Verdict |
|---|---|
| **Consumer subscription (£10–15/mo)** | The base. Necessary, and a mediocre standalone business at achievable scale. |
| **Performance tier (£25–30/mo)** | **The right primary bet.** Gates the expensive, differentiated layer: the coach's voice, the films, verified records, sensor integrations. Hybrid athletes already spend £150/mo on coaching and £250 on race entries. Price is not their objection. |
| **Coach seats (£8–12 per athlete/mo, coach pays)** | **The growth engine.** Buys distribution and retention simultaneously. `coach-verification` has shipped; the flow exists. |
| **Gyms** | Low ARPU, high support, weak intent. Later, or never. |
| **Teams / universities / pro sport** | Beautiful logos, 9–18 month sales cycles, bespoke demands, ~0.1% of TAM. **This company has already learned this lesson once** — `competition-intel` was retired as *"beautiful engineering, no market."* Do not relearn it. |
| **Hardware / sensors** | No. Capital, inventory, support, margin compression, and a two-year detour from software. Integrate Enode/Vitruve/Perch — `velocity.ts` is already capture-agnostic. |
| **API / B2B performance intelligence** | Real, but it is a 2029 business. It requires the outcome-closed model to exist first. |

### The recommendation
**Consumer subscription with a Performance tier, sold to the hybrid athlete, distributed through verified coaches.** One number to watch: percentage of Performance subscribers who follow a coach-adjusted prescription in a given week. That single metric tells you whether you are a coach or a dashboard.

---

## 15. The 2030 board

| Who | What they build | What stops them |
|---|---|---|
| **Apple** | The most likely to build the ambient layer. Watch + AirPods + on-device models + Health as the system of record, and Workout Buddy already exists. | They build for the median user, not the athlete. They will not prescribe a load progression — liability and brand. No barbell model, no coach marketplace, no interest in a strength credential. **They will own ambient sensing and leave prescription on the table.** |
| **WHOOP / Oura** | Recovery-side coaching on excellent proprietary sensor data. | Hardware margin businesses. No strength perception, no prescription authority, and their AI coach is a chat layer over their own metrics. They tell you how you slept, not what to squat. |
| **Strava** | Social graph + endurance, already shipping AI summaries. | Strength is a foreign language. Their identity is the feed, and feeds resist becoming coaches. |
| **Hevy / Strong** | The best strength logging UX, huge user bases, and they will bolt an LLM on. | No physiological engine, no endurance side, no recovery model. Their coach will be a summariser of what you typed. |
| **Tonal / Tempo / Peloton** | Genuine sensing, because they own the load cell. | Hardware-bound and capital-starved; the installed base is a ceiling, not a launchpad. |
| **Future / coaching marketplaces** | Actual human coaching, actually effective. | Labour-bound. £150–200/mo, does not scale, and AI compresses their pricing from below. |
| **OpenAI / Google / Meta** | A very good general coach in a chat box, free. | No continuous physiological state, no device pipeline, no write-access to a training log, no accountability. **They will make generic coaching worthless — which is a gift, because it prices out every competitor whose only asset was generic coaching.** |

**Who most likely builds this?** Apple builds the sensing layer. Nobody builds the whole thing, because the whole thing requires caring about barbells *and* running *and* recovery *and* prescription — a combination that is a rounding error to every platform and a religion to the hybrid athlete.

**Where a startup builds $1B+:** own the hybrid athlete completely. Hyrox and hybrid racing are the fastest-growing mass-participation category in fitness; the participants are high-intent, high-spend, tribal, and structurally underserved because their sport sits in the gap between two incumbent categories. Be the system of record for that gap, own the strength credential, and distribute through their coaches. That is a defensible billion-dollar wedge. "An AI fitness app" is not.

---

## 16. NOW / NEXT / FUTURE / SCI-FI

**NOW — 2026 (ship this year, all engineering, no research)**
Voice capture with a closed grammar and LLM fallback – prescribe + confirm-by-exception – auto rest timer and session boundaries from the IMU – superset inference – HealthKit passive stream *(currently blocked on one TestFlight verification)* – Watch glance app *(built, blocked on one workflow run)* – AirPods nod/shake confirmation – narrated data films from `recap.ts` / `learned.ts` – bar-sensor integrations – the coach's daily single utterance.

**NEXT — 2027–28 (plan for, do not depend on)**
Wrist-IMU rep counting for a subset of lifts – monocular bar path and velocity for camera-friendly lifts with a propped phone – plate counting for attestation tier 3 – on-device VLM exercise identification from a still – automatic alignment of two clips of the same lift.

**FUTURE — 2029–32 (watch, do not build)**
Egocentric capture from glasses — *the only development that makes the camera thesis genuinely work, because it removes phone propping* – continuous fatigue from movement signature – trustworthy generated instructional video.

**SCI-FI — beyond 2032**
Continuous non-invasive biochemistry – muscle-level load attribution without electrodes – fully closed-loop training and nutrition.

**The discipline:** a demo is one clip in good light. A product is every rep, in a bad gym, on a hot phone, with a stranger walking through frame. Almost everything exciting in this space is currently the former.

---

## 17. The MVP — "the first glimpse of the future," buildable now

**Name it what it is: the Session Line.**

**Interaction.** The athlete opens the app to one card carrying today's instruction and its reason. They tap Start. From then on the phone can go in a pocket. Prescribed sets are announced in one ear. After each set the athlete says nothing (accepted), says a word ("eight", "two left"), or nods. The rest timer starts itself when movement stops. At the end: "Done — that's your best squat tonnage in seven weeks. Tomorrow's easy." The screen is available at every moment and required at none.

**AI.** Server-side, grounded in the existing Twin: HPI and its limiting pillar, readiness with its ranked drivers, the athlete's own effort bias, adaptive MRV, tissue risk, and today's prescription. It answers "should I do another set?" and "how am I doing?" from *this athlete's* measured history, and says so explicitly when it does not know. The endpoint already exists at `/api/ai-coach`.

**Computer vision.** **None.** Not in the MVP. This is the most important line in the section.

**Video out.** One artifact: the weekly Ledger. 40 seconds, rendered server-side from `recap.ts` and `learned.ts`, narrated by a synthetic voice, ending on one instruction. Shareable.

**UI that survives.** Now (the session line) – the receipt – the record – the films – full authoring screens for plans, exercises and nutrition.

**Architecture.**
```
Phone ── on-device speech ──► closed grammar parser ──► delta
   │                                │ (miss)
   │                                └──► LLM parse (server, cheap model)
   │
   ├── IMU: phone-down / motion-stop  ──► set + rest boundaries
   ├── AirPods: nod / shake           ──► confirm
   ├── HealthKit: HR, HRV, sleep      ──► Signal rows (exists)
   │
   └──► /api ──► @hybrid/core engines (exist) ──► prescription + verdict
                        │
                        ├──► TTS ──► one ear
                        └──► renderer ──► the weekly film
```
Every box marked *exists* is roughly two-thirds of the diagram.

**Data model.** Two additions to what is already there: **Prescription** as a first-class object (what we told you, when, and why — the precondition for §12.2), and **Utterance** (what was said, what it parsed to, whether it was corrected — the training data for the grammar).

**Hardware.** None. Optional bar-sensor integration for the Performance tier.

**Honest scope check.** The blockers in the way are not technological: HealthKit needs a TestFlight verification, the Watch app needs one workflow run, and billing needs three credentials and a SQL script. **Three unblocks and a voice layer stand between this repo and the MVP described above.**

---

## 18. Three magic moments

### ① "Two left."
1. **Situation** — Set three of squats, 100 kg, chalk on hands, phone in pocket, AirPods in.
2. **Input** — The athlete racks the bar, breathes, and says two words: *"two left."*
3. **Perceives** — Motion stopped (IMU). Speech captured on-device. Plan context: exercise, set index, prescribed load.
4. **Understands** — Set 3 completed at the prescribed load and reps, RPE ~8. Rest starts now. Given this athlete's measured clearance rate, set 4 at the same load is appropriate.
5. **Action** — Logs the set. Starts the rest timer. Prepares set 4.
6. **Output** — One ear: *"Got it. Two ten. Same weight next."* Nothing on screen unless asked.
7. **Why it lands** — The athlete never took the phone out, and the set is on record with an effort rating they would normally never have entered. The feeling is not "the app is clever." It is *"someone is holding my clipboard."*
8. **Tech** — On-device speech, a closed grammar, existing engines, TTS, IMU. **All 2026. No CV.**

### ② The Verdict
1. **Situation** — Four hard sets done. The athlete genuinely does not know whether to do a fifth.
2. **Input** — *"Should I do another set?"*
3. **Perceives** — Today's completed volume, this muscle group's 7-day load, last night's sleep and HRV, the athlete's own measured recovery rate, their adaptive MRV and whether that estimate has converged.
4. **Understands** — This athlete clears quadriceps volume ~15% slower than the population curve, and today's sets already sit at 92% of their measured ceiling with a session in 36 hours.
5. **Action** — Recommends stopping, and writes the reasoning to the receipt.
6. **Output** — In-ear: *"I'd stop. That's about as much as you've historically recovered from in a day and a half, and you squat again Thursday."* Screen, if pulled: the three drivers, ranked, with provenance.
7. **Why it lands** — **Every rival gives a generic answer. This one is derived from four months of the athlete's own measurements, and it names them.** This is the single interaction a general-purpose model structurally cannot reproduce, and it is the entire product thesis in one sentence.
8. **Tech** — `recovery-pairs.ts`, `landmark-*.ts`, `readiness.ts`, `effort.ts`. **All shipped.** This is a voice and a prompt away.

### ③ The Sunday Film
1. **Situation** — Sunday evening, sofa, phone.
2. **Input** — A notification: *"Your week."* One tap.
3. **Perceives** — Seven days of sessions, load, PRs, sleep, compliance, and the deltas in the model of this athlete.
4. **Understands** — Which of the week's facts are *narratively* significant: the PR, the missed session, the fact that the confidence interval on their deadlift ceiling narrowed enough to change next week's prescription.
5. **Action** — Renders a 40-second film, server-side, deterministic motion graphics over real numbers, second-person narration.
6. **Output** — *"You lifted 14 tonnes this week. Thursday's squat moved faster at 105 than it did at 100 six weeks ago — that's the first hard evidence your strength is up rather than your effort. One thing for next week: you haven't touched a hinge in nine days."*
7. **Why it lands** — It is the first piece of fitness media that is **about you and true**. Not a filtered highlight reel — a film of your own physiology that you could not have made and cannot get anywhere else. It is also the most shareable object the company can produce.
8. **Tech** — `recap.ts` and `learned.ts` (both shipped) + a server-side renderer + TTS. **No CV, no generative video, no new science.**

**Honourable mention — the moat moment: The Verified Lift.** The athlete props the phone for a declared PR. The app counts the plates, confirms lockout, and stamps the record at tier 3 — *recorded*. It joins a ladder where a co-signed lift is tier 2 and a sanctioned meet is tier 5. This is not the most magical moment; it is the most valuable one, because it is the only one with a network behind it. Build it after the first three.

---

## 19. Red team — killing the bad ideas, including the popular ones

**This document's own biggest risk.** `reference/` already contains `north-star-strategy.md`, `performance-platform-master-strategy.md` and `a16z-investment-memo.md`. Layer 6 of the north star was *Video Intelligence* — it was built, shipped with ten unit tests, and deleted eleven months later having never analysed a single real recording. **The failure mode of this company is not a shortage of vision. It is building vision documents into code before validating demand.** If this memo becomes north-star #4, it has done harm.

**538 shipped capabilities, zero revenue mechanism.** That is the actual crisis, and no interface thesis addresses it.

**Camera-based form coaching will fail, specifically:**
- *Phone propping.* There is nowhere to put a phone in a squat rack. This alone kills the feature for most users on most days, and no model improvement fixes it.
- *Gym policy.* A growing number of commercial gyms ban filming outright. Others make it socially radioactive.
- *Bystanders.* You are recording strangers who did not consent, in a changing-adjacent space. This is a genuine legal and PR exposure, not a hypothetical.
- *Occlusion and mirrors.* Racks, benches, plates, other people, and mirrored walls that pose models happily detect as a second person.
- *Monocular depth.* Joint angle error from a single camera is meaningfully larger than the differences you would be coaching on. You would be confidently reporting noise.
- *Trust asymmetry.* One wrong "your depth is fine" before an injury and you have both a liability claim and a dead brand.

**Voice will not work for everyone.** Loud music, and a substantial minority of people will simply never talk to their phone in a public gym. **Voice must never be the only path to anything.** Every voice interaction needs a one-tap equivalent, permanently.

**Generative video of the athlete: kill it now.** Expensive, slow, uncanny, and a clip showing a rep that never happened is a category-ending trust failure. There is no version of this worth the risk.

**Proactive AI is how you get uninstalled.** Every fitness app has died of notifications. The interruption budget in §11 is not a preference; it is a survival constraint.

**Privacy and legal, concretely.** Body video is biometric data: GDPR special-category, Illinois BIPA (statutory per-violation damages, and it has killed products), Texas CUBI. Minors. Body-composition photos. Nutrition tracking with an eating-disorder exposure that most fitness companies simply ignore. If perception ever ships, **it processes on-device or it does not ship.**

**Liability language.** "Reduce your load 5% today" is coaching. "Your knee valgus indicates ACL risk" is a medical claim. The RTP rails already in the repo make this boundary sharper, not blurrier — a return-to-play protocol *looks* clinical, and that is precisely when the wording has to be most careful.

**Cost.** Continuous VLM inference on video is not free and will not be free by 2028 at the fidelity being imagined. A £12/month subscription does not fund per-user-hour video understanding. Generated video is worse. The narrated-data-film approach costs cents because it is deterministic rendering, not generation — that is not a compromise, it is the correct architecture.

**Things that sound futuristic and have no user value — say no permanently:**
AR glasses interfaces – 3D avatar digital twins – mid-air hand gestures – metaverse gyms – "here is an AI-generated ideal version of you" – continuous ambient gym cameras – a form score out of 100 (a number nobody can act on, derived from a measurement nobody can verify) – environment recognition to infer an exercise the plan already named.

**The single most likely way this fails:** the team builds a beautiful voice interface, ships it, and discovers that logging friction was never why people churned. **Validate the pain before building the cure.** Ten athletes, two weeks, a human on the other end of a text thread doing by hand what the AI would do. If they will not use a *human* coach in their pocket, they will not use a synthetic one.

---

## 20. The vision

**Today** — *We are building the system of record for the hybrid athlete: the only log that reconciles what the barbell and the road each cost you.*

**2028** — *We become the coach — an instruction, not a dashboard. The app stops showing you charts and starts telling you what to do, and it is right often enough that you stop checking.*

**2030** — *We become the credential — the verified record of what a human body can actually do, recognised because everyone's is here.*

**2035** — *If the thesis is correct, fitness becomes a continuous negotiation between an athlete and a model that understands their body better than any coach could, where the interface is a voice that mostly stays quiet.*

### One sentence

> **HYBRID is a coach with perception and memory: it prescribes your next set, hears you finish it, and keeps the only verified record of what your body can actually do.**

---

## Appendix — what to do on Monday

Ordered by ratio of impact to effort. Nothing here needs computer vision.

1. **Unblock billing.** Three credentials and one SQL script. Everything else is unmeasurable until this is done.
2. **Unblock HealthKit and the Watch glance app.** One TestFlight verification and one workflow run. The passive sensing layer is *built* and switched off.
3. **Validate the pain with ten athletes and a human coach on a text thread.** Two weeks. Before writing any voice code.
4. **Ship the Sunday Film.** The engines exist; it needs a renderer and a voice. Highest wow-per-line-of-code in the repo, and it is a retention loop, not a demo.
5. **Give the coach one daily sentence.** The load-adjustment message. One utterance a day, under the interruption budget.
6. **Prescribe + confirm-by-exception.** The 10x on interaction cost, with no new sensors.
7. **Then, and only then, voice.** Closed grammar first, LLM as the fallback.
8. **Attestation tier 3** as the one camera bet, once 1–7 have shipped and been paid for.
