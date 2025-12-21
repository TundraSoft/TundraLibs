/**
 * JWT Performance Benchmarks
 *
 * Benchmarks for measuring JWT token creation and verification performance
 * across different algorithms and payload sizes, including RSA algorithms,
 * token refresh, and decoding operations.
 */

import {
  issueJWT,
  type JWTAlgorithm,
  type JWTPayload,
  verifyJWT,
} from './mod.ts';
import { decodeJWT, refreshJWT } from './helpers.ts';
import { generateRSAKeyPair } from '../generators/key.ts';

// Test secret for benchmarking
const BENCH_SECRET =
  'benchmark-secret-key-for-testing-jwt-performance-must-be-long-enough';

// Generate RSA keys for benchmarking (done once at module load)
const RSA_KEYS = await generateRSAKeyPair({
  algorithm: 'RSA-PSS',
  keySize: 2048,
  hashAlgorithm: 'SHA-256',
  format: 'PEM',
  extractable: true,
});

const RSA_PRIVATE_KEY = RSA_KEYS.privateKeyExported as string;
const RSA_PUBLIC_KEY = RSA_KEYS.publicKeyExported as string;

// Small payload for basic testing
const SMALL_PAYLOAD: JWTPayload = {
  sub: 'user123',
  iss: 'auth.example.com',
  aud: 'api.example.com',
  exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
};

// Medium payload with more claims
const MEDIUM_PAYLOAD: JWTPayload = {
  sub: 'user123',
  iss: 'auth.example.com',
  aud: ['api.example.com', 'web.example.com', 'mobile.example.com'],
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  nbf: Math.floor(Date.now() / 1000),
  jti: 'unique-token-id-12345',
  role: 'admin',
  permissions: ['read', 'write', 'delete', 'admin'],
  metadata: {
    department: 'engineering',
    team: 'backend',
    location: 'remote',
  },
};

// Large payload with extensive data
const LARGE_PAYLOAD: JWTPayload = {
  sub: 'user123',
  iss: 'auth.example.com',
  aud: [
    'api.example.com',
    'web.example.com',
    'mobile.example.com',
    'dashboard.example.com',
  ],
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  nbf: Math.floor(Date.now() / 1000),
  jti: 'unique-token-id-12345-with-longer-identifier',
  role: 'admin',
  permissions: [
    'read',
    'write',
    'delete',
    'admin',
    'configure',
    'monitor',
    'audit',
    'backup',
    'restore',
    'deploy',
    'scale',
    'debug',
  ],
  metadata: {
    department: 'engineering',
    team: 'backend',
    location: 'remote',
    timezone: 'UTC',
    preferences: {
      theme: 'dark',
      language: 'en',
      notifications: {
        email: true,
        push: false,
        sms: true,
      },
    },
    projects: [
      { id: 'proj1', name: 'Authentication Service', role: 'lead' },
      { id: 'proj2', name: 'API Gateway', role: 'contributor' },
      { id: 'proj3', name: 'Monitoring Dashboard', role: 'reviewer' },
    ],
  },
  customClaims: {
    sessionId: 'sess_abc123def456ghi789',
    clientInfo: {
      userAgent: 'Mozilla/5.0 (compatible; BenchmarkClient/1.0)',
      ip: '192.168.1.100',
      platform: 'web',
    },
  },
};

// Pre-generated tokens for verification benchmarks
let smallTokenHS256: string;
let mediumTokenHS256: string;
let largeTokenHS256: string;
let smallTokenHS384: string;
let smallTokenHS512: string;
let smallTokenRS256: string;

// Setup tokens before benchmarks
const setupTokens = async () => {
  smallTokenHS256 = await issueJWT('HS256', SMALL_PAYLOAD, BENCH_SECRET);
  mediumTokenHS256 = await issueJWT('HS256', MEDIUM_PAYLOAD, BENCH_SECRET);
  largeTokenHS256 = await issueJWT('HS256', LARGE_PAYLOAD, BENCH_SECRET);
  smallTokenHS384 = await issueJWT('HS384', SMALL_PAYLOAD, BENCH_SECRET);
  smallTokenHS512 = await issueJWT('HS512', SMALL_PAYLOAD, BENCH_SECRET);
  smallTokenRS256 = await issueJWT('RS256', SMALL_PAYLOAD, RSA_PRIVATE_KEY);
};

// Initialize tokens
await setupTokens();

// ============================================================================
// JWT Creation Benchmarks
// ============================================================================

Deno.bench({
  name: 'crypt.JWT - Issue HS256 (small payload)',
  fn: async () => {
    await issueJWT('HS256', SMALL_PAYLOAD, BENCH_SECRET);
  },
});

