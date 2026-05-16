import { getPolarCheckout, isPaidCheckout } from "@/lib/polar";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const checkoutId = url.searchParams.get("checkout_id");
    const jobId = url.searchParams.get("job") ?? undefined;

    if (!checkoutId) {
      return Response.json({ error: "Missing checkout id." }, { status: 400 });
    }

    const checkout = await getPolarCheckout(checkoutId);

    return Response.json({
      checkoutId: checkout.id,
      status: checkout.status,
      paid: isPaidCheckout(checkout, jobId),
      email: checkout.customer_email ?? null,
    });
  } catch (error) {
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
