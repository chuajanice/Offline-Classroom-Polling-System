// GET /api/activities/:id/participants -> participant names, statuses and attempts (instructor only)
import { errorResponse, jsonOk } from "@/lib/api";
import { parseIdParam } from "@/lib/builder-validation";
import { requireInstructorApi } from "@/lib/session";
import { getActivityResults } from "@/services/results.service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const instructor = await requireInstructorApi();
    const id = parseIdParam((await params).id);
    const results = await getActivityResults(instructor.id, id);
    return jsonOk({ summary: results.summary, participants: results.participants });
  } catch (error) {
    return errorResponse(error);
  }
}
