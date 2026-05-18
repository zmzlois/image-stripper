import type {
   AspectRatio,
   FastOperation,
   ModelPreference,
   OutputFormat,
   PricingPlan,
   StripSettings,
} from "@/lib/image-stripper/types";

export const defaultSettings: StripSettings = {
   mode: "ai",
   fastOperation: "resize",
   modelPreference: "rotate",
   format: "png",
   maxEdge: 1024,
   aspectRatio: "free",
   background: "keep",
};

export function normalizeSettings(
   settings: Partial<StripSettings> | undefined,
): StripSettings {
   return {
      ...defaultSettings,
      ...settings,
   };
}

export const maxEdgeOptions = [512, 768, 1024, 1536, 2048];
export const aspectOptions: AspectRatio[] = ["free", "1:1", "4:3", "16:9"];
export const formatOptions: OutputFormat[] = ["png", "webp", "jpeg", "svg"];
export const fastOptions: Array<{ value: FastOperation; label: string }> = [
   { value: "resize", label: "Resize" },
   { value: "remove-background", label: "Remove bg" },
   { value: "svg", label: "SVG" },
];

export const modelOptions: Array<{
   value: ModelPreference;
   label: string;
   note: string;
}> = [
   {
      value: "rotate",
      label: "Rotate",
      note: "Spread work across configured providers.",
   },
   {
      value: "nano-banana-2",
      label: "Nano Banana 2",
      note: "Gemini 3.1 Flash Image Preview.",
   },
   {
      value: "nano-banana",
      label: "Nano Banana",
      note: "Gemini 2.5 Flash Image.",
   },
   {
      value: "nano-banana-pro",
      label: "Nano Banana Pro",
      note: "Gemini 3 Pro Image Preview.",
   },
   {
      value: "openai",
      label: "OpenAI",
      note: "GPT Image.",
   },
];

export const pricingPlans: PricingPlan[] = [
   {
      id: "starter",
      name: "Starter",
      price: "$9",
      credits: "20 credits",
      note: "Best for this batch",
   },
   {
      id: "pro",
      name: "Pro",
      price: "$19",
      credits: "60 credits",
      note: "Most popular",
   },
   {
      id: "studio",
      name: "Studio",
      price: "$49",
      credits: "200 credits",
      note: "Bulk work",
   },
   {
      id: "monthly",
      name: "Monthly",
      price: "$39/mo",
      credits: "Unlimited usage",
      note: "Steady workflow",
   },
   {
      id: "lifetime",
      name: "Lifetime",
      price: "$999",
      credits: "Lifetime access",
      note: "One-time payment",
   },
];

export const superAdminEmails = new Set(["lois@sf-voice.sh"]);
