#!/usr/bin/env node
import readline from "node:readline/promises";
import process from "node:process";

const origin = (
  process.env.BJR_TEST_RESET_ORIGIN ??
  "https://www.brendanjohnroch.com"
).replace(/\/$/, "");

const secret = (process.env.ADMIN_NUKE_SECRET ?? "").trim();
if (!secret) {
  console.error(
    "Missing ADMIN_NUKE_SECRET in the local environment. " +
      "Load it securely before running this command.",
  );
  process.exit(1);
}

const endpoint = `${origin}/api/admin/reset-test-member`;

async function post(body) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-secret": secret,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let payload;

  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }

  return { response, payload };
}

function safeTestEmailFromPayload(payload) {
  const candidate =
    typeof payload?.testEmail === "string" ? payload.testEmail : "";

  if (!candidate || candidate.length > 254) return "";

  if (/[\u0000-\u001F\u007F]/u.test(candidate)) return "";

  const atIndex = candidate.indexOf("@");
  if (atIndex <= 0 || atIndex !== candidate.lastIndexOf("@")) return "";

  const domain = candidate.slice(atIndex + 1);
  if (!domain || domain.length > 253) return "";

  const dotIndex = domain.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === domain.length - 1) return "";

  if (candidate.includes(" ")) return "";

  return candidate;
}

const dry = await post({ dryRun: true });

console.log("\n--- TEST MEMBER RESET DRY RUN ---");
console.log("Dry-run response received.");

if (!dry.response.ok) {
  console.error(`\nReset refused by server (HTTP ${dry.response.status}).`);
  process.exit(1);
}

const testEmail = safeTestEmailFromPayload(dry.payload);

if (!testEmail) {
  console.error("\nServer did not return the configured test email.");
  process.exit(1);
}

const blockers = Array.isArray(dry.payload?.blockers)
  ? dry.payload.blockers
  : [];

if (blockers.length > 0) {
  console.error("\nReset blocked by server-reported dependency state.");
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const phrase = `RESET ${testEmail}`;
const answer = await rl.question(
  `\nType exactly "${phrase}" to permanently reset this test identity:\n> `,
);
rl.close();

if (answer.trim() !== phrase) {
  console.log("\nCancelled. Nothing changed.");
  process.exit(0);
}

const executed = await post({
  dryRun: false,
  confirmEmail: testEmail,
});

console.log("\n--- TEST MEMBER RESET RESULT ---");
console.log("Execution response received.");

if (!executed.response.ok || executed.payload?.ok !== true) {
  console.error(`\nReset failed (HTTP ${executed.response.status}).`);
  process.exit(1);
}

console.log(
  "\nReset complete. The configured email can now be used as a fresh test identity.",
);
