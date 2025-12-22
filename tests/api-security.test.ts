import { describe, test, expect } from "bun:test";
import { z } from "zod";

// Entry ID validation (mirrors the logic in api.ts)
const ENTRY_ID_PATTERN = /^[a-zA-Z0-9-]+$/;

function isValidEntryId(id: string): boolean {
  return ENTRY_ID_PATTERN.test(id) && id.length > 0 && id.length <= 100;
}

// Update entry schema (mirrors the schema in api.ts)
const UpdateEntrySchema = z.object({
  title: z.string().optional(),
  transcript: z.string().optional(),
  audio_path: z.string().optional(),
  audio_duration_seconds: z.number().optional(),
  status: z.enum(["pending_transcription", "transcribed", "analyzed"]).optional(),
  analysis_json: z.string().optional(),
  follow_up_questions: z.string().optional(),
}).strict();

describe("Entry ID Validation (Path Traversal Prevention)", () => {
  test("accepts valid entry IDs", () => {
    // Standard generated IDs
    expect(isValidEntryId("1703123456789-abc123def")).toBe(true);
    expect(isValidEntryId("1703123456789-xyz789")).toBe(true);

    // Simple alphanumeric
    expect(isValidEntryId("entry-123")).toBe(true);
    expect(isValidEntryId("test")).toBe(true);
    expect(isValidEntryId("123")).toBe(true);
  });

  test("rejects path traversal attempts", () => {
    // Directory traversal
    expect(isValidEntryId("../../../etc/passwd")).toBe(false);
    expect(isValidEntryId("..")).toBe(false);
    expect(isValidEntryId("./test")).toBe(false);

    // Absolute paths
    expect(isValidEntryId("/etc/passwd")).toBe(false);
    expect(isValidEntryId("/tmp/malicious")).toBe(false);

    // Windows-style paths
    expect(isValidEntryId("C:\\Windows\\System32")).toBe(false);
    expect(isValidEntryId("..\\..\\etc")).toBe(false);
  });

  test("rejects special characters", () => {
    expect(isValidEntryId("entry;rm -rf /")).toBe(false);
    expect(isValidEntryId("entry`whoami`")).toBe(false);
    expect(isValidEntryId("entry$(cat /etc/passwd)")).toBe(false);
    expect(isValidEntryId("entry\x00null")).toBe(false);
    expect(isValidEntryId("entry with spaces")).toBe(false);
    expect(isValidEntryId("entry\n")).toBe(false);
  });

  test("rejects empty and overly long IDs", () => {
    expect(isValidEntryId("")).toBe(false);
    expect(isValidEntryId("a".repeat(101))).toBe(false);
  });

  test("accepts maximum length ID", () => {
    expect(isValidEntryId("a".repeat(100))).toBe(true);
  });
});

describe("PATCH Entry Schema Validation (SQL Injection Prevention)", () => {
  test("accepts valid update fields", () => {
    const result = UpdateEntrySchema.safeParse({
      title: "My Entry",
      transcript: "This is a transcript",
      status: "transcribed",
    });
    expect(result.success).toBe(true);
  });

  test("accepts empty object", () => {
    const result = UpdateEntrySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  test("accepts all valid fields", () => {
    const result = UpdateEntrySchema.safeParse({
      title: "Title",
      transcript: "Transcript",
      audio_path: "/path/to/audio.webm",
      audio_duration_seconds: 120.5,
      status: "analyzed",
      analysis_json: '{"key": "value"}',
      follow_up_questions: '["Q1", "Q2"]',
    });
    expect(result.success).toBe(true);
  });

  test("rejects unknown fields (SQL injection attempt)", () => {
    // Attempt to inject a SQL column name
    const result = UpdateEntrySchema.safeParse({
      title: "Valid title",
      "id = ''; DROP TABLE entries; --": "malicious",
    });
    expect(result.success).toBe(false);
  });

  test("rejects SQL injection in field names", () => {
    const sqlInjectionAttempts = [
      { "1=1; --": "value" },
      { "id": "value" },
      { "extra_field": "injection" },
      { "status; DROP TABLE entries": "analyzed" },
      { "created_at": "2024-01-01" }, // Column exists but shouldn't be updatable
    ];

    for (const attempt of sqlInjectionAttempts) {
      const result = UpdateEntrySchema.safeParse(attempt);
      expect(result.success).toBe(false);
    }
  });

  test("validates status enum values", () => {
    // Valid statuses
    expect(UpdateEntrySchema.safeParse({ status: "pending_transcription" }).success).toBe(true);
    expect(UpdateEntrySchema.safeParse({ status: "transcribed" }).success).toBe(true);
    expect(UpdateEntrySchema.safeParse({ status: "analyzed" }).success).toBe(true);

    // Invalid status
    expect(UpdateEntrySchema.safeParse({ status: "invalid_status" }).success).toBe(false);
    expect(UpdateEntrySchema.safeParse({ status: "" }).success).toBe(false);
  });

  test("validates field types", () => {
    // Wrong types
    expect(UpdateEntrySchema.safeParse({ title: 123 }).success).toBe(false);
    expect(UpdateEntrySchema.safeParse({ audio_duration_seconds: "not a number" }).success).toBe(false);
    expect(UpdateEntrySchema.safeParse({ transcript: null }).success).toBe(false);
  });
});
