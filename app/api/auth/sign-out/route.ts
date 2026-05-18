import { authenticatedEmailFromRequest, clearSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const email = authenticatedEmailFromRequest(request);
  console.log("auth.sign_out", { email });
  return Response.json(
    { signedOut: true },
    {
      headers: {
        "Set-Cookie": clearSessionCookie(),
      },
    },
  );
}
