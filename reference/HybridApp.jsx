import React, { useState, useEffect, useRef } from "react";

// ============================================================
//  HYBRID — Strength & Conditioning for hybrid athletes
//  Landing -> App. Athletic-editorial identity.
//  AI coach (default) + human coaching (premium).
//  Prototype: React state only. Auth/DB/AI wired in Claude Code.
// ============================================================

const INK = "#0c0d0c";
const INK2 = "#141614";
const CARD = "#16181699";
const LINE = "#2a2d2a";
const LIME = "#c4f035";
const CHALK = "#f3f4ef";
const ASH = "#8b8f86";
const BLUE = "#7fd4e8";
const VIOLET = "#c9a9f0";
const AMBER = "#f0b45e";   // sport accent

const F = `@import url('https://fonts.googleapis.com/css2?family=Sohne+Narrow:wght@500;600;700&display=swap');`;
const disp = { fontFamily: "'Sohne', sans-serif" };
const cond = { fontFamily: "'Sohne Narrow', sans-serif" };
const mono = { fontFamily: "'SohneMono', monospace" };
const body = { fontFamily: "'Sohne', sans-serif" };

const e1rm = (l, r) => (r <= 0 ? 0 : l * (1 + r / 30));
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

// ============================================================
//  i18n — PL / EN / DE. t(key) resolves to the active language,
//  falling back to English, then the key itself. Admin can edit.
// ============================================================
const LANGS = { en: "English", pl: "Polski", de: "Deutsch" };
const TRANSLATIONS = {
  en: {
    "nav.home": "Home", "nav.periodize": "Periodize", "nav.plans": "Plans", "nav.sport": "Sport", "nav.history": "History", "nav.coach": "Coach",
    "nav.roster": "Roster", "nav.inbox": "Requests",
    "role.client": "Client", "role.coach": "Coach", "role.admin": "Admin",
    "home.ready": "Ready to\ntrain.", "home.start": "START TRAINING", "home.startSub": "blank session · add as you go",
    "home.trainingFor": "Training for", "home.prescribed": "Today's prescribed session", "home.devices": "Connected devices",
    "home.streak": "day streak", "home.readiness": "readiness", "home.thisWeek": "this week",
    "periodize.kicker": "The core of smart training", "periodize.title": "Periodize",
    "plans.title": "Plans", "plans.sub": "Start with your goal. We'll show the plans built for it.",
    "plans.prebuilt": "Pre-built", "plans.custom": "Custom", "plans.chooseGoal": "Choose your goal",
    "sport.title": "What's your sport?", "history.title": "History", "coach.title": "Coach",
    "common.load": "load week", "common.deload": "deload week", "common.weeks": "weeks",
  },
  pl: {
    "nav.home": "Start", "nav.periodize": "Cykle", "nav.plans": "Plany", "nav.sport": "Sport", "nav.history": "Historia", "nav.coach": "Trener",
    "nav.roster": "Podopieczni", "nav.inbox": "Prośby",
    "role.client": "Zawodnik", "role.coach": "Trener", "role.admin": "Admin",
    "home.ready": "Gotowy do\ntreningu.", "home.start": "ZACZNIJ TRENING", "home.startSub": "pusta sesja · dodawaj na bieżąco",
    "home.trainingFor": "Cel treningowy", "home.prescribed": "Dzisiejsza zalecana sesja", "home.devices": "Połączone urządzenia",
    "home.streak": "dni z rzędu", "home.readiness": "gotowość", "home.thisWeek": "ten tydzień",
    "periodize.kicker": "Rdzeń mądrego treningu", "periodize.title": "Periodyzacja",
    "plans.title": "Plany", "plans.sub": "Zacznij od celu. Pokażemy plany dopasowane do niego.",
    "plans.prebuilt": "Gotowe", "plans.custom": "Własne", "plans.chooseGoal": "Wybierz swój cel",
    "sport.title": "Jaki jest Twój sport?", "history.title": "Historia", "coach.title": "Trener",
    "common.load": "tydzień obciążenia", "common.deload": "tydzień regeneracji", "common.weeks": "tygodni",
  },
  de: {
    "nav.home": "Start", "nav.periodize": "Zyklen", "nav.plans": "Pläne", "nav.sport": "Sport", "nav.history": "Verlauf", "nav.coach": "Coach",
    "nav.roster": "Athleten", "nav.inbox": "Anfragen",
    "role.client": "Athlet", "role.coach": "Coach", "role.admin": "Admin",
    "home.ready": "Bereit zum\nTraining.", "home.start": "TRAINING STARTEN", "home.startSub": "leere Einheit · nach Bedarf hinzufügen",
    "home.trainingFor": "Trainingsziel", "home.prescribed": "Heutige empfohlene Einheit", "home.devices": "Verbundene Geräte",
    "home.streak": "Tage in Folge", "home.readiness": "Bereitschaft", "home.thisWeek": "diese Woche",
    "periodize.kicker": "Der Kern klugen Trainings", "periodize.title": "Periodisierung",
    "plans.title": "Pläne", "plans.sub": "Beginne mit deinem Ziel. Wir zeigen die passenden Pläne.",
    "plans.prebuilt": "Vorgefertigt", "plans.custom": "Eigene", "plans.chooseGoal": "Wähle dein Ziel",
    "sport.title": "Was ist deine Sportart?", "history.title": "Verlauf", "coach.title": "Coach",
    "common.load": "Belastungswoche", "common.deload": "Entlastungswoche", "common.weeks": "Wochen",
  },
};
function makeT(lang) {
  return (key) => (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || TRANSLATIONS.en[key] || key;
}

// Goal-first hierarchy: choose a goal, then see the plans built for it.
const GOAL_TREE = [
  { id: "bb", name: "Bodybuilding", icon: "■", color: VIOLET, blurb: "Maximize muscle. Train splits, chase volume and progressive overload.",
    plans: [
      { id: "bb1", name: "Push / Pull / Legs", weeks: 8, sessions: 6, tag: "PPL", desc: "The classic 6-day hypertrophy split. High volume, full coverage.", focus: ["Hypertrophy"], hot: true },
      { id: "bb2", name: "Upper / Lower", weeks: 8, sessions: 4, tag: "U/L", desc: "4-day split balancing frequency and recovery. Great for naturals.", focus: ["Hypertrophy", "Strength"] },
      { id: "bb3", name: "Full Body (FBW)", weeks: 6, sessions: 3, tag: "FBW", desc: "3-day full-body. Maximum frequency per muscle, time-efficient.", focus: ["Hypertrophy"] },
      { id: "bb4", name: "Powerbuilding", weeks: 9, sessions: 4, tag: "Hybrid", desc: "Bigger and stronger — heavy compounds plus hypertrophy accessories.", focus: ["Strength", "Hypertrophy"] },
    ]},
  { id: "hyrox", name: "Hyrox", icon: "●", color: LIME, blurb: "Race the 8-station functional fitness event. Compromised running is everything.",
    plans: [
      { id: "hx1", name: "Hyrox Race Prep", weeks: 10, sessions: 5, tag: "Race", desc: "Compromised running, sled push/pull, and all 8 stations dialed in.", focus: ["Engine", "Strength-Endurance"], hot: true },
      { id: "hx2", name: "Hyrox Base Builder", weeks: 8, sessions: 4, tag: "Base", desc: "Aerobic base and strength-endurance for first-time competitors.", focus: ["Engine", "Strength"] },
      { id: "hx3", name: "Hyrox Peak", weeks: 6, sessions: 5, tag: "Peak", desc: "Sharpen for race day — pacing, transitions, station efficiency.", focus: ["Race"] },
    ]},
  { id: "tri", name: "Triathlon", icon: "◆", color: BLUE, blurb: "Swim-bike-run endurance. Strength work that supports, not sabotages.",
    plans: [
      { id: "tri1", name: "Strength for Triathletes", weeks: 12, sessions: 2, tag: "Support", desc: "Low-volume, high-value lifting to bulletproof joints without adding fatigue.", focus: ["Strength"], hot: true },
      { id: "tri2", name: "Off-Season Power", weeks: 8, sessions: 3, tag: "Base", desc: "Build raw strength in the off-season before sport-specific volume ramps.", focus: ["Strength", "Power"] },
      { id: "tri3", name: "In-Season Maintenance", weeks: 10, sessions: 2, tag: "Maintain", desc: "Keep strength while swim-bike-run volume peaks. Minimal interference.", focus: ["Strength"] },
    ]},
  { id: "hybrid", name: "Hybrid Athlete", icon: "▲", color: LIME, blurb: "Lift heavy and train your sport. Strength that carries over to running, combat, court, or crag.",
    plans: [
      { id: "hy1", name: "Hybrid Base", weeks: 8, sessions: 4, tag: "Foundation", desc: "Build a squat and a sub-8:00 2k in parallel. The on-ramp for everyone.", focus: ["Strength", "Engine"], hot: true },
      { id: "hy2", name: "Lift + Run", weeks: 10, sessions: 5, tag: "Endurance", desc: "Concurrent strength and running without the legs-feel-dead interference tax.", focus: ["Strength", "Running"] },
      { id: "hy3", name: "Strength for Combat", weeks: 12, sessions: 4, tag: "Combat", desc: "Power, grip, and conditioning for BJJ / boxing / MMA — built around your mat time.", focus: ["Strength", "Power", "Combat"] },
      { id: "hy4", name: "Climb + Strength", weeks: 8, sessions: 4, tag: "Outdoor", desc: "Pulling strength and core for climbers, programmed around sessions on the wall.", focus: ["Strength", "Climbing"] },
      { id: "hy5", name: "Tactical Operator", weeks: 12, sessions: 5, tag: "Tactical", desc: "Load-bearing strength, rucking, and work capacity under fatigue.", focus: ["Strength", "Conditioning", "Ruck"] },
    ]},
  { id: "power", name: "Powerlifting", icon: "▬", color: VIOLET, blurb: "One goal: a bigger squat, bench, and deadlift total.",
    plans: [
      { id: "pl1", name: "Linear Progression", weeks: 12, sessions: 3, tag: "Novice", desc: "Add weight every session. The fastest path for newer lifters.", focus: ["Strength"], hot: true },
      { id: "pl2", name: "Block Periodization", weeks: 16, sessions: 4, tag: "Advanced", desc: "Volume, intensity, and peak blocks toward a meet day.", focus: ["Strength", "Power"] },
    ]},
];

// flat list still used by the landing carousel (top plan per goal)
const PLANS = GOAL_TREE.map((g) => ({ ...g.plans[0], color: g.color }));

// ============================================================
//  PLAN DETAIL — every plan gets a full workout summary:
//  level, who it's for, outcome, duration/frequency, split,
//  a fully-spec'd sample session, progression, equipment.
// ============================================================
const PLAN_DETAIL = {
  // ---------- BODYBUILDING ----------
  bb1: { level: "Intermediate", forWho: "Lifters with 1+ yr training who can train 6 days/wk. Suits all; higher volume favors those recovering well.", outcome: "Visible muscle gain across all groups; +2–4 kg lean mass over the block done right.", sessionLength: "60–75 min", equipment: "Full gym (barbell, dumbbells, cables, machines)",
    split: ["Push", "Pull", "Legs", "Push", "Pull", "Legs", "Rest"],
    sample: { day: "Push day", items: [
      { name: "Bench Press", sr: "4 × 6–8", rest: "2:30", rpe: "8" },
      { name: "Incline DB Press", sr: "3 × 10", rest: "2:00", rpe: "8" },
      { name: "Overhead Press", sr: "3 × 8", rest: "2:00", rpe: "8" },
      { name: "Cable Fly", sr: "3 × 12–15", rest: "1:30", rpe: "9" },
      { name: "Lateral Raise", sr: "4 × 15", rest: "1:00", rpe: "9" },
      { name: "Tricep Pushdown", sr: "3 × 12", rest: "1:00", rpe: "9" },
    ] },
    progression: "Double progression: add reps within the range, then add load when you hit the top. Volume rises weeks 1–3, deload week 4." },
  bb2: { level: "Beginner–Intermediate", forWho: "Great for naturals and anyone wanting strength + size on 4 days/wk. Sex-neutral.", outcome: "Balanced size and strength; strong base before specializing.", sessionLength: "60 min", equipment: "Barbell, dumbbells, basic machines",
    split: ["Upper", "Lower", "Rest", "Upper", "Lower", "Rest", "Rest"],
    sample: { day: "Upper day", items: [
      { name: "Bench Press", sr: "4 × 6", rest: "2:30", rpe: "8" },
      { name: "Barbell Row", sr: "4 × 8", rest: "2:00", rpe: "8" },
      { name: "Overhead Press", sr: "3 × 8", rest: "2:00", rpe: "8" },
      { name: "Lat Pulldown", sr: "3 × 10", rest: "1:30", rpe: "8" },
      { name: "DB Curl", sr: "3 × 12", rest: "1:00", rpe: "9" },
    ] },
    progression: "Linear: add 2.5kg to main lifts each week while reps hold. Reset 10% and rebuild if a lift stalls twice." },
  bb3: { level: "Beginner", forWho: "New lifters or anyone time-limited to 3 days/wk. Highest frequency per muscle — ideal for learning movements.", outcome: "Fast early strength and size; movement competence on the main lifts.", sessionLength: "45–60 min", equipment: "Barbell, dumbbells",
    split: ["Full Body", "Rest", "Full Body", "Rest", "Full Body", "Rest", "Rest"],
    sample: { day: "Full body", items: [
      { name: "Back Squat", sr: "3 × 5", rest: "3:00", rpe: "7" },
      { name: "Bench Press", sr: "3 × 5", rest: "2:30", rpe: "7" },
      { name: "Barbell Row", sr: "3 × 8", rest: "2:00", rpe: "8" },
      { name: "Romanian Deadlift", sr: "3 × 8", rest: "2:00", rpe: "8" },
      { name: "Plank", sr: "3 × 45s", rest: "1:00", rpe: "—" },
    ] },
    progression: "Add 2.5kg every session you hit all reps. The simplest, fastest beginner progression." },
  bb4: { level: "Intermediate–Advanced", forWho: "Lifters who want to look strong and be strong. Assumes solid technique on the big three.", outcome: "Bigger lifts + more muscle; the best of both worlds.", sessionLength: "70–85 min", equipment: "Full gym",
    split: ["Lower (Strength)", "Upper (Strength)", "Rest", "Lower (Hypertrophy)", "Upper (Hypertrophy)", "Rest", "Rest"],
    sample: { day: "Lower (Strength)", items: [
      { name: "Back Squat", sr: "5 × 3", rest: "3:00", rpe: "8" },
      { name: "Deadlift", sr: "3 × 3", rest: "3:00", rpe: "8" },
      { name: "Leg Press", sr: "3 × 10", rest: "2:00", rpe: "8" },
      { name: "Leg Curl", sr: "3 × 12", rest: "1:30", rpe: "9" },
      { name: "Calf Raise", sr: "4 × 12", rest: "1:00", rpe: "9" },
    ] },
    progression: "Strength days: linear load on triples. Hypertrophy days: double progression. Deload every 4th week." },

  // ---------- HYROX ----------
  hx1: { level: "Intermediate–Advanced", forWho: "Athletes with an aerobic base targeting a Hyrox race. Demands consistent running.", outcome: "Race-ready: faster compromised running, stronger stations, dialed pacing.", sessionLength: "60–90 min", equipment: "Sled, ski erg, rower, kettlebells, wall ball, sandbag",
    split: ["Run + Strength", "Stations", "Easy Run", "Compromised Running", "Strength", "Long Run / Sim", "Rest"],
    sample: { day: "Compromised running", items: [
      { name: "Run", sr: "4 × 1 km @ race pace", rest: "—", rpe: "8" },
      { name: "Sled Push", sr: "4 × 25 m", rest: "between runs", rpe: "9" },
      { name: "Wall Balls", sr: "4 × 25", rest: "—", rpe: "8" },
      { name: "Row", sr: "4 × 500 m", rest: "—", rpe: "8" },
    ] },
    progression: "Build run volume + station load weeks 1–8, sharpen pacing weeks 9–10, taper into race week." },
  hx2: { level: "Beginner", forWho: "First-time Hyrox athletes building the engine and base strength. All welcome.", outcome: "The aerobic base and strength-endurance to complete your first Hyrox strong.", sessionLength: "45–60 min", equipment: "Rower, kettlebells, basic strength kit",
    split: ["Zone 2 Run", "Full Body Strength", "Rest", "Intervals", "Strength-Endurance", "Easy Long Run", "Rest"],
    sample: { day: "Strength-endurance", items: [
      { name: "Goblet Squat", sr: "4 × 15", rest: "1:30", rpe: "8" },
      { name: "KB Swing", sr: "4 × 20", rest: "1:30", rpe: "8" },
      { name: "Walking Lunge", sr: "3 × 20", rest: "1:30", rpe: "8" },
      { name: "Row", sr: "3 × 500 m", rest: "2:00", rpe: "7" },
    ] },
    progression: "Mostly volume: extend Z2 runs and circuit rounds weekly. Intensity stays moderate to build the base safely." },
  hx3: { level: "Advanced", forWho: "Experienced Hyrox racers peaking for a target event in the next 6 weeks.", outcome: "Peak race performance — sharpened pacing, station efficiency, fast transitions.", sessionLength: "60–75 min", equipment: "Full Hyrox station kit",
    split: ["Race-Pace Run", "Station Speed", "Easy Run", "Full Sim", "Recovery", "Pacing Run", "Rest"],
    sample: { day: "Full simulation", items: [
      { name: "8 × (1km Run + 1 Station)", sr: "race format", rest: "as per race", rpe: "9" },
    ] },
    progression: "Volume drops, intensity holds. Each week sharpens race execution; final week is a full taper." },

  // ---------- TRIATHLON ----------
  tri1: { level: "All levels", forWho: "Triathletes who want injury-proofing without adding fatigue. Low time cost — 2 days/wk.", outcome: "Stronger, more durable, more economical — without compromising swim/bike/run volume.", sessionLength: "40–45 min", equipment: "Barbell, dumbbells",
    split: ["Strength A", "Rest", "Rest", "Strength B", "Rest", "Rest", "Rest"],
    sample: { day: "Strength A", items: [
      { name: "Back Squat", sr: "3 × 5", rest: "2:30", rpe: "7" },
      { name: "Romanian Deadlift", sr: "3 × 8", rest: "2:00", rpe: "7" },
      { name: "Single-leg Step-up", sr: "3 × 10/leg", rest: "1:30", rpe: "7" },
      { name: "Plank", sr: "3 × 45s", rest: "1:00", rpe: "—" },
    ] },
    progression: "Low volume, quality load. Add small load while keeping RPE ≤ 8 so it never interferes with sport training." },
  tri2: { level: "Intermediate", forWho: "Triathletes in the off-season ready to build raw strength before sport volume ramps.", outcome: "A higher strength ceiling that carries into the season as power and durability.", sessionLength: "55 min", equipment: "Barbell, dumbbells, plyo box",
    split: ["Lower Power", "Rest", "Upper + Core", "Rest", "Full Body", "Rest", "Rest"],
    sample: { day: "Lower power", items: [
      { name: "Back Squat", sr: "4 × 4", rest: "3:00", rpe: "8" },
      { name: "Trap Bar Jump", sr: "4 × 3", rest: "2:30", rpe: "7" },
      { name: "Romanian Deadlift", sr: "3 × 6", rest: "2:00", rpe: "8" },
      { name: "Calf Raise", sr: "3 × 12", rest: "1:00", rpe: "8" },
    ] },
    progression: "Off-season build: load climbs over 3-week blocks with a deload, before sport-specific volume takes priority." },
  tri3: { level: "All levels", forWho: "Triathletes mid-season needing to keep strength while race volume peaks. Minimal interference.", outcome: "Maintain the strength you built without stealing recovery from key sessions.", sessionLength: "30–35 min", equipment: "Barbell or dumbbells",
    split: ["Maintenance A", "Rest", "Rest", "Maintenance B", "Rest", "Rest", "Rest"],
    sample: { day: "Maintenance A", items: [
      { name: "Back Squat", sr: "2 × 4", rest: "2:30", rpe: "7" },
      { name: "Bench or Push-up", sr: "2 × 6", rest: "2:00", rpe: "7" },
      { name: "Single-leg RDL", sr: "2 × 8/leg", rest: "1:30", rpe: "7" },
    ] },
    progression: "Hold load, low volume — just enough stimulus to retain strength. Never to failure in-season." },

  // ---------- HYBRID ----------
  hy1: { level: "Beginner–Intermediate", forWho: "Anyone wanting to lift and condition at once. The default on-ramp for hybrid athletes.", outcome: "A real squat and a sub-8:00 2k row — strength and engine, built together.", sessionLength: "60 min", equipment: "Barbell, rower, basic kit",
    split: ["Strength + Engine", "Easy Run", "Rest", "Strength + Engine", "Intervals", "Long Easy", "Rest"],
    sample: { day: "Strength + Engine", items: [
      { name: "Back Squat", sr: "4 × 5", rest: "2:30", rpe: "8" },
      { name: "Bench Press", sr: "3 × 8", rest: "2:00", rpe: "8" },
      { name: "Row Intervals", sr: "8 × 40s/20s", rest: "built-in", rpe: "8" },
    ] },
    progression: "Strength climbs linearly; conditioning volume rises weekly. Concurrent training kept low-interference." },
  hy2: { level: "Intermediate", forWho: "Runners who lift, or lifters adding running. Manages the interference effect directly.", outcome: "Hold (or build) strength while running improves — the hybrid holy grail.", sessionLength: "60–70 min", equipment: "Barbell, running route",
    split: ["Heavy Lower", "Easy Run", "Upper", "Tempo Run", "Power", "Long Run", "Rest"],
    sample: { day: "Heavy lower", items: [
      { name: "Back Squat", sr: "5 × 3", rest: "3:00", rpe: "8" },
      { name: "Romanian Deadlift", sr: "3 × 6", rest: "2:30", rpe: "8" },
      { name: "Walking Lunge", sr: "3 × 12", rest: "1:30", rpe: "8" },
    ] },
    progression: "Lifting and running kept on separate days where possible; hard runs away from heavy legs to limit interference." },
  hy3: { level: "Intermediate–Advanced", forWho: "Combat athletes (BJJ/boxing/MMA) wanting strength that carries to the mat, around their training.", outcome: "More power, grip, and conditioning — without overtraining alongside sport sessions.", sessionLength: "50–60 min", equipment: "Barbell, kettlebells, pull-up bar",
    split: ["Power", "Sport (own)", "Strength", "Sport (own)", "Conditioning", "Sport (own)", "Rest"],
    sample: { day: "Power", items: [
      { name: "Power Clean", sr: "5 × 2", rest: "2:30", rpe: "8" },
      { name: "Trap Bar Deadlift", sr: "4 × 4", rest: "2:30", rpe: "8" },
      { name: "Farmer's Carry", sr: "4 × 40 m", rest: "1:30", rpe: "8" },
    ] },
    progression: "Strength work autoregulated around mat fatigue — RPE-capped so sport always comes first." },
  hy4: { level: "Intermediate", forWho: "Climbers wanting pulling strength and core without bulking. Built around wall sessions.", outcome: "Stronger pulls and tension for harder routes, programmed around your climbing.", sessionLength: "45–55 min", equipment: "Pull-up bar, hangboard, barbell",
    split: ["Climb (own)", "Pull Strength", "Climb (own)", "Core + Antagonist", "Climb (own)", "Rest", "Rest"],
    sample: { day: "Pull strength", items: [
      { name: "Weighted Pull-up", sr: "4 × 5", rest: "3:00", rpe: "8" },
      { name: "Hangboard Repeaters", sr: "6 × 7s", rest: "3:00", rpe: "8" },
      { name: "Front Lever Progression", sr: "4 × 10s", rest: "2:00", rpe: "8" },
    ] },
    progression: "Finger and pulling load build slowly to protect tendons; antagonist work prevents climber's imbalances." },
  hy5: { level: "Advanced", forWho: "Tactical / military / first-responder athletes needing strength + work capacity under load.", outcome: "Carry heavy, move far, recover fast — durable all-round capability.", sessionLength: "70–80 min", equipment: "Barbell, ruck, sled, kettlebells",
    split: ["Strength", "Ruck", "Conditioning", "Strength", "Work Capacity", "Long Ruck", "Rest"],
    sample: { day: "Work capacity", items: [
      { name: "Front Squat", sr: "4 × 5", rest: "2:30", rpe: "8" },
      { name: "Sandbag Clean", sr: "5 × 5", rest: "2:00", rpe: "8" },
      { name: "Ruck Intervals", sr: "6 × 400 m @ 20kg", rest: "1:1", rpe: "8" },
    ] },
    progression: "Strength and load-carry volume rise together; periodic test weeks (ruck time, max carry) gauge readiness." },

  // ---------- POWERLIFTING ----------
  pl1: { level: "Beginner", forWho: "New lifters who want a bigger squat/bench/deadlift total fast. Sex-neutral; the fastest path early on.", outcome: "Rapid total gains — often +30–50kg on the combined total in the first block.", sessionLength: "60 min", equipment: "Barbell, rack, bench",
    split: ["Squat + Bench", "Rest", "Deadlift + OHP", "Rest", "Squat + Bench", "Rest", "Rest"],
    sample: { day: "Squat + Bench", items: [
      { name: "Back Squat", sr: "3 × 5", rest: "3:00", rpe: "8" },
      { name: "Bench Press", sr: "3 × 5", rest: "3:00", rpe: "8" },
      { name: "Accessory (chosen)", sr: "3 × 8–10", rest: "1:30", rpe: "8" },
    ] },
    progression: "Add 2.5kg (upper) / 5kg (lower) every session. Reset 10% and rebuild after a failed week — classic linear progression." },
  pl2: { level: "Advanced", forWho: "Experienced powerlifters peaking for a meet. Requires a known 1RM on each lift.", outcome: "A peaked total on meet day via accumulation → intensification → realization.", sessionLength: "75–90 min", equipment: "Full powerlifting setup, competition kit",
    split: ["Squat (main)", "Bench (main)", "Rest", "Deadlift (main)", "Bench (volume)", "Rest", "Rest"],
    sample: { day: "Squat (main)", items: [
      { name: "Back Squat", sr: "5 × 3 @ 80%", rest: "3:30", rpe: "8" },
      { name: "Paused Squat", sr: "3 × 3 @ 70%", rest: "3:00", rpe: "8" },
      { name: "Leg Press", sr: "3 × 10", rest: "2:00", rpe: "8" },
    ] },
    progression: "Block periodization: volume (wks 1–6) → intensity (7–12) → peak/taper (13–16). %1RM rises as reps fall toward meet day." },
};

// resolve a plan id to its full detail, filling any gaps with sane defaults
function planDetail(id, plan) {
  const d = PLAN_DETAIL[id] || {};
  return {
    level: d.level || "All levels",
    forWho: d.forWho || "Suitable for most trainees at the stated level.",
    outcome: d.outcome || "Consistent progress toward your goal.",
    sessionLength: d.sessionLength || "60 min",
    equipment: d.equipment || "Basic gym",
    split: d.split || ["Train", "Rest", "Train", "Rest", "Train", "Rest", "Rest"],
    sample: d.sample || { day: "Sample day", items: [{ name: "—", sr: "—", rest: "—", rpe: "—" }] },
    progression: d.progression || "Progressive overload week to week, with a deload every 4th week.",
  };
}

// Exercise catalog for the in-session picker. `last` prefills the logger.
const CATALOG = {
  Strength: [
    { name: "Back Squat", kind: "strength", last: { load: "100", reps: "5" } },
    { name: "Front Squat", kind: "strength", last: { load: "85", reps: "5" } },
    { name: "Deadlift", kind: "strength", last: { load: "140", reps: "3" } },
    { name: "Bench Press", kind: "strength", last: { load: "100", reps: "5" } },
    { name: "Overhead Press", kind: "strength", last: { load: "60", reps: "5" } },
    { name: "Barbell Row", kind: "strength", last: { load: "80", reps: "8" } },
    { name: "Romanian Deadlift", kind: "strength", last: { load: "110", reps: "8" } },
    { name: "Pull-up", kind: "strength", last: { load: "0", reps: "10" } },
  ],
  Olympic: [
    { name: "Snatch", kind: "strength", technical: true, last: { load: "60", reps: "2" } },
    { name: "Clean & Jerk", kind: "strength", technical: true, last: { load: "80", reps: "2" } },
    { name: "Power Clean", kind: "strength", technical: true, last: { load: "70", reps: "3" } },
  ],
  Conditioning: [
    { name: "Row Intervals", kind: "conditioning", format: "Intervals", work: 40, rest: 20, rounds: 8 },
    { name: "Assault Bike", kind: "conditioning", format: "EMOM", rounds: 10 },
    { name: "Easy Run", kind: "conditioning", format: "Steady" },
    { name: "Mixed Metcon", kind: "conditioning", format: "AMRAP", cap: 720 },
  ],
  Skill: [
    { name: "Muscle-up", kind: "skill" },
    { name: "Handstand Push-up", kind: "skill" },
    { name: "Toes-to-Bar", kind: "skill" },
    { name: "Double-unders", kind: "skill" },
  ],
  Accessory: [
    { name: "Dumbbell Curl", kind: "strength", last: { load: "16", reps: "12" } },
    { name: "Face Pull", kind: "strength", last: { load: "25", reps: "15" } },
    { name: "Lateral Raise", kind: "strength", last: { load: "10", reps: "15" } },
    { name: "Cable Tricep", kind: "strength", last: { load: "30", reps: "12" } },
  ],
};
const FLAT_CATALOG = Object.entries(CATALOG).flatMap(([cat, arr]) => arr.map((e) => ({ ...e, cat })));
const RECENT = ["Back Squat", "Bench Press", "Row Intervals", "Deadlift", "Pull-up"];

// Sports — a distinct block kind. `metric` decides which fields the logger shows.
//   distance: distance + pace/time   |   combat: rounds + sparring time
//   match: sets/score + duration     |   ascent: distance/laps + grade
// ============================================================
//  SPORT-DRIVEN TRAINING
//  Pick a sport + level → the engine prescribes the S&C work
//  that makes you better AT that sport. Sport is the goal;
//  exercises are the means.
// ============================================================

const LEVELS = ["Beginner", "Intermediate", "Advanced", "Elite"];

// Each sport: physical demands (ranked), a performance marker, and an
// exercise pool tagged by which demand it trains + the level it suits.
// lvl = min level index (0=Beginner) the exercise is appropriate from.
const SPORTS = {
  Running: {
    icon: "🏃", family: "Endurance",
    marker: { label: "Current 5k time", ph: "e.g. 24:30" },
    demands: ["Unilateral leg strength", "Posterior chain", "Ankle/tendon stiffness", "Running economy"],
    pool: [
      { name: "Bulgarian Split Squat", demand: "Unilateral leg strength", lvl: 0, why: "Fixes left-right imbalance — the #1 cause of running injury." },
      { name: "Romanian Deadlift", demand: "Posterior chain", lvl: 0, why: "Stronger hamstrings/glutes drive a more powerful stride." },
      { name: "Calf Raise (slow)", demand: "Ankle/tendon stiffness", lvl: 0, why: "Builds the Achilles resilience runners chronically lack." },
      { name: "Pogo Hops", demand: "Ankle/tendon stiffness", lvl: 1, why: "Trains reactive stiffness — free speed via better energy return." },
      { name: "Box Jumps", demand: "Running economy", lvl: 1, why: "Develops the explosive power that lowers ground-contact time." },
      { name: "Depth Jumps", demand: "Running economy", lvl: 2, why: "Advanced plyometric for elastic, reactive running mechanics." },
    ],
  },
  Climbing: {
    icon: "🧗", family: "Outdoor",
    marker: { label: "Hardest redpoint grade", ph: "e.g. 6c+ / V5" },
    demands: ["Pulling strength", "Grip / finger strength", "Core tension", "Shoulder stability"],
    pool: [
      { name: "Pull-up", demand: "Pulling strength", lvl: 0, why: "Foundational pulling power for steeper terrain." },
      { name: "Hollow Body Hold", demand: "Core tension", lvl: 0, why: "The body tension that keeps your feet on overhangs." },
      { name: "Scapular Pull-up", demand: "Shoulder stability", lvl: 0, why: "Protects shoulders from the climber's chronic injuries." },
      { name: "Hangboard Repeaters", demand: "Grip / finger strength", lvl: 1, why: "The single highest-return exercise above intermediate." },
      { name: "Weighted Pull-up", demand: "Pulling strength", lvl: 2, why: "Max-strength pulling for hard, powerful moves." },
      { name: "Front Lever Progression", demand: "Core tension", lvl: 2, why: "Elite tension for steep, cutting-loose climbing." },
    ],
  },
  BJJ: {
    icon: "🥋", family: "Combat",
    marker: { label: "Belt / years", ph: "e.g. Blue, 2 yrs" },
    demands: ["Grip endurance", "Hip power", "Isometric strength", "Conditioning"],
    pool: [
      { name: "Deadlift", demand: "Hip power", lvl: 0, why: "Hip drive for sweeps, bridges, and takedowns." },
      { name: "Towel Pull-up Hold", demand: "Grip endurance", lvl: 0, why: "Grip that survives the whole round — gi or no-gi." },
      { name: "Farmer's Carry", demand: "Grip endurance", lvl: 0, why: "Crushing grip endurance plus full-body tension." },
      { name: "Bear Crawl Intervals", demand: "Conditioning", lvl: 1, why: "Scramble-specific conditioning in grappling positions." },
      { name: "Zercher Squat", demand: "Isometric strength", lvl: 1, why: "Trains the clinch-and-hold isometric demand of grappling." },
      { name: "Power Clean", demand: "Hip power", lvl: 2, why: "Explosive triple extension for takedowns and throws." },
    ],
  },
  Cycling: {
    icon: "🚴", family: "Endurance",
    marker: { label: "FTP (watts)", ph: "e.g. 240" },
    demands: ["Leg strength", "Posterior chain", "Single-leg power", "Core"],
    pool: [
      { name: "Back Squat", demand: "Leg strength", lvl: 0, why: "Raw leg strength raises your sustainable power floor." },
      { name: "Romanian Deadlift", demand: "Posterior chain", lvl: 0, why: "Balances quad-dominant cyclists, protects the lower back." },
      { name: "Step-up", demand: "Single-leg power", lvl: 0, why: "Mirrors the single-leg pedal drive directly." },
      { name: "Plank Series", demand: "Core", lvl: 0, why: "A stable core transfers leg power to the pedals." },
      { name: "Trap Bar Jump", demand: "Single-leg power", lvl: 2, why: "Explosive power for sprints and breakaways." },
    ],
  },
  Boxing: {
    icon: "🥊", family: "Combat",
    marker: { label: "Bouts / experience", ph: "e.g. amateur, 10 bouts" },
    demands: ["Rotational power", "Shoulder endurance", "Conditioning", "Leg drive"],
    pool: [
      { name: "Med Ball Rotational Throw", demand: "Rotational power", lvl: 0, why: "Hip-to-fist rotational power — where punch force comes from." },
      { name: "Push-up Variations", demand: "Shoulder endurance", lvl: 0, why: "Shoulders that don't drop in the later rounds." },
      { name: "Assault Bike Intervals", demand: "Conditioning", lvl: 0, why: "Round-specific anaerobic conditioning." },
      { name: "Jump Squat", demand: "Leg drive", lvl: 1, why: "Explosive legs for footwork and punching off the back foot." },
      { name: "Landmine Punch Press", demand: "Rotational power", lvl: 2, why: "Loaded punch-pattern power for advanced fighters." },
    ],
  },
  Swimming: {
    icon: "🏊", family: "Endurance",
    marker: { label: "100m time", ph: "e.g. 1:25" },
    demands: ["Lat / pulling strength", "Shoulder stability", "Core", "Posterior chain"],
    pool: [
      { name: "Lat Pulldown", demand: "Lat / pulling strength", lvl: 0, why: "The catch-and-pull is everything — build the lats behind it." },
      { name: "Band Pull-apart", demand: "Shoulder stability", lvl: 0, why: "Bulletproofs the swimmer's most-injured joint." },
      { name: "Hollow Body Hold", demand: "Core", lvl: 0, why: "Streamline body position lives in the core." },
      { name: "Pull-up", demand: "Lat / pulling strength", lvl: 1, why: "Bodyweight pulling power that transfers to the stroke." },
      { name: "Cable Straight-arm Pulldown", demand: "Lat / pulling strength", lvl: 2, why: "Mimics the exact freestyle pull path under load." },
    ],
  },
};
const SPORT_NAMES = Object.keys(SPORTS);

// ---- the prescription engine: sport(s) + level -> ranked exercises + a session ----
function prescribeForSport(sportName, levelIdx) {
  const sport = SPORTS[sportName];
  // exercises appropriate for this level, ranked by demand priority order
  const eligible = sport.pool.filter((e) => e.lvl <= levelIdx);
  const ranked = [...eligible].sort((a, b) => sport.demands.indexOf(a.demand) - sport.demands.indexOf(b.demand));
  // build today's session: top exercise from each of the first 3 demands, dosed by level
  const seen = new Set();
  const picks = [];
  for (const d of sport.demands) {
    const ex = ranked.find((e) => e.demand === d && !seen.has(e.name));
    if (ex) { seen.add(ex.name); picks.push(ex); }
    if (picks.length >= 3) break;
  }
  const setScheme = ["3×8", "4×6", "4×5", "5×3"][levelIdx];
  const blocks = picks.map((p) => ({ name: p.name, scheme: setScheme, demand: p.demand }));
  return { sport, ranked, blocks, setScheme };
}

// ============================================================
//  PERIODIZATION
//  Macrocycle (season) -> Mesocycles (3-4wk phase blocks)
//  -> Microcycles (weeks, loading vs recovery).
//  Two phase models by goal. Generator works date-backward
//  (peak on the event) or stacks blocks forward.
// ============================================================

// each phase: label, weeks, intensity 0-100, volume 0-100, color, focus, the work:recovery pattern
const PHASE_MODELS = {
  endurance: {
    name: "Endurance model",
    phases: [
      { key: "base", label: "Base", weeks: 4, intensity: 45, volume: 90, color: "#7fd4e8", focus: "Aerobic & muscular endurance", pattern: "3 load / 1 recovery" },
      { key: "build", label: "Build", weeks: 3, intensity: 70, volume: 75, color: LIME, focus: "Threshold & VO₂ max", pattern: "2 load / 1 recovery" },
      { key: "peak", label: "Peak", weeks: 3, intensity: 90, volume: 50, color: "#f0b45e", focus: "Anaerobic capacity & power", pattern: "2 load / 1 recovery" },
      { key: "taper", label: "Taper", weeks: 1, intensity: 75, volume: 30, color: "#c9a9f0", focus: "Sharpen, shed fatigue", pattern: "race week" },
      { key: "recovery", label: "Recovery", weeks: 2, intensity: 30, volume: 35, color: "#8b8f86", focus: "Rest & regenerate", pattern: "easy" },
    ],
  },
  strength: {
    name: "Strength model",
    phases: [
      { key: "hypertrophy", label: "Hypertrophy", weeks: 4, intensity: 60, volume: 90, color: "#7fd4e8", focus: "Muscle mass, work capacity", pattern: "3 load / 1 deload" },
      { key: "strength", label: "Strength", weeks: 4, intensity: 80, volume: 65, color: LIME, focus: "Maximal force, heavy loads", pattern: "3 load / 1 deload" },
      { key: "power", label: "Power", weeks: 3, intensity: 85, volume: 45, color: "#f0b45e", focus: "Rate of force, explosiveness", pattern: "2 load / 1 deload" },
      { key: "peak", label: "Peak", weeks: 1, intensity: 95, volume: 25, color: "#c9a9f0", focus: "Express peak strength", pattern: "test week" },
      { key: "deload", label: "Deload", weeks: 2, intensity: 35, volume: 35, color: "#8b8f86", focus: "Supercompensate", pattern: "easy" },
    ],
  },
};

// goals/sports -> which phase model
const MODEL_FOR = {
  Running: "endurance", Cycling: "endurance", Swimming: "endurance", Hyrox: "endurance", Triathlon: "endurance",
  Bodybuilding: "strength", Powerlifting: "strength", Climbing: "strength", BJJ: "strength", Boxing: "strength", Hybrid: "strength",
};
function modelFor(goalOrSport) { return PHASE_MODELS[MODEL_FOR[goalOrSport] || "strength"]; }

// build a macrocycle. If eventInWeeks given, fit phases working backward from the event
// (taper/peak nearest), else stack all phases forward from now.
function buildMacrocycle(goalOrSport, eventInWeeks) {
  const model = modelFor(goalOrSport);
  let phases = model.phases.filter((p) => p.key !== "recovery" && p.key !== "deload"); // active build
  const recovery = model.phases.find((p) => p.key === "recovery" || p.key === "deload");

  let mesos;
  if (eventInWeeks) {
    // work backward: taper/peak land ON the event; trim/fit earlier phases into available weeks
    const ordered = [...phases]; // base...taper, in order
    let total = ordered.reduce((s, p) => s + p.weeks, 0);
    // scale to fit available weeks (min 1 each)
    const scale = eventInWeeks / total;
    mesos = ordered.map((p) => ({ ...p, weeks: Math.max(1, Math.round(p.weeks * scale)) }));
  } else {
    mesos = [...phases, recovery]; // forward stack incl. recovery at the end
  }

  // assign week ranges + microcycles
  let weekCursor = 0;
  const blocks = mesos.map((p) => {
    const micros = Array.from({ length: p.weeks }, (_, i) => {
      const isRecovery = (p.key === "recovery" || p.key === "deload") || (i === p.weeks - 1 && p.weeks >= 3);
      return {
        week: weekCursor + i + 1,
        kind: isRecovery ? "recovery" : "load",
        intensity: isRecovery ? Math.round(p.intensity * 0.6) : Math.min(100, p.intensity + i * 4),
        volume: isRecovery ? Math.round(p.volume * 0.55) : Math.min(100, p.volume - i * 3),
      };
    });
    const block = { ...p, startWeek: weekCursor + 1, endWeek: weekCursor + p.weeks, micros };
    weekCursor += p.weeks;
    return block;
  });

  return { model: model.name, goalOrSport, totalWeeks: weekCursor, eventInWeeks: eventInWeeks || null, blocks };
}

// which phase is "this week" (1-indexed), and a phase-aware dosing hint
function currentPhase(macro, currentWeek = 1) {
  const block = macro.blocks.find((b) => currentWeek >= b.startWeek && currentWeek <= b.endWeek) || macro.blocks[0];
  const micro = block.micros.find((m) => m.week === currentWeek) || block.micros[0];
  return { block, micro };
}

let PICK_UID = 2000;
function makeBlock(ex) {
  PICK_UID++;
  if (ex.kind === "sport") return { uid: PICK_UID, kind: "sport", name: ex.name, metric: ex.metric, icon: ex.icon, result: {} };
  if (ex.kind === "conditioning") return { uid: PICK_UID, kind: "conditioning", name: ex.name, format: ex.format, work: ex.work, rest: ex.rest, rounds: ex.rounds, cap: ex.cap };
  if (ex.kind === "skill") return { uid: PICK_UID, kind: "skill", name: ex.name };
  const l = ex.last || { load: "", reps: "" };
  return { uid: PICK_UID, kind: "strength", name: ex.name, technical: ex.technical, sets: [{ load: l.load, reps: l.reps, rpe: "" }], note: "", coachNote: ex.name === "Back Squat" ? "Keep depth consistent — you're cutting it high when fatigued. Film set 3." : "", pain: 0, tempo: "" };
}

// ---- coach-client relationship data ----
const MY_COACH = { name: "Jakub Nowak", initials: "JN", cert: "CSCS · UKSCA", clients: 14, since: "Mar 2026" };

const ROSTER = [
  { id: "c1", name: "Marek W.", initials: "MW", readiness: 82, lastSession: "Today", adherence: 94, goal: "Hyrox", injury: null, trend: "up" },
  { id: "c2", name: "Ola K.", initials: "OK", readiness: 61, lastSession: "Yesterday", adherence: 88, goal: "Powerlifting", injury: "Lower back — monitoring", trend: "flat" },
  { id: "c3", name: "Tomasz R.", initials: "TR", readiness: 90, lastSession: "Today", adherence: 100, goal: "Bodybuilding", injury: null, trend: "up" },
  { id: "c4", name: "Ewa S.", initials: "ES", readiness: 45, lastSession: "4 days ago", adherence: 62, goal: "Hybrid", injury: "Right knee — flagged", trend: "down" },
  { id: "c5", name: "Piotr L.", initials: "PL", readiness: 75, lastSession: "2 days ago", adherence: 91, goal: "Triathlon", injury: null, trend: "up" },
];

const PENDING_REQUESTS = [
  { id: "r1", name: "Kasia M.", initials: "KM", goal: "Hyrox", note: "Training for first Hyrox in Oct, need structure." },
  { id: "r2", name: "Adam Z.", initials: "AZ", goal: "Powerlifting", note: "Stalled on bench, want a coach's eyes." },
];

const INJURY_LOG = [
  { id: "i1", area: "Right shoulder", status: "Rehabbing", since: "May 12", level: 3, note: "Mild impingement on overhead. Avoid strict press, sub landmine." },
  { id: "i2", area: "Lower back", status: "Monitoring", since: "May 24", level: 2, note: "Tight after heavy deadlifts. Foam roll, keep RPE ≤ 8." },
];
const BODY_AREAS = ["Neck", "Left shoulder", "Right shoulder", "Upper back", "Lower back", "Left elbow", "Right elbow", "Hip", "Left knee", "Right knee", "Left ankle", "Right ankle"];

const GOALS = [
  { id: "g1", label: "First muscle-up", icon: "▲", domain: "Skill" },
  { id: "g2", label: "2x bodyweight squat", icon: "■", domain: "Strength" },
  { id: "g3", label: "Sub-7:00 2k row", icon: "◆", domain: "Engine" },
  { id: "g4", label: "Hyrox under 70min", icon: "●", domain: "Race" },
];

const HISTORY = [
  { id: "h1", date: "May 28", title: "Lower + Engine", dur: "1:04:22", blocks: 4, vol: "8,420", pr: "Back Squat e1RM 154kg", tags: ["Strength", "Engine"],
    exercises: [
      { name: "Back Squat", detail: "100×5 · 110×3 · 120×2" },
      { name: "Romanian Deadlift", detail: "90×8 · 90×8 · 90×8" },
      { name: "Row Intervals", detail: "8 × 40s/20s" },
      { name: "Toes-to-Bar", detail: "3 × 12" },
    ] },
  { id: "h2", date: "May 26", title: "Hyrox Sim", dur: "1:11:08", blocks: 6, vol: "5,100", pr: null, tags: ["Race"],
    exercises: [
      { name: "Run", detail: "8 × 1 km" },
      { name: "Sled Push", detail: "8 × 25 m" },
      { name: "Burpee Broad Jump", detail: "8 × 15 m" },
      { name: "Farmer's Carry", detail: "8 × 50 m @ 2×24kg" },
      { name: "Sandbag Lunge", detail: "8 × 20 m @ 30kg" },
      { name: "Wall Balls", detail: "100 reps @ 9kg" },
    ] },
  { id: "h3", date: "May 24", title: "Upper Strength", dur: "0:58:40", blocks: 5, vol: "6,940", pr: "Bench 110x3", tags: ["Strength"],
    exercises: [
      { name: "Bench Press", detail: "90×5 · 100×3 · 110×3" },
      { name: "Weighted Pull-up", detail: "4 × 6 @ +20kg" },
      { name: "Overhead Press", detail: "60×5 · 60×5 · 60×5" },
      { name: "Barbell Row", detail: "80×8 · 80×8 · 80×8" },
      { name: "Face Pull", detail: "3 × 15 @ 25kg" },
    ] },
  { id: "h4", date: "May 22", title: "Threshold Intervals", dur: "0:42:15", blocks: 3, vol: "—", pr: "2k pace 1:52", tags: ["Engine"],
    exercises: [
      { name: "Row Warm-up", detail: "10 min easy" },
      { name: "2k Row Intervals", detail: "4 × 2 km @ 1:52 pace" },
      { name: "Cool-down", detail: "10 min easy" },
    ] },
];

const STRENGTH_TREND = [142, 146, 145, 151, 154];
const ENGINE_TREND = [1.58, 1.56, 1.55, 1.53, 1.52];

// ============================================================
//  PRESCRIPTION ENGINE — the moat, made real.
//  Operates on a structured training log. Models per-movement
//  progression, per-energy-system load, and decaying fatigue,
//  then assembles + explains the next session. The more you log,
//  the more confident and sharp the prescription becomes.
// ============================================================

// muscle groups + energy systems each movement touches
const MOVEMENTS = {
  "Back Squat":   { pattern: "squat",  muscles: ["quads", "glutes", "back"], baseLoad: 100, system: null },
  "Front Squat":  { pattern: "squat",  muscles: ["quads", "glutes"],          baseLoad: 85,  system: null },
  "Deadlift":     { pattern: "hinge",  muscles: ["posterior", "back", "glutes"], baseLoad: 140, system: null },
  "Bench Press":  { pattern: "push",   muscles: ["chest", "triceps", "shoulders"], baseLoad: 100, system: null },
  "Overhead Press": { pattern: "push", muscles: ["shoulders", "triceps"],     baseLoad: 60,  system: null },
  "Row Intervals": { pattern: "cond",  muscles: ["posterior", "quads"],       baseLoad: null, system: "threshold" },
  "Assault Bike": { pattern: "cond",   muscles: ["quads", "shoulders"],       baseLoad: null, system: "anaerobic" },
  "Easy Run":     { pattern: "cond",   muscles: ["quads"],                    baseLoad: null, system: "aerobic" },
  "Mixed Metcon": { pattern: "cond",   muscles: ["posterior", "shoulders"],   baseLoad: null, system: "anaerobic" },
};

const ALL_MUSCLES = ["quads", "glutes", "posterior", "back", "chest", "shoulders", "triceps"];

// Structured log: each entry is a real session the engine reads.
// daysAgo drives fatigue decay; rpe + e1rm drive progression.
const TRAINING_LOG = [
  { daysAgo: 1, items: [
      { move: "Back Squat", e1rm: 154, topRpe: 9.0, hardSets: 5 },
      { move: "Row Intervals", system: "threshold", minutes: 16, rpe: 8 },
  ]},
  { daysAgo: 2, items: [
      { move: "Bench Press", e1rm: 122, topRpe: 8.5, hardSets: 4 },
      { move: "Assault Bike", system: "anaerobic", minutes: 9, rpe: 9 },
  ]},
  { daysAgo: 4, items: [
      { move: "Back Squat", e1rm: 151, topRpe: 8.0, hardSets: 4 },
      { move: "Easy Run", system: "aerobic", minutes: 35, rpe: 5 },
  ]},
  { daysAgo: 6, items: [
      { move: "Deadlift", e1rm: 188, topRpe: 8.5, hardSets: 3 },
  ]},
  { daysAgo: 7, items: [
      { move: "Bench Press", e1rm: 120, topRpe: 8.0, hardSets: 4 },
      { move: "Mixed Metcon", system: "anaerobic", minutes: 12, rpe: 9 },
  ]},
  { daysAgo: 9, items: [
      { move: "Back Squat", e1rm: 145, topRpe: 7.5, hardSets: 4 },
  ]},
];

// --- fatigue: each hard set / conditioning minute adds load to the
//     muscles it touches; load decays ~half every 2 days. ---
function computeFatigue(log) {
  const f = Object.fromEntries(ALL_MUSCLES.map((m) => [m, 0]));
  const sys = { anaerobic: 0, threshold: 0, aerobic: 0 };
  for (const session of log) {
    const decay = Math.pow(0.5, session.daysAgo / 2); // half-life 2 days
    for (const it of session.items) {
      const meta = MOVEMENTS[it.move] || {};
      const intensity = it.topRpe ? it.topRpe / 10 : (it.rpe || 6) / 10;
      const dose = (it.hardSets ? it.hardSets * 4 : (it.minutes || 0) * 0.9) * intensity * decay;
      (meta.muscles || []).forEach((m) => { f[m] = (f[m] || 0) + dose; });
      if (it.system) sys[it.system] += (it.minutes || 0) * intensity * decay;
    }
  }
  // normalize muscle fatigue to 0..100
  const max = Math.max(40, ...Object.values(f));
  const norm = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Math.round((v / max) * 100)]));
  return { muscles: norm, systems: sys };
}

