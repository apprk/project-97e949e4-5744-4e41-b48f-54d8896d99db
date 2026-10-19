import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { normalizeMaintenance, type CycleUnit, type Maintenance } from "@/lib/maintenance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type DisplaySettings={show_name:boolean;show_assignee:boolean};
export type EquipmentName={id:string;name:string};
export function blankMaintenance(name=""):Maintenance{return {id:"",user_id:"",name,repair_content:"",assignee:null,cycle_value:null,cycle_unit:null,planned_on:null,stopped:false,after_breakdown:false,created_at:""};}
export function RecordEditor({ record, names, display, reload, onSaved, onHistory }: {record:Maintenance;names:EquipmentName[];display:DisplaySettings;reload:()=>Promise<void>;onSaved?:()=>void;onHistory?:(r:Maintenance)=>void}) {
  const {session}=useAuth();
  const [draft,setDraft]=useState(record);
  const [busy,setBusy]=useState(false);
  const [suggest,setSuggest]=useState(false);
  useEffect(()=>setDraft(record),[record]);
  const field=<K extends keyof Maintenance>(key:K,value:Maintenance[K])=>setDraft(prev=>({...prev,[key]:value}));
  const save=async()=>{
    if(!session||!draft.repair_content.trim()){toast.error("修理内容を入力してください");return;}
    if(draft.cycle_value!==null && (!Number.isInteger(draft.cycle_value)||draft.cycle_value<1||!draft.cycle_unit)){toast.error("周期は1以上の整数と単位を指定してください");return;}
    setBusy(true);
    try{
      const payload={name:draft.name,repair_content:draft.repair_content.trim(),assignee:draft.assignee,planned_on:draft.planned_on||null,cycle_value:draft.cycle_value,cycle_unit:draft.cycle_value?draft.cycle_unit:null,stopped:draft.stopped,after_breakdown:draft.after_breakdown};
      const {data,error}=draft.id?await supabase.from("equipment").update(payload).eq("id",draft.id).select("id").single():await supabase.from("equipment").insert({...payload,user_id:session.user.id}).select("id").single();
      if(error||!data)throw error??new Error("保存結果がありません");
      if(!draft.id){setDraft(blankMaintenance(record.name));onSaved?.();}
      await reload();toast.success("保存しました");
    }catch{toast.error("保存に失敗しました");}finally{setBusy(false);}
  };
  const remove=async()=>{if(!confirm("この修理内容をごみ箱へ移動しますか？"))return;setBusy(true);const {data,error}=await supabase.from("equipment").update({deleted_at:new Date().toISOString()}).eq("id",draft.id).select("id");if(error||!data?.length)toast.error("移動できませんでした");else{await reload();toast.success("ごみ箱へ移動しました");}setBusy(false);};
  const candidates=names.filter(n=>normalizeMaintenance(n.name).includes(normalizeMaintenance(draft.name))).slice(0,8);
  const suffix=draft.id||"new";
  return <article className="border-b border-border py-5" data-record={draft.id||"new"}>
    <div className="mb-3 flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{draft.id?new Date(draft.created_at).toLocaleDateString("ja-JP"):"新しい修理内容"}</span>{draft.id&&onHistory?<Button variant="outline" size="sm" onClick={()=>onHistory(draft)}>実施履歴・追加</Button>:null}</div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-1 sm:col-span-2 lg:col-span-3"><Label htmlFor={`repair-${suffix}`}>修理内容 <span className="text-destructive">必須</span></Label><Input id={`repair-${suffix}`} value={draft.repair_content} onChange={e=>field("repair_content",e.target.value)} required/></div>
      {display.show_name?<div className="relative space-y-1"><Label htmlFor={`name-${suffix}`}>設備名</Label><Input id={`name-${suffix}`} value={draft.name} onChange={e=>{field("name",e.target.value);setSuggest(true);}} onFocus={()=>setSuggest(true)} onBlur={()=>setTimeout(()=>setSuggest(false),150)} autoComplete="off"/>{suggest&&draft.name&&candidates.length?<div className="absolute left-0 top-full z-30 w-full border border-border bg-popover p-1 shadow-md">{candidates.map(n=><Button key={n.id} variant="ghost" className="w-full justify-start" onMouseDown={e=>e.preventDefault()} onClick={()=>{field("name",n.name);setSuggest(false);}}>{n.name}</Button>)}</div>:null}</div>:null}
      {display.show_assignee?<div className="space-y-1"><Label htmlFor={`assignee-${suffix}`}>担当</Label><Input id={`assignee-${suffix}`} value={draft.assignee??""} onChange={e=>field("assignee",e.target.value)}/></div>:null}
      <div className="space-y-1"><Label htmlFor={`cycle-${suffix}`}>周期</Label><div className="flex gap-2"><Input id={`cycle-${suffix}`} className="min-w-0 flex-1" type="number" min={1} step={1} value={draft.cycle_value??""} onChange={e=>{field("cycle_value",e.target.value?Number(e.target.value):null);if(e.target.value&&!draft.cycle_unit)field("cycle_unit","year");}}/><Select value={draft.cycle_unit??"none"} onValueChange={v=>field("cycle_unit",v==="none"?null:v as CycleUnit)}><SelectTrigger className="w-24" aria-label="周期の単位"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">未設定</SelectItem><SelectItem value="year">年</SelectItem><SelectItem value="month">ヶ月</SelectItem><SelectItem value="week">週</SelectItem></SelectContent></Select></div></div>
      <div className="flex items-center gap-6 pt-4"><Label className="flex items-center gap-2"><Checkbox checked={draft.stopped} onCheckedChange={v=>field("stopped",v===true)}/>非表示</Label><Label className="flex items-center gap-2"><Checkbox checked={draft.after_breakdown} onCheckedChange={v=>field("after_breakdown",v===true)}/>破損後</Label></div>
    </div><div className="mt-4 flex gap-2"><Button disabled={busy} onClick={()=>void save()}>{draft.id?<Save className="size-4"/>:<Plus className="size-4"/>}{busy?"保存中…":draft.id?"保存":"追加登録"}</Button>{draft.id?<Button variant="outline" size="icon" title="ごみ箱へ移動" aria-label="ごみ箱へ移動" disabled={busy} onClick={()=>void remove()}><Trash2 className="size-4"/></Button>:null}</div>
  </article>;
}
