import { describe, test, expect } from "bun:test";
import { signSessionId, verifyAndExtractSessionId } from "../src/server/auth.ts";

describe("Session Signing", () => {
  test("signSessionId produces consistent signatures", () => {
    const sessionId = "test-session-123";
    const signed1 = signSessionId(sessionId);
    const signed2 = signSessionId(sessionId);

    expect(signed1).toBe(signed2);
    expect(signed1).toContain(sessionId);
    expect(signed1).toContain(".");
  });

  test("signSessionId format is sessionId.signature", () => {
    const sessionId = "abc123";
    const signed = signSessionId(sessionId);

    const parts = signed.split(".");
    expect(parts.length).toBe(2);
    expect(parts[0]).toBe(sessionId);
    expect(parts[1]).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex = 64 chars
  });

  test("verifyAndExtractSessionId returns sessionId for valid signature", () => {
    const sessionId = "valid-session-456";
    const signed = signSessionId(sessionId);

    const extracted = verifyAndExtractSessionId(signed);
    expect(extracted).toBe(sessionId);
  });

  test("verifyAndExtractSessionId returns null for tampered signature", () => {
    const sessionId = "session-to-tamper";
    const signed = signSessionId(sessionId);

    // Tamper with the signature
    const tampered = signed.slice(0, -1) + "0";

    expect(verifyAndExtractSessionId(tampered)).toBeNull();
  });

  test("verifyAndExtractSessionId returns null for tampered sessionId", () => {
    const sessionId = "original-session";
    const signed = signSessionId(sessionId);

    // Replace session ID but keep signature
    const parts = signed.split(".");
    const tampered = `different-session.${parts[1]}`;

    expect(verifyAndExtractSessionId(tampered)).toBeNull();
  });

  test("verifyAndExtractSessionId returns null for missing signature", () => {
    expect(verifyAndExtractSessionId("session-without-signature")).toBeNull();
  });

  test("verifyAndExtractSessionId returns null for empty string", () => {
    expect(verifyAndExtractSessionId("")).toBeNull();
  });

  test("verifyAndExtractSessionId returns null for malformed input", () => {
    expect(verifyAndExtractSessionId("too.many.dots")).toBeNull();
    expect(verifyAndExtractSessionId(".")).toBeNull();
    expect(verifyAndExtractSessionId("session.")).toBeNull();
    expect(verifyAndExtractSessionId(".signature")).toBeNull();
  });

  test("verifyAndExtractSessionId returns null for invalid hex signature", () => {
    // Non-hex characters in signature
    expect(verifyAndExtractSessionId("session.zzzznotvalidhex")).toBeNull();
  });

  test("verifyAndExtractSessionId handles special characters in session ID", () => {
    const sessionId = "session-with-special_chars123";
    const signed = signSessionId(sessionId);

    expect(verifyAndExtractSessionId(signed)).toBe(sessionId);
  });

  test("different session IDs produce different signatures", () => {
    const signed1 = signSessionId("session-1");
    const signed2 = signSessionId("session-2");

    const sig1 = signed1.split(".")[1];
    const sig2 = signed2.split(".")[1];

    expect(sig1).not.toBe(sig2);
  });
});
