// GET /api/activities/:id/report -> the activity's results as a PDF (instructor only).
// Archived activities keep their history and can still be reported.
import { errorResponse } from "@/lib/api";
import { parseIdParam } from "@/lib/builder-validation";
import { requireInstructorApi } from "@/lib/session";
import { generateActivityReport } from "@/services/report.service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const instructor = await requireInstructorApi();
    const id = parseIdParam((await params).id);
    const report = await generateActivityReport(instructor.id, id);
    return new Response(new Uint8Array(report.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${report.filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
