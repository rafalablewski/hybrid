import { describe, expect, it, vi } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import { DEFAULT_ONBOARDING_QUESTIONS, ONBOARDING_GOAL_GROUPS, ONBOARDING_PERSONA_CHOICES, onboardingQuestionsForClient } from "@hybrid/core";

/** The intake each persona actually walks — DERIVED, so adding a question to
 *  the shipped set changes these tests' step counts instead of breaking them. */
const intake = (p: "casual" | "athlete") => onboardingQuestionsForClient(DEFAULT_ONBOARDING_QUESTIONS, p);
import { renderScreen as render } from "./render";
import Onboarding from "../components/aurora/onboarding";
import { SCRUB_UNSET } from "../components/aurora/kit";

/**
 * THE WIZARD'S OPTION ROW MUST NOT RESHAPE WHEN IT IS PICKED.
 *
 * The row drew its tick only while selected, so choosing an option INSERTED a
 * 22dp glyph into the row — under the finger that had just landed on it, and
 * with every word in the row shifting sideways to make space. It is the app's
 * documented standard for a wizard row (nutrition-panels cites this component
 * by name), so the defect was in the thing other screens copy.
 *
 * This is the half of the onboarding motion pass a render gate can actually
 * hold: the mark is always laid out, so the row's TREE is identical selected
 * and not. The travel either side of it is time-based, and time is the one
 * thing this gate cannot see — react-native-web has no animation driver, so
 * every `Animated.timing` here completes inside the same commit that starts it
 * (the same class of blind spot as the missing layout engine; see
 * vitest.config.ts). Asserting the exchange would assert the stand-in.
 */

vi.mock(import("../lib/api"), async (importOriginal) => ({
  ...(await importOriginal()),
  // null → the wizard falls back to core's built-in question set, so the
  // labels below are the ones the app ships rather than a fixture.
  fetchOnboardingQuestions: () => Promise.resolve(null),
  fetchTranslationOverrides: () => Promise.resolve({}),
  submitOnboarding: () => Promise.resolve(true),
}));

/** The two stores the intake writes on the way out — spied rather than stubbed
 *  away, because WHAT it writes is the subject of the last test here. */
const written = vi.fn();
const weighed = vi.fn();
vi.mock(import("../lib/questionnaire"), async (importOriginal) => ({
  ...(await importOriginal()),
  setQuestionnaire: (p: unknown) => written(p),
}));
vi.mock(import("../lib/weigh-in"), async (importOriginal) => ({
  ...(await importOriginal()),
  logWeighInNow: (kg: number) => { weighed(kg); return Promise.resolve(); },
}));

/** The second persona card — the one that starts UNSELECTED (the answer map is
 *  seeded with the question's `casual` default). */
const UNPICKED = ONBOARDING_PERSONA_CHOICES[1]!.label;

/** The birth question, as the app ships it — asked fifth, and a DATE rather
 *  than an age, so it cannot go stale the day after it is answered. */
const AGE_Q = DEFAULT_ONBOARDING_QUESTIONS.find((q) => q.engineKey === "birthYear")!;

/** The row as the user sees it: everything inside the pressable it lives in. */
function row(container: HTMLElement, label: string): HTMLElement {
  const text = Array.from(container.querySelectorAll("div")).find((d) => d.textContent === label && !d.children.length);
  const el = text?.closest('[role="button"]') as HTMLElement | null;
  if (!el) throw new Error(`no option row for "${label}"`);
  return el;
}

/** The row's own surface — the node carrying the border and the wash. */
const surface = (el: HTMLElement) => el.firstElementChild as HTMLElement;

describe("the onboarding wizard's option row", () => {
  it("draws the same tree picked and unpicked", () => {
    const { container } = render(<Onboarding />);
    const idle = row(container, UNPICKED);
    const nodes = idle.querySelectorAll("*").length;
    const restColour = surface(idle).style.borderTopColor;
    // A row is a label, a blurb and a mark — if this is 3 the query found a
    // wrapper rather than the row, and the comparison below proves nothing.
    expect(nodes).toBeGreaterThan(3);

    fireEvent.click(idle);

    const picked = row(container, UNPICKED);
    expect(picked.querySelectorAll("*").length).toBe(nodes);
    // …and it genuinely picked, rather than the count holding still for the
    // uninteresting reason. The accent reached the rendered surface, which is
    // the same invariant press-scale.render asserts one primitive down: what a
    // component declares survives to the DOM.
    expect(surface(picked).style.borderTopColor).not.toBe(restColour);
  });
});

