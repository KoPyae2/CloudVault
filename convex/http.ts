import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";

// HTTP endpoint to store a video thumbnail in Convex storage and attach it to a file doc
const http = httpRouter();

http.route({
  path: "/uploadVideoThumbnail",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const fileIdHeader = request.headers.get("x-file-id");
      if (!fileIdHeader) {
        return new Response(JSON.stringify({ error: "Missing x-file-id header" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const blob = await request.blob();

      // Store raw bytes in Convex storage
      const storageId = await ctx.storage.store(blob);

      // Patch files doc with thumbnailStorageId via a mutation
      await ctx.runMutation(api.files.setFileThumbnail, {
        fileId: fileIdHeader as Id<"files">,
        storageId,
      });

      return new Response(JSON.stringify({ success: true, storageId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("uploadVideoThumbnail error:", error);
      return new Response(JSON.stringify({ error: "Failed to store thumbnail" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

export default http;