type BlobAccess = "public" | "private";

export type BlobPutResult = {
  url: string;
  downloadUrl: string;
  pathname: string;
  contentType: string;
  contentDisposition: string;
  etag: string;
};

export function hasVercelBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function blobToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (!token) {
    throw new Error("Missing BLOB_READ_WRITE_TOKEN.");
  }

  return token;
}

function blobAccess(): BlobAccess {
  return process.env.VERCEL_BLOB_ACCESS === "public" ? "public" : "private";
}

function blobPutApiUrl(pathname: string) {
  const url = new URL(
    process.env.VERCEL_BLOB_API_URL || "https://vercel.com/api/blob",
  );
  url.searchParams.set("pathname", pathname);
  return url;
}

export async function putVercelBlob({
  pathname,
  body,
  contentType,
}: {
  pathname: string;
  body: Buffer | string;
  contentType: string;
}) {
  const fetchBody = typeof body === "string" ? body : new Uint8Array(body);

  const response = await fetch(blobPutApiUrl(pathname), {
    method: "PUT",
    headers: {
      authorization: `Bearer ${blobToken()}`,
      "x-api-version": "12",
      "x-vercel-blob-access": blobAccess(),
      "x-content-type": contentType,
      "x-add-random-suffix": "0",
      "x-allow-overwrite": "0",
      "x-content-length": String(Buffer.byteLength(body)),
    },
    body: fetchBody,
  });
  const payload = (await response.json().catch(() => ({}))) as
    | BlobPutResult
    | { error?: { message?: string } };

  if (!response.ok) {
    throw new Error(
      "error" in payload && payload.error?.message
        ? payload.error.message
        : `Vercel Blob upload failed with ${response.status}.`,
    );
  }

  return payload as BlobPutResult;
}
