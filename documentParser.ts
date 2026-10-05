import { parseDateBR, parseMoney } from './format'
import type { ImportRow } from '../types'

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = text.match(p)
    if (m?.[1]) return m[1].trim()
  }
  return null
}

export function parseDocumentText(text: string): { row: ImportRow | null; warnings: string[] } {
  const clean = text.replace(/\r/g, ' ').replace(/\s+/g, ' ').trim()
  const warnings: string[] = []
  const dateRaw = firstMatch(clean, [
    /(?:data(?: da)? (?:compra|transa(?:ção|cao))?|data)\s*[:\-]?\s*(\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4})/i,
    /(\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4})/,
  ])
  const valueRaw = firstMatch(clean, [
    /(?:valor(?: total| pago)?|total|importe)\s*[:\-]?\s*(?:R\$\s*)?([\d\.]+,\d{2})/i,
    /R\$\s*([\d\.]+,\d{2})/i,
  ])
  const cardRaw = firstMatch(clean, [
    /(?:cart(?:ão|ao)|final|últimos? dígitos|ultimos? digitos)[^\d]{0,20}(\d{4})\b/i,
  ])
  const description = firstMatch(clean, [
    /(?:descri(?:ção|cao)|estabelecimento|merchant|produto|compra)\s*[:\-]\s*([^|;]{3,100})/i,
  ])

  const data = parseDateBR(dateRaw)
  const valor = parseMoney(valueRaw)
  if (!data) warnings.push('Data não identificada automaticamente.')
  if (valor === null) warnings.push('Valor não identificado automaticamente.')
  if (!description) warnings.push('Descrição não identificada automaticamente; revise antes de confirmar.')
  if (!data || valor === null) return { row: null, warnings }

  return {
    row: {
      data,
      movimentacao: 'Compra nacional',
      descricao: description,
      valor,
      meio_pagamento: cardRaw ? 'Cartão corporativo' : null,
      ultimos_digitos_cartao: cardRaw,
      titular_cartao: null,
      categoria: null,
      qtd_recibos_notas: 1,
    },
    warnings,
  }
}
