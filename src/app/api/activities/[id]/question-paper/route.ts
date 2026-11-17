// GET /api/activities/:id/question-paper -> question paper and answer key as a PDF (instructor only).
// Opens inline so the instructor can preview and print it.
import { errorResponse } from "@/lib/api";
import { parseIdParam } from "@/lib/builder-validation";
import { requireInstructorApi } from "@/lib/session";
import { generateQuestionPaper } from "@/services/question-paper.service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const instructor = await requireInstructorApi();
    const id = parseIdParam((await params).id);
    const paper = await generateQuestionPaper(instructor.id, id);
    return new Response(new Uint8Array(paper.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${paper.filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
