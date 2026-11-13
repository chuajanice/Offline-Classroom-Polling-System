// Server component: reads the participant cookie for THIS activity. No cookie or a
// foreign token sends the student back to the join page.
import { redirect, notFound } from "next/navigation";
import { toPositiveId } from "@/lib/builder-validation";
import { AppError } from "@/lib/errors";
import { readParticipantToken } from "@/lib/participant-session";
import { getStudentActivity } from "@/services/student.service";
import { StudentActivity } from "@/components/student/student-activity";

export const metadata = { title: "Activity" };

export default async function StudentActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const id = toPositiveId((await params).id);
  if (id === null) notFound();

  const token = await readParticipantToken(id);
  let view;
  try {
    view = await getStudentActivity(id, token);
  } catch (error) {
    if (error instanceof AppError && error.status === 401) redirect("/join");
    throw error;
  }
  return <StudentActivity view={view} />;
}
