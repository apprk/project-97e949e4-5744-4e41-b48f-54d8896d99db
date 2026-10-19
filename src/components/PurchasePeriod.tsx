import { useMemo, useState } from "react";
import { CalendarIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { activePurchasePeriod, currentFiscalYear, type PurchasePeriod } from "@/lib/purchase-period";

export function usePurchasePeriod() {
  const [year, setYear] = useState(() => currentFiscalYear());
  const [custom, setCustom] = useState<PurchasePeriod | null>(null);
  const period = useMemo(() => activePurchasePeriod(year, custom), [year, custom]);
  return { year, custom, period, setCustom, selectYear: (value: number) => { setYear(value); setCustom(null); } };
}

function PeriodDate({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  return <div className="space-y-1">
    <span className="text-sm">{label}</span>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button variant="outline" className="w-full justify-start" aria-label={label}><CalendarIcon className="size-4" />{format(parseISO(value), "yyyy/MM/dd")}</Button></PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" locale={ja} captionLayout="dropdown" startMonth={new Date(1900, 0)} endMonth={new Date(2100, 11)} selected={parseISO(value)} defaultMonth={parseISO(value)} onSelect={(date) => { if (date) { onChange(format(date, "yyyy-MM-dd")); setOpen(false); } }} className="pointer-events-auto p-3" />
      </PopoverContent>
    </Popover>
  </div>;
}

export function PurchasePeriodControls({ control, dates }: { control: ReturnType<typeof usePurchasePeriod>; dates: string[] }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(control.period);
  const current = currentFiscalYear();
  const years = useMemo(() => {
    const datedYears = dates.map((d) => Number(d.slice(0, 4)) - (Number(d.slice(5, 7)) < 4 ? 1 : 0)).filter(Number.isFinite);
    const first = Math.min(current - 5, ...datedYears);
    const last = Math.max(current + 1, control.year, ...datedYears);
    return Array.from({ length: last - first + 1 }, (_, i) => last - i);
  }, [dates, current, control.year]);
  return <>
    <Select value={String(control.year)} onValueChange={(v) => control.selectYear(Number(v))}>
      <SelectTrigger className="h-10 bg-card" aria-label="年度"><SelectValue /></SelectTrigger>
      <SelectContent>{years.map((year) => <SelectItem key={year} value={String(year)}>{year}年度</SelectItem>)}</SelectContent>
    </Select>
    <Button variant="outline" className="h-10 bg-card" onClick={() => { setDraft(control.period); setOpen(true); }}><CalendarIcon className="size-4" />期間指定{control.custom ? "中" : ""}</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>期間指定</DialogTitle></DialogHeader>
        <PeriodDate label="開始日" value={draft.from} onChange={(from) => setDraft((d) => ({ ...d, from }))} />
        <PeriodDate label="終了日" value={draft.to} onChange={(to) => setDraft((d) => ({ ...d, to }))} />
        {draft.from > draft.to ? <p className="text-sm text-destructive">終了日は開始日以降を選択してください。</p> : null}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => { control.setCustom(null); setOpen(false); }}>期間指定を解除</Button><Button disabled={draft.from > draft.to} onClick={() => { control.setCustom(draft); setOpen(false); }}>適用</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}

export function PurchasePeriodLabel({ period }: { period: PurchasePeriod }) {
  return <span className="text-xs text-muted-foreground">対象：{period.from.replaceAll("-", "/")}～{period.to.replaceAll("-", "/")}</span>;
}