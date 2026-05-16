import { createPolarCheckout } from "@/lib/polar";

export const runtime = "nodejs";

type CheckoutRequest = {
  jobId?: string;
  email?: string;
  selectionCount?: number;
  plan?: string;
};

function originFromRequest(request: Request) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    new URL(request.url).origin
  );
}

function customerIpFromRequest(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    undefined
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CheckoutRequest;
    const email = body.email?.trim().toLowerCase();
    const jobId = body.jobId?.trim();
    const selectionCount = body.selectionCount ?? 0;

    if (!jobId) {
      return Response.json({ error: "Missing job id." }, { status: 400 });
    }

    if (!email || !email.includes("@")) {
      return Response.json({ error: "Enter an email for recovery." }, { status: 400 });
    }

    if (selectionCount < 1) {
      return Response.json(
        { error: "Select at least one section before checkout." },
        { status: 400 },
      );
    }

    const checkout = await createPolarCheckout({
      jobId,
      email,
      selectionCount,
      plan: body.plan,
      origin: originFromRequest(request),
      customerIpAddress: customerIpFromRequest(request),
    });

    return Response.json({
      checkoutId: checkout.id,
      url: checkout.url,
      status: checkout.status,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create Polar checkout.",
      },
      { status: 500 },
    );
  }
}
