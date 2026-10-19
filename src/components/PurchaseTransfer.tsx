import { useState } from "react";
import { Download, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { fetchPurchaseRows } from "@/lib/purchase-data";
import {useServerFn} from "@tanstack/react-start";
import {exportPurchaseCsv} from "@/lib/purchase-export.functions";
import { inPurchasePeriod, parsePurchaseWorkbook, purchaseCsv, validatePurchaseFile, type ImportPurchase } from "@/lib/purchase-transfer";

export function PurchaseTransfer({ onImported }: { onImported: () => void }) {
  const exportCsv=useServerFn(exportPurchaseCsv);
  const [open,setOpen]=useState(false);
  const [from,setFrom]=useState(""); const [to,setTo]=useState("");
  const [file,setFile]=useState<File | null>(null);
  const [preview,setPreview]=useState<ImportPurchase[] | null>(null);
  const [busy,setBusy]=useState(false);
  const validPeriod=() => { if(from && to && from>to) throw new Error("開始日は終了日以前にしてください。"); };
  const check = async () => {
    try { validPeriod(); if(!file) throw new Error("ファイルを選択してください。"); validatePurchaseFile(file.name);
      setPreview(parsePurchaseWorkbook(await file.arrayBuffer(),from,to));
    } catch(e) { setPreview(null); toast.error(e instanceof Error ? e.message : "読み込めませんでした"); }
  };
  const register = async () => {
    if(!preview?.length || busy) return;
    setBusy(true); let count=0;
    try {
      for(let i=0;i<preview.length;i+=200) {
        const { data,error }=await supabase.rpc("import_purchases",{_rows: preview.slice(i,i+200)});
        if(error) throw error;
        count+=Number(data);
      }
      toast.success(`${count}件を登録しました`); setPreview(null); setFile(null); setOpen(false);
    } catch { toast.error(`登録を停止しました（${count}件登録済み）。重複を避けるため、未登録分を期間指定してください。`); }
    finally { setBusy(false); onImported(); }
  };
  const output = async () => {
    setBusy(true);
    try { validPeriod(); const {csv}=await exportCsv({data:{from,to}});
      const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
      const a=document.createElement("a"); a.href=url;a.download="物品購入.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch(e) { toast.error(e instanceof Error ? e.message : "出力できませんでした"); } finally {setBusy(false);}
  };
  return <>
    <Button size="sm" variant="outline" onClick={()=>setOpen(true)}><Upload className="size-4"/> Excel読込・CSV出力</Button>
    <Dialog open={open} onOpenChange={(v)=>!busy && setOpen(v)}><DialogContent><DialogHeader><DialogTitle>物品購入 Excel読込・CSV出力</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">開始日<Input type="date" aria-label="読込・出力開始日" value={from} onChange={(e)=>{setFrom(e.target.value);setPreview(null);}} disabled={busy}/></label>
        <label className="text-sm">終了日<Input type="date" aria-label="読込・出力終了日" value={to} onChange={(e)=>{setTo(e.target.value);setPreview(null);}} disabled={busy}/></label>
      </div>
      <Input type="file" accept=".xlsx" aria-label="物品購入Excelファイル" disabled={busy} onChange={(e)=>{setFile(e.target.files?.[0] ?? null);setPreview(null);}}/>
      <Button variant="outline" onClick={check} disabled={busy || !file}>読込内容を確認</Button>
      {preview ? <div className="space-y-2 text-sm"><p className="break-all">{file?.name}</p><p>{from || "すべて"} ～ {to || "すべて"}：登録予定 {preview.length}件</p>
        <Button disabled={busy || !preview.length} onClick={register}>{busy ? <Loader2 className="size-4 animate-spin"/> : <Upload className="size-4"/>} {preview.length}件を追加登録</Button></div> : null}
      <Button variant="outline" disabled={busy} onClick={output}><Download className="size-4"/> CSV出力</Button>
    </DialogContent></Dialog>
  </>;
}