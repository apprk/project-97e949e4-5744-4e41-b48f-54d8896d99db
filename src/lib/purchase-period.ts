export type PurchasePeriod = { from: string; to: string };

export function currentFiscalYear(date = new Date()): number {
  const japan = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return japan.getUTCFullYear() - (japan.getUTCMonth() < 3 ? 1 : 0);
}

export function fiscalPeriod(year: number): PurchasePeriod {
  return { from: `${year}-04-01`, to: `${year + 1}-03-31` };
}

export function activePurchasePeriod(year: number, custom: PurchasePeriod | null): PurchasePeriod {
  return custom ?? fiscalPeriod(year);
}

export function matchesPurchasePeriod(writtenOn: string, period: PurchasePeriod): boolean {
  return writtenOn >= period.from && writtenOn <= period.to;
}