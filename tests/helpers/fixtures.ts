// Shared fixture cleanup for database tests.
//
// Node runs test files in parallel. Every DB test file therefore uses its own e-mail
// prefix (for example "ph6-sessions-") and deletes ONLY rows under that prefix. A
// broad prefix such as "phase" would delete another file's live fixtures mid-run.
import { prisma } from "../../src/lib/prisma";

/** Removes every row created under one file's fixture prefix, children first. */
export async function removeFixtures(prefix: string): Promise<void> {
  if (!prefix.endsWith("-") || prefix.length < 6) {
    throw new Error(`refusing to clean up with an unsafe prefix: "${prefix}"`);
  }
  const instructor = { email: { startsWith: prefix } };
  await prisma.attemptStart.deleteMany({ where: { participant: { activity: { classroom: { instructor } } } } });
  await prisma.submissionAnswer.deleteMany({ where: { submission: { participant: { activity: { classroom: { instructor } } } } } });
  await prisma.submission.deleteMany({ where: { participant: { activity: { classroom: { instructor } } } } });
  await prisma.retakeAuthorization.deleteMany({ where: { participant: { activity: { classroom: { instructor } } } } });
  await prisma.participant.deleteMany({ where: { activity: { classroom: { instructor } } } });
  await prisma.activity.deleteMany({ where: { classroom: { instructor } } });
  await prisma.classroom.deleteMany({ where: { instructor } });
  await prisma.instructor.deleteMany({ where: { email: { startsWith: prefix } } });
}