Deno.bench({
  name: 'crypt.JWT - Issue HS384 (small payload)',
  fn: async () => {
    await issueJWT('HS384', SMALL_PAYLOAD, BENCH_SECRET);
  },
});

Deno.bench({
  name: 'crypt.JWT - Issue HS512 (small payload)',
  fn: async () => {
    await issueJWT('HS512', SMALL_PAYLOAD, BENCH_SECRET);
  },
});

Deno.bench({
  name: 'crypt.JWT - Issue HS256 (medium payload)',
  fn: async () => {
    await issueJWT('HS256', MEDIUM_PAYLOAD, BENCH_SECRET);
  },
});

Deno.bench({
  name: 'crypt.JWT - Issue HS256 (large payload)',
  fn: async () => {
    await issueJWT('HS256', LARGE_PAYLOAD, BENCH_SECRET);
  },
});

// ============================================================================
// JWT Verification Benchmarks
// ============================================================================

Deno.bench({
  name: 'crypt.JWT - Verify HS256 (small payload)',
  fn: async () => {
    await verifyJWT(smallTokenHS256, BENCH_SECRET);
  },
});

Deno.bench({
  name: 'crypt.JWT - Verify HS384 (small payload)',
  fn: async () => {
    await verifyJWT(smallTokenHS384, BENCH_SECRET);
  },
});

Deno.bench({
  name: 'crypt.JWT - Verify HS512 (small payload)',
  fn: async () => {
    await verifyJWT(smallTokenHS512, BENCH_SECRET);
  },
});

Deno.bench({
  name: 'crypt.JWT - Verify HS256 (medium payload)',
  fn: async () => {
    await verifyJWT(mediumTokenHS256, BENCH_SECRET);
  },
});

Deno.bench({
  name: 'crypt.JWT - Verify HS256 (large payload)',
  fn: async () => {
    await verifyJWT(largeTokenHS256, BENCH_SECRET);
  },
});

// ============================================================================
// JWT Verification with Options Benchmarks
// ============================================================================

Deno.bench({
  name: 'crypt.JWT - Verify with audience validation',
  fn: async () => {
    await verifyJWT(smallTokenHS256, BENCH_SECRET, {
      aud: 'api.example.com',
    });
  },
});

Deno.bench({
  name: 'crypt.JWT - Verify with issuer validation',
  fn: async () => {
    await verifyJWT(smallTokenHS256, BENCH_SECRET, {
      iss: 'auth.example.com',
    });
  },
});

Deno.bench({
  name: 'crypt.JWT - Verify with full validation',
  fn: async () => {
    await verifyJWT(smallTokenHS256, BENCH_SECRET, {
      aud: 'api.example.com',
      iss: 'auth.example.com',
      maxAge: 3600,
      clockTolerance: 30,
    });
  },
});

// ============================================================================
// Round-trip Benchmarks (Issue + Verify)
// ============================================================================

Deno.bench({
  name: 'crypt.JWT - Round-trip HS256 (small)',
  fn: async () => {
    const token = await issueJWT('HS256', SMALL_PAYLOAD, BENCH_SECRET);
    await verifyJWT(token, BENCH_SECRET);
  },
});

Deno.bench({
  name: 'crypt.JWT - Round-trip HS384 (small)',
  fn: async () => {
    const token = await issueJWT('HS384', SMALL_PAYLOAD, BENCH_SECRET);
    await verifyJWT(token, BENCH_SECRET);
  },
});

Deno.bench({
  name: 'crypt.JWT - Round-trip HS512 (small)',
  fn: async () => {
    const token = await issueJWT('HS512', SMALL_PAYLOAD, BENCH_SECRET);
    await verifyJWT(token, BENCH_SECRET);
  },
});

Deno.bench({
  name: 'crypt.JWT - Round-trip HS256 (medium)',
  fn: async () => {
    const token = await issueJWT('HS256', MEDIUM_PAYLOAD, BENCH_SECRET);
    await verifyJWT(token, BENCH_SECRET);
  },
});

Deno.bench({
  name: 'crypt.JWT - Round-trip HS256 (large)',
  fn: async () => {
    const token = await issueJWT('HS256', LARGE_PAYLOAD, BENCH_SECRET);
    await verifyJWT(token, BENCH_SECRET);
  },
});

// ============================================================================
// Algorithm Comparison Benchmarks
// ============================================================================

const algorithms: JWTAlgorithm[] = ['HS256', 'HS384', 'HS512'];

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
  name: 'crypt.JWT - Batch create 10 tokens',
  fn: async () => {
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        issueJWT('HS256', { ...SMALL_PAYLOAD, sub: `user${i}` }, BENCH_SECRET),
      );
    }
    await Promise.all(promises);
  },
});

