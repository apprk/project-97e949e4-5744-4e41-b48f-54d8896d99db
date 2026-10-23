import { describe, expect, test } from "bun:test";
import { equipmentReadOnly, assertNormalMode } from "../src/lib/equipment-view";

describe("equipment monitoring boundaries", () => {
  test("administrator can edit general target", () => expect(equipmentReadOnly("admin", "general", true)).toBe(false));
  test("general target is read-only", () => expect(equipmentReadOnly("general1", "general2", false)).toBe(true));
  test("own equipment remains editable", () => expect(equipmentReadOnly("general1", "general1", false)).toBe(false));
  test("active monitoring blocks other server modes", async () => {
    await expect(assertNormalMode({ rpc: async () => ({ data: true, error: null }) })).rejects.toThrow("切替を解除");
  });
  test("released monitoring permits other modes", async () => {
    await expect(assertNormalMode({ rpc: async () => ({ data: false, error: null }) })).resolves.toBeUndefined();
  });
  test("failed permission reads fail closed", async () => {
    await expect(assertNormalMode({ rpc: async () => ({ data: null, error: new Error("offline") }) })).rejects.toThrow();
  });
});