/**
 * THE BIRTH STEP SHOWS NO DATE IT WAS NEVER GIVEN — AND COSTS NO TAP.
 *
 * Two invariants that pull in opposite directions until you separate the value
 * from the control, which is what this asserts.
 *
 * NO FABRICATED FIGURE. The intake asks for age and body mass, and neither
 * ships a `defaultValue` — deliberately, because the client seeds every answer
 * from its default, so a default would mean an athlete who stepped past the
 * screen had "80 kg" written down as their own body mass. The model then goes
 * on to explain their recovery ceiling with it. The guard is on the RENDER
 * because that is where it would be given away: a screen showing "80" over a
 * Next button has told the athlete they answered, whatever the map holds.
 *
 * AND NO TOLL. The first cut satisfied the above with an "Answer" button — one
 * tap to reveal a field that could have been there all along, on a screen whose
 * whole purpose is to be answered. The field is present and live now, and only
 * empty; the seed is where it starts when touched, not something to ask for.
 */
describe("a date the athlete has not answered", () => {
  const next = (container: HTMLElement) => {
    const btn = Array.from(container.querySelectorAll('[role="button"]')).find(
      (b) => (b as HTMLElement).getAttribute("aria-label")?.toLowerCase().includes("next"),
    ) as HTMLElement | undefined;
    if (!btn) throw new Error("no Next control");
    fireEvent.click(btn);
  };

  it("offers a year and twelve months, with no figure until touched", () => {
    const { container } = render(<Onboarding />);
    // persona → goal → experience → sex → BORN. The persona must be CHOSEN
    // rather than left on its seeded "casual" default: the wizard forks on that
    // answer now, and the tracker intake is not asked for a goal at all.
    fireEvent.click(row(container, ONBOARDING_PERSONA_CHOICES[1]!.label));
    next(container);
    fireEvent.click(row(container, ONBOARDING_GOAL_GROUPS[0]!.goals[0]!.label));
    next(container); // → experience
    next(container); // → sex
    next(container); // → born
    const body = container.textContent ?? "";
    // Non-vacuity: the assertions below are trivially true on any screen that
    // is not this one, so prove we arrived. The title is core's own — the mock
    // returns null questions, so the wizard runs the shipped set.
    expect(body).toContain(AGE_Q.title);
    // No year may be on screen: the question is unanswered and has to look it.
    // (The seed is twenty years below the ceiling, so any four-digit year here
    // would be one the athlete never gave.)
    expect(body, "a year nobody gave is on screen").not.toMatch(/\b(19|20)\d\d\b/);
    // …but the control IS on screen, ready, with nothing standing in front of
    // it. AScrubField declares `adjustable`, which react-native-web renders as
    // a slider. The field is empty, not absent, and the dash is what says so.
    expect(container.querySelector('[role="slider"]'), "the field is gated").not.toBeNull();
    expect(body, "the empty field must read as empty").toContain(SCRUB_UNSET);
    // TWELVE MONTHS, and exactly twelve. The month is what makes the age exact
    // rather than ±1 — and a `number` question of this range used to draw one
    // segment per step, which for the age it replaced would have been ninety.
    expect(container.querySelectorAll('[role="radio"]').length).toBe(12);
  });
});

/**
 * A SEED IS NOT AN ANSWER — and the wizard must not hand one to the model.
 *
 * The answer map is seeded from every question's `defaultValue` before the
 * athlete touches anything: the recommender needs a complete set, and a choice
 * step has to open with its default shown as picked. The body questions ship
 * without defaults so that seeding cannot fabricate a body mass — but that was
 * only half the guarantee while `experience` and `days` still carried a value
 * nobody chose onto the PROFILE, where they move the volume landmarks and then
 * read back on the questionnaire as answered.
 *
 * So the seeds stop at the profile. What was given is written; what was merely
 * shown is not — which is the same rule the questionnaire screen already keeps,
 * and the point of asking that these two agree.
 */