Deno.bench({
  name: 'crypt.JWT - Batch verify 10 tokens',
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
  const smallToken = await issueJWT('HS256', SMALL_PAYLOAD, BENCH_SECRET);
  const mediumToken = await issueJWT('HS256', MEDIUM_PAYLOAD, BENCH_SECRET);
  const largeToken = await issueJWT('HS256', LARGE_PAYLOAD, BENCH_SECRET);

  console.log('\n=== JWT Token Size Analysis ===');
  console.log(`Small payload token size: ${smallToken.length} characters`);
  console.log(`Medium payload token size: ${mediumToken.length} characters`);
  console.log(`Large payload token size: ${largeToken.length} characters`);
  console.log('================================\n');
};

// ============================================================================
// RSA Algorithm Benchmarks
// ============================================================================

Deno.bench({
  name: 'crypt.JWT - Issue RS256 (small payload)',
  fn: async () => {
    await issueJWT('RS256', SMALL_PAYLOAD, RSA_PRIVATE_KEY);
  },
});

Deno.bench({
  name: 'crypt.JWT - Issue RS384 (small payload)',
  fn: async () => {
    await issueJWT('RS384', SMALL_PAYLOAD, RSA_PRIVATE_KEY);
  },
});

Deno.bench({
  name: 'crypt.JWT - Issue RS512 (small payload)',
  fn: async () => {
    await issueJWT('RS512', SMALL_PAYLOAD, RSA_PRIVATE_KEY);
  },
});

Deno.bench({
  name: 'crypt.JWT - Verify RS256 (small payload)',
  fn: async () => {
    await verifyJWT(smallTokenRS256, RSA_PUBLIC_KEY);
  },
});

Deno.bench({
  name: 'crypt.JWT - Round-trip RS256 (small)',
  fn: async () => {
    const token = await issueJWT('RS256', SMALL_PAYLOAD, RSA_PRIVATE_KEY);
    await verifyJWT(token, RSA_PUBLIC_KEY);
  },
});

// ============================================================================
// Decode JWT Benchmarks
// ============================================================================

Deno.bench({
  name: 'crypt.JWT - Decode HS256 (small payload)',
  fn: () => {
    decodeJWT(smallTokenHS256);
  },
});

Deno.bench({
  name: 'crypt.JWT - Decode HS256 (medium payload)',
  fn: () => {
    decodeJWT(mediumTokenHS256);
  },
});

Deno.bench({
  name: 'crypt.JWT - Decode HS256 (large payload)',
  fn: () => {
    decodeJWT(largeTokenHS256);
  },
});

Deno.bench({
  name: 'crypt.JWT - Decode RS256 (small payload)',
  fn: () => {
    decodeJWT(smallTokenRS256);
  },
});

// ============================================================================
// Refresh JWT Benchmarks
// ============================================================================

Deno.bench({
  name: 'crypt.JWT - Refresh HS256 token',
  fn: async () => {
    await refreshJWT(smallTokenHS256, BENCH_SECRET, 3600);
  },
});

Deno.bench({
  name: 'crypt.JWT - Refresh RS256 token',
  fn: async () => {
    await refreshJWT(smallTokenRS256, {
      verifyKey: RSA_PUBLIC_KEY,
      signKey: RSA_PRIVATE_KEY,
    }, 3600);
  },
});

Deno.bench({
  name: 'crypt.JWT - Refresh with custom expiry',
  fn: async () => {
    await refreshJWT(smallTokenHS256, BENCH_SECRET, 7200);
  },
});

// ============================================================================
// HMAC vs RSA Comparison
// ============================================================================

Deno.bench({
  name: 'crypt.JWT - HMAC vs RSA: HS256 create',
  fn: async () => {
    await issueJWT('HS256', SMALL_PAYLOAD, BENCH_SECRET);
  },
});

Deno.bench({
  name: 'crypt.JWT - HMAC vs RSA: RS256 create',
  fn: async () => {
    await issueJWT('RS256', SMALL_PAYLOAD, RSA_PRIVATE_KEY);
  },
});

Deno.bench({
  name: 'crypt.JWT - HMAC vs RSA: HS256 verify',
  fn: async () => {
    await verifyJWT(smallTokenHS256, BENCH_SECRET);
  },
});

Deno.bench({
  name: 'crypt.JWT - HMAC vs RSA: RS256 verify',
  fn: async () => {
    await verifyJWT(smallTokenRS256, RSA_PUBLIC_KEY);
  },
});

// Run size analysis if this file is executed directly
if (import.meta.main) {
  await analyzeTokenSizes();
}
