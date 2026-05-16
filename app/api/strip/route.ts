import { generateImage } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 300;

type OutputFormat = "png" | "jpeg" | "webp" | "svg";
type AspectRatio = "free" | "1:1" | "4:3" | "16:9";
type BackgroundMode = "keep" | "transparent";

type CropPayload = {
  id: string;
  name: string;
  index: number;
  dataUrl: string;
  width: number;
  height: number;
};

type StripSettings = {
  format: OutputFormat;
  maxEdge: number;
  aspectRatio: AspectRatio;
  background: BackgroundMode;
};

type StripRequest = {
  crops: CropPayload[];
  settings: StripSettings;
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

async function stripCrop(crop: CropPayload, settings: StripSettings) {
  const { buffer } = parseDataUrl(crop.dataUrl);
  const useGemini = crop.index % 2 === 0;
  const modelName = useGemini ? "gemini-2.5-flash-image" : "gpt-image-1";
  const prompt = [
    "Create a clean, high-fidelity recreation of the supplied cropped image region.",
    "Remove all visible text, captions, watermarks, UI labels, logos made of text, and typography.",
    "Preserve the original subject, material, lighting, perspective, edges, and photographic detail.",
    settings.background === "transparent"
      ? "Return the subject on a transparent background when supported."
      : "Keep the original background and surrounding visual context.",
  ].join(" ");

  const result = await generateImage({
    model: useGemini
      ? google.image("gemini-2.5-flash-image")
      : openai.image("gpt-image-1"),
    prompt: {
      images: [buffer],
      text: prompt,
    },
    maxRetries: 1,
    providerOptions: useGemini
      ? {
          google: {
            aspectRatio:
              settings.aspectRatio === "free" ? undefined : settings.aspectRatio,
          },
        }
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
    ...normalized,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as StripRequest;

    if (!body.crops?.length) {
      return Response.json({ error: "Add at least one selection." }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY && body.crops.some((crop) => crop.index % 2 === 1)) {
      return Response.json(
        { error: "Missing OPENAI_API_KEY in server environment." },
        { status: 500 },
      );
    }

    if (
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
      body.crops.map((crop) => stripCrop(crop, body.settings)),
    );

    return Response.json({
      results: settled.map((result, index) => {
        if (result.status === "fulfilled") {
          return result.value;
        }

        return {
          id: body.crops[index]?.id,
          name: body.crops[index]?.name,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : "Image generation failed.",
        };
      }),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not process the batch.",
      },
      { status: 500 },
    );
  }
}
