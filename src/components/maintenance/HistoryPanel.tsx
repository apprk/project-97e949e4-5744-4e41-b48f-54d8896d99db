import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronUp, Image, Paperclip, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { signMaintenancePhotos } from "@/lib/maintenance.functions";
import { japanToday, type Completion, type Maintenance } from "@/lib/maintenance";
import { compressImage } from "@/lib/image-compress";
import { readAllPages } from "@/lib/schedule-import";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Attachment = { id: string; history_id: string; storage_path: string; photo_id: string | null };
type Picked = { key: string; file?: File; photo?: { id: string; storage_path: string }; preview: string };
export function HistoryPanel({ record, history, reload }: { record: Maintenance; history: Completion[]; reload: () => Promise<void> }) {
  const { session }=useAuth();
  const sign=useServerFn(signMaintenancePhotos);
  const [date,setDate]=useState(japanToday());
  const [comment,setComment]=useState("");
  const [editing,setEditing]=useState<string|null>(null);
  const [descending,setDescending]=useState(true);
  const [picked,setPicked]=useState<Picked[]>([]);
  const pickedRef=useRef<Picked[]>([]);
  pickedRef.current=picked;
  const [attachments,setAttachments]=useState<Attachment[]>([]);
  const [urls,setUrls]=useState<Record<string,string>>({});
  const [library,setLibrary]=useState(false);
  const [photos,setPhotos]=useState<{id:string;storage_path:string;url:string}[]>([]);
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [preview,setPreview]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [loadingPhotos,setLoadingPhotos]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const [planned,setPlanned]=useState(record.planned_on??"");
  const [plannedBusy,setPlannedBusy]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null);
  const own=history.filter(h=>h.equipment_id===record.id);
  const sortedOwn=[...own].sort((a,b)=>(descending?-1:1)*(new Date(a.performed_on).getTime()-new Date(b.performed_on).getTime())||a.id.localeCompare(b.id));
  const latestByDate=own.length?[...own].sort((a,b)=>new Date(b.performed_on).getTime()-new Date(a.performed_on).getTime()||b.id.localeCompare(a.id))[0]:null;
  const visibleHistory=expanded?sortedOwn:latestByDate?[latestByDate]:[];
  const savePlanned=async()=>{
    setPlannedBusy(true);
    const {data,error}=await supabase.from("equipment").update({planned_on:planned||null}).eq("id",record.id).select("id");
    if(error||!data?.length)toast.error("予定日を保存できませんでした");else{await reload();toast.success("予定日を保存しました");}
    setPlannedBusy(false);
  };
  const removeHistory=async(h:Completion)=>{
    if(!confirm(`${h.performed_on}の実施履歴を削除しますか？添付写真との関連も解除されます。`))return;
    setBusy(true);
    const {data,error}=await supabase.from("equipment_history").update({deleted_at:new Date().toISOString()}).eq("id",h.id).eq("equipment_id",record.id).select("id");
    if(error||!data?.length)toast.error("削除できませんでした");else{if(editing===h.id){setEditing(null);setDate(japanToday());setComment("");}await reload();toast.success("実施履歴を削除しました");}
    setBusy(false);
  };
  const loadAttachments=async()=>{
    const rows=own.length ? await readAllPages<Attachment>((from,to)=>supabase.from("equipment_history_attachments").select("id,history_id,storage_path,photo_id").in("history_id",own.map(h=>h.id)).order("id").range(from,to)) : [];
    setAttachments(rows);
    const out:Record<string,string>={};
    for(let i=0;i<rows.length;i+=200) Object.assign(out,await sign({data:{ids:rows.slice(i,i+200).map(r=>r.id),existing:false}}));
    setUrls(out);
  };
  useEffect(()=>{void loadAttachments().catch(()=>toast.error("添付写真を読み込めませんでした"));},[history,record.id]);
  useEffect(()=>()=>{for(const p of pickedRef.current)if(p.file)URL.revokeObjectURL(p.preview);},[]);
  const openLibrary=async()=>{
    setLibrary(true);setSelected(new Set());setLoadingPhotos(true);
    try{
      const rows=await readAllPages<{id:string;storage_path:string}>((from,to)=>supabase.from("photos").select("id,storage_path").is("deleted_at",null).order("taken_at",{ascending:false}).order("id").range(from,to));
      const signed:Record<string,string>={};
      for(let i=0;i<rows.length;i+=200)Object.assign(signed,await sign({data:{ids:rows.slice(i,i+200).map(r=>r.id),existing:true}}));
      setPhotos(rows.map(r=>({...r,url:signed[r.id]??""})).filter(r=>r.url));
    }catch{toast.error("写真を読み込めませんでした");}finally{setLoadingPhotos(false);}
  };
  const save=async()=>{
    if(!session || !date)return;
    setBusy(true);
    const uploaded:string[]=[];
    try{
      // Upload before creating history so a failed upload cannot leave a misleading success.
      const pending=[];
      for(const p of picked){
        let path=p.photo?.storage_path;
        if(p.file){
          const file=await compressImage(p.file);
          const ext=(file.name.split(".").pop()??"jpg").replace(/[^a-zA-Z0-9]/g,"");
          path=`${session.user.id}/maintenance-${crypto.randomUUID()}.${ext||"jpg"}`;
          const {error}=await supabase.storage.from("photos").upload(path,file,{contentType:file.type||"image/jpeg"});
          if(error)throw error;
          uploaded.push(path);
        }
        if(path)pending.push({storage_path:path,photo_id:p.photo?.id??null,user_id:session.user.id});
      }
      const {data:saved,error}=editing
        ? await supabase.from("equipment_history").update({performed_on:date,comment:comment||null}).eq("id",editing).eq("equipment_id",record.id).select("id").single()
        : await supabase.from("equipment_history").insert({equipment_id:record.id,user_id:session.user.id,performed_on:date,comment:comment||null}).select("id").single();
      if(error || !saved)throw error??new Error("保存結果がありません");
      if(pending.length){
        const {error:attachmentError}=await supabase.from("equipment_history_attachments").insert(pending.map(p=>({...p,history_id:saved.id})));
        if(attachmentError){
          // Keep the saved history identifiable for retry; do not insert it twice.
          setEditing(saved.id);
          throw new Error("実施日は保存済みですが、写真を添付できませんでした。再度保存してください。");
        }
      }
      uploaded.length=0;
      for(const p of picked)if(p.file)URL.revokeObjectURL(p.preview);
      setPicked([]);setEditing(null);setComment("");setDate(japanToday());
      await reload();
      toast.success("実施履歴を保存しました");
    }catch(e){
      if(uploaded.length)await supabase.storage.from("photos").remove(uploaded);
      toast.error(e instanceof Error?e.message:"実施履歴を保存できませんでした");
      await reload();
    }finally{setBusy(false);}
  };
  return <section className="space-y-4">
    <div className="space-y-1"><Label htmlFor={`planned-${record.id}`}>予定日</Label><div className="flex gap-2"><Input id={`planned-${record.id}`} type="date" className="max-w-56" value={planned} onChange={e=>setPlanned(e.target.value)}/><Button variant="outline" size="sm" className="self-center" disabled={plannedBusy||planned===(record.planned_on??"")} onClick={()=>void savePlanned()}>{plannedBusy?"保存中…":"予定日を保存"}</Button></div></div>
    <div className="flex items-center justify-between gap-2"><Button variant="ghost" className="-ml-2 font-bold" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?<ChevronUp className="size-4"/>:<ChevronDown className="size-4"/>}実施履歴（{own.length}件）</Button>{expanded?<Button variant="outline" size="sm" onClick={()=>setDescending(!descending)}>{descending?"新しい順":"古い順"}</Button>:null}</div>
    {!expanded&&own.length>1?<p className="text-xs text-muted-foreground">直近の履歴のみ表示中。見出しをタップすると全件表示します。</p>:null}
    <div className="divide-y divide-border">
      {visibleHistory.map(h=><div key={h.id} className="py-3"><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{h.performed_on}</p><p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{h.comment}</p></div><div className="flex shrink-0 gap-1"><Button variant="outline" size="sm" disabled={busy} onClick={()=>{setEditing(h.id);setDate(h.performed_on);setComment(h.comment??"");}}>編集</Button><Button variant="outline" size="icon" title="この履歴を削除" aria-label={`${h.performed_on}の履歴を削除`} disabled={busy} onClick={()=>void removeHistory(h)}><Trash2 className="size-4"/></Button></div></div><div className="mt-2 flex flex-wrap gap-2">{attachments.filter(a=>a.history_id===h.id).map(a=><Button key={a.id} variant="outline" className="h-20 w-20 overflow-hidden p-0" aria-label={`${h.performed_on}の写真`} onClick={()=>setPreview(urls[a.id]??null)}>{urls[a.id]?<img src={urls[a.id]} alt={`${h.performed_on}の添付写真`} className="h-full w-full object-contain"/>:<Image className="size-5"/>}</Button>)}</div></div>)}
    </div>
    <div className="border-t border-border pt-4"><h3 className="mb-3 font-bold">{editing?"実施履歴を編集":"実施日を追加"}</h3><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label htmlFor={`history-date-${record.id}`}>実施日</Label><Input id={`history-date-${record.id}`} type="date" value={date} onChange={e=>setDate(e.target.value)}/></div><div className="space-y-1"><Label htmlFor={`history-comment-${record.id}`}>一言コメント</Label><Input id={`history-comment-${record.id}`} value={comment} onChange={e=>setComment(e.target.value)}/></div></div>
    <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" onClick={()=>fileRef.current?.click()}><Paperclip className="size-4"/>端末の写真</Button><Button variant="outline" onClick={()=>void openLibrary()}><Image className="size-4"/>アプリ内の写真</Button></div>
    <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e=>{const additions=Array.from(e.target.files??[]).map(file=>({key:crypto.randomUUID(),file,preview:URL.createObjectURL(file)}));e.target.value="";setPicked(prev=>[...prev,...additions]);}}/>
    <div className="mt-3 flex flex-wrap gap-2">{picked.map(p=><div key={p.key} className="relative"><img src={p.preview} alt="添付予定" className="h-20 w-20 rounded-md border border-border object-contain"/><Button variant="secondary" size="icon" className="absolute right-0 top-0 size-6" aria-label="添付を取り消す" onClick={()=>{if(p.file)URL.revokeObjectURL(p.preview);setPicked(prev=>prev.filter(x=>x.key!==p.key));}}><X className="size-3"/></Button></div>)}</div>
    <div className="mt-3 flex gap-2"><Button onClick={()=>void save()} disabled={busy||!date}>{editing?<Save className="size-4"/>:<Plus className="size-4"/>}{busy?"保存中…":editing?"履歴を保存":"実施日を追加"}</Button>{editing?<Button variant="outline" onClick={()=>{setEditing(null);setDate(japanToday());setComment("");}}>編集を終了</Button>:null}</div></div>
    <Dialog open={library} onOpenChange={setLibrary}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>アプリ内の写真</DialogTitle></DialogHeader>{loadingPhotos?<p>読込中…</p>:<div className="grid max-h-[55vh] grid-cols-3 gap-2 overflow-auto sm:grid-cols-5">{photos.map(p=><Button key={p.id} variant="outline" aria-label={`写真 ${p.id}`} aria-pressed={selected.has(p.id)} className={`aspect-square h-auto overflow-hidden p-1 ${selected.has(p.id)?"ring-2 ring-primary":""}`} onClick={()=>setSelected(prev=>{const s=new Set(prev);if(s.has(p.id))s.delete(p.id);else s.add(p.id);return s;})}><img src={p.url} alt="既存写真" className="h-full w-full object-contain"/></Button>)}</div>}{!loadingPhotos&&!photos.length?<p className="text-sm text-muted-foreground">閲覧できる写真がありません。</p>:null}<Button disabled={!selected.size} onClick={()=>{setPicked(prev=>[...prev,...photos.filter(p=>selected.has(p.id)).map(p=>({key:crypto.randomUUID(),photo:{id:p.id,storage_path:p.storage_path},preview:p.url}))]);setLibrary(false);}}>選択した写真を添付（{selected.size}枚）</Button></DialogContent></Dialog>
    <Dialog open={!!preview} onOpenChange={()=>setPreview(null)}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>実施履歴の写真</DialogTitle></DialogHeader>{preview?<img src={preview} alt="実施履歴の添付写真" className="max-h-[75vh] w-full object-contain"/>:null}</DialogContent></Dialog>
  </section>;
}
