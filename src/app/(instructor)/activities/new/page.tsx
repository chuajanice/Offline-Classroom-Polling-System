import { ActivityBuilder } from "@/components/activities/activity-builder";
import { requireInstructor } from "@/lib/session";
import { listClassrooms } from "@/services/classroom.service";

export const metadata = { title: "New activity" };

export default async function NewActivityPage() {
  const instructor = await requireInstructor();
  const classrooms = await listClassrooms(instructor.id);
  return <ActivityBuilder classrooms={classrooms} initial={null} />;
}
