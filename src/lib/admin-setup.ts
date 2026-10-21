import { z } from "zod";
import { validAdminPassword } from "./admin-password";

export const adminSetupSchema = z.object({
  token: z.string().max(200).nullable(),
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9_-]+$/, "IDは半角小文字・数字・ハイフン・下線で入力してください"),
  password: z.string().max(1000).refine(validAdminPassword, "パスワードは英字と数字を含む6文字以上で入力してください"),
});

export function initialSetupAllowed(enabled: string | undefined, adminExists: boolean, claimed: boolean) {
  return enabled === "true" && !adminExists && !claimed;
}