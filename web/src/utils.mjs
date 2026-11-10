export const CATEGORIES = [
  { id: 'fuel', label: 'Tankování (včetně AdBlue)', color: '#ad99ff' },
  { id: 'resort', label: 'Skipasy a areál', color: '#69cde3' },
  { id: 'food', label: 'Strava a nákupy', color: '#efa971' },
  { id: 'lodging', label: 'Ubytování', color: '#74d5a9' },
  { id: 'travel', label: 'Doprava', color: '#e8cf81' },
  { id: 'other', label: 'Ostatní', color: '#d4a5d8' }
];
export const currency = (value, code = 'EUR') => new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: code, maximumFractionDigits: 2 }).format(Number(value || 0));
export function decimal(input) {
  const n = Number(String(input || '0').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
export function expenseStatus(e) {
  if (!e.receipt_path) return 'Chybí účtenka';
  if (!e.merchant || Number(e.amount) <= 0 || !['cash', 'card'].includes(e.payment_method)) return 'Doplnit údaje';
  if (e.payment_method === 'card' && !e.bank_path) return 'Chybí potvrzení';
  if (e.ocr && e.ocr.reviewed === false && !e.ocr.autoReady) return 'OCR potřebuje kontrolu';
  return 'Doklady kompletní';
}
export function summarize(expenses = [], funding = []) {
  const deposit = funding.filter(x => x.kind === 'advance').reduce((s, x) => s + Math.round(Number(x.amount) * 100), 0) / 100;
  const returned = funding.filter(x => x.kind === 'return').reduce((s, x) => s + Math.round(Number(x.amount) * 100), 0) / 100;
  const spent = expenses.reduce((s, x) => s + Math.round(Number(x.amount || 0) * 100), 0) / 100;
  const missingBank = expenses.filter(x => x.payment_method === 'card' && !x.bank_path).length;
  const incomplete = expenses.filter(x => expenseStatus(x) !== 'Doklady kompletní').length;
  return { deposit, returned, spent, remaining: Math.round((deposit - returned - spent) * 100) / 100, missingBank, incomplete, count: expenses.length };
}
export function safeFilename(value) {
  return (value || 'doklad').normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(0, 65) || 'doklad';
}
export function csvCell(value) {
  return '"' + String(value ?? '').replace(/"/g, '""') + '"';
}
