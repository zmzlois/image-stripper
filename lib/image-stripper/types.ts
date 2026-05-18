export type OutputFormat = "png" | "jpeg" | "webp" | "svg";
export type AspectRatio = "free" | "1:1" | "4:3" | "16:9";
export type BackgroundMode = "keep" | "transparent";
export type ProcessingMode = "ai" | "fast";
export type FastOperation = "resize" | "remove-background" | "svg";
export type PricingPlanId = "starter" | "pro" | "studio" | "monthly" | "lifetime";
export type CheckoutIntent = "job" | "billing";
export type AuthMode = "sign-in" | "sign-up";
export type BillingState =
   | { kind: "anonymous" }
   | { kind: "none"; email: string }
   | { kind: "error"; email?: string; error?: string }
   | { kind: "credits"; email: string; balance: number }
   | { kind: "unlimited"; email: string; label: string };
export type ModelPreference =
   | "rotate"
   | "nano-banana-2"
   | "nano-banana"
   | "nano-banana-pro"
   | "openai";

export type SourceImage = {
   name: string;
   dataUrl: string;
};

export type Selection = {
   id: string;
   name: string;
   x: number;
   y: number;
   w: number;
   h: number;
};

export type StripSettings = {
   mode: ProcessingMode;
   fastOperation: FastOperation;
   modelPreference: ModelPreference;
   format: OutputFormat;
   maxEdge: number;
   aspectRatio: AspectRatio;
   background: BackgroundMode;
};

export type StripResult = {
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

export type HistoryEntry = {
   id: string;
   createdAt: number;
   source: SourceImage;
   selections: Selection[];
   settings: StripSettings;
   results: StripResult[];
   payment?: {
      checkoutId?: string;
      email?: string;
      status?: "pending" | "paid";
   };
};

export type PricingPlan = {
   id: PricingPlanId;
   name: string;
   price: string;
   credits: string;
   note: string;
};