// --- readiness: inverse of average current fatigue, 0..100 ---
// --- wearable biometrics: HRV, sleep, resting HR from a connected device.
//     Each compares to the athlete's baseline to nudge readiness up/down. ---
const DEVICES = [
  { id: "apple", name: "Apple Watch", via: "HealthKit", icon: "⌚", connected: true },
  { id: "garmin", name: "Garmin", via: "Garmin Connect", icon: "⌚", connected: true },
  { id: "whoop", name: "WHOOP", via: "WHOOP API", icon: "⌚", connected: true },
  { id: "amazfit", name: "Amazfit", via: "Zepp", icon: "⌚", connected: false },
  { id: "fitbit", name: "Fitbit", via: "Fitbit Web API", icon: "⌚", connected: false },
  { id: "huawei", name: "Huawei", via: "Huawei Health Kit", icon: "⌚", connected: false },
  { id: "xiaomi", name: "Xiaomi", via: "Mi Fitness / Zepp", icon: "⌚", connected: false },
];

// today's reading vs the rolling baseline (what "normal" looks like for this athlete)
const BIOMETRICS = {
  hrv: { today: 68, baseline: 62, unit: "ms", better: "high" },        // higher = more recovered
  restingHr: { today: 52, baseline: 54, unit: "bpm", better: "low" },  // lower = more recovered
  sleep: { today: 7.2, baseline: 7.5, unit: "h", better: "high" },
  sleepScore: { today: 81, baseline: 78, unit: "", better: "high" },
};

