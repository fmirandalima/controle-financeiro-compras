export function brl(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}
export function pct(value: number) { return `${Math.round(value)}%` }
export function parseMoney(input: unknown): number | null {
  if (input === null || input === undefined || String(input).trim() === '') return null
  const raw = String(input).trim().replace(/\s/g, '')
  const normalized = raw.includes(',') && raw.includes('.') ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(',', '.')
  const n = Number(normalized.replace(/[R$]/gi, ''))
  return Number.isFinite(n) ? n : null
}
export function parseDateBR(input: unknown): string | null {
  const s = String(input ?? '').trim(); if (!s) return null
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) { const [d,m,y]=s.split('/'); return `${y}-${m}-${d}` }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const date = new Date(s); return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0,10)
}