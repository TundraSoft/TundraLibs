/**
 * JWT Performance Benchmarks
 *
 * Benchmarks for measuring JWT token creation and verification performance
 * across different algorithms and payload sizes.
 */

import {
  issueJWT,
  type JWTAlgorithm,
  type JWTPayload,
  verifyJWT,
} from "./mod.ts";

// Test secret for benchmarking
const BENCH_SECRET =
  "benchmark-secret-key-for-testing-jwt-performance-must-be-long-enough";

// Small payload for basic testing
const SMALL_PAYLOAD: JWTPayload = {
  sub: "user123",
  iss: "auth.example.com",
  aud: "api.example.com",
  exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
};

// Medium payload with more claims
const MEDIUM_PAYLOAD: JWTPayload = {
  sub: "user123",
  iss: "auth.example.com",
  aud: ["api.example.com", "web.example.com", "mobile.example.com"],
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  nbf: Math.floor(Date.now() / 1000),
  jti: "unique-token-id-12345",
  role: "admin",
  permissions: ["read", "write", "delete", "admin"],
  metadata: {
    department: "engineering",
    team: "backend",
    location: "remote",
  },
};

// Large payload with extensive data
const LARGE_PAYLOAD: JWTPayload = {
  sub: "user123",
  iss: "auth.example.com",
  aud: [
    "api.example.com",
    "web.example.com",
    "mobile.example.com",
    "dashboard.example.com",
  ],
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  nbf: Math.floor(Date.now() / 1000),
  jti: "unique-token-id-12345-with-longer-identifier",
  role: "admin",
  permissions: [
    "read",
    "write",
    "delete",
    "admin",
    "configure",
    "monitor",
    "audit",
    "backup",
    "restore",
    "deploy",
    "scale",
    "debug",
  ],
  metadata: {
    department: "engineering",
    team: "backend",
    location: "remote",
    timezone: "UTC",
    preferences: {
      theme: "dark",
      language: "en",
      notifications: {
        email: true,
        push: false,
        sms: true,
      },
    },
    projects: [
      { id: "proj1", name: "Authentication Service", role: "lead" },
      { id: "proj2", name: "API Gateway", role: "contributor" },
      { id: "proj3", name: "Monitoring Dashboard", role: "reviewer" },
    ],
  },
  customClaims: {
    sessionId: "sess_abc123def456ghi789",
    clientInfo: {
      userAgent: "Mozilla/5.0 (compatible; BenchmarkClient/1.0)",
      ip: "192.168.1.100",
      platform: "web",
    },
  },
};

// Pre-generated tokens for verification benchmarks
let smallTokenHS256: string;
let mediumTokenHS256: string;
let largeTokenHS256: string;
let smallTokenHS384: string;
let smallTokenHS512: string;

// Setup tokens before benchmarks
const setupTokens = async () => {
  smallTokenHS256 = await issueJWT("HS256", SMALL_PAYLOAD, BENCH_SECRET);
  mediumTokenHS256 = await issueJWT("HS256", MEDIUM_PAYLOAD, BENCH_SECRET);
  largeTokenHS256 = await issueJWT("HS256", LARGE_PAYLOAD, BENCH_SECRET);
  smallTokenHS384 = await issueJWT("HS384", SMALL_PAYLOAD, BENCH_SECRET);
  smallTokenHS512 = await issueJWT("HS512", SMALL_PAYLOAD, BENCH_SECRET);
};

// Initialize tokens
await setupTokens();

// ============================================================================
// JWT Creation Benchmarks
// ============================================================================

Deno.bench({
  name: "crypt.JWT - Issue HS256 (small payload)",
  fn: async () => {
    await issueJWT("HS256", SMALL_PAYLOAD, BENCH_SECRET);
  },
});

Deno.bench({
  name: "crypt.JWT - Issue HS384 (small payload)",
  fn: async () => {
    await issueJWT("HS384", SMALL_PAYLOAD, BENCH_SECRET);
  },
});

Deno.bench({
  name: "crypt.JWT - Issue HS512 (small payload)",
  fn: async () => {
    await issueJWT("HS512", SMALL_PAYLOAD, BENCH_SECRET);
  },
});

Deno.bench({
  name: "crypt.JWT - Issue HS256 (medium payload)",
  fn: async () => {
    await issueJWT("HS256", MEDIUM_PAYLOAD, BENCH_SECRET);
  },
});

Deno.bench({
  name: "crypt.JWT - Issue HS256 (large payload)",
  fn: async () => {
    await issueJWT("HS256", LARGE_PAYLOAD, BENCH_SECRET);
  },
});

// ============================================================================
// JWT Verification Benchmarks
// ============================================================================

Deno.bench({
  name: "crypt.JWT - Verify HS256 (small payload)",
  fn: async () => {
    await verifyJWT(smallTokenHS256, BENCH_SECRET);
  },
});

Deno.bench({
  name: "crypt.JWT - Verify HS384 (small payload)",
  fn: async () => {
    await verifyJWT(smallTokenHS384, BENCH_SECRET);
  },
});

