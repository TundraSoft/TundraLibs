import { SyslogSeverities } from "@tundralibs/utils";
import { SlogObject } from "../types/mod.ts";
import {
  compactFormat,
  detailedFormat,
  jsonFormatter,
  keyValueFormat,
  maskingFormatter,
  MaskingStrategy,
  minimalistFormat,
  simpleFormatter,
  standardFormat,
} from "./mod.ts";

// Helper to create a standard log object for benchmarking
const makeLogObject = (
  message: string,
  context: Record<string, unknown> = {},
): SlogObject => ({
  id: "12345",
  appName: "benchApp",
  hostname: "benchmark-host",
  levelName: "INFO",
  level: SyslogSeverities.INFO,
  context,
  message,
  date: new Date("2023-01-01T12:00:00Z"),
  isoDate: "2023-01-01T12:00:00.000Z",
  timestamp: 1672574400000,
});

// Simple message for basic benchmarks
const simpleMessage = "This is a benchmark log message";
const simpleLog = makeLogObject(simpleMessage);

// Complex log with rich context for advanced benchmarks
const complexLog = makeLogObject("Complex benchmark operation completed", {
  user: { id: 12345, name: "John Doe", email: "john@example.com" },
  request: {
    method: "POST",
    url: "/api/v1/users/12345/profile",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer token123",
    },
    body: {
      name: "John Doe Updated",
      preferences: { theme: "dark", notifications: true },
    },
  },
  response: { status: 200, duration: 145.67, size: 2048 },
  performance: { cpuUsage: 12.5, memoryUsage: 256.7, diskIO: 1024 },
  metadata: {
    version: "2.1.0",
    environment: "production",
    region: "us-east-1",
  },
});

// Benchmark simple string formatters
Deno.bench({
  name: "slogger.String Formatter Standard - Format",
  fn() {
    standardFormat(simpleLog);
  },
});

Deno.bench({
  name: "slogger.String Formatter Detailed - Format",
  fn() {
    detailedFormat(simpleLog);
  },
});

Deno.bench({
  name: "slogger.String Formatter Compact - Format",
  fn() {
    compactFormat(simpleLog);
  },
});

Deno.bench({
  name: "slogger.String Formatter Minimalist - Format",
  fn() {
    minimalistFormat(simpleLog);
  },
});

Deno.bench({
  name: "slogger.String Formatter - Key-Value Format",
  fn() {
    keyValueFormat(simpleLog);
  },
});

// Benchmark JSON formatter
Deno.bench({
  name: "slogger.JSON Formatter Simple - Log",
  fn() {
    jsonFormatter(simpleLog);
  },
});

Deno.bench({
  name: "slogger.JSON Formatter Complex - Log",
  fn() {
    jsonFormatter(complexLog);
  },
});

// Benchmark masking formatter
Deno.bench({
  name: "slogger.Masking Formatter Default - Masking",
  fn() {
    const formatter = maskingFormatter();
    formatter(complexLog);
  },
});

Deno.bench({
  name: "slogger.Masking Formatter Aggressive - Masking",
  fn() {
    const formatter = maskingFormatter({
      sensitiveFields: ["user", "request", "response", "metadata"],
      strategy: MaskingStrategy.FULL,
    });
    formatter(complexLog);
  },
});

// Benchmark with large string formatting
Deno.bench({
  name: "slogger.String Formatter Large - Message (1KB)",
  fn() {
    const largeMessage = "X".repeat(1024); // 1KB message
    const largeLog = makeLogObject(largeMessage);
    standardFormat(largeLog);
  },
});

// Benchmark template variable replacement performance
Deno.bench({
  name: "slogger.String Formatter Complex - Template",
  fn() {
    const complexTemplate =
      "${timestamp} ${hostname}:${appName}[${id}] ${levelName}: ${message} | Context: ${context} | Date: ${date} | ISO: ${isoDate}";
    const formatter = simpleFormatter(complexTemplate);
    formatter(complexLog);
  },
});

// Benchmark custom formatter function vs template
Deno.bench({
  name: "slogger.Custom Formatter Function vs - Template",
  fn() {
    const customFormatter = (log: SlogObject): string => {
      return `${log.timestamp} ${log.hostname}:${log.appName}[${log.id}] ${log.levelName}: ${log.message}`;
    };
    customFormatter(simpleLog);
  },
});

// Benchmark different formatter efficiency
Deno.bench({
  name: "slogger.Binary vs JSON vs String Complex - Log",
  fn() {
    // Test each formatter type for comparison
    jsonFormatter(complexLog);
    detailedFormat(complexLog);
  },
});
