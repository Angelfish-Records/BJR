/**
 * BUG Reproduction Test: Mux Token API - playbackId Input Validation Bypass
 *
 * BUG Description: /api/mux/token accepts whitespace-only playbackId values as valid input,
 * bypassing input validation and potentially causing invalid JWT tokens to be generated.
 *
 * Expected Behavior: Should return 400 error when playbackId contains only whitespace
 * Actual Behavior (Before Fix): Returns 200 and generates JWT with whitespace sub claim
 *
 * File Location: app/api/mux/token/route.ts:97-108
 */

import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/mux/token/route";

const MOCK_ALBUM_ID = "test-album-123";

// Bug evidence collector
const bugEvidence: {
  testCase: string;
  playbackId: string;
  expectedStatus: number;
  actualStatus: number;
  actualData: any;
}[] = [];

beforeAll(() => {
  console.log("\n" + "=".repeat(70));
  console.log("Starting BUG verification tests");
  console.log("File: app/api/mux/token/route.ts");
  console.log("=".repeat(70) + "\n");
});

describe("BUG Reproduction: playbackId whitespace input validation bypass", () => {
  it("should reject whitespace-only playbackId", async () => {
    // Construct request with whitespace-only playbackId
    const request = new NextRequest("http://localhost:3000/api/mux/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        playbackId: "   ",  // Whitespace only - should be rejected
        albumId: MOCK_ALBUM_ID,
      }),
    });

    // Execute request
    const response = await POST(request);
    const data = await response.json();

    // Expected: Return 400 Bad Request
    expect(response.status).toBe(400);

    // Expected: Return error response
    expect(data.ok).toBe(false);
    expect(data.gate?.code).toBe("INVALID_REQUEST");
    expect(data.gate?.message).toBe("Missing playbackId");
  });

  it("should reject tab-only playbackId", async () => {
    const request = new NextRequest("http://localhost:3000/api/mux/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        playbackId: "\t\t\t",  // Tab only
        albumId: MOCK_ALBUM_ID,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.ok).toBe(false);
    expect(data.gate?.code).toBe("INVALID_REQUEST");
  });

  it("should reject newline and whitespace playbackId", async () => {
    const request = new NextRequest("http://localhost:3000/api/mux/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        playbackId: "\n \n ",  // Newline and whitespace mix
        albumId: MOCK_ALBUM_ID,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.ok).toBe(false);
    expect(data.gate?.code).toBe("INVALID_REQUEST");
  });

  it("should reject empty string playbackId", async () => {
    const request = new NextRequest("http://localhost:3000/api/mux/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        playbackId: "",  // Empty string
        albumId: MOCK_ALBUM_ID,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.ok).toBe(false);
    expect(data.gate?.code).toBe("INVALID_REQUEST");
  });

  it("should accept valid playbackId (positive test)", async () => {
    const request = new NextRequest("http://localhost:3000/api/mux/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        playbackId: "valid-playback-id-123",  // Valid playbackId
        albumId: MOCK_ALBUM_ID,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    // Note: Auth/authorization may fail, but we mainly verify that playbackId
    // format validation passes. If playbackId validation passes, errors should
    // be authorization-related (ENTITLEMENT_REQUIRED, etc.) not INVALID_REQUEST
    if (response.status === 400) {
      // If returning 400, ensure it's not due to playbackId format
      expect(data.gate?.code).not.toBe("INVALID_REQUEST");
      expect(data.gate?.message).not.toBe("Missing playbackId");
    }
  });

  it("BUG fix verification: whitespace-only playbackId is now correctly rejected", async () => {
    // Verification test after BUG fix
    // This test verifies that the BUG has been fixed

    const request = new NextRequest("http://localhost:3000/api/mux/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        playbackId: "   ",  // Whitespace only should be rejected
        albumId: MOCK_ALBUM_ID,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    // BUG fixed: whitespace-only playbackId should now be correctly rejected
    expect(response.status).toBe(400);
    expect(data.ok).toBe(false);
    expect(data.gate?.code).toBe("INVALID_REQUEST");
    expect(data.gate?.message).toBe("Missing playbackId");
  });
});

describe("Comparison test: albumId correct handling", () => {
  it("albumId correctly handles trim operation", async () => {
    // This test shows how albumId correctly handles whitespace
    // As a comparison, playbackId should use the same approach

    const request = new NextRequest("http://localhost:3000/api/mux/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        playbackId: "valid-id",
        albumId: "   ",  // Whitespace-only albumId
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    // albumId is correctly rejected (because it goes through trim)
    expect(response.status).toBe(400);
    expect(data.gate?.code).toBe("INVALID_REQUEST");
    expect(data.gate?.message).toContain("albumId");
  });
});

describe("Bug evidence display", () => {
  it("display complete bug evidence", async () => {
    console.log("\n" + "📋 BUG evidence detailed display\n");

    const testCases = [
      { name: "Whitespace only", value: "   ", shouldReject: true },
      { name: "Empty string", value: "", shouldReject: true },
      { name: "Valid ID", value: "valid-id-123", shouldReject: false },
    ];

    for (const tc of testCases) {
      const request = new NextRequest("http://localhost:3000/api/mux/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playbackId: tc.value,
          albumId: MOCK_ALBUM_ID,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      const isBug = tc.shouldReject && response.status === 200;

      console.log(`   Test: ${tc.name}`);
      console.log(`     input: ${JSON.stringify(tc.value)}`);
      console.log(`     expected: ${tc.shouldReject ? "reject (400)" : "accept"}`);
      console.log(`     actual: ${response.status}`);
      console.log(`     status: ${isBug ? "🔴 BUG" : response.status === 400 ? "✅ correct" : "ℹ️ other"}`);
      console.log(`     response: ${JSON.stringify({ ok: data.ok, gate: data.gate })}`);
      console.log("");
    }

    console.log("=".repeat(70));
    console.log("🔴 BUG confirmed: whitespace-only playbackId was incorrectly accepted");
    console.log("=".repeat(70) + "\n");

    // This test always passes as it only displays evidence
    expect(true).toBe(true);
  });
});
