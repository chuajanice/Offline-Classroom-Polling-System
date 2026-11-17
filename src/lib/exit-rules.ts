// Exit-warning rules (Stage 3). Pure: no database, no framework, unit-tested directly.
//
// Stages, per attempt:
//   0 = no warning yet
//   1 = warned. The student has not answered yet (decision null), or answered NO (decision STAY)
//   2 = attempt automatically zeroed
//
// Events reported by the browser:
//   left  = the student left the active page (tab hidden, page hidden, back navigation)
//   stay  = the student chose NO on the warning
//   leave = the student chose YES on the warning
//
// Rules:
//   first "left"                         -> warned, dialog pending
//   repeated "left" while pending         -> ignored (one hide can fire several events)
//   "stay" while pending                  -> recorded as STAY
//   "leave" while warned (any answer)     -> zeroed
//   "left" after STAY                     -> zeroed (no dialog)
//   anything once zeroed                  -> ignored (never a second zero)

export type ExitEvent = "left" | "stay" | "leave";
export type ExitOutcome = "pending" | "stayed" | "zeroed" | "ignored";

export type ExitChange = {
  /** Set when the first warning is recorded. */
  warnedNow?: boolean;
  /** Set when the student answers NO. */
  decision?: "STAY";
  /** Set when the attempt must be zeroed. */
  zero?: boolean;
};

export function decideExit(
  stage: number,
  decision: string | null,
  event: ExitEvent,
): { outcome: ExitOutcome; change: ExitChange } {
  if (stage === 2) return { outcome: "zeroed", change: {} };

  if (stage === 0) {
    if (event === "left") return { outcome: "pending", change: { warnedNow: true } };
    return { outcome: "ignored", change: {} };
  }

  // stage 1: the warning has been issued
  if (event === "left") {
    if (decision === null) return { outcome: "pending", change: {} };
    return { outcome: "zeroed", change: { zero: true } };
  }
  if (event === "stay") {
    if (decision === null) return { outcome: "stayed", change: { decision: "STAY" } };
    return { outcome: "ignored", change: {} };
  }
  // leave
  return { outcome: "zeroed", change: { zero: true } };
}
