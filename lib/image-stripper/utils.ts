import { modelOptions, superAdminEmails } from "@/lib/image-stripper/config";
import type { ModelPreference, StripResult } from "@/lib/image-stripper/types";

export function makeId(prefix: string) {
   return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function pluralCredits(count: number) {
   return `${count} credit${count === 1 ? "" : "s"}`;
}

export function clamp(value: number, min: number, max: number) {
   return Math.min(Math.max(value, min), max);
}

export function slug(value: string) {
   return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
}

export function resultDataUrl(result: StripResult) {
   if (!result.b64 || !result.mediaType) {
      return "";
   }

   return `data:${result.mediaType};base64,${result.b64}`;
}

export function isSuperAdminEmail(email: string) {
   return superAdminEmails.has(email.trim().toLowerCase());
}

export function modelLabelForIndex(index: number, preference: ModelPreference) {
   const rotated = [
      "Nano Banana 2",
      "OpenAI",
      "Nano Banana",
      "Nano Banana Pro",
   ] as const;

   if (preference === "rotate") {
      return rotated[index % rotated.length];
   }

   return (
      modelOptions.find((option) => option.value === preference)?.label ??
      "Model"
   );
}
