// GET /api/auth/me: who is logged in? 401 when nobody is.
import { errorResponse, jsonOk } from "@/lib/api";
import { requireInstructorApi } from "@/lib/session";

export async function GET() {
  try {
    const instructor = await requireInstructorApi();
    return jsonOk({ instructor });
  } catch (error) {
    return errorResponse(error);
  }
}
