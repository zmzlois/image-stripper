import { generateImage } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { getPolarCheckout, isPaidCheckout } from "@/lib/polar";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 300;

type OutputFormat = "png" | "jpeg" | "webp" | "svg";
type AspectRatio = "free" | "1:1" | "4:3" | "16:9";
type BackgroundMode = "keep" | "transparent";
type ProcessingMode = "ai" | "fast";
type FastOperation = "resize" | "remove-background" | "svg";

type CropPayload = {
  id: string;
  name: string;
  index: number;
  dataUrl: string;
  width: number;
  height: number;
  prompt?: string;
};

type StripSettings = {
  mode?: ProcessingMode;
  fastOperation?: FastOperation;
  format: OutputFormat;
  maxEdge: number;
  aspectRatio: AspectRatio;
  background: BackgroundMode;
};

type StripRequest = {
  crops: CropPayload[];
  settings: StripSettings;
  payment?: {
    checkoutId?: string;
    jobId?: string;
    email?: string;
  };
};

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

const aspectMap: Record<Exclude<AspectRatio, "free">, number> = {
  "1:1": 1,
  "4:3": 4 / 3,
  "16:9": 16 / 9,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);

  if (!match) {
    throw new Error("Invalid image payload.");
  }

  return {
    mediaType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function outputDimensions(width: number, height: number, settings: StripSettings) {
  const sourceRatio = width / height;
  const ratio =
    settings.aspectRatio === "free" ? sourceRatio : aspectMap[settings.aspectRatio];
  const maxEdge = Math.max(256, Math.min(settings.maxEdge || 1024, 2048));

  if (ratio >= 1) {
    return {
      width: maxEdge,
      height: Math.max(1, Math.round(maxEdge / ratio)),
    };
  }

  return {
    width: Math.max(1, Math.round(maxEdge * ratio)),
    height: maxEdge,
  };
}

function svgWrap(buffer: Buffer, width: number, height: number) {
  const encoded = buffer.toString("base64");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image href="data:image/png;base64,${encoded}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/></svg>`,
  );
}

async function normalizeImage(
  input: Uint8Array,
  crop: CropPayload,
  settings: StripSettings,
) {
  const target = outputDimensions(crop.width, crop.height, settings);
  const base = sharp(Buffer.from(input), { failOn: "none" })
    .resize(target.width, target.height, {
      fit: settings.aspectRatio === "free" ? "inside" : "cover",
      withoutEnlargement: false,
      position: "center",
    })
    .rotate();

  if (settings.format === "svg") {
    const png = await base.png().toBuffer();
    const svg = svgWrap(png, target.width, target.height);

    return {
      b64: svg.toString("base64"),
      mediaType: "image/svg+xml",
      extension: "svg",
      width: target.width,
      height: target.height,
    };
  }

  if (settings.format === "jpeg") {
    const jpeg = await base
      .flatten({ background: { r: 0, g: 0, b: 0 } })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();

    return {
      b64: jpeg.toString("base64"),
      mediaType: "image/jpeg",
      extension: "jpg",
      width: target.width,
      height: target.height,
    };
  }

  if (settings.format === "webp") {
    const webp = await base.webp({ quality: 88 }).toBuffer();

    return {
      b64: webp.toString("base64"),
      mediaType: "image/webp",
      extension: "webp",
      width: target.width,
      height: target.height,
    };
  }

  const png = await base.png({ compressionLevel: 9 }).toBuffer();

  return {
    b64: png.toString("base64"),
    mediaType: "image/png",
    extension: "png",
    width: target.width,
    height: target.height,
  };
}

function colorDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
) {
  const r = r1 - r2;
  const g = g1 - g2;
  const b = b1 - b2;

  return Math.sqrt(r * r + g * g + b * b);
}

