import { get } from "@vercel/blob";
import { failure } from "@/lib/server/api";

export async function GET(request, { params }) {
  try {
    const { pathname: pathnameSegments } = await params;
    const pathname = Array.isArray(pathnameSegments) ? pathnameSegments.join("/") : pathnameSegments;

    if (!pathname) {
      return failure("BLOB_PATH_REQUIRED", 400);
    }

    const access = new URL(request.url).searchParams.get("access") === "public" ? "public" : "private";
    const result = await get(pathname, { access });

    if (!result || result.statusCode !== 200 || !result.stream) {
      return failure("BLOB_NOT_FOUND", 404);
    }

    return new Response(result.stream, {
      status: 200,
      headers: {
        "Content-Type": result.blob.contentType || "application/octet-stream",
        "Cache-Control": result.blob.cacheControl || "private, max-age=60",
      },
    });
  } catch (error) {
    return failure(error, 404);
  }
}
