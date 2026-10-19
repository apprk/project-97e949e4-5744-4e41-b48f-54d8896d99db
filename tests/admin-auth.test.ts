import { describe, expect, test } from "bun:test";
import {validAdminPassword,retentionExpiry} from "../src/lib/admin-password";
describe("administrator password and retention",()=>{
 test("letters and digits are required",()=>{expect(validAdminPassword("admin2026")).toBe(true);expect(validAdminPassword("Abc12345")).toBe(true);expect(validAdminPassword("K0r3n!")).toBe(true);expect(validAdminPassword("abcdef")).toBe(false);expect(validAdminPassword("12345678")).toBe(false);});
 test("four-digit PIN is not an administrator password",()=>{expect(validAdminPassword("0000")).toBe(false);expect(validAdminPassword("1234")).toBe(false);});
 test("no fixed password length or uppercase requirement",()=>{expect(validAdminPassword("a12345")).toBe(true);expect(validAdminPassword("administrator2026-long-password")).toBe(true);});
 test("retention uses exact day boundaries",()=>{expect(retentionExpiry(1,1000)).toBe(86401000);expect(retentionExpiry(7,1000)).toBe(604801000);expect(retentionExpiry(30,1000)).toBe(2592001000);});
});