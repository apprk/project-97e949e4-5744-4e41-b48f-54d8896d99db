import { useEffect, useState } from "react";
import { Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { normalizeMaintenance } from "@/lib/maintenance";
import { readAllPages } from "@/lib/schedule-import";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { DisplaySettings, EquipmentName } from "./RecordEditor";

type Account={id:string;name:string};
export function MaintenanceSettings({names,reload}:{names:EquipmentName[];reload:()=>Promise<void>}) {
  const {isAdmin}=useAuth();
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [settings,setSettings]=useState<Record<string,DisplaySettings>>({});
  const [newName,setNewName]=useState("");
  const [edits,setEdits]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  useEffect(()=>{if(!isAdmin)return;void (async()=>{const [profiles,rows]=await Promise.all([readAllPages<Account>((from,to)=>supabase.from("profiles").select("id,name").is("disabled_at",null).order("id").range(from,to)),readAllPages<{user_id:string;show_name:boolean;show_assignee:boolean}>((from,to)=>supabase.from("equipment_display_settings").select("user_id,show_name,show_assignee").order("user_id").range(from,to))]);setAccounts(profiles);setSettings(Object.fromEntries(rows.map(s=>[s.user_id,{show_name:s.show_name,show_assignee:s.show_assignee}])));})().catch(()=>toast.error("設定を読み込めませんでした"));},[isAdmin]);
  if(!isAdmin)return null;
  const save=async()=>{setBusy(true);try{const {error}=await supabase.from("equipment_display_settings").upsert(accounts.map(a=>({user_id:a.id,...(settings[a.id]??{show_name:true,show_assignee:true})})));if(error)throw error;await reload();toast.success("表示設定を保存しました");}catch{toast.error("保存できませんでした");}finally{setBusy(false);}};
  const saveName=async(id?:string)=>{const name=(id?edits[id]:newName)?.trim();if(!name)return;if(names.some(n=>n.id!==id&&normalizeMaintenance(n.name)===normalizeMaintenance(name))){toast.error("同じ設備名が登録されています");return;}setBusy(true);try{const {error}=id?await supabase.from("equipment_names").update({name}).eq("id",id):await supabase.from("equipment_names").insert({name});if(error)throw error;setNewName("");await reload();toast.success("設備名を保存しました");}catch{toast.error("設備名を保存できませんでした");}finally{setBusy(false);}};
  return <div className="space-y-8"><section><h2 className="mb-4 text-lg font-bold">アカウント別の表示</h2><div className="divide-y divide-border">{accounts.map(a=>{const current=settings[a.id]??{show_name:true,show_assignee:true};return <div key={a.id} className="flex flex-wrap items-center justify-between gap-4 py-3"><span className="font-medium">{a.name}</span><div className="flex gap-5"><Label className="flex items-center gap-2"><Checkbox checked={current.show_name} onCheckedChange={v=>setSettings(prev=>({...prev,[a.id]:{...current,show_name:v===true}}))}/>設備名</Label><Label className="flex items-center gap-2"><Checkbox checked={current.show_assignee} onCheckedChange={v=>setSettings(prev=>({...prev,[a.id]:{...current,show_assignee:v===true}}))}/>担当</Label></div></div>;})}</div><Button className="mt-4" disabled={busy} onClick={()=>void save()}><Save className="size-4"/>表示設定を保存</Button></section><section><h2 className="mb-4 text-lg font-bold">設備名マスタ</h2><div className="space-y-2">{names.map(n=><div key={n.id} className="flex gap-2"><Input aria-label={`${n.name}の設備名`} value={edits[n.id]??n.name} onChange={e=>setEdits(prev=>({...prev,[n.id]:e.target.value}))}/><Button variant="outline" disabled={busy||!(edits[n.id]?.trim())} onClick={()=>void saveName(n.id)}><Save className="size-4"/>保存</Button></div>)}</div><div className="mt-4 flex gap-2"><Input aria-label="新しい設備名" placeholder="設備名" value={newName} onChange={e=>setNewName(e.target.value)}/><Button disabled={busy||!newName.trim()} onClick={()=>void saveName()}><Plus className="size-4"/>登録</Button></div></section></div>;
}