describe("what setup writes down", () => {
  /** The commit pill — last in the tree, after the scroller, so it is the last
   *  button on screen whatever the step is called. */
  const cta = (container: HTMLElement) => {
    const all = container.querySelectorAll('[role="button"]');
    return all[all.length - 1] as HTMLElement;
  };

  it("writes the answer it was given and not the default it showed", async () => {
    written.mockClear();
    weighed.mockClear();
    const { container } = render(<Onboarding />);
    // The ATHLETE intake, chosen: the wizard forks on this answer, and only
    // this branch is asked the five plan-shaping questions this test steps past.
    fireEvent.click(row(container, ONBOARDING_PERSONA_CHOICES[1]!.label));
    fireEvent.click(cta(container)); // persona → goal
    fireEvent.click(row(container, ONBOARDING_GOAL_GROUPS[0]!.goals[0]!.label));
    fireEvent.click(cta(container)); // → experience
    // The three experience choices are short, so the wizard draws them as a
    // segmented control rather than option rows — a tab, not a button.
    const seg = Array.from(container.querySelectorAll('[role="tab"]')).find((e) => e.textContent === "Intermediate");
    fireEvent.click(seg as HTMLElement); // …and this one is CHOSEN
    // Past every remaining question without touching any of them. Experience is
    // step index 2, the plan step sits at `length`, so that is the distance.
    const steps = intake("athlete").length - 2;
    for (let i = 0; i < steps; i++) fireEvent.click(cta(container));
    fireEvent.click(cta(container)); // the plan step's commit

    await waitFor(() => expect(written).toHaveBeenCalled());
    const profile = written.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(profile.experience).toBe("intermediate");
    // `days` carries defaultValue 3 and `sex`/`birth`/`bodyweight` carry none —
    // every one of them was stepped past, so none of them may be on the profile.
    expect(profile.daysPerWeek, "a frequency nobody chose").toBeUndefined();
    expect(profile.sex).toBeUndefined();
    expect(profile.birthYear).toBeUndefined();
    // The two recovery questions carry a default too, and are held to the same
    // rule: a mid-scale prior is fine to SHOW and must never be recorded as an
    // answer, or the model would read a 3 nobody gave as a measured value.
    expect(profile.sleep, "a sleep score nobody chose").toBeUndefined();
    expect(profile.stress, "a stress score nobody chose").toBeUndefined();
    expect(weighed, "a body mass nobody gave").not.toHaveBeenCalled();
  });
});

/**
 * THE FORK, AT THE SCREEN.
 *
 * The first question offers two products and the wizard did not branch on the
 * answer: everyone was asked all eight questions, the goal step was `required`
 * with no skip control, and the run ended on a button reading "Start this
 * plan". Someone who chose the tracker was enrolled in a twelve-week season
 * they had just declined, one screen after declining it.
 */
describe("choosing the tracker", () => {
  const cta = (container: HTMLElement) => {
    const all = container.querySelectorAll('[role="button"]');
    return all[all.length - 1] as HTMLElement;
  };

  it("is never asked for a goal, and never ends on a plan", () => {
    const { container } = render(<Onboarding />);
    fireEvent.click(row(container, ONBOARDING_PERSONA_CHOICES[0]!.label));
    // persona → sex → born → weight, and then it commits. Four steps, not nine.
    for (let i = 0; i < 3; i++) fireEvent.click(cta(container));
    const body = container.textContent ?? "";
    expect(body, "the goal step is in the tracker's wizard").not.toContain(
      ONBOARDING_GOAL_GROUPS[0]!.goals[0]!.label,
    );
    expect(body, "the tracker was offered a plan").not.toContain("Start this plan");
  });

  it("is asked everything the engine learns from, and only skips the goal", () => {
    // THE FORK IS THE OUTCOME, NOT THE DATA. An earlier cut dropped experience,
    // days per week and equipment from this intake, which fed the volume model
    // rather than the plan matcher — so a tracker's ceiling lost a stimulus
    // multiplier, a recovery factor and two of seven confidence inputs.
    const { container } = render(<Onboarding />);
    fireEvent.click(row(container, ONBOARDING_PERSONA_CHOICES[0]!.label));
    const qs = intake("casual");
    const seen: string[] = [];
    for (let i = 0; i < qs.length; i++) {
      seen.push(container.textContent ?? "");
      if (i < qs.length - 1) fireEvent.click(cta(container)); // the last commits
    }
    const all = seen.join(" ");
    for (const q of qs) {
      expect(all, `the tracker was not asked "${q.title}"`).toContain(q.title);
    }
    // And the one thing it genuinely does not need.
    const goal = DEFAULT_ONBOARDING_QUESTIONS.find((x) => x.key === "goal")!;
    expect(all, "the tracker was asked for a goal").not.toContain(goal.title);
  });
});
