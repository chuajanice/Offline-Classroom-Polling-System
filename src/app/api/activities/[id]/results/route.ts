// GET /api/activities/:id/results -> participants, submissions, scores, question statistics (instructor only)
import { errorResponse, jsonOk } from "@/lib/api";
import { parseIdParam } from "@/lib/builder-validation";
import { requireInstructorApi } from "@/lib/session";
import { getActivityResults } from "@/services/results.service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const instructor = await requireInstructorApi();
    const id = parseIdParam((await params).id);
    return jsonOk({ results: await getActivityResults(instructor.id, id) });
  } catch (error) {
    return errorResponse(error);
  }
}
