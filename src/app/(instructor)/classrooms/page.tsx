import { ClassroomManager } from "@/components/classrooms/classroom-manager";
import { requireInstructor } from "@/lib/session";
import { listClassrooms } from "@/services/classroom.service";

export const metadata = { title: "Classrooms" };

export default async function ClassroomsPage() {
  const instructor = await requireInstructor();
  const classrooms = await listClassrooms(instructor.id);
  return <ClassroomManager classrooms={classrooms} />;
}
