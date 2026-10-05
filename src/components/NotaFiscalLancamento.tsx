import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { brl } from '../lib/format'

type Compra = {
  id: string
  empresa_apelido: string | null
  data_compra: string
  valor_operacao_cartao: number
  valor_nf_total: number
  status_conferencia: string
  numeros_nf: string | null
}

type Nota = {
  id: string
  numero_nf: string | null
  serie_nf: string | null
  data_emissao: string | null
  valor_total: number
}

type Props = {
  rows: Compra[]
  canEdit: boolean
}

function parseNumber(value: string) {
  const normalized = value.replace(/\./g, '').replace(',', '.')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : NaN
}

function dateOnly(value?: string | null) {
  return value ? value.slice(0, 10) : ''
}

export function NotaFiscalLancamento({ rows, canEdit }: Props) {
  const [compraId, setCompraId] = useState('')
  const [numero, setNumero] = useState('')
  const [serie, setSerie] = useState('')
  const [data, setData] = useState('')
  const [valor, setValor] = useState('')
  const [observacao, setObservacao] = useState('')
  const [notas, setNotas] = useState<Nota[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const selected = useMemo(() => rows.find(r => r.id === compraId) ?? null, [rows, compraId])
  const nfTotal = notas.reduce((sum, n) => sum + Number(n.valor_total || 0), 0)
  const cardTotal = Number(selected?.valor_operacao_cartao || 0)
  const projected = nfTotal + (Number.isFinite(parseNumber(valor)) ? parseNumber(valor) : 0)
  const difference = projected - cardTotal

  async function loadNotas(id: string) {
    if (!id) { setNotas([]); return }
    const { data, error } = await supabase
      .from('compras_ml_notas')
      .select('id,numero_nf,serie_nf,data_emissao,valor_total')
      .eq('compra_id', id)
      .order('data_emissao', { ascending: true })
    if (error) setMessage(`Não foi possível consultar as NF(s): ${error.message}`)
    else setNotas((data ?? []) as Nota[])
  }

  useEffect(() => { loadNotas(compraId) }, [compraId])

  async function save() {
    if (!canEdit || !selected) return
    const amount = parseNumber(valor)
    if (!numero.trim()) { setMessage('Informe o número da NF.'); return }
    if (!data) { setMessage('Informe a data de emissão da NF.'); return }
    if (!Number.isFinite(amount) || amount <= 0) { setMessage('Informe um valor de NF válido.'); return }

    setBusy(true)
    setMessage('')
    const { error } = await supabase.from('compras_ml_notas').insert({
      compra_id: selected.id,
      numero_nf: numero.trim(),
      serie_nf: serie.trim() || null,
      data_emissao: data,
      valor_produtos: amount,
      valor_frete: 0,
      valor_desconto: 0,
      valor_ipi: 0,
      valor_outras_despesas: 0,
      valor_total: amount,
      status_nf: 'LANÇADA',
      observacao: observacao.trim() || null,
    })
    if (error) {
      setMessage(`Não foi possível lançar a NF: ${error.message}`)
    } else {
      await loadNotas(selected.id)
      setNumero('')
      setSerie('')
      setData('')
      setValor('')
      setObservacao('')
      setMessage('NF lançada. A data e o valor da NF não são comparados individualmente com o cartão.')
    }
    setBusy(false)
  }

  if (!canEdit) return null

  return <div className="import-box" style={{ marginTop: 20 }}>
    <h3>Lançamento de NF — vinculado à compra/cartão</h3>
    <p className="muted">A NF é vinculada à compra selecionada. <b>Data e valor da NF são independentes da data e do valor do cartão.</b> O sistema compara somente o total acumulado das NF(s) com o total do cartão.</p>

    <div className="form-grid">
      <label>Compra/cartão *
        <select value={compraId} onChange={e => { setCompraId(e.target.value); setMessage('') }}>
          <option value="">Selecione a compra</option>
          {rows.map(r => <option key={r.id} value={r.id}>{r.empresa_apelido ?? 'Empresa'} · {dateOnly(r.data_compra).split('-').reverse().join('/')} · {brl(r.valor_operacao_cartao)} · Req. {r.id.slice(0, 8)}</option>)}
        </select>
      </label>
      <label>Número da NF *<input value={numero} onChange={e => setNumero(e.target.value)} /></label>
      <label>Série<input value={serie} onChange={e => setSerie(e.target.value)} /></label>
      <label>Data de emissão da NF *<input type="date" value={data} onChange={e => setData(e.target.value)} /></label>
      <label>Valor total da NF *<input inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" /></label>
      <label>Observação<input value={observacao} onChange={e => setObservacao(e.target.value)} /></label>
    </div>

    {selected && <div className="notice">
      <b>Compra selecionada:</b> cartão {dateOnly(selected.data_compra).split('-').reverse().join('/')} · {brl(cardTotal)}
      {' · '}NF(s) já lançadas: {brl(nfTotal)}
      {' · '}<b>Após esta NF: {brl(projected)}</b>
      {difference < -0.01 ? <> · <span className="warn">AGUARDANDO NF — faltam {brl(Math.abs(difference))}</span></> :
       difference > 0.01 ? <> · <span className="warn">DIVERGÊNCIA — NF(s) excedem o cartão em {brl(difference)}. O lançamento não será bloqueado.</span></> :
       <> · <b>CONCILIADO</b></>}
    </div>}

    {message && <div className={message.startsWith('Não') || message.startsWith('Informe') ? 'error-box' : 'notice'}>{message}</div>}

    <div className="actions">
      <button className="primary" onClick={save} disabled={busy || !selected}>{busy ? 'Lançando...' : 'Lançar NF'}</button>
    </div>

    {selected && <div className="table-wrap" style={{ marginTop: 12 }}>
      <table className="data-table"><thead><tr><th>NF</th><th>Série</th><th>Emissão</th><th>Valor</th></tr></thead>
      <tbody>{notas.length ? notas.map(n => <tr key={n.id}><td>{n.numero_nf ?? '—'}</td><td>{n.serie_nf ?? '—'}</td><td>{dateOnly(n.data_emissao).split('-').reverse().join('/')}</td><td>{brl(Number(n.valor_total))}</td></tr>) : <tr><td colSpan={4}>Nenhuma NF vinculada a esta compra.</td></tr>}</tbody></table>
    </div>}
  </div>
}
