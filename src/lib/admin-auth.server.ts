import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyDeviceToken(token: string | null) {
  const secret = process.env["GATE_SECRET"];
  if (!secret || !token) throw new Error("初期認証が必要です");
  const expected = createHmac("sha256", secret).update("sanjo-gate-v1").digest("hex");
  const a = Buffer.from(token); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a,b)) throw new Error("初期認証が必要です");
}
export function passwordClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("認証を利用できません");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>{
    const headers=new Headers(init?.headers);
    if(key.startsWith("sb_") && headers.get("Authorization")===`Bearer ${key}`)headers.delete("Authorization");
    headers.set("apikey",key);return fetch(input,{...init,headers});
  }}});
}
export function sessionId(token: string): string {
  const payload=JSON.parse(Buffer.from(token.split(".")[1] ?? "","base64url").toString());
  if(typeof payload.session_id!=="string")throw new Error("認証をやり直してください");
  return payload.session_id;
}