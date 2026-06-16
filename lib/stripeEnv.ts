type StripeKeyMode = "live" | "test" | "unknown";
type StripeRuntimeMode = "live" | "test";

function keyMode(value: string): StripeKeyMode {
  if (value.startsWith("sk_live_") || value.startsWith("pk_live_"))
    return "live";
  if (value.startsWith("sk_test_") || value.startsWith("pk_test_"))
    return "test";
  return "unknown";
}

function stripeRuntimeMode(): StripeRuntimeMode {
  const raw = (process.env.STRIPE_MODE ?? process.env.STRIPE_ENVIRONMENT ?? "")
    .trim()
    .toLowerCase();

  if (raw === "live" || raw === "test") return raw;

  // Safe default: production builds assume live unless explicitly placed in test mode.
  return process.env.NODE_ENV === "production" ? "live" : "test";
}

export function assertStripeSecretKey(
  value: string,
  name = "STRIPE_SECRET_KEY",
): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`Missing ${name}`);

  const key = keyMode(trimmed);
  const runtime = stripeRuntimeMode();

  if (key === "unknown") {
    throw new Error(`${name} must be a Stripe secret key`);
  }

  if (key !== runtime) {
    throw new Error(`${name} is a ${key} key but STRIPE_MODE is ${runtime}`);
  }

  return trimmed;
}

export function assertStripePriceId(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`Missing ${name}`);

  if (!trimmed.startsWith("price_")) {
    throw new Error(`${name} must be a Stripe price id`);
  }

  return trimmed;
}