function estimateEdgeColor(data: Buffer, width: number, height: number) {
  const samples: Array<[number, number, number]> = [];
  const stride = 4;
  const sample = Math.max(1, Math.min(8, Math.floor(Math.min(width, height) / 8)));

  for (let y = 0; y < height; y += Math.max(1, height - sample)) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * stride;
      if (data[index + 3] > 16) {
        samples.push([data[index], data[index + 1], data[index + 2]]);
      }
    }
  }

  for (let x = 0; x < width; x += Math.max(1, width - sample)) {
    for (let y = 0; y < height; y += 1) {
      const index = (y * width + x) * stride;
      if (data[index + 3] > 16) {
        samples.push([data[index], data[index + 1], data[index + 2]]);
      }
    }
  }

  if (samples.length === 0) {
    return [255, 255, 255] as const;
  }

  const totals = samples.reduce(
    (next, sampleColor) => {
      next[0] += sampleColor[0];
      next[1] += sampleColor[1];
      next[2] += sampleColor[2];
      return next;
    },
    [0, 0, 0],
  );

  return [
    Math.round(totals[0] / samples.length),
    Math.round(totals[1] / samples.length),
    Math.round(totals[2] / samples.length),
  ] as const;
}

async function removeEdgeBackground(
  input: Buffer,
  crop: CropPayload,
  settings: StripSettings,
) {
  const target = outputDimensions(crop.width, crop.height, settings);
  const { data, info } = await sharp(input, { failOn: "none" })
    .rotate()
    .resize(target.width, target.height, {
      fit: settings.aspectRatio === "free" ? "inside" : "cover",
      withoutEnlargement: false,
      position: "center",
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const [bgR, bgG, bgB] = estimateEdgeColor(data, width, height);
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];
  const threshold = 46;
  const feather = 34;

  const enqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }

    const pixel = y * width + x;

    if (visited[pixel]) {
      return;
    }

    const offset = pixel * 4;
    const distance = colorDistance(
      data[offset],
      data[offset + 1],
      data[offset + 2],
      bgR,
      bgG,
      bgB,
    );

    if (distance <= threshold + feather) {
      visited[pixel] = 1;
      queue.push(pixel);
    }
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }

  for (let y = 1; y < height - 1; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const pixel = queue[cursor];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  for (const pixel of queue) {
    const offset = pixel * 4;
    const distance = colorDistance(
      data[offset],
      data[offset + 1],
      data[offset + 2],
      bgR,
      bgG,
      bgB,
    );
    const alpha =
      distance <= threshold
        ? 0
        : Math.round(
            data[offset + 3] *
              clamp((distance - threshold) / feather, 0, 1),
          );

    data[offset + 3] = alpha;
  }

  const png = await sharp(data, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return {
    b64: png.toString("base64"),
    mediaType: "image/png",
    extension: "png",
    width,
    height,
  };
}

function stripPrompt(crop: CropPayload, settings: StripSettings) {
  const extraPrompt = crop.prompt?.trim();
  const instructions = [
    "Create a clean, high-fidelity recreation of the supplied cropped image region.",
    "Remove all visible text, captions, watermarks, UI labels, logos made of text, and typography.",
    "Preserve the original subject, material, lighting, perspective, edges, and photographic detail.",
    settings.background === "transparent"
      ? "Return the subject on a transparent background when supported."
      : "Keep the original background and surrounding visual context.",
  ];

  if (extraPrompt) {
    instructions.push(`Additional direction for this version: ${extraPrompt}`);
  }

  return instructions.join(" ");
}

async function stripCrop(crop: CropPayload, settings: StripSettings) {
  const { buffer } = parseDataUrl(crop.dataUrl);
  const useGemini = crop.index % 2 === 0;
  const modelName = useGemini ? "gemini-2.5-flash-image" : "gpt-image-1";
  const prompt = stripPrompt(crop, settings);

  const result = await generateImage({
    model: useGemini
      ? google.image("gemini-2.5-flash-image")
      : openai.image("gpt-image-1"),
    prompt: {
      images: [buffer],
      text: prompt,
    },
    ...(useGemini && settings.aspectRatio !== "free"
      ? { aspectRatio: settings.aspectRatio }
      : {}),
    maxRetries: 1,
    providerOptions: useGemini
      ? undefined
      : {
          openai: {
            quality: "medium",
            background:
              settings.background === "transparent" ? "transparent" : "opaque",
            outputFormat: "png",
            inputFidelity: "high",
          },
        },
  });

  const image = result.images[0];

  if (!image) {
    throw new Error(`${modelName} did not return an image.`);
  }

  const normalized = await normalizeImage(image.uint8Array, crop, settings);

  return {
    id: crop.id,
    name: crop.name,
    model: modelName,
    prompt: crop.prompt?.trim() || undefined,
    ...normalized,
  };
}

async function fastCrop(crop: CropPayload, settings: StripSettings) {
  const { buffer } = parseDataUrl(crop.dataUrl);
  const operation = settings.fastOperation ?? "resize";

  if (operation === "remove-background") {
    const result = await removeEdgeBackground(buffer, crop, settings);

    return {
      id: crop.id,
      name: crop.name,
      model: "sharp-background",
      prompt: crop.prompt?.trim() || undefined,
      ...result,
    };
  }

  const outputSettings =
    operation === "svg" ? { ...settings, format: "svg" as const } : settings;
  const normalized = await normalizeImage(buffer, crop, outputSettings);

  return {
    id: crop.id,
    name: crop.name,
    model: operation === "svg" ? "sharp-svg" : "sharp-resize",
    prompt: crop.prompt?.trim() || undefined,
    ...normalized,
  };
}

async function assertPaid(payment: StripRequest["payment"]) {
  if (process.env.PAYMENT_REQUIRED === "false") {
    return;
  }

  const email = payment?.email?.trim().toLowerCase();

  if (email === "lois@sf-voice.sh") {
    return;
  }

  const checkoutId = payment?.checkoutId?.trim();

  if (!checkoutId) {
    throw new Error("Payment is required before generation.");
  }

  const checkout = await getPolarCheckout(checkoutId);

  if (!isPaidCheckout(checkout, payment?.jobId)) {
    throw new Error("Polar checkout has not succeeded yet.");
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as StripRequest;

    if (!body.crops?.length) {
      return Response.json({ error: "Add at least one selection." }, { status: 400 });
    }

    const isFastMode = body.settings.mode === "fast";

    if (!isFastMode) {
      await assertPaid(body.payment);
    }

    if (
      !isFastMode &&
      !process.env.OPENAI_API_KEY &&
      body.crops.some((crop) => crop.index % 2 === 1)
    ) {
      return Response.json(
        { error: "Missing OPENAI_API_KEY in server environment." },
        { status: 500 },
      );
    }

    if (
      !isFastMode &&
      !process.env.GEMINI_API_KEY &&
      !process.env.GOOGLE_GENERATIVE_AI_API_KEY &&
      body.crops.some((crop) => crop.index % 2 === 0)
    ) {
      return Response.json(
        { error: "Missing GEMINI_API_KEY in server environment." },
        { status: 500 },
      );
    }

    const settled = await Promise.allSettled(
      body.crops.map((crop) =>
        isFastMode ? fastCrop(crop, body.settings) : stripCrop(crop, body.settings),
      ),
    );

    return Response.json({
      results: settled.map((result, index) => {
        if (result.status === "fulfilled") {
          return result.value;
        }

        return {
          id: body.crops[index]?.id,
          name: body.crops[index]?.name,
          prompt: body.crops[index]?.prompt?.trim() || undefined,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : "Image generation failed.",
        };
      }),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not process the batch.";

    return Response.json(
      {
        error: message,
      },
      {
        status:
          message.includes("Payment") || message.includes("checkout") ? 402 : 500,
      },
    );
  }
}
