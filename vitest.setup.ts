import { vi } from "vitest";

// Mock server-only module for testing
vi.mock("server-only", () => ({}));

// Mock environment variables needed for tests
process.env.MUX_SIGNING_KEY_ID = "test-key-id";

// Test RSA private key (generated for testing purposes)
process.env.MUX_SIGNING_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC3iyYBmVLYdMFR
k4DWUITqPJ59y3AaWwe3F40an/fCwqGgdt3/ZrTfU2eyedaSBYhXuBQb8J2OcKbD
wfAtPZqK/vmqLcSFWM6QJ5doLHSyc+l9+1Th+BVQ42Ty0u/+XNiAf2EeApfJfQL/
Cj1vRoZeNQTWgksjM09H7qaBFmT6+vGy1fSvDRjJQnmRX7+2DFau5IZk3MUXEfiU
vgooJ+sQo2RHPqYBlFZbHB7jYNk57jpRADVVW1VMY5zfMc9YUaAg4wiD2l6ZvzYb
FfLMXe3ec6AQ4yK3ZRMD742q2lCb5BYdu70zwa8vZ5viFPoobA4nHx1gbrvvO1Pp
rZE/oGlhAgMBAAECggEADcjbj98uA6exJSlI0c+2S8lFtfjjcHdJuwx/wnIlL3Fi
piSHQ7k4+FTRQuw3mzvjI4NlrzuA+cOoIqecHCm2Q54mrgtF6SXkTZtLmb1M/mIK
NTX9CAOTxkFtwXbqI1ZhxDTM3G4hbDaBVRo1xveq+8RLmriqX/hoieR4iNVfvCGg
E/A/kwxYu+i7AA/KmmBO5qRBvV1Ab/QITXDqVAORJMqHuiRtmT5X7iWWaHnZQQ7r
m8Vw33YN1j3oczc2kME85FYje6HcCUGG0QWkrKKWp51swNXmCqIY13iZIucTRzM3
wS8vrzJeqmwfStQBdxwyALwbLO1gH1K4JsCtjigq4QKBgQDhRICA/j3KkH+ZIDVG
B67aW0SgN4Tk8wB9cPNYNwACmmCqotCvq1q4vLYnfr9gAyK24TWYNfHuuY3FAEsG
dAZACWXgTVH8bh5i3lDe4wNGdsUG6gvR7+ZsiXDBZxF+Vs4wPjOwLZKH8wtLXTir
qFe0kZHpFwp7KQpIhEfSJlTc3QKBgQDQlW3sL4N7+nq93YQ2XqLoC3oD1+OWo14h
6mlyILMiYk4kBclpZy8MYKJFTYY7yx9SMqzvC7QFgUTMroxmfOfyrpSSVAFhEno6
m4K6IBvB0PLsC1hcttgIfYqFWOPbnhps37DIWWZK39fojQLHoPfk0oDUiDFU0HIw
qefCR7QkVQKBgFS29DSOaCJzcOjfCenKHeGUDRzLhDitgfOqtHjqRiC0ecHx9NT7
deSfY0k7CzFKPJXV39fcAZ2rPjtlvtEwdOFEJ4HQ0hJCPz8jJ/qKGMM5CyNshQFw
XJFYpoS1BAklD+lomvuYR9DEf+zZo+Q6LLGFRQAJYDGs32ciB/hp3eQpAoGAJ9gT
mmVtIXa0kaZKBjTHu7nNggRwdisY5TOpFuMGNRBASwNL+TV7uEqRVNm9RZjEj+gc
PsGmjtKluM+zBDTh/eq5eMZRSSDFdoKUU0ek5b4rWUnFhFhtJhoNJvHW/PHTrG6C
j5L8RltCHCsrl8S49d38PB0UB1aWKZObMPKPh80CgYAVkbRfNONVCt1Z7heeKBRt
wGhMeyHTDD08DYB3X9hCwBjwHWTtAIEAQfpGxotMJCKmMeTap1Ob0QfhUMgoh3YV
gETgEDd4Wd2vcfNXPntrb9P3RlNRWoOoqbL/Gy/Ugg4Dmdgciaq7JmXg5yrnSlUq
4lYyTvE/WvRu2UAYgx6f/Q==
-----END PRIVATE KEY-----`;

process.env.MUX_TOKEN_TTL_SECONDS = "900";

// Mock Clerk auth
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: null }),
}));

// Mock Vercel Postgres
vi.mock("@vercel/postgres", () => ({
  sql: async () => ({
    rows: [],
  }),
}));

// Mock shareTokens
vi.mock("@/lib/shareTokens", () => ({
  validateShareToken: async () => ({ ok: false, code: "INVALID" }),
}));

// Mock accessOracle
vi.mock("@/lib/accessOracle", () => ({
  decideAlbumPlaybackAccess: async () => ({
    allowed: false,
    code: "ENTITLEMENT_REQUIRED",
    reason: "Test - no entitlement",
  }),
}));

// Mock events
vi.mock("@/lib/events", () => ({
  countAnonDistinctCompletedTracks: async () => 0,
}));
