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

  const buffer = Buffer.from(base64Data, "base64");
  const blob = await put(`rooms/${roomCode}/rounds/${roundId}/drawing.png`, buffer, {
    access: "public",
    contentType,
    token: process.env.BLOB_READ_WRITE_TOKEN,
    addRandomSuffix: false,
  });

  return blob.url;
}