Deno.bench({
  name: "crypt.JWT - Verify HS512 (small payload)",
  fn: async () => {
    await verifyJWT(smallTokenHS512, BENCH_SECRET);
  },
});

Deno.bench({
  name: "crypt.JWT - Verify HS256 (medium payload)",
  fn: async () => {
    await verifyJWT(mediumTokenHS256, BENCH_SECRET);
  },
});

Deno.bench({
  name: "crypt.JWT - Verify HS256 (large payload)",
  fn: async () => {
    await verifyJWT(largeTokenHS256, BENCH_SECRET);
  },
});

// ============================================================================
// JWT Verification with Options Benchmarks
// ============================================================================

Deno.bench({
  name: "crypt.JWT - Verify with audience validation",
  fn: async () => {
    await verifyJWT(smallTokenHS256, BENCH_SECRET, {
      audience: "api.example.com",
    });
  },
});

Deno.bench({
  name: "crypt.JWT - Verify with issuer validation",
  fn: async () => {
    await verifyJWT(smallTokenHS256, BENCH_SECRET, {
      issuer: "auth.example.com",
    });
  },
});

Deno.bench({
  name: "crypt.JWT - Verify with full validation",
  fn: async () => {
    await verifyJWT(smallTokenHS256, BENCH_SECRET, {
      audience: "api.example.com",
      issuer: "auth.example.com",
      maxAge: 3600,
      clockTolerance: 30,
    });
  },
});

// ============================================================================
// Round-trip Benchmarks (Issue + Verify)
// ============================================================================

Deno.bench({
  name: "crypt.JWT - Round-trip HS256 (small)",
  fn: async () => {
    const token = await issueJWT("HS256", SMALL_PAYLOAD, BENCH_SECRET);
    await verifyJWT(token, BENCH_SECRET);
  },
});

Deno.bench({
  name: "crypt.JWT - Round-trip HS384 (small)",
  fn: async () => {
    const token = await issueJWT("HS384", SMALL_PAYLOAD, BENCH_SECRET);
    await verifyJWT(token, BENCH_SECRET);
  },
});

Deno.bench({
  name: "crypt.JWT - Round-trip HS512 (small)",
  fn: async () => {
    const token = await issueJWT("HS512", SMALL_PAYLOAD, BENCH_SECRET);
    await verifyJWT(token, BENCH_SECRET);
  },
});

Deno.bench({
  name: "crypt.JWT - Round-trip HS256 (medium)",
  fn: async () => {
    const token = await issueJWT("HS256", MEDIUM_PAYLOAD, BENCH_SECRET);
    await verifyJWT(token, BENCH_SECRET);
  },
});

Deno.bench({
  name: "crypt.JWT - Round-trip HS256 (large)",
  fn: async () => {
    const token = await issueJWT("HS256", LARGE_PAYLOAD, BENCH_SECRET);
    await verifyJWT(token, BENCH_SECRET);
  },
});

// ============================================================================
// Algorithm Comparison Benchmarks
// ============================================================================

const algorithms: JWTAlgorithm[] = ["HS256", "HS384", "HS512"];

for (const algorithm of algorithms) {
  Deno.bench({
    name: `crypt.JWT - Algorithm comparison: ${algorithm}`,
    fn: async () => {
      const token = await issueJWT(algorithm, SMALL_PAYLOAD, BENCH_SECRET);
      await verifyJWT(token, BENCH_SECRET);
    },
  });
}

// ============================================================================
// Stress Test Benchmarks
// ============================================================================

Deno.bench({
  name: "crypt.JWT - Batch create 10 tokens",
  fn: async () => {
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        issueJWT("HS256", { ...SMALL_PAYLOAD, sub: `user${i}` }, BENCH_SECRET),
      );
    }
    await Promise.all(promises);
  },
});

Deno.bench({
  name: "crypt.JWT - Batch verify 10 tokens",
  fn: async () => {
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(verifyJWT(smallTokenHS256, BENCH_SECRET));
    }
    await Promise.all(promises);
  },
});

// ============================================================================
// Token Size Analysis (not a performance benchmark, but useful info)
// ============================================================================

// Helper to calculate token sizes
const analyzeTokenSizes = async () => {
  const smallToken = await issueJWT("HS256", SMALL_PAYLOAD, BENCH_SECRET);
  const mediumToken = await issueJWT("HS256", MEDIUM_PAYLOAD, BENCH_SECRET);
  const largeToken = await issueJWT("HS256", LARGE_PAYLOAD, BENCH_SECRET);

  console.log("\n=== JWT Token Size Analysis ===");
  console.log(`Small payload token size: ${smallToken.length} characters`);
  console.log(`Medium payload token size: ${mediumToken.length} characters`);
  console.log(`Large payload token size: ${largeToken.length} characters`);
  console.log("================================\n");
};

// Run size analysis if this file is executed directly
if (import.meta.main) {
  await analyzeTokenSizes();
}
