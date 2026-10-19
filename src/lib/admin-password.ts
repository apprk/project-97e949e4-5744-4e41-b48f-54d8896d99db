export function validAdminPassword(value: string) {
  return /[A-Za-z]/.test(value) && /[0-9]/.test(value) && value.length >= 6;
}
export function retentionExpiry(days: number, now: number) {
  return now + (days > 0 ? days * 86400000 : 86400000);
}