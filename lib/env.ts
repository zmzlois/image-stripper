type EnvMap = NodeJS.ProcessEnv;

const requiredVars = [
  "OPENAI_API_KEY",
  "AUTH_SESSION_SECRET",
  "POLAR_SERVER",
  "POLAR_ACCESS_TOKEN",
  "POLAR_WEBHOOK_SECRET",
  "POLAR_STARTER_PRODUCT_ID",
  "POLAR_PRO_PRODUCT_ID",
  "POLAR_STUDIO_PRODUCT_ID",
  "POLAR_MONTHLY_PRODUCT_ID",
  "POLAR_LIFETIME_PRODUCT_ID",
  "POLAR_CREDIT_METER_ID",
  "POLAR_LIFETIME_BENEFIT_ID",
  "POLAR_USAGE_EVENT_NAME",
  "PAYMENT_REQUIRED",
  "BLOB_READ_WRITE_TOKEN",
  "VERCEL_BLOB_ACCESS",
] as const;

const alternativeVars = [
  ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
  ["NEXT_PUBLIC_APP_URL", "APP_URL"],
  ["POSTGRES_URL", "DATABASE_URL"],
] as const;

function hasValue(env: EnvMap, name: string) {
  return Boolean(env[name]?.trim());
}

function missingRequiredVars(env: EnvMap) {
  return requiredVars.filter((name) => !hasValue(env, name));
}

function missingAlternativeVars(env: EnvMap) {
  return alternativeVars
    .filter((group) => !group.some((name) => hasValue(env, name)))
    .map((group) => group.join(" or "));
}

function invalidVars(env: EnvMap) {
  const invalid: string[] = [];

  if (
    hasValue(env, "POLAR_SERVER") &&
    !["sandbox", "production"].includes(env.POLAR_SERVER ?? "")
  ) {
    invalid.push("POLAR_SERVER must be sandbox or production");
  }

  if (
    hasValue(env, "PAYMENT_REQUIRED") &&
    !["true", "false"].includes(env.PAYMENT_REQUIRED ?? "")
  ) {
    invalid.push("PAYMENT_REQUIRED must be true or false");
  }

  if (
    hasValue(env, "VERCEL_BLOB_ACCESS") &&
    !["public", "private"].includes(env.VERCEL_BLOB_ACCESS ?? "")
  ) {
    invalid.push("VERCEL_BLOB_ACCESS must be public or private");
  }

  if (hasValue(env, "AUTH_USERS_JSON")) {
    try {
      JSON.parse(env.AUTH_USERS_JSON ?? "{}");
    } catch {
      invalid.push("AUTH_USERS_JSON must be valid JSON");
    }
  }

  if (hasValue(env, "NEXT_PUBLIC_APP_URL")) {
    try {
      new URL(env.NEXT_PUBLIC_APP_URL ?? "");
    } catch {
      invalid.push("NEXT_PUBLIC_APP_URL must be a valid URL");
    }
  }

  if (hasValue(env, "APP_URL")) {
    try {
      new URL(env.APP_URL ?? "");
    } catch {
      invalid.push("APP_URL must be a valid URL");
    }
  }

  if (hasValue(env, "VERCEL_BLOB_API_URL")) {
    try {
      new URL(env.VERCEL_BLOB_API_URL ?? "");
    } catch {
      invalid.push("VERCEL_BLOB_API_URL must be a valid URL");
    }
  }

  return invalid;
}

export function validateEnv() {
  const missing = [...missingRequiredVars(process.env), ...missingAlternativeVars(process.env)];
  const invalid = invalidVars(process.env);

  if (missing.length === 0 && invalid.length === 0) {
    return;
  }

  const lines = [
    "Environment validation failed. Fix these variables before deploying:",
    ...missing.map((name) => `- missing: ${name}`),
    ...invalid.map((message) => `- invalid: ${message}`),
  ];

  throw new Error(lines.join("\n"));
}