// returns a -15..+15 readiness adjustment from biometric deviation vs baseline
function biometricAdjustment(bio) {
  let adj = 0;
  const dev = (m) => (m.today - m.baseline) / m.baseline;
  adj += dev(bio.hrv) * 40 * (bio.hrv.better === "high" ? 1 : -1);
  adj += dev(bio.restingHr) * 40 * (bio.restingHr.better === "high" ? 1 : -1);
  adj += dev(bio.sleep) * 25 * (bio.sleep.better === "high" ? 1 : -1);
  return Math.max(-15, Math.min(15, Math.round(adj)));
}

function computeReadiness(fatigue, bio) {
  const vals = Object.values(fatigue.muscles);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const base = 100 - avg * 0.7;
  const bioAdj = bio ? biometricAdjustment(bio) : 0;
  return { score: Math.max(35, Math.min(98, Math.round(base + bioAdj))), bioAdj };
}

// --- per-movement progression signal from e1RM trend + last RPE ---
function progressionSignal(log, move) {
  const hits = log.filter((s) => s.items.some((i) => i.move === move))
    .map((s) => s.items.find((i) => i.move === move)).filter((i) => i.e1rm);
  if (hits.length < 2) return { action: "hold", reason: "not enough history", confidence: 0.3 };
  const latest = hits[0], prev = hits[1];
  const trendUp = latest.e1rm >= prev.e1rm;
  const lastRpe = latest.topRpe;
  if (trendUp && lastRpe <= 8.0) return { action: "progress", reason: "e1RM rising, RPE in range", confidence: 0.85 };
  if (lastRpe >= 9.0) return { action: "deload", reason: "RPE 9+ — accumulating fatigue", confidence: 0.8 };
  if (!trendUp) return { action: "hold", reason: "e1RM stalled — repeat to consolidate", confidence: 0.7 };
  return { action: "progress", reason: "steady progress", confidence: 0.75 };
}

// --- the prescription: pick a recovered primary lift + a conditioning
//     system that hasn't been hammered, and explain why. ---
function prescribeSession(log, bio) {
  const fatigue = computeFatigue(log);
  const { score: readiness, bioAdj } = computeReadiness(fatigue, bio);

  // choose primary strength lift: most-recovered pattern with a good signal
  const candidates = ["Back Squat", "Deadlift", "Bench Press", "Overhead Press"];
  const scored = candidates.map((move) => {
    const meta = MOVEMENTS[move];
    const musFatigue = Math.max(...meta.muscles.map((m) => fatigue.muscles[m] || 0));
    const sig = progressionSignal(log, move);
    return { move, musFatigue, sig, recovery: 100 - musFatigue };
  }).sort((a, b) => b.recovery - a.recovery);
  const primary = scored[0];

  // load prescription from signal
  const lastE1rm = (() => {
    const h = log.flatMap((s) => s.items).filter((i) => i.move === primary.move && i.e1rm);
    return h.length ? h[0].e1rm : MOVEMENTS[primary.move].baseLoad * 1.2;
  })();
  const pct = primary.sig.action === "progress" ? 0.80 : primary.sig.action === "deload" ? 0.65 : 0.75;
  const workLoad = Math.round((lastE1rm * pct) / 2.5) * 2.5;
  const reps = primary.sig.action === "deload" ? 3 : 5;
  const sets = primary.sig.action === "progress" ? 5 : primary.sig.action === "deload" ? 3 : 4;

  // choose conditioning system least-loaded recently
  const sysOrder = Object.entries(fatigue.systems).sort((a, b) => a[1] - b[1]);
  const pickSys = sysOrder[0][0];
  const condMove = pickSys === "aerobic" ? "Easy Run" : pickSys === "threshold" ? "Row Intervals" : "Assault Bike";
  const condFormat = pickSys === "aerobic" ? "Steady" : pickSys === "threshold" ? "Intervals" : "EMOM";

  // confidence rises with log depth — the network effect, made literal
  const confidence = Math.min(0.95, 0.45 + log.length * 0.08);

  const blocks = [
    { uid: 901, kind: "strength", name: primary.move,
      sets: Array.from({ length: sets }, () => ({ load: String(workLoad), reps: String(reps), rpe: "" })) },
    { uid: 902, kind: "conditioning", name: condMove, format: condFormat, work: 40, rest: 20, rounds: 8 },
  ];

  const why =
    `Readiness ${readiness}/100. ` +
    `${primary.move} is your most-recovered heavy pattern, and your signal is "${primary.sig.action}" — ${primary.sig.reason}, ` +
    `so I prescribed ${sets}×${reps} @ ${workLoad}kg (${Math.round(pct * 100)}% e1RM). ` +
    `Your ${pickSys} system is the freshest, so today's conditioning is ${condMove.toLowerCase()} (${condFormat.toLowerCase()}) to balance the week.` +
    (bio && bioAdj !== 0 ? ` Your wearable nudged readiness ${bioAdj > 0 ? "+" : ""}${bioAdj} today — ${bioAdj > 0 ? "HRV is above baseline and sleep was solid, so you're cleared to push." : "HRV dipped and sleep ran short, so I held the load back."}` : "");

  return { readiness, fatigue, primary, blocks, why, confidence, pickSys, bioAdj: bio ? bioAdj : 0 };
}

const Mono = ({ children, s = {}, c = ASH, onClick }) => <span onClick={onClick} style={{ ...mono, color: c, cursor: onClick ? "pointer" : "inherit", ...s }}>{children}</span>;

function Chip({ children, c = LIME, solid }) {
  return <span style={{ ...cond, fontSize: 12, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: solid ? INK : c, background: solid ? c : `${c}1f`, padding: "3px 9px", borderRadius: 5, whiteSpace: "nowrap" }}>{children}</span>;
}

function Btn({ children, onClick, kind = "prim", style, disabled }) {
  const base = { ...body, fontWeight: 700, fontSize: 15, padding: "13px 20px", borderRadius: 12, cursor: disabled ? "default" : "pointer", border: "none", transition: "transform .1s, opacity .15s", opacity: disabled ? 0.55 : 1 };
  const kinds = { prim: { background: LIME, color: INK }, dark: { background: INK2, color: CHALK, border: `1px solid ${LINE}` }, ghost: { background: "transparent", color: CHALK, border: `1px solid ${LINE}` } };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...kinds[kind], ...style }} onMouseDown={(e) => !disabled && (e.currentTarget.style.transform = "scale(.97)")} onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")} onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}>{children}</button>;
}

function Card({ children, style, onClick, glow }) {
  return <div onClick={onClick} style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 18, padding: 18, cursor: onClick ? "pointer" : "default", backdropFilter: "blur(8px)", boxShadow: glow ? `0 0 0 1px ${LIME}33, 0 8px 40px ${LIME}11` : "0 4px 24px #00000040", ...style }}>{children}</div>;
}

function Atmosphere() {
  return <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, maxWidth: 480, left: "50%", transform: "translateX(-50%)" }}>
    <div style={{ position: "absolute", top: "-10%", right: "-20%", width: 360, height: 360, borderRadius: "50%", background: `radial-gradient(circle, ${LIME}22, transparent 70%)`, filter: "blur(40px)" }} />
    <div style={{ position: "absolute", bottom: "10%", left: "-25%", width: 320, height: 320, borderRadius: "50%", background: `radial-gradient(circle, ${BLUE}18, transparent 70%)`, filter: "blur(50px)" }} />
  </div>;
}

