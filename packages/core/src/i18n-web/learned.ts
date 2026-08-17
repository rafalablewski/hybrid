/**
 * Strings for the MONTHLY STORY — "What we learned about you" (EN baseline +
 * PL/DE), merged OVER the base TRANSLATIONS in i18n.ts. Keys are namespaced
 * "w.learned.*" so they never collide across domains.
 *
 * The voice here is load-bearing rather than decorative: every one of these
 * strings sits next to a figure the app is claiming to have measured, so it says
 * where the figure came from and what it does not know. Where a count appears it
 * arrives as `{n}` INSIDE the phrase — Polish inflects a bare noun after a
 * numeral three different ways, so the counts sit in prepositional phrases
 * ("z {n} tygodni", "aus {n} Wochen") that read correctly at every count
 * instead of needing a plural table for a caption.
 */
export const web_learned = {
  en: {
    "w.learned.title": "What we learned\nabout you",
    "w.learned.lead": "Every figure below came out of your own training. Each one says which layer it came from and how sure of it we are — and where we are not sure yet, it says that instead.",
    "w.learned.window": "Last {n} days",
    "w.learned.known": "of you, measured",
    "w.learned.knownWhy": "Rises as your log answers the questions a population table can only guess at.",
    "w.learned.moved": "What moved",
    "w.learned.emptyTitle": "Nothing measured yet",
    "w.learned.empty": "Log a few weeks — the sessions, and the two taps that ask how spent you are — and these become your numbers instead of the textbook's.",
    "w.learned.waitingLabel": "Not enough evidence yet",
    "w.learned.provenance": "Where it comes from",
    "w.learned.confidence": "confidence",
    "w.learned.since": "vs the month before",
    "w.learned.censusNote": "counted, not estimated",

    // Chapters
    "w.learned.chapterCeiling": "Your volume ceilings",
    "w.learned.whyCeiling": "A ceiling is only ever found by running into one. These come from weeks where you carried real volume, judged by whether your top sets held and how spent you reported feeling.",
    "w.learned.chapterClearance": "How fast you clear a session",
    "w.learned.whyClearance": "Measured by asking twice about the same session — once in the gym, once hours later — and comparing your drop with the population's decay curve. Below 1 is faster than the curve.",
    "w.learned.chapterReadiness": "Your readiness pattern",
    "w.learned.whyReadiness": "Replayed day by day from your own log, with the wearable deliberately left out: there is no history of past readings to replay, so every day in the window is measured the same way.",

    // Findings
    "w.learned.fClearance": "Your clearance rate",
    "w.learned.fReadiness": "Readiness, averaged",
    "w.learned.fLimiter": "What took the most off you",
    "w.learned.fCeilingUntested": "Ceilings still untested",
    "w.learned.fCeilingsOff": "Learning from your training is switched off",

    // Units
    "w.learned.unitSets": "weekly sets",
    "w.learned.unitCurve": "× the curve",
    "w.learned.unitReadiness": "readiness",
    "w.learned.unitShare": "% of the deficit",

    // Evidence
    "w.learned.evWeeks": "from {n} qualifying weeks",
    "w.learned.evPairs": "from {n} matched pairs of reads",
    "w.learned.evDays": "across {n} days",
    "w.learned.evUntested": "{n} of 7 muscles",

    // What would settle it
    "w.learned.needWeeks": "A ceiling shows up in a week that carried at least the top of your productive band — and it takes two of them before we will say so.",
    "w.learned.needPairs": "Answer how spent you feel twice about one session: once in the gym, once hours later. Two clean pairs and this rate becomes yours.",
    "w.learned.needDays": "Two weeks of days inside the window. Keep logging and checking in.",
    "w.learned.needAdaptive": "Turn on “learn from my training” in the volume model and your own weeks start correcting the estimate.",

    // The clearance state, as the word beside the figure
    "w.learned.clearFast": "faster",
    "w.learned.clearOnTrack": "on the curve",
    "w.learned.clearSlow": "slower",

    // The readiness cause, as the word beside the share
    "w.learned.causeTissue": "tissue load",
    "w.learned.causeConditioning": "conditioning",
    "w.learned.causeWearable": "wearable",
    "w.learned.causeFuel": "under-fuelling",
    "w.learned.causeCeiling": "the scale’s ceiling",

    // Intervals
    "w.learned.intervalBelief": "probably between",
    "w.learned.intervalPinned": "pinned by your own weeks at",
    "w.learned.intervalSpread": "your day-to-day range",

    // The You tab's lead
    "w.learned.leadKicker": "What we learned about you",
    "w.learned.leadMeta": "{n} measured, {m} still waiting",
    "w.learned.leadEmpty": "Your model fills in as you log.",
  },

  pl: {
    "w.learned.title": "Czego się\no tobie dowiedzieliśmy",
    "w.learned.lead": "Każda liczba poniżej wyszła z twojego treningu. Przy każdej piszemy, z której warstwy pochodzi i jak jesteśmy jej pewni — a gdzie pewni jeszcze nie jesteśmy, piszemy właśnie to.",
    "w.learned.window": "Ostatnie {n} dni",
    "w.learned.known": "z ciebie, zmierzone",
    "w.learned.knownWhy": "Rośnie, gdy twój dziennik odpowiada na pytania, które tabela populacyjna może tylko zgadywać.",
    "w.learned.moved": "Co się zmieniło",
    "w.learned.emptyTitle": "Jeszcze nic nie zmierzone",
    "w.learned.empty": "Zaloguj kilka tygodni — sesje i te dwa pytania o to, jak bardzo jesteś wyczerpany — a te liczby staną się twoje, nie podręcznikowe.",
    "w.learned.waitingLabel": "Za mało dowodów",
    "w.learned.provenance": "Skąd to wiemy",
    "w.learned.confidence": "pewność",
    "w.learned.since": "vs miesiąc wcześniej",
    "w.learned.censusNote": "policzone, nie szacowane",

    "w.learned.chapterCeiling": "Twoje sufity objętości",
    "w.learned.whyCeiling": "Sufit poznaje się tylko wtedy, gdy się w niego uderzy. Te pochodzą z tygodni, w których dźwignąłeś realną objętość, ocenionych po tym, czy serie szczytowe się utrzymały i jak wyczerpany się czułeś.",
    "w.learned.chapterClearance": "Jak szybko odrabiasz sesję",
    "w.learned.whyClearance": "Mierzone przez dwa pytania o tę samą sesję — raz na siłowni, raz kilka godzin później — i porównanie twojego spadku z populacyjną krzywą zaniku. Poniżej 1 znaczy szybciej niż krzywa.",
    "w.learned.chapterReadiness": "Twój wzorzec gotowości",
    "w.learned.whyReadiness": "Odtworzone dzień po dniu z twojego dziennika, celowo bez opaski: nie ma historii dawnych odczytów do odtworzenia, więc każdy dzień w okresie jest mierzony tak samo.",

    "w.learned.fClearance": "Twoje tempo odrabiania",
    "w.learned.fReadiness": "Gotowość, średnio",
    "w.learned.fLimiter": "Co zabierało najwięcej",
    "w.learned.fCeilingUntested": "Sufity jeszcze niesprawdzone",
    "w.learned.fCeilingsOff": "Uczenie się z twojego treningu jest wyłączone",

    "w.learned.unitSets": "serii tygodniowo",
    "w.learned.unitCurve": "× krzywej",
    "w.learned.unitReadiness": "gotowości",
    "w.learned.unitShare": "% deficytu",

    "w.learned.evWeeks": "z {n} tygodni z dowodami",
    "w.learned.evPairs": "z {n} dopasowanych par odczytów",
    "w.learned.evDays": "przez {n} dni",
    "w.learned.evUntested": "{n} z 7 grup mięśniowych",

    "w.learned.needWeeks": "Sufit ujawnia się w tygodniu, w którym objętość sięgnęła co najmniej górnej granicy twojego pasma produktywnego — i trzeba dwóch takich tygodni, żebyśmy to powiedzieli.",
    "w.learned.needPairs": "Odpowiedz dwa razy o tej samej sesji: raz na siłowni, raz kilka godzin później. Dwie czyste pary i to tempo staje się twoje.",
    "w.learned.needDays": "Dwa tygodnie dni w tym okresie. Loguj i wypełniaj check-in dalej.",
    "w.learned.needAdaptive": "Włącz „ucz się z mojego treningu” w modelu objętości, a twoje własne tygodnie zaczną korygować szacunek.",

    "w.learned.clearFast": "szybciej",
    "w.learned.clearOnTrack": "zgodnie z krzywą",
    "w.learned.clearSlow": "wolniej",

    "w.learned.causeTissue": "obciążenie tkanek",
    "w.learned.causeConditioning": "kondycja",
    "w.learned.causeWearable": "wearable",
    "w.learned.causeFuel": "niedobór energii",
    "w.learned.causeCeiling": "sufit skali",

    "w.learned.intervalBelief": "prawdopodobnie między",
    "w.learned.intervalPinned": "przypięte twoimi tygodniami na",
    "w.learned.intervalSpread": "twój rozrzut dzień po dniu",

    "w.learned.leadKicker": "Czego się o tobie dowiedzieliśmy",
    "w.learned.leadMeta": "{n} zmierzone, {m} wciąż czeka",
    "w.learned.leadEmpty": "Twój model wypełnia się w miarę logowania.",
  },

  de: {
    "w.learned.title": "Was wir über\ndich gelernt haben",
    "w.learned.lead": "Jede Zahl unten stammt aus deinem eigenen Training. Jede nennt die Ebene, aus der sie kommt, und wie sicher wir sind — und wo wir es noch nicht sind, steht genau das.",
    "w.learned.window": "Letzte {n} Tage",
    "w.learned.known": "von dir, gemessen",
    "w.learned.knownWhy": "Steigt, sobald dein Logbuch die Fragen beantwortet, die eine Bevölkerungstabelle nur schätzen kann.",
    "w.learned.moved": "Was sich bewegt hat",
    "w.learned.emptyTitle": "Noch nichts gemessen",
    "w.learned.empty": "Logge ein paar Wochen — die Sessions und die zwei Fragen dazu, wie ausgelaugt du bist — und daraus werden deine Zahlen statt der aus dem Lehrbuch.",
    "w.learned.waitingLabel": "Noch nicht genug Belege",
    "w.learned.provenance": "Woher es kommt",
    "w.learned.confidence": "Sicherheit",
    "w.learned.since": "vs. Vormonat",
    "w.learned.censusNote": "gezählt, nicht geschätzt",

    "w.learned.chapterCeiling": "Deine Volumen-Obergrenzen",
    "w.learned.whyCeiling": "Eine Obergrenze findet man nur, indem man an sie stößt. Diese kommen aus Wochen mit echtem Volumen, bewertet daran, ob deine Topsätze gehalten haben und wie ausgelaugt du dich gemeldet hast.",
    "w.learned.chapterClearance": "Wie schnell du eine Session abbaust",
    "w.learned.whyClearance": "Gemessen, indem zweimal nach derselben Session gefragt wird — einmal im Gym, einmal Stunden später — und dein Abfall mit der Abbaukurve der Bevölkerung verglichen wird. Unter 1 heißt schneller als die Kurve.",
    "w.learned.chapterReadiness": "Dein Readiness-Muster",
    "w.learned.whyReadiness": "Tag für Tag aus deinem Logbuch nachgerechnet, bewusst ohne Wearable: es gibt keine Historie früherer Messwerte zum Nachrechnen, also wird jeder Tag im Zeitraum gleich gemessen.",

    "w.learned.fClearance": "Deine Abbaurate",
    "w.learned.fReadiness": "Readiness, im Mittel",
    "w.learned.fLimiter": "Was am meisten gekostet hat",
    "w.learned.fCeilingUntested": "Noch ungetestete Obergrenzen",
    "w.learned.fCeilingsOff": "Lernen aus deinem Training ist aus",

    "w.learned.unitSets": "Sätze pro Woche",
    "w.learned.unitCurve": "× der Kurve",
    "w.learned.unitShare": "% des Defizits",
    "w.learned.unitReadiness": "Readiness",

    "w.learned.evWeeks": "aus {n} aussagekräftigen Wochen",
    "w.learned.evPairs": "aus {n} zusammengehörigen Messpaaren",
    "w.learned.evDays": "über {n} Tage",
    "w.learned.evUntested": "{n} von 7 Muskelgruppen",

    "w.learned.needWeeks": "Eine Obergrenze zeigt sich in einer Woche, die mindestens das obere Ende deines produktiven Bandes getragen hat — und es braucht zwei davon, bevor wir das sagen.",
    "w.learned.needPairs": "Beantworte zweimal, wie ausgelaugt du bist, zur selben Session: einmal im Gym, einmal Stunden später. Zwei saubere Paare und die Rate ist deine.",
    "w.learned.needDays": "Zwei Wochen an Tagen im Zeitraum. Logge und checke weiter ein.",
    "w.learned.needAdaptive": "Schalte „aus meinem Training lernen“ im Volumenmodell ein, dann korrigieren deine eigenen Wochen die Schätzung.",

    "w.learned.clearFast": "schneller",
    "w.learned.clearOnTrack": "auf der Kurve",
    "w.learned.clearSlow": "langsamer",

    "w.learned.causeTissue": "Gewebelast",
    "w.learned.causeConditioning": "Ausdauerlast",
    "w.learned.causeWearable": "Wearable",
    "w.learned.causeFuel": "zu wenig gegessen",
    "w.learned.causeCeiling": "Skalenobergrenze",

    "w.learned.intervalBelief": "wahrscheinlich zwischen",
    "w.learned.intervalPinned": "von deinen Wochen festgelegt auf",
    "w.learned.intervalSpread": "deine Streuung von Tag zu Tag",

    "w.learned.leadKicker": "Was wir über dich gelernt haben",
    "w.learned.leadMeta": "{n} gemessen, {m} noch offen",
    "w.learned.leadEmpty": "Dein Modell füllt sich, während du loggst.",
  },
} as const;
