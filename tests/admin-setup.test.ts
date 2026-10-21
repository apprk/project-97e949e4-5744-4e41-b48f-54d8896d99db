import { describe, expect, test } from "bun:test";
import { adminSetupSchema, initialSetupAllowed } from "../src/lib/admin-setup";

describe("destination-only initial administrator setup", () => {
  test("new installation needs explicit enablement", () => {
    expect(initialSetupAllowed("true", false, false)).toBe(true);
    expect(initialSetupAllowed(undefined, false, false)).toBe(false);
  });
  test("existing administrator cannot be bypassed", () => {
    expect(initialSetupAllowed("true", true, false)).toBe(false);
  });
  test("claimed or completed setup never reopens", () => {
    expect(initialSetupAllowed("true", false, true)).toBe(false);
  });
  test("owner chooses their ID and password without prior credentials", () => {
    expect(adminSetupSchema.safeParse({ token: null, slug: "my-admin", password: "MyPass2026" }).success).toBe(true);
    expect(adminSetupSchema.safeParse({ token: null, slug: "", password: "MyPass2026" }).success).toBe(false);
    expect(adminSetupSchema.safeParse({ token: null, slug: "my-admin", password: "0000" }).success).toBe(false);
  });
});