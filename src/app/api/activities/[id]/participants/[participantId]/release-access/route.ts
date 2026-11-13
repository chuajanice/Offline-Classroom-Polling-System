// POST /api/activities/:id/participants/:participantId/release-access
// The old token stops working; the same name may rejoin and reclaim this participant.
import { assertSameOrigin, errorResponse, jsonOk } from "@/lib/api";
import { parseIdParam } from "@/lib/builder-validation";
import { requireInstructorApi } from "@/lib/session";
import { releaseAccess } from "@/services/results.service";

type Context = { params: Promise<{ id: string; participantId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const instructor = await requireInstructorApi();
    const p = await params;
    const results = await releaseAccess(instructor.id, parseIdParam(p.id), parseIdParam(p.participantId));
    return jsonOk({ results });
  } catch (error) {
    return errorResponse(error);
  }
}
