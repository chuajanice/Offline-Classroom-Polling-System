import { notFound } from "next/navigation";
import { ActivityBuilder } from "@/components/activities/activity-builder";
import { toPositiveId } from "@/lib/builder-validation";
import { orNotFound } from "@/lib/page-helpers";
import { requireInstructor } from "@/lib/session";
import { getActivity } from "@/services/activity.service";
import { listClassrooms } from "@/services/classroom.service";

export const metadata = { title: "Edit activity" };

export default async function EditActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const instructor = await requireInstructor();
  const id = toPositiveId((await params).id);
  if (id === null) notFound();

  const [activity, classrooms] = await Promise.all([
    orNotFound(getActivity(instructor.id, id)),
    listClassrooms(instructor.id),
  ]);
  return <ActivityBuilder classrooms={classrooms} initial={activity} />;
}
