import { authenticatedUserFromRequest } from "@/lib/auth";
import {
  hasVercelBlobToken,
  putVercelBlob,
  type BlobPutResult,
} from "@/lib/vercel-blob";
import { saveJobToDatabase } from "@/lib/jobs";

export const runtime = "nodejs";

type SourceImage = {
  name: string;
  dataUrl: string;
};

type Selection = {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

type StripResult = {
  id: string;
  name: string;
  model?: string;
  prompt?: string;
  b64?: string;
  mediaType?: string;
  extension?: string;
  width?: number;
  height?: number;
  error?: string;
  status?: "processing";
};

type HistoryEntry = {
  id: string;
  createdAt: number;
  source: SourceImage;
  selections: Selection[];
  settings: unknown;
  results: StripResult[];
  payment?: {
    checkoutId?: string;
    email?: string;
    status?: "pending" | "paid";
  };
};

type SaveRequest = {
  email?: string;
  job?: HistoryEntry;
};

function slug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/(^-|-$)/g, "") || "file"
  );
}

function timestampForPath(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function extensionForContentType(contentType: string) {
  if (contentType === "image/jpeg") {
    return "jpg";
  }

  if (contentType === "image/svg+xml") {
    return "svg";
  }

  return contentType.split("/")[1]?.replace("+xml", "") || "bin";
}

function dataUrlToFile(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)(;base64)?,(.*)$/);

  if (!match) {
    throw new Error("Invalid data URL.");
  }

  const [, contentType, isBase64, payload] = match;
  const body = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload));

  return {
    body,
    contentType,
    extension: extensionForContentType(contentType),
  };
}

function resultToFile(result: StripResult) {
  if (!result.b64 || !result.mediaType) {
    return null;
  }

  return {
    body: Buffer.from(result.b64, "base64"),
    contentType: result.mediaType,
    extension: result.extension || extensionForContentType(result.mediaType),
  };
}

async function uploadJson(pathname: string, value: unknown) {
  return putVercelBlob({
    pathname,
    contentType: "application/json",
    body: JSON.stringify(value, null, 2),
  });
}