function Landing({ enter }) {
  return (
    <div style={{ position: "relative", zIndex: 1, padding: "0 0 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 22px" }}>
        <div style={{ ...disp, fontWeight: 900, fontSize: 20, letterSpacing: "-.04em" }}>HYBRID<span style={{ color: LIME }}>.</span></div>
        <Btn kind="ghost" onClick={enter} style={{ padding: "9px 16px", fontSize: 13 }}>Sign in</Btn>
      </div>
      <div style={{ padding: "30px 22px 40px" }}>
        <Chip>Strength · Conditioning</Chip>
        <h1 style={{ ...disp, fontWeight: 900, fontSize: 54, lineHeight: 0.95, letterSpacing: "-.045em", margin: "18px 0 0" }}>TRAIN<br />LIKE TWO<br /><span style={{ color: LIME }}>ATHLETES.</span></h1>
        <p style={{ ...body, fontSize: 16, color: ASH, lineHeight: 1.5, margin: "20px 0 28px", maxWidth: 340 }}>The only log built for athletes who lift heavy <i>and</i> condition. One app for the barbell and the engine — with an AI coach that programs both.</p>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn onClick={enter} style={{ flex: 1 }}>Start training →</Btn>
          <Btn kind="dark" onClick={enter} style={{ flex: 1 }}>See plans</Btn>
        </div>
        <div style={{ display: "flex", gap: 22, marginTop: 30 }}>
          {[["50K+", "athletes"], ["1.2M", "sessions"], ["4.9★", "App Store"]].map(([a, b]) => (
            <div key={b}><div style={{ ...disp, fontWeight: 800, fontSize: 22 }}>{a}</div><Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em" }}>{b}</Mono></div>
          ))}
        </div>
      </div>
      <div style={{ padding: "20px 22px" }}>
        <Mono s={{ fontSize: 12, letterSpacing: ".15em", textTransform: "uppercase" }} c={LIME}>The gap</Mono>
        <h2 style={{ ...disp, fontWeight: 800, fontSize: 26, letterSpacing: "-.03em", margin: "8px 0 18px" }}>Your tracker can't see half your training.</h2>
        {[
          { t: "Every conditioning format, natively", d: "EMOM, AMRAP, intervals, for-time, steady-state — modeled properly, not crammed into a sets-and-reps box.", c: BLUE },
          { t: "Strength + engine, one dashboard", d: "Watch your squat climb and your 2k drop on the same screen. Nobody else can show this.", c: LIME },
          { t: "An AI coach that programs both", d: "Auto-regulated sessions from your real performance. Human coaching when you want a person in the loop.", c: VIOLET },
        ].map((f) => (
          <Card key={f.t} style={{ marginBottom: 12, borderLeft: `3px solid ${f.c}` }}>
            <div style={{ ...disp, fontWeight: 700, fontSize: 17 }}>{f.t}</div>
            <div style={{ ...body, fontSize: 14, color: ASH, lineHeight: 1.5, marginTop: 6 }}>{f.d}</div>
          </Card>
        ))}
      </div>
      <div style={{ padding: "26px 0 26px 22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16, paddingRight: 22 }}>
          <h2 style={{ ...disp, fontWeight: 800, fontSize: 24, letterSpacing: "-.03em" }}>Pre-built plans</h2>
          <Mono s={{ fontSize: 12 }} c={LIME} onClick={enter}>view all →</Mono>
        </div>
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, paddingRight: 22 }}>
          {PLANS.slice(0, 3).map((p) => (
            <div key={p.id} onClick={enter} style={{ minWidth: 220, cursor: "pointer" }}>
              <Card glow={p.hot} style={{ height: "100%" }}>
                {p.hot && <Chip solid>Most popular</Chip>}
                <div style={{ ...disp, fontWeight: 800, fontSize: 20, marginTop: p.hot ? 12 : 0 }}>{p.name}</div>
                <Mono s={{ fontSize: 12, display: "block", margin: "6px 0 10px" }}>{p.weeks} wks · {p.sessions}x/wk</Mono>
                <div style={{ ...body, fontSize: 13, color: ASH, lineHeight: 1.45 }}>{p.desc}</div>
              </Card>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: "0 22px 26px" }}>
        <h2 style={{ ...disp, fontWeight: 800, fontSize: 24, letterSpacing: "-.03em", marginBottom: 16 }}>Coaching, your way</h2>
        <Card style={{ marginBottom: 12, borderLeft: `3px solid ${LIME}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ ...disp, fontWeight: 800, fontSize: 18 }}>AI Coach</div><Chip solid>Included</Chip></div>
          <div style={{ ...body, fontSize: 14, color: ASH, lineHeight: 1.5, marginTop: 8 }}>Adaptive programming that learns your fatigue and progression. Always on, instant, free.</div>
        </Card>
        <Card style={{ borderLeft: `3px solid ${VIOLET}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ ...disp, fontWeight: 800, fontSize: 18 }}>Human Coach</div><Chip c={VIOLET}>Premium</Chip></div>
          <div style={{ ...body, fontSize: 14, color: ASH, lineHeight: 1.5, marginTop: 8 }}>A real S&C coach reviews your data, adjusts your plan, and messages you weekly.</div>
        </Card>
      </div>
      <div style={{ padding: "10px 22px 0", textAlign: "center" }}>
        <h2 style={{ ...disp, fontWeight: 900, fontSize: 30, letterSpacing: "-.04em" }}>Stop using three apps.</h2>
        <Btn onClick={enter} style={{ marginTop: 18, width: "100%" }}>Get started — free</Btn>
        <Mono s={{ fontSize: 11, display: "block", marginTop: 14 }}>iPhone · iPad · Apple Watch</Mono>
      </div>
    </div>
  );
}

function Auth({ done }) {
  const provs = [{ n: "Continue with Apple", bg: "#fff", fg: "#000", i: "" }, { n: "Continue with Google", bg: INK2, fg: CHALK, i: "G" }, { n: "Continue with Facebook", bg: "#1877f2", fg: "#fff", i: "f" }];
  return (
    <div style={{ position: "relative", zIndex: 1, minHeight: "85vh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 28px" }}>
      <div style={{ textAlign: "center", marginBottom: 38 }}>
        <div style={{ ...disp, fontWeight: 900, fontSize: 40, letterSpacing: "-.05em" }}>HYBRID<span style={{ color: LIME }}>.</span></div>
        <Mono s={{ fontSize: 12, letterSpacing: ".25em", textTransform: "uppercase", marginTop: 6 }} c={LIME}>Strength · Conditioning</Mono>
      </div>
      {provs.map((p) => (
        <button key={p.n} onClick={done} style={{ ...body, fontWeight: 700, fontSize: 15, padding: 15, borderRadius: 13, marginBottom: 11, cursor: "pointer", border: "none", background: p.bg, color: p.fg, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          {p.i && <b style={disp}>{p.i}</b>}{p.n}
        </button>
      ))}
      <div style={{ textAlign: "center", marginTop: 14 }}><Mono s={{ fontSize: 13 }}>or sign in with email</Mono></div>
      <div onClick={done} style={{ textAlign: "center", marginTop: 26, cursor: "pointer" }}>
        <Mono s={{ fontSize: 13, letterSpacing: ".08em", textTransform: "uppercase", borderBottom: `1px solid ${ASH}55`, paddingBottom: 2 }} c={LIME}>Skip for now →</Mono>
      </div>
    </div>
  );
}

function CondTimer({ format, cap = 600, work = 40, rest = 20, rounds = 8 }) {
  const [t, setT] = useState(0); const [run, setRun] = useState(false); const ref = useRef();
  useEffect(() => { if (!run) return; ref.current = setInterval(() => setT((x) => x + 1), 1000); return () => clearInterval(ref.current); }, [run]);
  let label = fmt(t), sub = "elapsed", col = LIME;
  if (format === "Intervals") { const cy = work + rest, pos = t % cy, r = Math.floor(t / cy) + 1, w = pos < work; label = fmt(w ? work - pos : cy - pos); sub = `${w ? "WORK" : "REST"} · ${Math.min(r, rounds)}/${rounds}`; col = w ? LIME : BLUE; }
  else if (format === "AMRAP") { label = fmt(Math.max(cap - t, 0)); sub = t >= cap ? "TIME" : "remaining"; }
  else if (format === "EMOM") { const m = Math.floor(t / 60) + 1; sub = `round ${Math.min(m, rounds)}/${rounds}`; col = t % 60 >= 50 ? "#e0625e" : LIME; }
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ ...mono, fontSize: 50, fontWeight: 700, color: col, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{label}</div>
      <Mono s={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", display: "block", marginTop: 6 }}>{sub}</Mono>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 14 }}>
        <Btn onClick={() => setRun((r) => !r)} style={{ padding: "9px 24px" }}>{run ? "Pause" : "Start"}</Btn>
        <Btn kind="dark" onClick={() => { setT(0); setRun(false); }} style={{ padding: "9px 16px" }}>↺</Btn>
      </div>
    </div>
  );
}
function RestTimer({ seconds = 120 }) {
  const [l, setL] = useState(seconds); const [run, setRun] = useState(false);
  useEffect(() => { if (!run) return; const t = setInterval(() => setL((x) => (x <= 1 ? (clearInterval(t), 0) : x - 1)), 1000); return () => clearInterval(t); }, [run]);
  return <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <Mono s={{ fontSize: 20, fontWeight: 600, fontVariantNumeric: "tabular-nums" }} c={l === 0 ? LIME : CHALK}>{fmt(l)}</Mono>
    <Btn kind="dark" onClick={() => setRun((r) => !r)} style={{ padding: "6px 12px", fontSize: 12 }}>{run ? "Pause" : "Rest"}</Btn>
    <Btn kind="dark" onClick={() => { setL(seconds); setRun(false); }} style={{ padding: "6px 11px", fontSize: 12 }}>↺</Btn>
  </div>;
}

function Home({ go, startBlank, startPrescribed, t }) {
  const tr = t || ((k) => k);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const syncedCount = DEVICES.filter((d) => d.connected).length;

  // active periodized season (demo: a Hybrid macrocycle, currently week 5)
  const macro = React.useMemo(() => buildMacrocycle("Hybrid", null), []);
  const seasonWeek = 5;
  const ph = currentPhase(macro, seasonWeek);
  const weekInPhase = seasonWeek - ph.block.startWeek + 1;

  return (
    <div style={{ padding: "10px 18px 110px", position: "relative", zIndex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 6 }}>
        <div>
          <Mono s={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase" }}>Monday · week {seasonWeek}</Mono>
          <h1 style={{ ...disp, fontWeight: 900, fontSize: 30, letterSpacing: "-.04em", margin: "4px 0 0", whiteSpace: "pre-line" }}>{tr("home.ready")}</h1>
        </div>
        <div style={{ width: 44, height: 44, borderRadius: 22, background: `${LIME}22`, border: `1px solid ${LIME}`, display: "grid", placeItems: "center", ...disp, fontWeight: 800, color: LIME }}>R</div>
      </div>

      {/* active season banner — where you are in your periodized plan */}
      <Card onClick={() => go("periodize")} style={{ marginTop: 18, borderLeft: `3px solid ${ph.block.color}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em" }} c={ph.block.color}>Training for · {macro.goalOrSport}</Mono>
            <div style={{ ...disp, fontWeight: 800, fontSize: 19, marginTop: 2 }}>{ph.block.label} phase · {ph.micro.kind === "recovery" ? "deload week" : "load week"}</div>
            <Mono s={{ fontSize: 11, display: "block", marginTop: 2 }}>{ph.block.focus}</Mono>
          </div>
          <span style={{ color: ASH, fontSize: 20 }}>›</span>
        </div>
        {/* mini phase progress bar */}
        <div style={{ display: "flex", gap: 3, height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
          {macro.blocks.map((b) => (
            <div key={b.key} style={{ flex: b.weeks, background: b.key === ph.block.key ? b.color : `${b.color}33` }} />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Mono s={{ fontSize: 10 }}>Week {seasonWeek} of {macro.totalWeeks}</Mono>
          <Mono s={{ fontSize: 10 }} c={ph.block.color}>Week {weekInPhase} of {ph.block.weeks} in {ph.block.label.toLowerCase()}</Mono>
        </div>
      </Card>

      {/* THE button — the whole point of opening the app */}
      <button onClick={startBlank} style={{
        ...body, fontWeight: 800, fontSize: 22, color: INK, background: LIME, border: "none",
        borderRadius: 20, width: "100%", padding: "32px 20px", marginTop: 14, cursor: "pointer",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        boxShadow: `0 8px 40px ${LIME}33`,
      }}>
        <span style={{ ...disp, fontWeight: 900, fontSize: 28, letterSpacing: "-.03em" }}>{tr("home.start")}</span>
        <span style={{ ...mono, fontSize: 12, fontWeight: 500, opacity: .7 }}>{tr("home.startSub")}</span>
      </button>

      {/* prescribed = secondary, now phase-aware */}
      <Card onClick={startPrescribed} glow style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ fontSize: 24, color: LIME }}>✦</div>
        <div style={{ flex: 1 }}>
          <div style={{ ...disp, fontWeight: 700, fontSize: 16 }}>Today's prescribed session</div>
          <Mono s={{ fontSize: 12 }}>Readiness 74 · dosed for your {ph.block.label.toLowerCase()} phase</Mono>
        </div>
        <span style={{ color: ASH, fontSize: 20 }}>›</span>
      </Card>

      {/* small stats — glanceable, not in the way */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 22 }}>
        {[["12", tr("home.streak"), LIME], ["86", tr("home.readiness"), BLUE], ["4", tr("home.thisWeek"), CHALK]].map(([a, b, c]) => (
          <Card key={b} style={{ padding: 14, textAlign: "center" }}>
            <div style={{ ...disp, fontWeight: 800, fontSize: 24, color: c }}>{a}</div>
            <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em" }}>{b}</Mono>
          </Card>
        ))}
      </div>

      {/* connected wearables — collapsed by default */}
      <Card style={{ marginTop: 22 }}>
        <button onClick={() => setDevicesOpen((o) => !o)} style={{ width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: 0 }}>
          <div style={{ fontSize: 20 }}>⌚</div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ ...disp, fontWeight: 700, fontSize: 15, color: CHALK }}>Connected devices</div>
            <Mono s={{ fontSize: 11 }}>{syncedCount} synced · feeds your readiness engine</Mono>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Chip c={BLUE}>● {syncedCount}</Chip>
            <span style={{ color: ASH, fontSize: 16, transform: devicesOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}>⌄</span>
          </div>
        </button>
        {devicesOpen && <div style={{ marginTop: 14, borderTop: `1px solid ${LINE}`, paddingTop: 6 }}>
          {DEVICES.map((d) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0" }}>
              <div style={{ flex: 1 }}>
                <div style={{ ...disp, fontWeight: 600, fontSize: 14 }}>{d.name}</div>
                <Mono s={{ fontSize: 10 }}>via {d.via}</Mono>
              </div>
              {d.connected
                ? <Chip c={BLUE}>● Synced</Chip>
                : <button style={{ ...cond, fontSize: 11, fontWeight: 700, textTransform: "uppercase", padding: "6px 12px", borderRadius: 8, cursor: "pointer", border: `1px solid ${LIME}`, background: LIME, color: INK }}>Connect</button>}
            </div>
          ))}
        </div>}
      </Card>
    </div>
  );
}

function PeriodizationTimeline({ macro, currentWeek }) {
  const [openPhase, setOpenPhase] = useState(null);
  const cur = currentPhase(macro, currentWeek);
  return (
    <div>
      {/* macro bar — phases as proportional segments */}
      <div style={{ display: "flex", gap: 3, height: 56, borderRadius: 12, overflow: "hidden", marginBottom: 6 }}>
        {macro.blocks.map((b) => {
          const isCur = b.key === cur.block.key;
          return (
            <div key={b.key} onClick={() => setOpenPhase(openPhase === b.key ? null : b.key)} title={b.label}
              style={{ flex: b.weeks, background: isCur ? b.color : `${b.color}40`, cursor: "pointer", position: "relative",
                display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", border: isCur ? `2px solid ${b.color}` : "none" }}>
              <span style={{ ...cond, fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: isCur ? INK : CHALK, letterSpacing: ".02em" }}>{b.label}</span>
              <span style={{ ...mono, fontSize: 9, color: isCur ? INK : ASH }}>{b.weeks}w</span>
            </div>
          );
        })}
      </div>
      {/* week ruler */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Mono s={{ fontSize: 10 }}>Wk 1</Mono>
        <Mono s={{ fontSize: 10 }} c={LIME}>You're in week {currentWeek} · {cur.block.label}</Mono>
        <Mono s={{ fontSize: 10 }}>Wk {macro.totalWeeks}</Mono>
      </div>

      {/* phase detail when tapped */}
      {macro.blocks.filter((b) => openPhase === b.key).map((b) => (
        <Card key={b.key} style={{ marginBottom: 14, borderLeft: `3px solid ${b.color}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ ...disp, fontWeight: 800, fontSize: 18 }}>{b.label} phase</div>
            <Chip c={b.color}>{b.pattern}</Chip>
          </div>
          <Mono s={{ fontSize: 12, display: "block", margin: "6px 0 12px" }}>Weeks {b.startWeek}–{b.endWeek} · {b.focus}</Mono>
          <div style={{ display: "flex", gap: 14, marginBottom: 12 }}>
            <div><Mono s={{ fontSize: 10, textTransform: "uppercase" }}>Intensity</Mono><div style={{ ...mono, fontWeight: 700, fontSize: 16, color: b.color }}>{b.intensity}%</div></div>
            <div><Mono s={{ fontSize: 10, textTransform: "uppercase" }}>Volume</Mono><div style={{ ...mono, fontWeight: 700, fontSize: 16, color: CHALK }}>{b.volume}%</div></div>
          </div>
          {/* microcycles */}
          <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", display: "block", marginBottom: 6 }}>Microcycles</Mono>
          <div style={{ display: "flex", gap: 6 }}>
            {b.micros.map((m) => (
              <div key={m.week} style={{ flex: 1, textAlign: "center", padding: "8px 2px", borderRadius: 8,
                background: m.week === currentWeek ? `${b.color}33` : INK2, border: `1px solid ${m.week === currentWeek ? b.color : LINE}` }}>
                <Mono s={{ fontSize: 10, display: "block" }} c={m.kind === "recovery" ? "#8b8f86" : CHALK}>W{m.week}</Mono>
                <Mono s={{ fontSize: 9, display: "block", textTransform: "uppercase" }} c={m.kind === "recovery" ? "#e0a96a" : b.color}>{m.kind === "recovery" ? "rest" : "load"}</Mono>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function PeriodizeTab({ go }) {
  const [target, setTarget] = useState(Object.keys(MODEL_FOR)[0]);
  const [anchor, setAnchor] = useState("blocks"); // blocks | event
  const [eventWeeks, setEventWeeks] = useState(12);
  const [macro, setMacro] = useState(null);
  const currentWeek = 1;

  const generate = () => setMacro(buildMacrocycle(target, anchor === "event" ? eventWeeks : null));

  return (
    <div>
      <Mono s={{ fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", display: "block", marginBottom: 12 }} c={LIME}>Build a periodized season</Mono>

      <Card style={{ marginBottom: 14 }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em" }}>Goal / sport</Mono>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0 16px" }}>
          {Object.keys(MODEL_FOR).map((g) => (
            <button key={g} onClick={() => setTarget(g)} style={{ ...cond, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 999, cursor: "pointer", border: `1px solid ${target === g ? LIME : LINE}`, background: target === g ? `${LIME}1a` : "transparent", color: target === g ? LIME : ASH }}>{g}</button>
          ))}
        </div>
        <Mono s={{ fontSize: 11, display: "block", marginBottom: 8 }}>Model: {modelFor(target).name} · phases auto-selected for this goal</Mono>

        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em" }}>Anchor</Mono>
        <div style={{ display: "flex", gap: 8, margin: "8px 0 14px" }}>
          {[["blocks", "Stack blocks"], ["event", "Target an event"]].map(([id, l]) => (
            <button key={id} onClick={() => setAnchor(id)} style={{ ...cond, fontSize: 13, fontWeight: 700, textTransform: "uppercase", padding: "8px 14px", borderRadius: 10, cursor: "pointer", flex: 1, border: `1px solid ${anchor === id ? LIME : LINE}`, background: anchor === id ? LIME : "transparent", color: anchor === id ? INK : ASH }}>{l}</button>
          ))}
        </div>
        {anchor === "event" && (
          <div style={{ marginBottom: 14 }}>
            <Mono s={{ fontSize: 11, textTransform: "uppercase" }}>Weeks until event · {eventWeeks}</Mono>
            <input type="range" min="6" max="24" value={eventWeeks} onChange={(e) => setEventWeeks(+e.target.value)} style={{ width: "100%", marginTop: 8, accentColor: LIME }} />
            <Mono s={{ fontSize: 11 }}>Phases fit backward — taper lands on race week.</Mono>
          </div>
        )}
        <Btn onClick={generate} style={{ width: "100%" }}>Generate macrocycle →</Btn>
      </Card>

      {macro && <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <h2 style={{ ...disp, fontWeight: 900, fontSize: 22, letterSpacing: "-.03em" }}>{target} season</h2>
          <Mono s={{ fontSize: 12 }}>{macro.totalWeeks} weeks · {macro.blocks.length} blocks</Mono>
        </div>
        <PeriodizationTimeline macro={macro} currentWeek={currentWeek} />
        <Mono s={{ fontSize: 11, display: "block", textAlign: "center", margin: "4px 0 14px" }}>Tap a phase to see its microcycles & loading.</Mono>
        <Btn onClick={() => go("coach")} style={{ width: "100%" }}>✦ Prescriptions now respect your phase</Btn>
      </>}
    </div>
  );
}

function PlanDetailView({ plan, goal, back, go }) {
  const d = planDetail(plan.id, plan);
  const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const trainDays = d.split.filter((s) => !/rest/i.test(s)).length;
  return (
    <div>
      <button onClick={back} style={{ ...mono, background: "none", border: "none", color: ASH, fontSize: 13, cursor: "pointer", marginBottom: 12 }}>‹ {goal.name} plans</button>

      {/* hero */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <Chip c={goal.color} solid={plan.hot}>{plan.tag}</Chip>
        <Chip c={ASH}>{d.level}</Chip>
      </div>
      <h1 style={{ ...disp, fontWeight: 900, fontSize: 28, letterSpacing: "-.03em" }}>{plan.name}</h1>
      <div style={{ ...body, fontSize: 14, color: ASH, lineHeight: 1.5, margin: "8px 0 16px" }}>{plan.desc}</div>

      {/* key stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        {[[plan.weeks, "weeks"], [trainDays + "×", "per week"], [d.sessionLength.split("–")[0].replace(/\D/g, "") || "60", "min/session"]].map(([a, b]) => (
          <Card key={b} style={{ padding: 14, textAlign: "center" }}>
            <div style={{ ...disp, fontWeight: 800, fontSize: 22, color: goal.color }}>{a}</div>
            <Mono s={{ fontSize: 10, textTransform: "uppercase" }}>{b}</Mono>
          </Card>
        ))}
      </div>

      {/* who it's for + outcome */}
      <Card style={{ marginBottom: 12, borderLeft: `3px solid ${goal.color}` }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={goal.color}>Who it's for</Mono>
        <div style={{ ...body, fontSize: 14, color: CHALK, lineHeight: 1.5, marginTop: 6 }}>{d.forWho}</div>
      </Card>
      <Card style={{ marginBottom: 16 }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>Expected outcome</Mono>
        <div style={{ ...body, fontSize: 14, color: CHALK, lineHeight: 1.5, marginTop: 6 }}>{d.outcome}</div>
      </Card>

      {/* weekly split */}
      <Mono s={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 10 }}>Weekly split</Mono>
      <div style={{ display: "flex", gap: 5, marginBottom: 16 }}>
        {d.split.map((s, i) => {
          const rest = /rest/i.test(s);
          return (
            <div key={i} style={{ flex: 1, textAlign: "center", padding: "10px 2px", borderRadius: 9, background: rest ? INK2 : `${goal.color}1a`, border: `1px solid ${rest ? LINE : goal.color + "55"}` }}>
              <Mono s={{ fontSize: 9, textTransform: "uppercase", display: "block" }}>{DOW[i]}</Mono>
              <div style={{ ...cond, fontSize: 11, fontWeight: 600, marginTop: 4, color: rest ? ASH : CHALK, lineHeight: 1.1 }}>{rest ? "Rest" : s}</div>
            </div>
          );
        })}
      </div>

      {/* sample session — fully spec'd */}
      <Mono s={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 10 }}>Sample session · {d.sample.day}</Mono>
      <Card style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 56px 40px", gap: 6, padding: "10px 14px", background: INK2, ...mono, fontSize: 10, color: ASH, textTransform: "uppercase" }}>
          <span>Exercise</span><span>Sets×Reps</span><span>Rest</span><span>RPE</span>
        </div>
        {d.sample.items.map((it, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 70px 56px 40px", gap: 6, padding: "12px 14px", alignItems: "center", borderTop: `1px solid ${LINE}` }}>
            <div style={{ ...disp, fontWeight: 600, fontSize: 14 }}>{it.name}</div>
            <Mono s={{ fontSize: 12 }} c={CHALK}>{it.sr}</Mono>
            <Mono s={{ fontSize: 12 }}>{it.rest}</Mono>
            <Mono s={{ fontSize: 12 }} c={goal.color}>{it.rpe}</Mono>
          </div>
        ))}
      </Card>

      {/* progression + equipment */}
      <Card style={{ marginBottom: 12 }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={goal.color}>How it progresses</Mono>
        <div style={{ ...body, fontSize: 14, color: CHALK, lineHeight: 1.5, marginTop: 6 }}>{d.progression}</div>
      </Card>
      <Card style={{ marginBottom: 18 }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>Equipment</Mono>
        <div style={{ ...body, fontSize: 14, color: CHALK, lineHeight: 1.5, marginTop: 6 }}>{d.equipment}</div>
      </Card>

      <Btn onClick={() => go("session")} style={{ width: "100%", padding: 16, fontSize: 16, background: goal.color }}>Start this plan →</Btn>
      <Mono s={{ fontSize: 11, display: "block", textAlign: "center", marginTop: 10 }}>Loads today's session · full plan runs {plan.weeks} weeks</Mono>
    </div>
  );
}

function PlansScreen({ go }) {
  const [tab, setTab] = useState("pre");
  const [goal, setGoal] = useState(null); // selected goal object
  const [plan, setPlan] = useState(null); // selected plan within a goal
  const [levelFilter, setLevelFilter] = useState("All");

  return (
    <div style={{ padding: "10px 18px 110px", position: "relative", zIndex: 1 }}>
      <h1 style={{ ...disp, fontWeight: 900, fontSize: 30, letterSpacing: "-.04em", margin: "6px 0 4px" }}>Plans</h1>
      <Mono s={{ fontSize: 13 }}>Start with your goal. We'll show the plans built for it.</Mono>
      <div style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        {[["pre", "Pre-built"], ["custom", "Custom"]].map(([id, l]) => (
          <button key={id} onClick={() => { setTab(id); setGoal(null); setPlan(null); }} style={{ ...cond, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", padding: "8px 12px", borderRadius: 10, cursor: "pointer", border: `1px solid ${tab === id ? LIME : LINE}`, background: tab === id ? LIME : "transparent", color: tab === id ? INK : ASH }}>{l}</button>
        ))}
      </div>

      {tab === "pre" && !goal && <>
        <Mono s={{ fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", display: "block", marginBottom: 12 }} c={LIME}>Choose your goal</Mono>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {GOAL_TREE.map((g) => (
            <Card key={g.id} onClick={() => setGoal(g)} style={{ padding: 18, borderLeft: `3px solid ${g.color}` }}>
              <div style={{ fontSize: 24, color: g.color }}>{g.icon}</div>
              <div style={{ ...disp, fontWeight: 800, fontSize: 17, marginTop: 10, lineHeight: 1.05 }}>{g.name}</div>
              <Mono s={{ fontSize: 11, marginTop: 6, display: "block" }}>{g.plans.length} plans</Mono>
            </Card>
          ))}
        </div>
      </>}

      {tab === "pre" && goal && !plan && <>
        <button onClick={() => setGoal(null)} style={{ ...mono, background: "none", border: "none", color: ASH, fontSize: 13, cursor: "pointer", marginBottom: 12 }}>‹ all goals</button>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{ fontSize: 26, color: goal.color }}>{goal.icon}</div>
          <h2 style={{ ...disp, fontWeight: 900, fontSize: 26, letterSpacing: "-.03em" }}>{goal.name}</h2>
        </div>
        <div style={{ ...body, fontSize: 14, color: ASH, lineHeight: 1.5, marginBottom: 14 }}>{goal.blurb}</div>

        {/* level filter */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 14 }}>
          {["All", "Beginner", "Intermediate", "Advanced"].map((lv) => (
            <button key={lv} onClick={() => setLevelFilter(lv)} style={{ ...cond, fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap", border: `1px solid ${levelFilter === lv ? goal.color : LINE}`, background: levelFilter === lv ? `${goal.color}1a` : "transparent", color: levelFilter === lv ? goal.color : ASH }}>{lv}</button>
          ))}
        </div>

        {(() => {
          const filtered = goal.plans.filter((p) => { const lvl = planDetail(p.id, p).level.toLowerCase(); return levelFilter === "All" || lvl.includes("all level") || lvl.includes(levelFilter.toLowerCase()); });
          if (filtered.length === 0) return <Mono s={{ fontSize: 13, display: "block", textAlign: "center", marginTop: 24 }}>No {levelFilter.toLowerCase()} plans for {goal.name} yet.</Mono>;
          return filtered.map((p) => (
            <Card key={p.id} glow={p.hot} style={{ marginBottom: 12 }} onClick={() => setPlan(p)}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <Chip c={goal.color} solid={p.hot}>{p.tag}</Chip>
                <Chip c={ASH}>{planDetail(p.id, p).level}</Chip>
                {p.hot && <Mono s={{ fontSize: 11 }} c={goal.color}>★ most popular</Mono>}
              </div>
              <div style={{ ...disp, fontWeight: 800, fontSize: 21 }}>{p.name}</div>
              <Mono s={{ fontSize: 12, display: "block", margin: "4px 0 8px" }}>{p.weeks} weeks · {p.sessions}x/week</Mono>
              <div style={{ ...body, fontSize: 14, color: ASH, lineHeight: 1.45 }}>{p.desc}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{p.focus.map((f) => <Chip key={f} c={ASH}>{f}</Chip>)}</div>
                <Mono s={{ fontSize: 12 }} c={goal.color}>view →</Mono>
              </div>
            </Card>
          ));
        })()}
      </>}

      {tab === "pre" && goal && plan && <PlanDetailView plan={plan} goal={goal} back={() => setPlan(null)} go={go} />}

      {tab === "custom" && (
        <div>
          <Card style={{ borderStyle: "dashed", textAlign: "center", padding: 28, marginBottom: 14 }}>
            <div style={{ fontSize: 30, color: LIME }}>+</div>
            <div style={{ ...disp, fontWeight: 800, fontSize: 18, marginTop: 8 }}>Build a custom plan</div>
            <Mono s={{ fontSize: 13, display: "block", margin: "6px 0 14px" }}>Pick your goal, split, domains, and length.</Mono>
            <Btn onClick={() => go("coach")} style={{ width: "100%" }}>✦ Generate with AI</Btn>
            <Btn kind="dark" style={{ width: "100%", marginTop: 8 }}>Build manually</Btn>
          </Card>
          <Card>
            <div style={{ ...disp, fontWeight: 700, fontSize: 16, marginBottom: 4 }}>My Custom Plan</div>
            <Mono s={{ fontSize: 12 }}>Push / Pull / Engine / Legs · 6 wks · editing</Mono>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}><Chip>Strength</Chip><Chip c={BLUE}>Engine</Chip></div>
          </Card>
        </div>
      )}
    </div>
  );
}

function ExercisePicker({ close, onAdd }) {
  const [mode, setMode] = useState("recent");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Strength");

  const recentItems = RECENT.map((n) => FLAT_CATALOG.find((e) => e.name === n)).filter(Boolean);
  const searchPool = FLAT_CATALOG;
  const searchItems = q ? searchPool.filter((e) => e.name.toLowerCase().includes(q.toLowerCase())) : [];

  const chipColor = (ex) => ex.kind === "sport" ? AMBER : ex.kind === "conditioning" ? BLUE : ex.kind === "skill" ? VIOLET : LIME;
  const Row = ({ ex }) => (
    <button onClick={() => { onAdd(ex); close(); }} style={{
      width: "100%", textAlign: "left", background: CARD, border: `1px solid ${LINE}`, borderRadius: 12,
      padding: "14px 16px", marginBottom: 8, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      <div>
        <div style={{ ...disp, fontWeight: 700, fontSize: 16, color: CHALK }}>{ex.icon ? ex.icon + " " : ""}{ex.name}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
          <Chip c={chipColor(ex)}>{ex.cat || ex.kind}</Chip>
          {ex.last && <Mono s={{ fontSize: 11 }}>last: {ex.last.load}kg × {ex.last.reps}</Mono>}
        </div>
      </div>
      <span style={{ color: chipColor(ex), fontSize: 22, fontWeight: 700 }}>+</span>
    </button>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "#000000cc", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={close}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, height: "82vh", background: INK, borderRadius: "24px 24px 0 0", border: `1px solid ${LINE}`, padding: 20, display: "flex", flexDirection: "column" }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: LINE, margin: "0 auto 16px", flexShrink: 0 }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ ...disp, fontWeight: 800, fontSize: 22 }}>Add exercise</div>
          <button onClick={close} style={{ ...mono, background: "none", border: "none", color: ASH, fontSize: 14, cursor: "pointer" }}>done</button>
        </div>

        {/* three modes */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexShrink: 0 }}>
          {[["recent", "Recent"], ["search", "Search"], ["browse", "Browse"]].map(([id, l]) => (
            <button key={id} onClick={() => setMode(id)} style={{ ...cond, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", padding: "8px 14px", borderRadius: 10, cursor: "pointer", flex: 1, border: `1px solid ${mode === id ? LIME : LINE}`, background: mode === id ? LIME : "transparent", color: mode === id ? INK : ASH }}>{l}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {mode === "recent" && recentItems.map((ex) => <Row key={ex.name} ex={ex} />)}

          {mode === "search" && <>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type an exercise name…" style={{ ...inp, textAlign: "left", padding: "13px 14px", marginBottom: 12 }} />
            {searchItems.map((ex) => <Row key={ex.name} ex={ex} />)}
            {q && searchItems.length === 0 && <Mono s={{ fontSize: 13, display: "block", textAlign: "center", marginTop: 20 }}>No match. Try Browse.</Mono>}
          </>}

          {mode === "browse" && <>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 12 }}>
              {Object.keys(CATALOG).map((c) => (
                <button key={c} onClick={() => setCat(c)} style={{ ...cond, fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap", border: `1px solid ${cat === c ? LIME : LINE}`, background: cat === c ? `${LIME}1a` : "transparent", color: cat === c ? LIME : ASH }}>{c}</button>
              ))}
            </div>
            {CATALOG[cat].map((ex) => <Row key={ex.name} ex={{ ...ex, cat }} />)}
          </>}
        </div>
      </div>
    </div>
  );
}

function SportFields({ b, update }) {
  const set = (k, v) => update({ ...b, result: { ...b.result, [k]: v } });
  const r = b.result || {};
  const F = ({ label, k, ph }) => (
    <div style={{ flex: 1 }}>
      <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</Mono>
      <input value={r[k] || ""} onChange={(e) => set(k, e.target.value)} placeholder={ph} style={{ ...inp, textAlign: "left", marginTop: 6 }} />
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 10 }}>
        {b.metric === "distance" && <><F label="Distance" k="dist" ph="10 km" /><F label="Time" k="time" ph="48:30" /><F label="Avg pace" k="pace" ph="4:51 /km" /></>}
        {b.metric === "combat" && <><F label="Rounds" k="rounds" ph="6" /><F label="Sparring" k="spar" ph="25 min" /><F label="Total" k="time" ph="1:15" /></>}
        {b.metric === "match" && <><F label="Duration" k="time" ph="90 min" /><F label="Score / result" k="score" ph="W 3-1" /></>}
        {b.metric === "ascent" && <><F label="Routes / dist" k="dist" ph="8 routes" /><F label="Top grade" k="grade" ph="6c+" /><F label="Time" k="time" ph="1:40" /></>}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>RPE / effort</Mono>
          <input value={r.rpe || ""} onChange={(e) => set("rpe", e.target.value)} inputMode="decimal" placeholder="1–10" style={{ ...inp, textAlign: "left", marginTop: 6 }} />
        </div>
        <div style={{ flex: 2 }}>
          <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>Notes</Mono>
          <input value={r.note || ""} onChange={(e) => set("note", e.target.value)} placeholder="How did it go?" style={{ ...inp, textAlign: "left", marginTop: 6 }} />
        </div>
      </div>
    </div>
  );
}

function Session({ session, setSession, go, share }) {
  const [elapsed, setElapsed] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [countdown, setCountdown] = useState(3);       // 3..2..1..0(go)
  const [countRunning, setCountRunning] = useState(true);
  const counting = countdown > 0;

  // countdown ticks (pausable); only when running and not yet at zero
  useEffect(() => {
    if (!countRunning || countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, countRunning]);

  // session clock starts only after the countdown clears
  useEffect(() => {
    if (counting) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [counting]);

  const blocks = session.blocks;
  const update = (i, b) => setSession((s) => ({ ...s, blocks: s.blocks.map((x, idx) => (idx === i ? b : x)) }));
  const addBlock = (ex) => setSession((s) => ({ ...s, blocks: [...s.blocks, makeBlock(ex)] }));
  const removeBlock = (i) => setSession((s) => ({ ...s, blocks: s.blocks.filter((_, idx) => idx !== i) }));

  // total volume across logged strength sets
  const volume = blocks.reduce((sum, b) => b.kind === "strength"
    ? sum + b.sets.reduce((v, s) => v + (+s.load || 0) * (+s.reps || 0), 0) : sum, 0);
  const setCount = blocks.reduce((n, b) => b.kind === "strength" ? n + b.sets.filter((s) => s.load && s.reps).length : n, 0);

  return (
    <div style={{ padding: "0 0 120px", position: "relative", zIndex: 1 }}>
      {counting && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, background: `${INK}f7`, backdropFilter: "blur(8px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", maxWidth: 480, margin: "0 auto" }}>
          <Mono s={{ fontSize: 12, letterSpacing: ".2em", textTransform: "uppercase" }} c={LIME}>{countRunning ? "Get ready" : "Paused"}</Mono>
          <div style={{ ...disp, fontWeight: 900, fontSize: 140, lineHeight: 1, color: LIME, fontVariantNumeric: "tabular-nums", textShadow: `0 0 60px ${LIME}55` }}>{countdown}</div>
          <div style={{ ...disp, fontWeight: 800, fontSize: 20, marginTop: 8 }}>{session.title}</div>
          <div style={{ display: "flex", gap: 12, marginTop: 36 }}>
            <Btn kind="dark" onClick={() => setCountRunning((r) => !r)} style={{ padding: "13px 28px" }}>{countRunning ? "Pause" : "Resume"}</Btn>
            <Btn onClick={() => { setCountdown(0); }} style={{ padding: "13px 28px" }}>Skip →</Btn>
          </div>
          <button onClick={() => go("home")} style={{ ...mono, background: "none", border: "none", color: ASH, fontSize: 13, cursor: "pointer", marginTop: 22 }}>✕ cancel session</button>
        </div>
      )}
      {/* sticky live header — clock + volume always visible */}
      <div style={{ position: "sticky", top: 0, zIndex: 15, background: `${INK}f0`, backdropFilter: "blur(14px)", borderBottom: `1px solid ${LINE}`, padding: "14px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={() => go("home")} style={{ ...mono, background: "none", border: "none", color: ASH, fontSize: 13, cursor: "pointer" }}>‹ end</button>
          <div style={{ display: "flex", gap: 20 }}>
            <div style={{ textAlign: "center" }}><Mono s={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em" }}>time</Mono><div style={{ ...mono, fontWeight: 700, fontSize: 17, color: LIME, fontVariantNumeric: "tabular-nums" }}>{fmt(elapsed)}</div></div>
            <div style={{ textAlign: "center" }}><Mono s={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em" }}>volume</Mono><div style={{ ...mono, fontWeight: 700, fontSize: 17, color: CHALK }}>{volume.toLocaleString()}<span style={{ fontSize: 11, color: ASH }}>kg</span></div></div>
            <div style={{ textAlign: "center" }}><Mono s={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em" }}>sets</Mono><div style={{ ...mono, fontWeight: 700, fontSize: 17, color: CHALK }}>{setCount}</div></div>
          </div>
        </div>
      </div>

      <div style={{ padding: "16px 18px 0" }}>
        {blocks.length === 0 && (
          <div style={{ textAlign: "center", padding: "50px 20px" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>💪</div>
            <div style={{ ...disp, fontWeight: 800, fontSize: 20 }}>Empty session</div>
            <Mono s={{ fontSize: 13, display: "block", marginTop: 6 }}>Add your first exercise to begin.</Mono>
          </div>
        )}

        {blocks.map((b, i) => (
          <Card key={b.uid} style={{ marginBottom: 12, borderLeft: `3px solid ${b.kind === "conditioning" ? BLUE : b.kind === "skill" ? VIOLET : b.kind === "sport" ? AMBER : LIME}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ ...disp, fontWeight: 800, fontSize: 18 }}>{b.name}</div>
                <div style={{ marginTop: 5, display: "flex", gap: 6 }}>
                  <Chip c={b.kind === "conditioning" ? BLUE : b.kind === "skill" ? VIOLET : b.kind === "sport" ? AMBER : LIME}>{b.kind === "conditioning" ? b.format : b.kind}</Chip>
                  {b.technical && <Chip c="#e0a96a">technical</Chip>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {b.kind === "strength" && <div style={{ textAlign: "right" }}><Mono s={{ fontSize: 10 }}>e1RM</Mono><div style={{ ...mono, fontWeight: 700, fontSize: 18, color: LIME }}>{Math.round(Math.max(0, ...b.sets.map((s) => e1rm(+s.load || 0, +s.reps || 0)))) || "—"}</div></div>}
                <button onClick={() => removeBlock(i)} style={{ ...mono, background: "none", border: "none", color: ASH, fontSize: 16, cursor: "pointer" }}>×</button>
              </div>
            </div>

            {b.kind === "strength" && <>
              <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 1fr 1fr 40px", gap: 8, ...mono, fontSize: 10, color: ASH, textTransform: "uppercase", marginBottom: 6 }}><span>#</span><span>kg</span><span>reps</span><span>rpe</span><span></span></div>
              {b.sets.map((s, si) => {
                const done = s.load && s.reps;
                return (
                  <div key={si} style={{ display: "grid", gridTemplateColumns: "24px 1fr 1fr 1fr 40px", gap: 8, marginBottom: 6, alignItems: "center" }}>
                    <Mono s={{ fontSize: 13 }} c={done ? LIME : ASH}>{si + 1}</Mono>
                    {["load", "reps", "rpe"].map((k) => <input key={k} value={s[k]} inputMode="decimal" placeholder="—" onChange={(e) => update(i, { ...b, sets: b.sets.map((x, xi) => xi === si ? { ...x, [k]: e.target.value } : x) })} style={{ ...inp, borderColor: done ? `${LIME}55` : LINE }} />)}
                    <span style={{ textAlign: "center", color: done ? LIME : LINE, fontSize: 16 }}>{done ? "✓" : "○"}</span>
                  </div>
                );
              })}
              <Btn kind="dark" onClick={() => update(i, { ...b, sets: [...b.sets, { load: b.sets.at(-1)?.load || "", reps: b.sets.at(-1)?.reps || "", rpe: "" }] })} style={{ width: "100%", marginTop: 6, fontSize: 13 }}>+ Add set</Btn>
              <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button onClick={() => update(i, { ...b, _open: !b._open })} style={{ ...mono, background: "none", border: "none", color: b.note || b.pain ? LIME : ASH, fontSize: 12, cursor: "pointer" }}>
                  {b._open ? "− notes" : "+ notes / pain / tempo"}{(b.note || b.pain > 0) && !b._open ? " ●" : ""}
                </button>
                <RestTimer />
              </div>
              {b._open && <div style={{ marginTop: 12, padding: 14, background: INK2, borderRadius: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                {b.coachNote && <div style={{ padding: 10, background: `${VIOLET}14`, borderLeft: `3px solid ${VIOLET}`, borderRadius: 8 }}>
                  <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 4 }} c={VIOLET}>Coach note</Mono>
                  <div style={{ ...body, fontSize: 13, color: CHALK, lineHeight: 1.4 }}>{b.coachNote}</div>
                </div>}
                <div>
                  <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>Your note</Mono>
                  <input value={b.note} onChange={(e) => update(i, { ...b, note: e.target.value })} placeholder="How did it feel?" style={{ ...inp, textAlign: "left", marginTop: 6 }} />
                </div>
                <div>
                  <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>Pain {b.pain > 0 ? `· ${b.pain}/10` : ""}</Mono>
                  <input type="range" min="0" max="10" value={b.pain} onChange={(e) => update(i, { ...b, pain: +e.target.value })} style={{ width: "100%", marginTop: 8, accentColor: b.pain >= 5 ? "#e0625e" : b.pain > 0 ? "#e0a96a" : LIME }} />
                </div>
                <div>
                  <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>Tempo · ecc-pause-con-pause</Mono>
                  <input value={b.tempo} inputMode="numeric" onChange={(e) => update(i, { ...b, tempo: e.target.value.replace(/\D/g, "").slice(0, 4).split("").join("-") })} placeholder="x-x-x-x" style={{ ...inp, textAlign: "left", marginTop: 6 }} />
                </div>
                {b.pain >= 4 && <div style={{ ...body, fontSize: 12, color: "#e0a96a" }}>⚠ Pain logged — this will flag in your injury monitor and notify your coach.</div>}
              </div>}
            </>}

            {b.kind === "conditioning" && <div style={{ background: INK2, borderRadius: 14, padding: 18 }}><CondTimer format={b.format} cap={b.cap} work={b.work} rest={b.rest} rounds={b.rounds} /></div>}

            {b.kind === "skill" && <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <input placeholder="reps / time" style={{ ...inp, flex: 1 }} />
              <div style={{ display: "flex", gap: 5 }}>{[1, 2, 3, 4, 5].map((n) => <div key={n} style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${n <= 3 ? VIOLET : LINE}`, background: n <= 3 ? `${VIOLET}22` : "transparent", color: n <= 3 ? VIOLET : ASH, display: "grid", placeItems: "center", ...mono, fontSize: 11 }}>{n}</div>)}</div>
            </div>}

            {b.kind === "sport" && <SportFields b={b} update={(nb) => update(i, nb)} />}
          </Card>
        ))}

        {/* the always-present next action */}
        <Btn onClick={() => setPickerOpen(true)} style={{ width: "100%", marginTop: 4, padding: "16px", fontSize: 16 }}>+ Add exercise</Btn>
        {blocks.length > 0 && <Btn kind="dark" onClick={share} style={{ width: "100%", marginTop: 10 }}>Finish & share →</Btn>}
      </div>

      {pickerOpen && <ExercisePicker close={() => setPickerOpen(false)} onAdd={addBlock} />}
    </div>
  );
}

function Bar({ label, value, color }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <Mono s={{ fontSize: 11, textTransform: "capitalize" }} c={CHALK}>{label}</Mono>
        <Mono s={{ fontSize: 11 }} c={color}>{value}</Mono>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: INK2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${value}%`, background: color, borderRadius: 3, transition: "width .4s" }} />
      </div>
    </div>
  );
}

function Coach({ loadPrescription }) {
  const [mode, setMode] = useState("ai");
  const [useWearable, setUseWearable] = useState(true);
  const [rx, setRx] = useState(() => prescribeSession(TRAINING_LOG, BIOMETRICS));
  const [threads, setThreads] = useState({
    ai: [{ who: "ai", t: rx.why }],
    human: [{ who: "human", t: "Hey — I'm Jakub, your coach. I've reviewed your data and I'm happy with where the engine has you. Message me anytime." }],
  });
  const [draft, setDraft] = useState("");
  const rerun = (wear) => setRx(prescribeSession(TRAINING_LOG, wear ? BIOMETRICS : null));
  const msgs = threads[mode];

  // phase-awareness: the active macrocycle + this week's phase shape the prescription
  const macro = React.useMemo(() => buildMacrocycle("Hybrid", null), []);
  const phase = currentPhase(macro, 5); // week 5 demo

  const fatigueRank = Object.entries(rx.fatigue.muscles).sort((a, b) => b[1] - a[1]).slice(0, 4);

  const send = () => {
    if (!draft.trim()) return;
    const q = draft.toLowerCase(); const text = draft; setDraft("");
    const activeMode = mode;
    setThreads((t) => ({ ...t, [activeMode]: [...t[activeMode], { who: "me", t: text }] }));
    // engine-grounded answers from real computed state
    let a;
    if (activeMode === "human") a = "Looked at your data — agree with the engine here. I'll tweak next week's volume and check in Friday.";
    else if (q.includes("readiness") || q.includes("ready")) a = `Your readiness is ${rx.readiness}/100 right now. It's computed from accumulated fatigue across muscle groups, decaying with a ~2-day half-life. ${rx.readiness > 75 ? "You're fresh — good day to push." : "Moderate — I kept the load conservative."}`;
    else if (q.includes("why") && (q.includes("light") || q.includes("load"))) a = `${rx.primary.move} signal is "${rx.primary.sig.action}" — ${rx.primary.sig.reason}. That set the percentage of e1RM I prescribed.`;
    else if (q.includes("swap") || q.includes("change") || q.includes("conditioning")) a = `Today's conditioning targets your ${rx.pickSys} system because it's the freshest in your log. I can swap it, but you'd be doubling up on a system you hit recently.`;
    else if (q.includes("fatigue") || q.includes("sore")) a = `Most-fatigued right now: ${fatigueRank.slice(0, 2).map(([m, v]) => `${m} (${v})`).join(", ")}. That's why today avoids loading them hard.`;
    else a = `Based on your last ${TRAINING_LOG.length} sessions, I'd hold this prescription. Confidence is ${Math.round(rx.confidence * 100)}% and rising as you log more. Want me to load it into today?`;
    setTimeout(() => setThreads((t) => ({ ...t, [activeMode]: [...t[activeMode], { who: activeMode, t: a }] })), 600);
  };

  return (
    <div style={{ padding: "10px 18px 110px", position: "relative", zIndex: 1, display: "flex", flexDirection: "column", minHeight: "82vh" }}>
      <h1 style={{ ...disp, fontWeight: 900, fontSize: 28, letterSpacing: "-.04em", margin: "6px 0 12px" }}>Coach</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setMode("ai")} style={tabBtn(mode === "ai", LIME)}>✦ AI Coach</button>
        <button onClick={() => setMode("human")} style={tabBtn(mode === "human", VIOLET)}>Human Coach</button>
      </div>

      {mode === "ai" && <>
        {/* live computed state — the engine, visible */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>Readiness</Mono>
              <div style={{ ...disp, fontWeight: 900, fontSize: 38, color: rx.readiness > 75 ? LIME : "#e0a96a", lineHeight: 1 }}>{rx.readiness}<span style={{ fontSize: 15, color: ASH }}>/100</span></div>
              {useWearable && rx.bioAdj !== 0 && <Mono s={{ fontSize: 11, display: "block", marginTop: 2 }} c={rx.bioAdj > 0 ? LIME : "#e0a96a"}>{rx.bioAdj > 0 ? "+" : ""}{rx.bioAdj} from wearable</Mono>}
            </div>
            <div style={{ textAlign: "right" }}>
              <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>Model confidence</Mono>
              <div style={{ ...disp, fontWeight: 800, fontSize: 24, color: BLUE }}>{Math.round(rx.confidence * 100)}%</div>
              <Mono s={{ fontSize: 10 }}>{TRAINING_LOG.length} sessions logged</Mono>
            </div>
          </div>
          <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", display: "block", marginBottom: 8 }}>Per-muscle fatigue</Mono>
          {fatigueRank.map(([m, v]) => <Bar key={m} label={m} value={v} color={v > 60 ? "#e0625e" : v > 35 ? "#e0a96a" : LIME} />)}
        </Card>

        {/* wearable biometrics feeding the engine */}
        <Card style={{ marginBottom: 12, borderLeft: `3px solid ${BLUE}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={BLUE}>Recovery · from your wearable</Mono>
            <button onClick={() => { const n = !useWearable; setUseWearable(n); rerun(n); }} style={{ display: "flex", alignItems: "center", gap: 5, background: INK2, border: `1px solid ${useWearable ? BLUE : LINE}`, borderRadius: 999, padding: "3px 4px", cursor: "pointer" }}>
              <span style={{ ...cond, fontSize: 10, fontWeight: 700, textTransform: "uppercase", padding: "2px 7px", borderRadius: 999, background: useWearable ? BLUE : "transparent", color: useWearable ? INK : ASH }}>On</span>
              <span style={{ ...cond, fontSize: 10, fontWeight: 700, textTransform: "uppercase", padding: "2px 7px", borderRadius: 999, background: !useWearable ? ASH : "transparent", color: !useWearable ? INK : ASH }}>Off</span>
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
            {[["HRV", BIOMETRICS.hrv], ["Rest HR", BIOMETRICS.restingHr], ["Sleep", BIOMETRICS.sleep], ["Sleep Q", BIOMETRICS.sleepScore]].map(([label, m]) => {
              const good = m.better === "high" ? m.today >= m.baseline : m.today <= m.baseline;
              return (
                <div key={label} style={{ textAlign: "center", padding: "10px 4px", background: INK2, borderRadius: 10 }}>
                  <div style={{ ...mono, fontWeight: 700, fontSize: 16, color: good ? LIME : "#e0a96a" }}>{m.today}{m.unit}</div>
                  <Mono s={{ fontSize: 9, textTransform: "uppercase", display: "block", marginTop: 2 }}>{label}</Mono>
                  <Mono s={{ fontSize: 9, display: "block" }} c={good ? LIME : "#e0a96a"}>{good ? "▲" : "▼"} base {m.baseline}</Mono>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {DEVICES.filter((d) => d.connected).map((d) => (
              <Chip key={d.id} c={BLUE}>{d.icon} {d.name}</Chip>
            ))}
          </div>
        </Card>

        {/* phase context — the prescription respects where you are in the season */}
        <Card style={{ marginBottom: 12, borderLeft: `3px solid ${phase.block.color}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em" }} c={phase.block.color}>Macrocycle · week {phase.micro.week}</Mono>
            <div style={{ ...disp, fontWeight: 800, fontSize: 17, marginTop: 2 }}>{phase.block.label} phase · {phase.micro.kind === "recovery" ? "deload week" : "load week"}</div>
            <Mono s={{ fontSize: 11, display: "block", marginTop: 2 }}>{phase.block.focus}</Mono>
          </div>
          <div style={{ textAlign: "right" }}>
            <Mono s={{ fontSize: 10, textTransform: "uppercase" }}>Target</Mono>
            <div style={{ ...mono, fontSize: 13, color: phase.block.color }}>{phase.micro.intensity}% int</div>
            <div style={{ ...mono, fontSize: 13, color: ASH }}>{phase.micro.volume}% vol</div>
          </div>
        </Card>

        {/* the prescription it generated */}
        <Card glow style={{ marginBottom: 12, borderLeft: `3px solid ${LIME}` }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>Prescribed for today</Mono>
          <Mono s={{ fontSize: 11, display: "block", marginTop: 4 }}>Dosed for your {phase.block.label.toLowerCase()} phase ({phase.micro.intensity}% intensity target).</Mono>
          {rx.blocks.map((b) => (
            <div key={b.uid} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
              <div style={{ ...disp, fontWeight: 700, fontSize: 16 }}>{b.name}</div>
              <Mono s={{ fontSize: 13 }} c={CHALK}>{b.kind === "strength" ? `${b.sets.length}×${b.sets[0].reps} @ ${b.sets[0].load}kg` : b.format}</Mono>
            </div>
          ))}
          <Btn onClick={() => loadPrescription(rx.blocks)} style={{ width: "100%", marginTop: 14 }}>Load into today's session →</Btn>
          <Btn kind="dark" onClick={() => rerun(useWearable)} style={{ width: "100%", marginTop: 8, fontSize: 13 }}>↻ Re-run engine</Btn>
        </Card>
      </>}

      {mode === "human" && <>
        <Card style={{ marginBottom: 12, borderLeft: `3px solid ${VIOLET}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 22, background: `${VIOLET}33`, display: "grid", placeItems: "center", ...disp, fontWeight: 700, color: VIOLET }}>{MY_COACH.initials}</div>
            <div style={{ flex: 1 }}><div style={{ ...disp, fontWeight: 700, fontSize: 16 }}>{MY_COACH.name}</div><Mono s={{ fontSize: 11 }} c={VIOLET}>{MY_COACH.cert} · since {MY_COACH.since}</Mono></div>
            <Chip c={VIOLET}>Linked</Chip>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: `1px solid ${LINE}` }}>
            <Mono s={{ fontSize: 11, lineHeight: 1.3 }}>You granted access to your training data. They can leave private notes you won't see.</Mono>
            <button style={{ ...mono, fontSize: 11, background: "none", border: `1px solid ${LINE}`, borderRadius: 8, color: ASH, padding: "5px 10px", cursor: "pointer", whiteSpace: "nowrap", marginLeft: 8 }}>End link</button>
          </div>
        </Card>

        {/* injury monitor — body-area log */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c="#e0a96a">Injury monitor</Mono>
            <button style={{ ...mono, fontSize: 12, background: "none", border: `1px solid ${LINE}`, borderRadius: 8, color: CHALK, padding: "5px 10px", cursor: "pointer" }}>+ log area</button>
          </div>
          {INJURY_LOG.map((inj) => (
            <div key={inj.id} style={{ display: "flex", gap: 12, padding: "10px 0", borderTop: `1px solid ${LINE}` }}>
              <div style={{ width: 6, borderRadius: 3, background: inj.level >= 3 ? "#e0625e" : "#e0a96a" }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ ...disp, fontWeight: 700, fontSize: 15 }}>{inj.area}</div>
                  <Chip c={inj.status === "Rehabbing" ? "#e0625e" : "#e0a96a"}>{inj.status}</Chip>
                </div>
                <Mono s={{ fontSize: 11, display: "block", margin: "2px 0 4px" }}>since {inj.since} · pain {inj.level}/10</Mono>
                <div style={{ ...body, fontSize: 13, color: ASH, lineHeight: 1.4 }}>{inj.note}</div>
              </div>
            </div>
          ))}
        </Card>
      </>}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.who === "me" ? "flex-end" : "flex-start", maxWidth: "84%" }}>
            <div style={{ ...body, fontSize: 14, lineHeight: 1.5, padding: "11px 14px", borderRadius: 14, background: m.who === "me" ? LIME : CARD, color: m.who === "me" ? INK : CHALK, border: m.who === "me" ? "none" : `1px solid ${LINE}`, borderLeft: m.who === "ai" ? `3px solid ${LIME}` : m.who === "human" ? `3px solid ${VIOLET}` : undefined }}>
              {m.who !== "me" && <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 5 }} c={m.who === "ai" ? LIME : VIOLET}>{m.who === "ai" ? "AI Coach" : "Coach Jakub"}</Mono>}
              {m.t}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Ask: why is today light? how's my readiness?" style={{ ...inp, flex: 1, textAlign: "left", padding: "13px 14px", fontSize: 13 }} />
        <Btn onClick={send} style={{ padding: "0 18px" }}>↑</Btn>
      </div>
    </div>
  );
}

// build a date-driven schedule: 14 days back (completed) + 14 days forward (planned)
function buildSchedule() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sched = {};
  const key = (d) => d.toISOString().slice(0, 10);
  // past completed sessions, spaced realistically
  const pastTemplates = [
    { title: "Lower + Engine", dur: "1:04", domains: ["S", "E"], pr: "Squat e1RM 154", exercises: [{ name: "Back Squat", detail: "100×5 · 110×3 · 120×2" }, { name: "Romanian Deadlift", detail: "90×8 · 90×8 · 90×8" }, { name: "Row Intervals", detail: "8 × 40s/20s" }, { name: "Toes-to-Bar", detail: "3 × 12" }] },
    { title: "Upper Strength", dur: "0:58", domains: ["S"], pr: "Bench 110×3", exercises: [{ name: "Bench Press", detail: "90×5 · 100×3 · 110×3" }, { name: "Weighted Pull-up", detail: "4 × 6 @ +20kg" }, { name: "Overhead Press", detail: "60×5 · 60×5 · 60×5" }, { name: "Barbell Row", detail: "80×8 · 80×8 · 80×8" }] },
    { title: "Threshold Intervals", dur: "0:42", domains: ["E"], pr: null, exercises: [{ name: "Row Warm-up", detail: "10 min easy" }, { name: "2k Row Intervals", detail: "4 × 2 km @ 1:52" }, { name: "Cool-down", detail: "10 min easy" }] },
    { title: "Hyrox Sim", dur: "1:11", domains: ["E", "K"], pr: null, exercises: [{ name: "Run", detail: "8 × 1 km" }, { name: "Sled Push", detail: "8 × 25 m" }, { name: "Burpee Broad Jump", detail: "8 × 15 m" }, { name: "Farmer's Carry", detail: "8 × 50 m @ 2×24kg" }, { name: "Sandbag Lunge", detail: "8 × 20 m @ 30kg" }, { name: "Wall Balls", detail: "100 reps @ 9kg" }] },
    { title: "Deadlift + Skill", dur: "0:55", domains: ["S", "K"], pr: "DL 188×3", exercises: [{ name: "Deadlift", detail: "160×3 · 175×3 · 188×3" }, { name: "Front Squat", detail: "85×5 · 85×5 · 85×5" }, { name: "Muscle-up", detail: "5 × 3" }, { name: "Hanging Leg Raise", detail: "3 × 12" }] },
    { title: "Push / Pull", dur: "1:02", domains: ["S"], pr: null, exercises: [{ name: "Bench Press", detail: "95×5 · 95×5 · 95×5" }, { name: "Pull-up", detail: "4 × 10" }, { name: "Dumbbell Curl", detail: "3 × 12 @ 16kg" }, { name: "Cable Tricep", detail: "3 × 12 @ 30kg" }] },
  ];
  const pastOffsets = [1, 3, 5, 7, 9, 12];
  pastOffsets.forEach((off, i) => {
    const d = new Date(today); d.setDate(d.getDate() - off);
    sched[key(d)] = { status: "done", ...pastTemplates[i % pastTemplates.length] };
  });
  // today = prescribed
  sched[key(today)] = { status: "today", title: "AI Prescribed", dur: "≈58", domains: ["S", "E"], pr: null, exercises: [{ name: "Front Squat", detail: "85×5 · 90×5 · 95×5" }, { name: "Assault Bike", detail: "EMOM × 10" }, { name: "Handstand Push-up", detail: "5 × 5" }] };
  // future planned from a 4x/week cadence (Mon/Tue/Thu/Sat-ish)
  const futureTemplates = [
    { title: "Bench + Bike", domains: ["S", "E"], exercises: [{ name: "Bench Press", detail: "4 × 5" }, { name: "Assault Bike", detail: "8 × 30s/30s" }, { name: "Face Pull", detail: "3 × 15" }] },
    { title: "Squat Volume", domains: ["S"], exercises: [{ name: "Back Squat", detail: "5 × 5" }, { name: "Leg Press", detail: "4 × 12" }, { name: "Calf Raise", detail: "4 × 15" }] },
    { title: "Engine: Steady", domains: ["E"], exercises: [{ name: "Easy Run", detail: "45 min Z2" }] },
    { title: "Full Body + Skill", domains: ["S", "K"], exercises: [{ name: "Clean & Jerk", detail: "5 × 2" }, { name: "Pull-up", detail: "4 × 8" }, { name: "Toes-to-Bar", detail: "4 × 12" }] },
    { title: "Intervals", domains: ["E"], exercises: [{ name: "Row Intervals", detail: "6 × 500m" }] },
    { title: "Deadlift Day", domains: ["S"], exercises: [{ name: "Deadlift", detail: "5 × 3" }, { name: "Romanian Deadlift", detail: "3 × 8" }, { name: "Back Extension", detail: "3 × 15" }] },
  ];
  const futureOffsets = [2, 4, 6, 8, 9, 11];
  futureOffsets.forEach((off, i) => {
    const d = new Date(today); d.setDate(d.getDate() + off);
    sched[key(d)] = { status: "planned", dur: "—", pr: null, ...futureTemplates[i % futureTemplates.length] };
  });
  return { sched, today, key };
}

const DOMAIN_COLOR = { S: LIME, E: BLUE, K: VIOLET };
const DOMAIN_NAME = { S: "Strength", E: "Engine", K: "Skill" };

function WeekCalendar({ sched, today, dayKey, weekOffset, setWeekOffset, onPick }) {
  // start of the displayed week (Monday)
  const base = new Date(today);
  base.setDate(base.getDate() - ((base.getDay() + 6) % 7) + weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(base); d.setDate(d.getDate() + i); return d; });
  const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const monthLabel = base.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <button onClick={() => setWeekOffset(weekOffset - 1)} style={navArrow}>‹</button>
        <Mono s={{ fontSize: 13, letterSpacing: ".08em", textTransform: "uppercase" }} c={CHALK}>
          {weekOffset === 0 ? "This week" : weekOffset === -1 ? "Last week" : weekOffset === 1 ? "Next week" : monthLabel}
        </Mono>
        <button onClick={() => setWeekOffset(weekOffset + 1)} style={navArrow}>›</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {days.map((d, i) => {
          const k = dayKey(d);
          const ses = sched[k];
          const isToday = k === dayKey(today);
          const accent = ses?.status === "today" ? LIME : ses?.status === "done" ? CHALK : ses?.status === "planned" ? ASH : LINE;
          return (
            <Card key={k} onClick={() => onPick(d, ses)} glow={ses?.status === "today"} style={{
              padding: 14, display: "flex", alignItems: "center", gap: 14,
              borderLeft: `3px solid ${ses ? accent : LINE}`, opacity: ses ? 1 : 0.55,
            }}>
              <div style={{ textAlign: "center", minWidth: 42 }}>
                <Mono s={{ fontSize: 10, textTransform: "uppercase" }} c={isToday ? LIME : ASH}>{DOW[i]}</Mono>
                <div style={{ ...disp, fontWeight: 800, fontSize: 20, color: isToday ? LIME : CHALK }}>{d.getDate()}</div>
              </div>
              <div style={{ flex: 1 }}>
                {ses ? <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ ...disp, fontWeight: 700, fontSize: 15 }}>{ses.title}</div>
                    {ses.status === "done" && <span style={{ color: LIME, fontSize: 13 }}>✓</span>}
                    {ses.status === "today" && <Chip solid>Today</Chip>}
                    {ses.status === "planned" && <Mono s={{ fontSize: 10, textTransform: "uppercase" }}>planned</Mono>}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
                    {ses.domains.map((dm) => <span key={dm} style={{ width: 8, height: 8, borderRadius: 4, background: DOMAIN_COLOR[dm] }} />)}
                    <Mono s={{ fontSize: 11, marginLeft: 4 }}>{ses.dur !== "—" ? ses.dur : "—"}</Mono>
                    {ses.pr && <Chip solid>★ PR</Chip>}
                  </div>
                </> : <Mono s={{ fontSize: 13 }}>Rest day</Mono>}
              </div>
              <span style={{ color: ASH, fontSize: 18 }}>{ses ? "›" : ""}</span>
            </Card>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 16 }}>
        {Object.entries(DOMAIN_NAME).map(([k, name]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: DOMAIN_COLOR[k] }} />
            <Mono s={{ fontSize: 11 }}>{name}</Mono>
          </div>
        ))}
      </div>
    </div>
  );
}

function DayDetail({ date, session, close, share, go }) {
  const label = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "#000000cc", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={close}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto", background: INK, borderRadius: "24px 24px 0 0", border: `1px solid ${LINE}`, padding: 22, paddingBottom: 96 }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: LINE, margin: "0 auto 18px", position: "sticky", top: 0 }} />
        <Mono s={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>{label}</Mono>
        {!session ? (
          <div style={{ ...disp, fontWeight: 800, fontSize: 22, marginTop: 8 }}>Rest day</div>
        ) : <>
          <div style={{ ...disp, fontWeight: 900, fontSize: 26, margin: "8px 0 6px" }}>{session.title}</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {session.domains.map((dm) => <Chip key={dm} c={DOMAIN_COLOR[dm]}>{DOMAIN_NAME[dm]}</Chip>)}
            {session.pr && <Chip solid>★ {session.pr}</Chip>}
          </div>
          <Mono s={{ fontSize: 13, display: "block", marginBottom: 14 }}>
            {session.status === "done" ? `Completed · ${session.dur}` : session.status === "today" ? "Prescribed for today" : "Scheduled · upcoming"}
          </Mono>

          {/* the exercise list — what was previously cut off */}
          {session.exercises && <div style={{ background: INK2, borderRadius: 14, padding: "6px 16px", marginBottom: 16 }}>
            {session.exercises.map((ex, xi) => (
              <div key={xi} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "11px 0", borderTop: xi ? `1px solid ${LINE}` : "none" }}>
                <div style={{ ...disp, fontWeight: 600, fontSize: 15 }}>{ex.name}</div>
                <Mono s={{ fontSize: 13 }} c={CHALK}>{ex.detail}</Mono>
              </div>
            ))}
          </div>}

          {session.status === "done" && <Btn kind="dark" onClick={share} style={{ width: "100%" }}>↗ Share this session</Btn>}
          {session.status === "today" && <Btn onClick={() => { close(); go("session"); }} style={{ width: "100%" }}>Start today's session →</Btn>}
          {session.status === "planned" && <>
            <Btn onClick={() => { close(); go("session"); }} style={{ width: "100%" }}>Start early →</Btn>
            <Btn kind="dark" style={{ width: "100%", marginTop: 8 }}>Reschedule</Btn>
          </>}
        </>}
      </div>
    </div>
  );
}

const navArrow = { ...disp, fontSize: 20, fontWeight: 700, background: INK2, border: `1px solid ${LINE}`, borderRadius: 10, color: CHALK, width: 38, height: 38, cursor: "pointer" };

// ===================== ADMIN PANEL =====================
function AdminPanel({ lang, setLang, defaultLang, setDefaultLang }) {
  const [section, setSection] = useState("language");
  const sections = [["language", "Language"], ["users", "Users"], ["plans", "Plans"], ["content", "Content"]];

  // translation coverage per language
  const enKeys = Object.keys(TRANSLATIONS.en).length;
  const coverage = Object.fromEntries(Object.keys(LANGS).map((l) => [l, Math.round((Object.keys(TRANSLATIONS[l] || {}).length / enKeys) * 100)]));

  return (
    <div style={{ padding: "10px 18px 110px", position: "relative", zIndex: 1 }}>
      <Mono s={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase" }} c="#e0a96a">Operator console</Mono>
      <h1 style={{ ...disp, fontWeight: 900, fontSize: 30, letterSpacing: "-.04em", margin: "4px 0 14px" }}>Admin</h1>

      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 18 }}>
        {sections.map(([id, l]) => (
          <button key={id} onClick={() => setSection(id)} style={{ ...cond, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", padding: "8px 14px", borderRadius: 10, cursor: "pointer", whiteSpace: "nowrap", border: `1px solid ${section === id ? "#e0a96a" : LINE}`, background: section === id ? "#e0a96a" : "transparent", color: section === id ? INK : ASH }}>{l}</button>
        ))}
      </div>

      {section === "language" && <>
        <Card style={{ marginBottom: 14 }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c="#e0a96a">Default app language</Mono>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {Object.entries(LANGS).map(([code, name]) => (
              <button key={code} onClick={() => setDefaultLang(code)} style={{ ...cond, fontSize: 13, fontWeight: 700, padding: "9px 14px", borderRadius: 10, cursor: "pointer", flex: 1, border: `1px solid ${defaultLang === code ? "#e0a96a" : LINE}`, background: defaultLang === code ? "#e0a96a" : "transparent", color: defaultLang === code ? INK : ASH }}>{name}</button>
            ))}
          </div>
          <Mono s={{ fontSize: 11, display: "block", marginTop: 10 }}>New users start in this language. Each user can override it.</Mono>
        </Card>

        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 10 }}>Translation coverage</Mono>
        {Object.entries(LANGS).map(([code, name]) => (
          <Card key={code} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ ...disp, fontWeight: 700, fontSize: 15 }}>{name} <Mono s={{ fontSize: 11 }}>{code.toUpperCase()}</Mono></div>
              <Mono s={{ fontSize: 13 }} c={coverage[code] === 100 ? LIME : "#e0a96a"}>{coverage[code]}%</Mono>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: INK2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${coverage[code]}%`, background: coverage[code] === 100 ? LIME : "#e0a96a", borderRadius: 3 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <Mono s={{ fontSize: 11 }}>{Object.keys(TRANSLATIONS[code] || {}).length} / {enKeys} keys</Mono>
              <button style={{ ...mono, fontSize: 11, background: "none", border: `1px solid ${LINE}`, borderRadius: 8, color: CHALK, padding: "4px 10px", cursor: "pointer" }}>Edit strings →</button>
            </div>
          </Card>
        ))}
        <Card style={{ marginTop: 6, borderStyle: "dashed", textAlign: "center", padding: 18 }}>
          <Mono s={{ fontSize: 12 }}>+ Add a language</Mono>
        </Card>
      </>}

      {section === "users" && <>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
          {[["2,847", "users", CHALK], ["214", "coaches", VIOLET], ["63%", "active 30d", LIME]].map(([a, b, c]) => (
            <Card key={b} style={{ padding: 14, textAlign: "center" }}><div style={{ ...disp, fontWeight: 800, fontSize: 22, color: c }}>{a}</div><Mono s={{ fontSize: 10, textTransform: "uppercase" }}>{b}</Mono></Card>
          ))}
        </div>
        {[["Rafal A.", "Athlete · EN", "active"], ["Coach Jakub", "Coach · PL · 14 clients", "active"], ["Marta W.", "Athlete · DE", "active"], ["Tomáš R.", "Athlete · EN", "suspended"]].map(([n, meta, st]) => (
          <Card key={n} style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div><div style={{ ...disp, fontWeight: 700, fontSize: 15 }}>{n}</div><Mono s={{ fontSize: 11 }}>{meta}</Mono></div>
            <Chip c={st === "active" ? LIME : "#e0625e"}>{st}</Chip>
          </Card>
        ))}
      </>}

      {section === "plans" && <>
        <Mono s={{ fontSize: 12, display: "block", marginBottom: 12 }}>Manage the pre-built plan library · {GOAL_TREE.reduce((n, g) => n + g.plans.length, 0)} plans across {GOAL_TREE.length} goals.</Mono>
        {GOAL_TREE.map((g) => (
          <Card key={g.id} style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", borderLeft: `3px solid ${g.color}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 18, color: g.color }}>{g.icon}</span><div style={{ ...disp, fontWeight: 700, fontSize: 15 }}>{g.name}</div></div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Mono s={{ fontSize: 12 }}>{g.plans.length} plans</Mono><span style={{ color: ASH }}>›</span></div>
          </Card>
        ))}
        <Btn style={{ width: "100%", marginTop: 6, background: "#e0a96a" }}>+ New plan</Btn>
      </>}

      {section === "content" && <>
        {[["Exercise library", `${Object.values(CATALOG).flat().length} movements`], ["Sports", `${SPORT_NAMES.length} sports`], ["Phase models", `${Object.keys(PHASE_MODELS).length} models`], ["Onboarding copy", "3 languages"]].map(([t, meta]) => (
          <Card key={t} style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div><div style={{ ...disp, fontWeight: 700, fontSize: 15 }}>{t}</div><Mono s={{ fontSize: 11 }}>{meta}</Mono></div>
            <span style={{ color: ASH }}>›</span>
          </Card>
        ))}
      </>}
    </div>
  );
}


// ===================== SPORT-DRIVEN TRAINING SCREEN =====================
function SportTraining({ loadPrescription }) {
  const [sportName, setSportName] = useState(null);
  const [levelIdx, setLevelIdx] = useState(1);
  const [marker, setMarker] = useState("");

  if (!sportName) {
    return (
      <div style={{ padding: "10px 18px 110px", position: "relative", zIndex: 1 }}>
        <Mono s={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase" }} c={AMBER}>Train for your sport</Mono>
        <h1 style={{ ...disp, fontWeight: 900, fontSize: 30, letterSpacing: "-.04em", margin: "4px 0 4px" }}>What's your sport?</h1>
        <Mono s={{ fontSize: 13, display: "block", marginBottom: 18 }}>We'll prescribe the strength work that makes you better at it.</Mono>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {SPORT_NAMES.map((s) => (
            <Card key={s} onClick={() => setSportName(s)} style={{ padding: 18, borderLeft: `3px solid ${AMBER}` }}>
              <div style={{ fontSize: 28 }}>{SPORTS[s].icon}</div>
              <div style={{ ...disp, fontWeight: 800, fontSize: 17, marginTop: 10 }}>{s}</div>
              <Mono s={{ fontSize: 11, marginTop: 4, display: "block" }}>{SPORTS[s].family}</Mono>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const sport = SPORTS[sportName];
  const rx = prescribeForSport(sportName, levelIdx);

  return (
    <div style={{ padding: "10px 18px 110px", position: "relative", zIndex: 1 }}>
      <button onClick={() => setSportName(null)} style={{ ...mono, background: "none", border: "none", color: ASH, fontSize: 14, cursor: "pointer", marginBottom: 10 }}>‹ change sport</button>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 34 }}>{sport.icon}</div>
        <div><h1 style={{ ...disp, fontWeight: 900, fontSize: 26, letterSpacing: "-.03em" }}>{sportName}</h1><Mono s={{ fontSize: 12 }}>{sport.family}</Mono></div>
      </div>

      {/* level tier */}
      <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 8 }}>Your level</Mono>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {LEVELS.map((l, i) => (
          <button key={l} onClick={() => setLevelIdx(i)} style={{ ...cond, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", padding: "9px 4px", borderRadius: 9, cursor: "pointer", flex: 1, border: `1px solid ${levelIdx === i ? AMBER : LINE}`, background: levelIdx === i ? AMBER : "transparent", color: levelIdx === i ? INK : ASH }}>{l}</button>
        ))}
      </div>

      {/* performance marker */}
      <div style={{ marginBottom: 18 }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>{sport.marker.label}</Mono>
        <input value={marker} onChange={(e) => setMarker(e.target.value)} placeholder={sport.marker.ph} style={{ ...inp, textAlign: "left", marginTop: 6 }} />
        <Mono s={{ fontSize: 11, display: "block", marginTop: 6 }}>Sharpens your prescription beyond the level tier.</Mono>
      </div>

      {/* prescribed session */}
      <Card glow style={{ marginBottom: 16, borderLeft: `3px solid ${AMBER}` }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={AMBER}>Today's session for {sportName}</Mono>
        {rx.blocks.map((b) => (
          <div key={b.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <div>
              <div style={{ ...disp, fontWeight: 700, fontSize: 16 }}>{b.name}</div>
              <Mono s={{ fontSize: 11 }}>{b.demand}</Mono>
            </div>
            <Mono s={{ fontSize: 14 }} c={CHALK}>{b.scheme}</Mono>
          </div>
        ))}
        <Btn onClick={() => loadPrescription(rx.blocks, sportName)} style={{ width: "100%", marginTop: 14, background: AMBER }}>Start this session →</Btn>
      </Card>

      {/* prioritized exercise list */}
      <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 10 }}>Key exercises · ranked by impact</Mono>
      {rx.ranked.map((e, i) => (
        <Card key={e.name} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ ...disp, fontWeight: 900, fontSize: 22, color: AMBER, lineHeight: 1, minWidth: 26 }}>{i + 1}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ ...disp, fontWeight: 700, fontSize: 16 }}>{e.name}</div>
                <Chip c={AMBER}>{e.demand}</Chip>
              </div>
              <div style={{ ...body, fontSize: 13, color: ASH, lineHeight: 1.4, marginTop: 6 }}>{e.why}</div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}


// ===================== COACH PERSONA SCREENS =====================
function trendArrow(t) { return t === "up" ? { s: "↗", c: LIME } : t === "down" ? { s: "↘", c: "#e0625e" } : { s: "→", c: ASH }; }

function CoachRoster({ roster, requests, openClient, go }) {
  const flagged = roster.filter((c) => c.injury);
  return (
    <div style={{ padding: "10px 18px 110px", position: "relative", zIndex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <Mono s={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase" }} c={VIOLET}>Coach view</Mono>
          <h1 style={{ ...disp, fontWeight: 900, fontSize: 30, letterSpacing: "-.04em", margin: "4px 0 0" }}>Your roster</h1>
        </div>
        <button onClick={() => go("inbox")} style={{ position: "relative", ...mono, fontSize: 18, background: INK2, border: `1px solid ${LINE}`, borderRadius: 12, color: CHALK, width: 44, height: 44, cursor: "pointer" }}>
          ✉<span style={{ position: "absolute", top: -4, right: -4, background: LIME, color: INK, ...mono, fontWeight: 700, fontSize: 10, borderRadius: 8, padding: "1px 5px" }}>{requests.length}</span>
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, margin: "18px 0" }}>
        {[[roster.length, "clients", CHALK], [flagged.length, "flagged", "#e0625e"], [(roster.length ? Math.round(roster.reduce((s, c) => s + c.adherence, 0) / roster.length) : 0) + "%", "adherence", LIME]].map(([a, b, c]) => (
          <Card key={b} style={{ padding: 14, textAlign: "center" }}><div style={{ ...disp, fontWeight: 800, fontSize: 24, color: c }}>{a}</div><Mono s={{ fontSize: 10, textTransform: "uppercase" }}>{b}</Mono></Card>
        ))}
      </div>

      {flagged.length > 0 && <Card style={{ marginBottom: 14, borderLeft: `3px solid #e0625e` }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c="#e0625e">Needs attention</Mono>
        {flagged.map((c) => <div key={c.id} onClick={() => openClient(c)} style={{ display: "flex", justifyContent: "space-between", marginTop: 8, cursor: "pointer" }}>
          <div style={{ ...disp, fontWeight: 700, fontSize: 14 }}>{c.name}</div><Mono s={{ fontSize: 12 }} c="#e0a96a">{c.injury}</Mono>
        </div>)}
      </Card>}

      {roster.map((c) => {
        const ta = trendArrow(c.trend);
        return (
          <Card key={c.id} onClick={() => openClient(c)} style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 22, background: `${VIOLET}22`, border: `1px solid ${VIOLET}55`, display: "grid", placeItems: "center", ...disp, fontWeight: 700, color: VIOLET }}>{c.initials}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ ...disp, fontWeight: 700, fontSize: 16 }}>{c.name}</div>
                {c.injury && <span style={{ width: 8, height: 8, borderRadius: 4, background: "#e0625e" }} />}
              </div>
              <Mono s={{ fontSize: 11, display: "block", marginTop: 2 }}>{c.goal} · {c.lastSession}</Mono>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ ...mono, fontWeight: 700, fontSize: 16, color: c.readiness > 70 ? LIME : c.readiness > 50 ? "#e0a96a" : "#e0625e" }}>{c.readiness}</div>
              <Mono s={{ fontSize: 13 }} c={ta.c}>{ta.s} {c.adherence}%</Mono>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function ClientDetail({ client, back }) {
  const [note, setNote] = useState("");
  return (
    <div style={{ padding: "10px 18px 110px", position: "relative", zIndex: 1 }}>
      <button onClick={back} style={{ ...mono, background: "none", border: "none", color: ASH, fontSize: 14, cursor: "pointer", marginBottom: 10 }}>‹ roster</button>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <div style={{ width: 54, height: 54, borderRadius: 27, background: `${VIOLET}22`, border: `1px solid ${VIOLET}`, display: "grid", placeItems: "center", ...disp, fontWeight: 700, fontSize: 20, color: VIOLET }}>{client.initials}</div>
        <div><h1 style={{ ...disp, fontWeight: 900, fontSize: 24, letterSpacing: "-.03em" }}>{client.name}</h1><Mono s={{ fontSize: 12 }}>{client.goal} · adherence {client.adherence}%</Mono></div>
      </div>

      {client.injury && <Card style={{ marginBottom: 12, borderLeft: `3px solid #e0625e` }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c="#e0625e">⚠ Injury flag</Mono>
        <div style={{ ...body, fontSize: 14, color: CHALK, marginTop: 6 }}>{client.injury}</div>
      </Card>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <Card style={{ padding: 14 }}><Mono s={{ fontSize: 11, textTransform: "uppercase" }}>Readiness</Mono><div style={{ ...disp, fontWeight: 800, fontSize: 26, color: client.readiness > 70 ? LIME : "#e0a96a", margin: "4px 0 6px" }}>{client.readiness}</div><Spark data={STRENGTH_TREND} color={LIME} /></Card>
        <Card style={{ padding: 14 }}><Mono s={{ fontSize: 11, textTransform: "uppercase" }}>Squat e1RM</Mono><div style={{ ...disp, fontWeight: 800, fontSize: 26, color: CHALK, margin: "4px 0 6px" }}>154</div><Spark data={STRENGTH_TREND} color={LIME} /></Card>
      </div>

      <Mono s={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 10 }}>Recent sessions</Mono>
      {HISTORY.slice(0, 3).map((h) => (
        <Card key={h.id} style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><div style={{ ...disp, fontWeight: 700, fontSize: 15 }}>{h.title}</div><Mono s={{ fontSize: 11 }}>{h.date} · {h.dur}</Mono></div>
          {h.pr && <Chip solid>★ PR</Chip>}
        </Card>
      ))}

      <Card style={{ marginTop: 14, borderLeft: `3px solid ${VIOLET}` }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>Leave a coach note</Mono>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note on a lift, e.g. 'film squat set 3'…" style={{ ...inp, textAlign: "left", margin: "10px 0" }} />
        <Btn onClick={() => setNote("")} style={{ width: "100%" }}>Send to {client.name.split(" ")[0]} →</Btn>
        <Btn kind="dark" style={{ width: "100%", marginTop: 8, fontSize: 13 }}>Adjust their program</Btn>
      </Card>
    </div>
  );
}

function CoachInbox({ requests, accept, decline, back }) {
  return (
    <div style={{ padding: "10px 18px 110px", position: "relative", zIndex: 1 }}>
      <button onClick={back} style={{ ...mono, background: "none", border: "none", color: ASH, fontSize: 14, cursor: "pointer", marginBottom: 10 }}>‹ roster</button>
      <h1 style={{ ...disp, fontWeight: 900, fontSize: 28, letterSpacing: "-.04em", marginBottom: 4 }}>Requests</h1>
      <Mono s={{ fontSize: 13, display: "block", marginBottom: 8 }}>Athletes asking you to coach them.</Mono>
      <div style={{ padding: "8px 12px", borderRadius: 10, background: `${VIOLET}12`, border: `1px solid ${VIOLET}40`, marginBottom: 18 }}>
        <Mono s={{ fontSize: 11, lineHeight: 1.4 }} c={CHALK}>Mutual consent: you only gain access to an athlete's data once you accept — and they requested you. Either side can end the link.</Mono>
      </div>
      {requests.length === 0
        ? <Card style={{ textAlign: "center", padding: 30 }}><Mono s={{ fontSize: 13 }}>No pending requests.</Mono></Card>
        : requests.map((r) => (
          <Card key={r.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 20, background: `${VIOLET}22`, border: `1px solid ${VIOLET}55`, display: "grid", placeItems: "center", ...disp, fontWeight: 700, color: VIOLET }}>{r.initials}</div>
              <div style={{ flex: 1 }}><div style={{ ...disp, fontWeight: 700, fontSize: 16 }}>{r.name}</div><Chip c={VIOLET}>{r.goal}</Chip></div>
            </div>
            <div style={{ ...body, fontSize: 13, color: ASH, lineHeight: 1.4, margin: "10px 0 12px" }}>"{r.note}"</div>
            <div style={{ display: "flex", gap: 8 }}><Btn onClick={() => accept(r)} style={{ flex: 1 }}>Accept</Btn><Btn kind="dark" onClick={() => decline(r)} style={{ flex: 1 }}>Decline</Btn></div>
          </Card>
        ))}
    </div>
  );
}


function HistoryScreen({ share, go }) {
  const [view, setView] = useState("calendar"); // calendar default, per request
  const [weekOffset, setWeekOffset] = useState(0);
  const [picked, setPicked] = useState(null);
  const [openId, setOpenId] = useState(null);
  const { sched, today, key } = React.useMemo(buildSchedule, []);

  return (
    <div style={{ padding: "10px 18px 110px", position: "relative", zIndex: 1 }}>
      <h1 style={{ ...disp, fontWeight: 900, fontSize: 30, letterSpacing: "-.04em", margin: "6px 0 4px" }}>History</h1>
      <Mono s={{ fontSize: 13 }}>Past sessions and what's coming up.</Mono>

      <div style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        {[["calendar", "Calendar"], ["list", "List"]].map(([id, l]) => (
          <button key={id} onClick={() => setView(id)} style={{ ...cond, fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", padding: "8px 16px", borderRadius: 10, cursor: "pointer", border: `1px solid ${view === id ? LIME : LINE}`, background: view === id ? LIME : "transparent", color: view === id ? INK : ASH }}>{l}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
        <Card style={{ padding: 14 }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase" }}>Squat e1RM</Mono>
          <div style={{ ...disp, fontWeight: 800, fontSize: 22, color: LIME, margin: "4px 0 6px" }}>154<span style={{ fontSize: 12, color: ASH }}> kg</span></div>
          <Spark data={STRENGTH_TREND} color={LIME} />
        </Card>
        <Card style={{ padding: 14 }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase" }}>2k pace</Mono>
          <div style={{ ...disp, fontWeight: 800, fontSize: 22, color: BLUE, margin: "4px 0 6px" }}>1:52<span style={{ fontSize: 12, color: ASH }}> /500</span></div>
          <Spark data={ENGINE_TREND} color={BLUE} invert />
        </Card>
      </div>

      {view === "calendar"
        ? <WeekCalendar sched={sched} today={today} dayKey={key} weekOffset={weekOffset} setWeekOffset={setWeekOffset} onPick={(d, s) => setPicked({ date: d, session: s })} />
        : HISTORY.map((h) => {
          const open = openId === h.id;
          return (
          <Card key={h.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setOpenId(open ? null : h.id)}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Mono s={{ fontSize: 12 }} c={LIME}>{h.date}</Mono>
                  {h.tags.map((t) => <Chip key={t} c={t === "Engine" ? BLUE : t === "Race" ? VIOLET : LIME}>{t}</Chip>)}
                </div>
                <div style={{ ...disp, fontWeight: 800, fontSize: 18, marginTop: 6 }}>{h.title}</div>
                <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
                  <Mono s={{ fontSize: 12 }}>⏱ {h.dur}</Mono>
                  <Mono s={{ fontSize: 12 }}>▦ {h.blocks} exercises</Mono>
                  {h.vol !== "—" && <Mono s={{ fontSize: 12 }}>{h.vol}kg</Mono>}
                </div>
                {h.pr && <div style={{ marginTop: 8 }}><Chip solid>★ PR · {h.pr}</Chip></div>}
              </div>
              <button onClick={share} style={{ ...mono, fontSize: 18, background: "none", border: `1px solid ${LINE}`, borderRadius: 10, color: CHALK, width: 38, height: 38, cursor: "pointer" }}>↗</button>
            </div>
            {open && h.exercises && <div style={{ marginTop: 12, borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
              {h.exercises.map((ex, xi) => (
                <div key={xi} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 0" }}>
                  <div style={{ ...disp, fontWeight: 600, fontSize: 14 }}>{ex.name}</div>
                  <Mono s={{ fontSize: 12 }} c={CHALK}>{ex.detail}</Mono>
                </div>
              ))}
            </div>}
            <button onClick={() => setOpenId(open ? null : h.id)} style={{ ...mono, fontSize: 11, background: "none", border: "none", color: ASH, cursor: "pointer", marginTop: 8, padding: 0 }}>{open ? "− hide exercises" : "+ show exercises"}</button>
          </Card>
          );
        })}

      {picked && <DayDetail date={picked.date} session={picked.session} close={() => setPicked(null)} share={() => { setPicked(null); share(); }} go={go} />}
    </div>
  );
}
function Spark({ data, color, invert }) {
  const min = Math.min(...data), max = Math.max(...data), rg = max - min || 1, W = 120, H = 40;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * W, (invert ? (v - min) / rg : 1 - (v - min) / rg) * (H - 8) + 4]);
  return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 40 }}>
    <path d={pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill={color} />)}
  </svg>;
}

function ShareSheet({ close, session }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "#000000cc", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={close}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: INK, borderRadius: "24px 24px 0 0", border: `1px solid ${LINE}`, padding: 22, paddingBottom: 96 }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: LINE, margin: "0 auto 18px" }} />
        <div style={{ ...disp, fontWeight: 800, fontSize: 20, marginBottom: 16 }}>Share to Instagram</div>
        <div style={{ borderRadius: 18, overflow: "hidden", background: `linear-gradient(160deg, ${INK2}, #000)`, border: `1px solid ${LINE}`, padding: 22, position: "relative" }}>
          <div style={{ position: "absolute", top: -30, right: -30, width: 160, height: 160, borderRadius: "50%", background: `radial-gradient(circle, ${LIME}33, transparent 70%)`, filter: "blur(20px)" }} />
          <div style={{ ...disp, fontWeight: 900, fontSize: 15, letterSpacing: "-.03em" }}>HYBRID<span style={{ color: LIME }}>.</span></div>
          <div style={{ ...disp, fontWeight: 900, fontSize: 32, letterSpacing: "-.04em", marginTop: 18, lineHeight: 1 }}>{session.title}</div>
          <div style={{ display: "flex", gap: 20, marginTop: 20 }}>
            {[["58:22", "duration"], ["8,420", "kg moved"], ["154", "squat e1RM"]].map(([a, b]) => (
              <div key={b}><div style={{ ...mono, fontWeight: 700, fontSize: 22, color: LIME, fontVariantNumeric: "tabular-nums" }}>{a}</div><Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>{b}</Mono></div>
            ))}
          </div>
          <div style={{ marginTop: 18, display: "flex", gap: 6 }}><Chip solid>★ New PR</Chip><Chip c={BLUE}>Strength + Engine</Chip></div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <Btn onClick={close} style={{ flex: 1, background: "linear-gradient(45deg,#f09433,#dc2743,#bc1888)", color: "#fff" }}>Share to Story</Btn>
          <Btn kind="dark" onClick={close} style={{ flex: 1 }}>Save image</Btn>
        </div>
      </div>
    </div>
  );
}

const inp = { ...mono, fontSize: 15, background: INK2, border: `1px solid ${LINE}`, borderRadius: 9, color: CHALK, padding: "9px 10px", width: "100%", textAlign: "center", outline: "none" };
const tabBtn = (a, c) => ({ ...cond, fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", padding: "9px 18px", borderRadius: 11, cursor: "pointer", border: `1px solid ${a ? c : LINE}`, background: a ? c : "transparent", color: a ? INK : ASH, flex: 1 });

const NAV = [["home", "Home", "◆"], ["periodize", "Periodize", "◰"], ["plans", "Plans", "▤"], ["sport", "Sport", "◈"], ["history", "History", "◷"], ["coach", "Coach", "✦"]];
const COACH_NAV = [["roster", "Roster", "▦"], ["inbox", "Requests", "✉"]];

export default function App() {
  const [stage, setStage] = useState("app");
  const [role, setRole] = useState("client"); // client | coach | admin
  const [screen, setScreen] = useState("home");
  const [coachScreen, setCoachScreen] = useState("roster");
  const [activeClient, setActiveClient] = useState(null);
  const [roster, setRoster] = useState(ROSTER);
  const [requests, setRequests] = useState(PENDING_REQUESTS);
  const [myCoachStatus, setMyCoachStatus] = useState("linked"); // none | pending | linked
  const acceptRequest = (r) => { setRequests((q) => q.filter((x) => x.id !== r.id)); setRoster((rs) => [{ id: r.id, name: r.name, initials: r.initials, readiness: 70, lastSession: "New", adherence: 0, goal: r.goal, injury: null, trend: "flat" }, ...rs]); };
  const declineRequest = (r) => setRequests((q) => q.filter((x) => x.id !== r.id));
  const [shareOpen, setShareOpen] = useState(false);
  const [defaultLang, setDefaultLang] = useState("en"); // admin-set
  const [lang, setLang] = useState("en");                // user-chosen
  const [langOpen, setLangOpen] = useState(false);
  const t = makeT(lang);
  const [session, setSession] = useState({ title: "Workout", tag: "Freestyle", blocks: [] });
  const startBlank = () => { setSession({ title: "Workout", tag: "Freestyle", blocks: [] }); setScreen("session"); };
  const startPrescribed = () => {
    const rx = prescribeSession(TRAINING_LOG);
    setSession({ title: "AI Prescribed", tag: "Engine", blocks: rx.blocks });
    setScreen("session");
  };
  const ROLES = ["client", "coach", "admin"];
  const setRoleTo = (r) => { setRole(r); setActiveClient(null); setCoachScreen("roster"); };

  const shell = { ...body, background: INK, color: CHALK, minHeight: "100vh", maxWidth: 480, margin: "0 auto", position: "relative", overflowX: "hidden" };
  if (stage === "landing") return <div style={shell}><style>{F}{globalCss}</style><Atmosphere /><Landing enter={() => setStage("auth")} /></div>;
  if (stage === "auth") return <div style={shell}><style>{F}{globalCss}</style><Atmosphere /><Auth done={() => setStage("app")} /></div>;

  const isCoach = role === "coach";
  const isAdmin = role === "admin";
  const roleAccent = isAdmin ? "#e0a96a" : isCoach ? VIOLET : LIME;
  return (
    <div style={shell}>
      <style>{F}{globalCss}</style>
      <Atmosphere />
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: `${INK}dd`, backdropFilter: "blur(14px)", borderBottom: `1px solid ${LINE}`, padding: "13px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span onClick={() => setStage("landing")} style={{ ...disp, fontWeight: 900, fontSize: 17, letterSpacing: "-.04em", cursor: "pointer" }}>HYBRID<span style={{ color: LIME }}>.</span></span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* language picker */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setLangOpen((o) => !o)} style={{ ...cond, fontSize: 12, fontWeight: 700, textTransform: "uppercase", background: INK2, border: `1px solid ${LINE}`, borderRadius: 999, padding: "6px 11px", cursor: "pointer", color: CHALK }}>{lang.toUpperCase()} ⌄</button>
            {langOpen && <div style={{ position: "absolute", top: "110%", right: 0, background: INK, border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden", zIndex: 30, minWidth: 120 }}>
              {Object.entries(LANGS).map(([code, name]) => (
                <button key={code} onClick={() => { setLang(code); setLangOpen(false); }} style={{ ...body, fontSize: 13, fontWeight: 600, padding: "10px 14px", width: "100%", textAlign: "left", background: lang === code ? `${LIME}1a` : "transparent", border: "none", color: lang === code ? LIME : CHALK, cursor: "pointer" }}>{name}</button>
              ))}
            </div>}
          </div>
          {/* role toggle — Client / Coach / Admin */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, background: INK2, border: `1px solid ${roleAccent}`, borderRadius: 999, padding: "4px" }}>
            {ROLES.map((r) => {
              const on = role === r;
              const acc = r === "admin" ? "#e0a96a" : r === "coach" ? VIOLET : LIME;
              return <button key={r} onClick={() => setRoleTo(r)} style={{ ...cond, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", padding: "3px 7px", borderRadius: 999, background: on ? acc : "transparent", color: on ? INK : ASH, border: "none", cursor: "pointer" }}>{t("role." + r)}</button>;
            })}
          </div>
        </div>
      </div>

      {/* role scope banner — what this role can access */}
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "10px 18px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, background: `${roleAccent}12`, border: `1px solid ${roleAccent}40` }}>
          <span style={{ color: roleAccent, fontSize: 13 }}>{isAdmin ? "⚙" : isCoach ? "◆" : "●"}</span>
          <Mono s={{ fontSize: 11, lineHeight: 1.3 }} c={CHALK}>
            {isAdmin ? "Admin · platform aggregates & content. No access to private training data."
              : isCoach ? "Coach · only athletes who accepted you. Your own training lives in Client."
              : "Client · only your own data. Coach notes marked private stay hidden."}
          </Mono>
        </div>
      </div>

      {role === "client" && <>
        {screen === "home" && <Home go={setScreen} startBlank={startBlank} startPrescribed={startPrescribed} t={t} />}
        {screen === "periodize" && <div style={{ padding: "10px 18px 110px", position: "relative", zIndex: 1 }}>
          <Mono s={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase" }} c={LIME}>{t("periodize.kicker")}</Mono>
          <h1 style={{ ...disp, fontWeight: 900, fontSize: 30, letterSpacing: "-.04em", margin: "4px 0 14px" }}>{t("periodize.title")}</h1>
          <PeriodizeTab go={setScreen} />
        </div>}
        {screen === "plans" && <PlansScreen go={setScreen} />}
        {screen === "sport" && <SportTraining loadPrescription={(blocks, sportName) => {
          const sBlocks = blocks.map((b) => makeBlock({ name: b.name, kind: "strength", last: { load: "", reps: b.scheme.split("×")[1] || "" } }));
          setSession({ title: `${sportName} S&C`, tag: sportName, blocks: sBlocks });
          setScreen("session");
        }} />}
        {screen === "session" && <Session session={session} setSession={setSession} go={setScreen} share={() => setShareOpen(true)} />}
        {screen === "history" && <HistoryScreen share={() => setShareOpen(true)} go={setScreen} />}
        {screen === "coach" && <Coach loadPrescription={(blocks) => { setSession((s) => ({ ...s, title: "AI Prescribed", tag: "Engine", blocks })); setScreen("session"); }} />}
      </>}

      {/* ---- COACH ROLE ---- */}
      {isCoach && <>
        {activeClient && <ClientDetail client={activeClient} back={() => setActiveClient(null)} />}
        {!activeClient && coachScreen === "roster" && <CoachRoster roster={roster} requests={requests} openClient={setActiveClient} go={setCoachScreen} />}
        {!activeClient && coachScreen === "inbox" && <CoachInbox requests={requests} accept={acceptRequest} decline={declineRequest} back={() => setCoachScreen("roster")} />}
      </>}

      {/* ---- ADMIN ROLE ---- */}
      {isAdmin && <AdminPanel lang={lang} setLang={setLang} defaultLang={defaultLang} setDefaultLang={setDefaultLang} />}

      {shareOpen && <ShareSheet close={() => setShareOpen(false)} session={session} />}

      {/* bottom nav — role-aware (admin has no bottom nav; it's a console) */}
      {!isAdmin && <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: `${INK}f2`, backdropFilter: "blur(14px)", borderTop: `1px solid ${LINE}`, display: "flex", padding: "8px 0 14px", zIndex: 20 }}>
        {(isCoach ? COACH_NAV : NAV).map(([id, l, ic]) => {
          const active = isCoach ? (coachScreen === id && !activeClient) : screen === id;
          const accent = isCoach ? VIOLET : LIME;
          return (
            <button key={id} onClick={() => isCoach ? (setActiveClient(null), setCoachScreen(id)) : setScreen(id)} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: active ? accent : ASH }}>
              <span style={{ fontSize: 17 }}>{ic}</span>
              <span style={{ ...cond, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>{t("nav." + id)}</span>
            </button>
          );
        })}
      </div>}
    </div>
  );
}

const globalCss = `* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; } body { margin: 0; } input::placeholder { color: ${ASH}; } ::-webkit-scrollbar { display: none; }`;
