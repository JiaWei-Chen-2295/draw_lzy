import { put } from "@vercel/blob";

function fallbackDataUrl(contentType, base64Data) {
  return `data:${contentType};base64,${base64Data}`;
}

export async function uploadDrawingImage({ roomCode, roundId, base64Data, contentType = "image/png" }) {
  if (!base64Data) {
    return null;
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return fallbackDataUrl(contentType, base64Data);
  }

  try {
    const buffer = Buffer.from(base64Data, "base64");
    const access = process.env.BLOB_ACCESS;
    const putOptions = {
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
    };

    if (access === "public" || access === "private") {
      putOptions.access = access;
    }

    const blob = await put(`rooms/${roomCode}/rounds/${roundId}/drawing.png`, buffer, putOptions);
    return blob.url;
  } catch {
    // Keep the round playable even if the store access mode is misconfigured.
    return fallbackDataUrl(contentType, base64Data);
  }
}
