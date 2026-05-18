import { getPolarCheckout, isPaidCheckout } from "@/lib/polar";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const checkoutId = url.searchParams.get("checkout_id");
    const jobId = url.searchParams.get("job") ?? undefined;

    console.log("polar.checkout_status.request", { checkoutId, jobId });

    if (!checkoutId) {
      console.log("polar.checkout_status.rejected", { reason: "missing_checkout_id" });
      return Response.json({ error: "Missing checkout id." }, { status: 400 });
    }

    const checkout = await getPolarCheckout(checkoutId);
    const paid = isPaidCheckout(checkout, jobId);

    console.log("polar.checkout_status.response", {
      checkoutId: checkout.id,
      status: checkout.status,
      paid,
      email: checkout.customer_email ?? null,
    });

    return Response.json({
      checkoutId: checkout.id,
      status: checkout.status,
      paid,
      email: checkout.customer_email ?? null,
    });
  } catch (error) {
    console.error("polar.checkout_status.error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not verify Polar checkout.",
      },
      { status: 500 },
    );
  }
}
