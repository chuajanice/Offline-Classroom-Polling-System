// Deadline handling shared by instructor and student code paths.
// Kept in its own module so activity.service and session.service can both use
// it without importing each other.
import { prisma } from "@/lib/prisma";

/**
 * If an OPEN activity has passed its scheduled closing time, close it now.
 * The closing time is recorded as closed_at (when it actually ended). Safe to
 * call repeatedly and from concurrent requests: the conditional update only
 * succeeds once.
 */
export async function closeIfDeadlinePassed(activityId: number, now: Date = new Date()): Promise<boolean> {
  const row = await prisma.activity.findUnique({
    where: { id: activityId },
    select: { status: true, scheduledClosesAt: true },
  });
  if (!row || row.status !== "OPEN" || !row.scheduledClosesAt) return false;
  if (now.getTime() < row.scheduledClosesAt.getTime()) return false;

  const result = await prisma.activity.updateMany({
    where: { id: activityId, status: "OPEN" },
    data: { status: "CLOSED", closedAt: row.scheduledClosesAt },
  });
  return result.count === 1;
}