export async function POST(request: Request) {
  const sessionUser = await authenticatedUserFromRequest(request);
  const sessionEmail = sessionUser?.email ?? null;

  console.log("storage.save.attempt", { sessionEmail, userId: sessionUser?.userId });

  if (!sessionUser) {
    console.log("storage.save.rejected", { reason: "unauthenticated" });
    return Response.json({ error: "Sign in before saving." }, { status: 401 });
  }

  const body = (await request.json()) as SaveRequest;
  const email = body.email?.trim().toLowerCase();
  const job = body.job;

  if (!email || email !== sessionEmail) {
    console.log("storage.save.rejected", {
      reason: "email_mismatch",
      sessionEmail,
      bodyEmail: email,
    });
    return Response.json({ error: "Session email mismatch." }, { status: 403 });
  }

  if (!job?.id || !job.source?.dataUrl) {
    console.log("storage.save.rejected", { reason: "missing_payload", email });
    return Response.json({ error: "Missing job payload." }, { status: 400 });
  }

  const uploadedAt = new Date();
  const uploadedAtIso = uploadedAt.toISOString();
  const userId = slug(sessionUser.userId);
  const timestamp = timestampForPath(uploadedAt);
  const folderKey = `image-stripper/${userId}`;
  const prefix = `${folderKey}/${slug(job.id)}`;

  if (!hasVercelBlobToken()) {
    console.log("storage.save.skipped", { reason: "missing_blob_token", email, jobId: job.id });
    return Response.json({
      saved: false,
      reason: "missing_blob_token",
      uploadedAt: uploadedAtIso,
      userId,
      folderKey,
      prefix,
    });
  }

  const sourceFile = dataUrlToFile(job.source.dataUrl);
  const sourcePathname = `${prefix}/${timestamp}-source.${sourceFile.extension}`;
  const sourceBlob = await putVercelBlob({
    pathname: sourcePathname,
    body: sourceFile.body,
    contentType: sourceFile.contentType,
  });
  const sourceMetadata = {
    app: "image-stripper",
    userId,
    email: sessionEmail,
    jobId: job.id,
    folderKey,
    imageRole: "source",
    uploadedAt: uploadedAtIso,
    originalFilename: job.source.name,
    originalContentType: sourceFile.contentType,
    blobPathname: sourceBlob.pathname,
    blobUrl: sourceBlob.url,
  };

  await uploadJson(`${sourcePathname}.metadata.json`, sourceMetadata);

  const outputBlobs: Array<
    BlobPutResult & {
      metadataPathname: string;
      result: StripResult;
    }
  > = [];

  for (const [index, result] of job.results.entries()) {
    const file = resultToFile(result);

    if (!file) {
      continue;
    }

    const outputPathname = `${prefix}/${timestamp}-output-${index + 1}-${slug(
      result.name,
    )}.${file.extension}`;
    const blob = await putVercelBlob({
      pathname: outputPathname,
      body: file.body,
      contentType: file.contentType,
    });
    const outputMetadata = {
      app: "image-stripper",
      userId,
      email: sessionEmail,
      jobId: job.id,
      folderKey,
      imageRole: "output",
      uploadedAt: uploadedAtIso,
      outputId: result.id,
      selection: job.selections.find((selection) => selection.id === result.id),
      name: result.name,
      model: result.model,
      prompt: result.prompt,
      width: result.width,
      height: result.height,
      originalContentType: file.contentType,
      blobPathname: blob.pathname,
      blobUrl: blob.url,
    };

    await uploadJson(`${outputPathname}.metadata.json`, outputMetadata);
    outputBlobs.push({
      ...blob,
      metadataPathname: `${outputPathname}.metadata.json`,
      result,
    });
  }

  const manifest = await uploadJson(`${prefix}/${timestamp}-job.metadata.json`, {
    app: "image-stripper",
    userId,
    email: sessionEmail,
    jobId: job.id,
    folderKey,
    createdAt: new Date(job.createdAt).toISOString(),
    uploadedAt: uploadedAtIso,
    selections: job.selections,
    settings: job.settings,
    payment: job.payment,
    source: sourceMetadata,
    outputs: outputBlobs.map((blob) => ({
      pathname: blob.pathname,
      url: blob.url,
      contentType: blob.contentType,
      metadataPathname: blob.metadataPathname,
    })),
  });
  const databaseSaved = await saveJobToDatabase({
    id: job.id,
    userId: sessionUser.userId,
    email: sessionEmail,
    sourceName: job.source.name,
    sourceBlobUrl: sourceBlob.url,
    settings: job.settings,
    selections: job.selections,
    polarCheckoutId: job.payment?.checkoutId,
    polarStatus: job.payment?.status,
    outputs: outputBlobs.map((blob) => ({
      selectionId: blob.result.id,
      name: blob.result.name,
      prompt: blob.result.prompt,
      model: blob.result.model,
      blobUrl: blob.url,
      mediaType: blob.result.mediaType,
      extension: blob.result.extension,
      width: blob.result.width,
      height: blob.result.height,
      error: blob.result.error,
    })),
  });

  console.log("storage.save.success", {
    email,
    jobId: job.id,
    outputCount: outputBlobs.length,
    databaseSaved,
    prefix,
  });

  return Response.json({
    saved: true,
    databaseSaved,
    uploadedAt: uploadedAtIso,
    userId,
    folderKey,
    prefix,
    source: sourceBlob,
    outputs: outputBlobs.map((blob) => ({
      url: blob.url,
      downloadUrl: blob.downloadUrl,
      pathname: blob.pathname,
      contentType: blob.contentType,
      contentDisposition: blob.contentDisposition,
      etag: blob.etag,
      metadataPathname: blob.metadataPathname,
    })),
    manifest,
  });
}
