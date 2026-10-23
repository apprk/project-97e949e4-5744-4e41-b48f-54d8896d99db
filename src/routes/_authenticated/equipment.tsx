import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, ChevronLeft, ChevronRight, FileDown, LayoutList, Loader2, Plus, Search, Settings, Wrench } from "lucide-react";
import { addMonths, format, parseISO } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { equipmentView, equipmentReadOnly, type EquipmentAccount } from "@/lib/equipment-view";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exportCsv, exportPdf } from "@/lib/exporters";
import { useAuth } from "@/lib/auth";
import { readAllPages } from "@/lib/schedule-import";
import { equipmentGroup, japanToday, latestCompletion, maintenanceMatches, nextTiming, normalizeMaintenance, planMonths, sortMaintenance, type Completion, type Maintenance } from "@/lib/maintenance";
import { blankMaintenance, RecordEditor, type DisplaySettings, type EquipmentName } from "@/components/maintenance/RecordEditor";
import { HistoryPanel } from "@/components/maintenance/HistoryPanel";
import { MaintenanceSettings } from "@/components/maintenance/MaintenanceSettings";

export const Route = createFileRoute("/_authenticated/equipment")({
  head: () => ({
    meta: [
      { title: "設備管理 | 三条工場 業務管理" },
      { name: "description", content: "修理内容・実施履歴・写真を記録し、次回時期と月別の保全計画を管理します。" },
      { property: "og:title", content: "設備管理 | 三条工場 業務管理" },
      { property: "og:description", content: "修理内容・実施履歴・写真を記録し、次回時期と月別の保全計画を管理します。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EquipmentPage,
});

const TABS=[{key:"all",label:"全件"},{key:"month",label:"月別"},{key:"overdue",label:"未実施"},{key:"plan",label:"計画"}];
function EquipmentPage() {
  const {session,isAdmin}=useAuth();
  const [accounts,setAccounts]=useState<EquipmentAccount[]>([]);
  const [target,setTarget]=useState<string|null>(null);
  const [switching,setSwitching]=useState(false);
  const request=useRef(0);
  const targetId=target??session?.user.id;
  const switched=!!target && target!==session?.user.id;
  const readOnly=!!session && !!targetId && equipmentReadOnly(session.user.id,targetId,isAdmin);
  const changeTarget=async(id:string)=>{
    setSwitching(true);setLoading(true);request.current++;setItems([]);setHistory([]);setHistoryOf(null);setEditingRecord(null);setGroup(null);setView("list");
    try{const {error}=await supabase.rpc("set_equipment_target",id===session?.user.id?{}:{_target:id});if(error)throw error;const state=await equipmentView();setAccounts(state.accounts);setTarget(state.target??session?.user.id??null);await load();}
    catch{setError(true);setLoading(false);toast.error("アカウントを切り替えられませんでした");}
    finally{setSwitching(false);}
  };
  const [items,setItems]=useState<Maintenance[]>([]);
  const [history,setHistory]=useState<Completion[]>([]);
  const [names,setNames]=useState<EquipmentName[]>([]);
  const [display,setDisplay]=useState<DisplaySettings>({show_name:true,show_assignee:true});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const [tab,setTab]=useState("all");
  const [view,setView]=useState("list");
  const [month,setMonth]=useState(japanToday().slice(0,7));
  const [today,setToday]=useState(japanToday());
  const [search,setSearch]=useState("");
  const [sort,setSort]=useState("next");
  const [descending,setDescending]=useState(false);
  const [group,setGroup]=useState<string|null>(null);
  const [historyOf,setHistoryOf]=useState<Maintenance|null>(null);
  const [editingRecord,setEditingRecord]=useState<Maintenance|null>(null);
  const [newKey,setNewKey]=useState(0);
  const load=async()=>{
    const version=++request.current;
    try {
      const state=await equipmentView();
      const uid=state.target??session?.user.id;
      if(!uid)return;
      if(version!==request.current)return;
      setAccounts(state.accounts);setTarget(uid);
      const [eq,hs,ns,settings]=await Promise.all([
        readAllPages<Maintenance>((from,to)=>supabase.from("equipment").select("id,user_id,name,repair_content,assignee,cycle_value,cycle_unit,planned_on,stopped,after_breakdown,created_at").is("deleted_at",null).eq("user_id",uid).order("created_at").order("id").range(from,to).returns<Maintenance[]>()),
        readAllPages<Completion>((from,to)=>supabase.from("equipment_history").select("id,equipment_id,user_id,performed_on,comment,created_at").is("deleted_at",null).eq("user_id",uid).order("id").range(from,to)),
        readAllPages<EquipmentName>((from,to)=>supabase.from("equipment_names").select("id,name").order("name").order("id").range(from,to)),
        session?supabase.from("equipment_display_settings").select("show_name,show_assignee").eq("user_id",uid).maybeSingle():Promise.resolve({data:null,error:null})
      ]);
      if(version!==request.current)return;
      if(settings.error)throw settings.error;
      setItems(eq);setHistory(hs);setNames(ns);setDisplay(settings.data??{show_name:true,show_assignee:true});setError(false);
    }catch{if(version===request.current){setError(true);toast.error("設備管理を読み込めませんでした");}}finally{if(version===request.current)setLoading(false);}
  };
  useEffect(()=>{if(session)void load();},[session?.user.id]);
  useEffect(()=>{const refresh=()=>{setToday(japanToday());if(document.visibilityState==="visible")void load();};const timer=setInterval(()=>setToday(japanToday()),60000);document.addEventListener("visibilitychange",refresh);return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",refresh);};},[session?.user.id]);
  const ownHistory=(r:Maintenance)=>history.filter(h=>h.equipment_id===r.id);
  const timing=(r:Maintenance)=>nextTiming(r,ownHistory(r),today);
  const inGroup=(r:Maintenance)=>!group||equipmentGroup(r.name,names)===group;
  const keyword=normalizeMaintenance(search);
  const searched=items.filter(r=>{
    if(!inGroup(r))return false;
    if(!keyword)return true;
    const t=timing(r);
    const cycle=r.cycle_unit?({year:"年",month:"ヶ月",week:"週"})[r.cycle_unit]:"";
    return normalizeMaintenance([r.repair_content,r.name,r.assignee,r.planned_on,r.cycle_value,cycle,latestCompletion(ownHistory(r)),...ownHistory(r).flatMap(h=>[h.performed_on,h.comment]),t.kind==="state"?t.label:t.date].filter(v=>v!=null).join(" ")).includes(keyword);
  });
  const sorted=sortMaintenance(searched.filter(r=>maintenanceMatches(timing(r),tab,today,month)),history,today,sort,descending);
  const registration=items.filter(inGroup).sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime()||a.id.localeCompare(b.id));
  const timingLabel=(r:Maintenance)=>{const t=timing(r);return t.kind==="date"?t.date:t.label;};
  const exportHeaders=["修理内容",...(display.show_name?["設備名"]:[]),...(display.show_assignee?["担当"]:[]),"周期","予定日","次回時期","最新実施日","実施履歴"];
  const exportRows=sorted.map(r=>[r.repair_content,...(display.show_name?[r.name]:[]),...(display.show_assignee?[r.assignee??""]:[]),r.cycle_value&&r.cycle_unit?`${r.cycle_value}${({year:"年",month:"ヶ月",week:"週"})[r.cycle_unit]}`:"",r.planned_on??"",timingLabel(r),latestCompletion(ownHistory(r))??"",[...ownHistory(r)].sort((a,b)=>new Date(a.performed_on).getTime()-new Date(b.performed_on).getTime()).map(h=>`${h.performed_on} ${h.comment??""}`).join(" / ")]);
  const title=view==="settings"?"保全管理の設定":view==="register"?"修理内容の登録・編集":view==="groups"?"設備毎":group?`設備管理 — ${group}`:"設備管理";
  return <div className="min-h-screen bg-background"><AppHeader title="設備管理" equipmentOnly={switched||switching}/>
    <div className="sticky top-16 z-10 border-b border-border bg-background px-3 py-2"><div className="mx-auto max-w-5xl">{accounts.length>1||switched?<div className="mb-3 flex flex-wrap items-center gap-2"><span className="text-sm font-medium">対象アカウント</span><Select value={targetId??""} disabled={switching} onValueChange={id=>void changeTarget(id)}><SelectTrigger className="w-56 max-w-full" aria-label="設備管理の対象アカウント"><SelectValue/></SelectTrigger><SelectContent>{accounts.map(a=><SelectItem key={a.id} value={a.id}>{a.name}{a.id===session?.user.id?"（自分）":""}</SelectItem>)}</SelectContent></Select>{switched?<><p className="w-full break-words text-sm font-bold text-primary">他アカウントの設備管理を表示中：{accounts.find(a=>a.id===targetId)?.name}{readOnly?"（閲覧のみ）":""}</p><Button size="sm" variant="outline" disabled={switching} onClick={()=>{if(session)void changeTarget(session.user.id);}}>自分の設備管理に戻る</Button></>:null}</div>:null}<div className="grid grid-cols-4 gap-1" role="tablist" aria-label="修理内容の表示">{TABS.map(t=><Button key={t.key} role="tab" aria-selected={tab===t.key&&view==="list"} variant={tab===t.key&&view==="list"?"default":"outline"} className="min-w-0 px-1 text-xs sm:text-sm" onClick={()=>{setTab(t.key);setView("list");}}>{t.label}</Button>)}</div><div className="mt-2 flex flex-wrap gap-2"><Button variant={view==="groups"||group?"default":"outline"} size="sm" aria-pressed={view==="groups"||!!group} onClick={()=>{if(view==="groups"||group){setView("list");setGroup(null);}else setView("groups");}}><Wrench className="size-4"/>設備毎{group?`：${group}`:""}</Button>{!readOnly?<Button size="sm" variant={view==="register"?"default":"outline"} onClick={()=>setView("register")}><Plus className="size-4"/>登録</Button>:null}{view!=="list"&&!group?<Button size="sm" variant="outline" onClick={()=>{setView("list");setGroup(null);}}><LayoutList className="size-4"/>一覧</Button>:null}{isAdmin&&!switched?<Button variant="outline" size="sm" onClick={()=>setView("settings")}><Settings className="size-4"/>保全管理の設定</Button>:null}</div></div></div>
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-5"><h2 className="mb-4 break-words text-xl font-bold">{title}</h2>
      {loading?<div className="py-12 text-center"><Loader2 className="mx-auto size-6 animate-spin text-primary"/></div>:error?<div className="py-8 text-center"><p>読み込みに失敗しました。</p><Button className="mt-3" onClick={()=>void load()}>再読み込み</Button></div>:view==="settings"?<MaintenanceSettings names={names} reload={load}/>:view==="groups"?<div className="divide-y divide-border">{[...names.map(n=>n.name),"その他"].map(name=><Button key={name} variant="ghost" className="h-14 w-full justify-between rounded-none border-b border-border" onClick={()=>{setGroup(name);setTab("all");setView("list");}}><span>{name}</span><span className="text-muted-foreground">{items.filter(r=>equipmentGroup(r.name,names)===name).length}件</span></Button>)}</div>:view==="register"?<div>{registration.map(r=><RecordEditor key={r.id} record={r} targetUserId={targetId} names={names} display={display} reload={load} onHistory={setHistoryOf}/>)}<RecordEditor key={`new-${newKey}-${group}`} record={blankMaintenance(group&&group!=="その他"?group:"")} targetUserId={targetId} names={names} display={display} reload={load} onSaved={()=>setNewKey(k=>k+1)}/></div>:<>
      <div className="mb-4 flex flex-wrap items-center gap-2"><div className="relative min-w-0 flex-1 basis-48"><Search className="absolute left-3 top-3 size-4 text-muted-foreground"/><Input aria-label="修理内容を検索" placeholder="検索" className="pl-9" value={search} onChange={e=>setSearch(e.target.value)}/></div><Select value={sort} onValueChange={setSort}><SelectTrigger className="w-40" aria-label="並び替え"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="repair">修理内容</SelectItem><SelectItem value="next">次回時期</SelectItem><SelectItem value="latest">最終実施日</SelectItem><SelectItem value="created">登録順</SelectItem></SelectContent></Select><Button variant="outline" size="icon" aria-label={descending?"降順から昇順へ":"昇順から降順へ"} title={descending?"降順":"昇順"} onClick={()=>setDescending(!descending)}>{descending?<ArrowDown className="size-4"/>:<ArrowUp className="size-4"/>}</Button></div>
      {group?<div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm"><Wrench className="size-4 text-primary"/><span className="font-bold">設備毎モード：{group}</span><Button size="sm" variant="outline" onClick={()=>setGroup(null)}>通常モードへ戻る</Button></div>:null}
      {tab==="month"?<div className="mb-4 flex flex-wrap items-center gap-2"><Button variant="outline" size="icon" aria-label="前月" onClick={()=>setMonth(format(addMonths(parseISO(`${month}-01`),-1),"yyyy-MM"))}><ChevronLeft className="size-4"/></Button><Input className="w-40" aria-label="年月を直接指定" type="month" value={month} onChange={e=>setMonth(e.target.value)}/><Button variant="outline" size="icon" aria-label="翌月" onClick={()=>setMonth(format(addMonths(parseISO(`${month}-01`),1),"yyyy-MM"))}><ChevronRight className="size-4"/></Button><Button variant="outline" size="sm" onClick={()=>setMonth(japanToday().slice(0,7))}>今月</Button></div>:null}
      <div className="mb-4 flex flex-wrap items-center gap-2"><span className="mr-auto text-sm text-muted-foreground">{sorted.length}件{group?` / ${group}`:""}</span><Button variant="outline" size="sm" onClick={()=>exportCsv(exportHeaders,exportRows,"設備管理.csv")}><FileDown className="size-4"/>CSV出力</Button><Button variant="outline" size="sm" onClick={()=>exportPdf("設備管理一覧",exportHeaders,exportRows)}><FileDown className="size-4"/>PDF出力</Button></div>
      {tab==="plan"?<div className="max-w-full overflow-x-auto pb-4" aria-label="保全計画"><div className="flex w-max gap-3">{["overdue",...planMonths(today)].map(m=><section key={m} className="w-56 border-x border-border"><h3 className="border-y border-border bg-muted px-3 py-3 font-bold">{m==="overdue"?"未実施":`${Number(m.slice(0,4))}年${Number(m.slice(5))}月`}</h3><div className="divide-y divide-border">{sorted.filter(r=>{const t=timing(r);return t.kind==="date"&&(m==="overdue"?maintenanceMatches(t,"overdue",today,month):t.date.slice(0,7)===m);}).map(r=><Button key={r.id} variant="ghost" className="h-auto min-h-20 w-full flex-col items-start gap-1 whitespace-normal rounded-none px-3 py-3 text-left" onClick={()=>setHistoryOf(r)}><span className="break-words font-bold">{r.repair_content}</span>{display.show_assignee&&r.assignee?<span className="text-xs text-muted-foreground">{r.assignee}</span>:null}{m==="overdue"?<span className="text-xs text-muted-foreground">予定時期 {timingLabel(r)}</span>:null}</Button>)}</div></section>)}</div></div>:!sorted.length?<p className="py-12 text-center text-sm text-muted-foreground">該当する修理内容はありません。</p>:<ul className="space-y-3">{sorted.map(r=>{const t=timing(r);const latest=latestCompletion(ownHistory(r));return <li key={r.id} className="rounded-lg border border-border bg-card p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="break-words font-bold">{r.repair_content}{t.kind==="date"&&t.planned?<span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">予定済</span>:null}</h3><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">{display.show_name&&r.name?<span>設備名：{r.name}</span>:null}{display.show_assignee&&r.assignee?<span>担当：{r.assignee}</span>:null}</div></div><div className="text-right"><p className="text-xs text-muted-foreground">次回時期</p><p className={`font-bold ${maintenanceMatches(t,"overdue",today,month)?"text-destructive":"text-primary"}`}>{t.kind==="date"?t.date:t.label}</p>{t.inferred?<span className="text-[11px] text-muted-foreground">周期未記入</span>:null}</div></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>最新実施日：{latest??"—"}</span><span>履歴：{ownHistory(r).length}件</span>{r.cycle_value&&r.cycle_unit?<span>周期：{r.cycle_value}{({year:"年",month:"ヶ月",week:"週"})[r.cycle_unit]}</span>:null}{r.planned_on?<span>予定日：{r.planned_on}</span>:null}</div><div className="mt-4 flex gap-2"><Button className="flex-1" onClick={()=>setHistoryOf(r)}><CheckCircle2 className="size-4"/>{readOnly?"実施履歴":"実施日・履歴"}</Button>{!readOnly?<Button variant="outline" onClick={()=>setEditingRecord(r)}>編集</Button>:null}</div></li>;})}</ul>}
      </>}
    </main><Dialog open={!!historyOf} onOpenChange={open=>!open&&setHistoryOf(null)}><DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle className="break-words">{historyOf?.repair_content}</DialogTitle></DialogHeader>{historyOf?<HistoryPanel key={historyOf.id} record={items.find(r=>r.id===historyOf.id)??historyOf} history={history} readOnly={readOnly} reload={load}/>:null}</DialogContent></Dialog>
    <Dialog open={!!editingRecord} onOpenChange={open=>!open&&setEditingRecord(null)}><DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle className="break-words">修理内容の編集</DialogTitle></DialogHeader>{editingRecord?<RecordEditor key={editingRecord.id} record={items.find(r=>r.id===editingRecord.id)??editingRecord} targetUserId={targetId} names={names} display={display} reload={load} onSaved={()=>setEditingRecord(null)} onHistory={r=>{setEditingRecord(null);setHistoryOf(r);}}/>:null}</DialogContent></Dialog>
  </div>;
}
