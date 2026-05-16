type PolarServer = "sandbox" | "production";

type PolarCheckoutStatus = "open" | "expired" | "confirmed" | "succeeded" | "failed";

export type PolarCheckout = {
  id: string;
  status: PolarCheckoutStatus;
  url: string;
  customer_email?: string | null;
  metadata?: Record<string, unknown>;
};

type CreatePolarCheckoutInput = {
  jobId: string;
  email: string;
  selectionCount: number;
  plan?: string;
  origin: string;
  customerIpAddress?: string;
};

function polarServer(): PolarServer {
  return process.env.POLAR_SERVER === "production" ? "production" : "sandbox";
}

function polarBaseUrl() {
  return polarServer() === "production"
    ? "https://api.polar.sh"
    : "https://sandbox-api.polar.sh";
}

function polarAccessToken() {
  const token = process.env.POLAR_ACCESS_TOKEN;

  if (!token) {
    throw new Error("Missing POLAR_ACCESS_TOKEN.");
  }

  return token;
}

function polarProductId() {
  const productId = process.env.POLAR_PRODUCT_ID;

  if (!productId) {
    throw new Error("Missing POLAR_PRODUCT_ID.");
  }

  return productId;
}

async function polarFetch<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${polarBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${polarAccessToken()}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const payload = (await response.json().catch(() => ({}))) as T & {
    detail?: string;
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(
      payload.detail ||
        payload.error ||
        payload.message ||
        `Polar request failed with ${response.status}.`,
    );
  }

  return payload as T;
}

export async function createPolarCheckout({
  jobId,
  email,
  selectionCount,
  plan,
  origin,
  customerIpAddress,
}: CreatePolarCheckoutInput) {
  return polarFetch<PolarCheckout>("/v1/checkouts", {
    method: "POST",
    body: JSON.stringify({
      products: [polarProductId()],
      customer_email: email,
      external_customer_id: email.toLowerCase(),
      customer_ip_address: customerIpAddress,
      metadata: {
        job_id: jobId,
        selection_count: selectionCount,
        plan: plan || "starter",
        app: "image-stripper",
      },
      success_url: `${origin}/?checkout_id={CHECKOUT_ID}&job=${jobId}&paid=polar`,
      return_url: origin,
      allow_discount_codes: false,
    }),
  });
}

export async function getPolarCheckout(id: string) {
  return polarFetch<PolarCheckout>(`/v1/checkouts/${id}`);
}

export function isPaidCheckout(checkout: PolarCheckout, jobId?: string) {
  const metadataJobId = checkout.metadata?.job_id;

  return (
    checkout.status === "succeeded" &&
    (!jobId || typeof metadataJobId !== "string" || metadataJobId === jobId)
  );
}
