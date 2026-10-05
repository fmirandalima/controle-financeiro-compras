import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Empresa, Perfil } from '../types'
import { brl } from '../lib/format'
import { NotaFiscalLancamento } from './NotaFiscalLancamento'

 type Compra = {
  id: string
  empresa_id: string
  empresa_apelido: string | null
  nro_requisicao: number
  nro_oc: number | null
  data_compra: string
  ml_order_id: string | null
  valor_operacao_cartao: number
  ultimos_digitos_cartao: string | null
  valor_nf_total: number
  data_cartao: string | null
  data_estorno: string | null
  mercado_entregue: boolean | null
  palavra_chave: string | null
  status_conferencia: string
  status_erp: boolean
  observacao: string | null
  notas_count: number
  itens_count: number
  numeros_nf: string | null
}

type Props = { profile: Perfil; empresas: Empresa[] }

const PAGE_OPTIONS = [20, 50]

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : ''
}

function parseNumber(value: string) {
  const normalized = value.replace(/\./g, '').replace(',', '.')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : NaN
}

export function PurchasesPage({ profile, empresas }: Props) {
  const [mode, setMode] = useState<'consulta' | 'lancamento'>('consulta')
  const [rows, setRows] = useState<Compra[]>([])
  const [empresa, setEmpresa] = useState(String(empresas[0]?.id ?? ''))
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [pageSize, setPageSize] = useState(20)
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<Compra | null>(null)
  const [form, setForm] = useState({ nro_requisicao: '', data_compra: '', ml_order_id: '', valor: '', nro_oc: '', ultimos_digitos_cartao: '', observacao: '' })
  const [lancamentoEmpresa, setLancamentoEmpresa] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importRows, setImportRows] = useState<Array<Record<string, string>>>([])
  const [importEmpresa, setImportEmpresa] = useState('')
  const canEdit = profile.role === 'FATURAMENTO' || profile.role === 'COMPRAS'
  const canEditErp = profile.role === 'FATURAMENTO'

  async function load() {
    setBusy(true)
    setMessage('')
    let q = supabase.from('vw_acompanhamento_compras').select('*').order('data_compra', { ascending: false })
    if (empresa) q = q.eq('empresa_id', empresa)
    if (status) q = q.eq('status_conferencia', status)
    if (search.trim()) {
      const s = search.trim()
      const safe = s.replace(/[^0-9A-Za-z-]/g, '')
      if (safe) {
        const filters = [
          `ml_order_id.ilike.*${safe}*`,
          `numeros_nf.ilike.*${safe}*`,
        ]
        if (/^\d{1,7}$/.test(safe)) {
          filters.unshift(`nro_requisicao.eq.${Number(safe)}`)
          filters.unshift(`nro_oc.eq.${Number(safe)}`)
        }
        q = q.or(filters.join(','))
      }
    }
    const { data, error } = await q
    if (error) setMessage(`Erro ao consultar Compras: ${error.message}`)
    else setRows((data ?? []) as Compra[])
    setPage(1)
    setBusy(false)
  }

  useEffect(() => { if (!empresa && empresas[0]) setEmpresa(String(empresas[0].id)) }, [empresas])
  useEffect(() => { if (mode === 'consulta') load() }, [empresa, status])

  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const visible = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [rows, page, pageSize])

  function newLaunch() {
    setSelected(null)
    setForm({ nro_requisicao: '', data_compra: '', ml_order_id: '', valor: '', nro_oc: '', ultimos_digitos_cartao: '', observacao: '' })
    setLancamentoEmpresa('')
    setMessage('')
    setMode('lancamento')
  }

  function edit(row: Compra) {
    setSelected(row)
    setLancamentoEmpresa(String(row.empresa_id))
    setForm({
      nro_requisicao: String(row.nro_requisicao ?? ''),
      data_compra: toDateInput(row.data_compra),
      ml_order_id: row.ml_order_id ?? '',
      valor: String(row.valor_operacao_cartao ?? '').replace('.', ','),
      nro_oc: row.nro_oc == null ? '' : String(row.nro_oc),
      ultimos_digitos_cartao: row.ultimos_digitos_cartao ?? '',
      observacao: row.observacao ?? '',
    })
    setMode('lancamento')
  }

  async function save() {
    if (!canEdit) return
    setBusy(true); setMessage('')
    const req = Number(form.nro_requisicao)
    const valor = parseNumber(form.valor)
    const oc = form.nro_oc.trim() ? Number(form.nro_oc) : null
    const cartao = form.ultimos_digitos_cartao.trim()
    const observacao = form.observacao.trim()
    if (!lancamentoEmpresa) { setMessage('Selecione a empresa do lançamento.'); setBusy(false); return }
    if (!Number.isInteger(req) || req < 0 || req > 9999999) { setMessage('Nº Requisição deve ser um número inteiro de até 7 dígitos.'); setBusy(false); return }
    if (!form.data_compra) { setMessage('Informe a data da compra.'); setBusy(false); return }
    if (!Number.isFinite(valor) || valor < 0) { setMessage('Informe um valor válido para o cartão.'); setBusy(false); return }
    if (oc !== null && (!Number.isInteger(oc) || oc < 0 || oc > 9999999)) { setMessage('Nº OC deve ser um número inteiro de até 7 dígitos.'); setBusy(false); return }
    if (cartao && !/^\d{1,4}$/.test(cartao)) { setMessage('Nº do cartão deve conter até 4 dígitos.'); setBusy(false); return }
    if (observacao.length > 10) { setMessage('Observação deve ter no máximo 10 caracteres.'); setBusy(false); return }
    const rpcName = selected ? 'atualizar_lancamento_compra' : 'criar_lancamento_compra'
    const rpcArgs = selected
      ? {
          p_id: selected.id, p_nro_requisicao: req, p_data_compra: form.data_compra,
          p_ml_order_id: form.ml_order_id.trim() || null, p_valor_operacao_cartao: valor, p_nro_oc: oc,
          p_ultimos_digitos_cartao: cartao || null, p_observacao: observacao || null,
        }
      : {
          p_empresa_id: lancamentoEmpresa, p_nro_requisicao: req, p_data_compra: form.data_compra,
          p_ml_order_id: form.ml_order_id.trim() || null, p_valor_operacao_cartao: valor, p_nro_oc: oc,
          p_ultimos_digitos_cartao: cartao || null, p_observacao: observacao || null, p_status_erp: false,
        }
    const { data, error } = await supabase.rpc(rpcName, rpcArgs)
    if (error) setMessage(`Não foi possível salvar: ${error.message}`)
    else {
      setMessage(selected ? 'Lançamento atualizado com sucesso.' : (oc === null ? 'Lançamento salvo. Atenção: Nº OC não informado; ele pode ser preenchido depois.' : 'Lançamento salvo com sucesso.'))
      await load()
      setMode('consulta')
    }
    setBusy(false)
    return data
  }

  async function importManual() {
    if (!importEmpresa) { setMessage('Selecione a empresa correspondente aos arquivos antes de confirmar a importação.'); return }
    if (!importRows.length) { setMessage('Selecione um arquivo CSV/TXT/Excel e faça a prévia antes de importar.'); return }
    setBusy(true); setMessage('')
    let processed = 0, errors = 0
    for (const r of importRows) {
      const get = (...names: string[]) => { const n = names.map(x => x.toLowerCase().trim()); const key = Object.keys(r).find(k => n.includes(k.toLowerCase().trim())); return key ? String(r[key] ?? '') : '' }
      const req = Number(get('nro requisicao','nº requisicao','requisicao','nro_requisicao','numero_requisicao','número requisição'))
      const data = get('data da compra','data','data_compra')
      const order = get('nro pedido','nº pedido','pedido','ml_order_id','numero do pedido','número do pedido')
      const valor = parseNumber(get('valor pago no cartao','valor pago no cartão','valor','valor_operacao_cartao','valor do pedido'))
      const cartao = get('final_cartao','final cartão','ultimos_digitos_cartao','últimos dígitos do cartão').replace(/\D/g,'').slice(0,4)
      const ocRaw = get('nro oc','nº oc','oc','nro_ordem_compra'); const oc = ocRaw ? Number(ocRaw) : null
      if (!Number.isInteger(req) || req < 0 || req > 9999999 || !data || !order || !Number.isFinite(valor) || valor < 0) { errors++; continue }
      const { error } = await supabase.rpc('criar_lancamento_compra', { p_empresa_id: importEmpresa, p_nro_requisicao: req, p_data_compra: data, p_ml_order_id: order, p_valor_operacao_cartao: valor, p_nro_oc: Number.isInteger(oc) ? oc : null, p_ultimos_digitos_cartao: cartao || null, p_observacao: null, p_status_erp: false })
      if (error) errors++; else processed++
    }
    const empresaNome = empresas.find(e => String(e.id) === importEmpresa)?.nome ?? 'empresa selecionada'
    setMessage(`Importação concluída para ${empresaNome}. Registros processados: ${processed}.${errors ? ` ${errors} linha(s) com erro.` : ''}`)
    setImportRows([]); setImportFile(null); setImportEmpresa(''); await load(); setBusy(false)
  }

  async function prepareFile(file: File) {
    setImportFile(file); setMessage('')
    const ext = file.name.toLowerCase().split('.').pop()
    try {
      let rows: Array<Record<string, string>> = []
      if (ext === 'xlsx' || ext === 'xls') {
        const XLSX = await import('xlsx'); const buffer = await file.arrayBuffer(); const wb = XLSX.read(buffer, { type: 'array' }); const ws = wb.Sheets[wb.SheetNames[0]]; rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })
      } else {
        const Papa = await import('papaparse'); const raw = await file.text(); const parsed = Papa.default.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true, delimiter: '' }); rows = parsed.data
      }
      setImportRows(rows); setMessage(`Prévia pronta: ${file.name}. ${Math.min(8, rows.length)} linha(s) serão exibidas abaixo.`)
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Falha ao ler o arquivo.') }
  }

  const statuses = ['AGUARDANDO','AGUARDANDO_NF','CONCILIADO','DIVERGENCIA','ESTORNADO','ENTREGUE','PENDENCIA']

  return <section className="panel purchases-panel">
    <div className="panel-head">
      <div><h2>Compras — Mercado Livre</h2><p className="muted">Consulta e lançamento de compras. Integração automática está em stand by.</p></div>
      <div className="actions"><button className={mode === 'consulta' ? 'primary' : ''} onClick={() => setMode('consulta')}>Consulta</button>{canEdit && <button className={mode === 'lancamento' ? 'primary' : ''} onClick={newLaunch}>Novo lançamento</button>}</div>
    </div>

    {mode === 'consulta' ? <>
      <div className="filters purchase-filters">
        <select value={empresa} onChange={e => setEmpresa(e.target.value)}><option value="">Todas as empresas</option>{empresas.map(e => <option key={e.id} value={String(e.id)}>{e.nome}</option>)}</select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Requisição, OC, NF ou pedido ML" onKeyDown={e => { if (e.key === 'Enter') load() }} />
        <select value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos os status</option>{statuses.map(s => <option key={s}>{s}</option>)}</select>
        <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}>{PAGE_OPTIONS.map(n => <option key={n} value={n}>{n} registros</option>)}</select>
        <button onClick={load} disabled={busy}>{busy ? 'Consultando...' : 'Atualizar'}</button>
      </div>
      {message && <div className="notice">{message}</div>}
      <div className="table-wrap"><table className="data-table purchase-table"><thead><tr><th>Empresa</th><th>Requisição</th><th>OC</th><th>Data compra</th><th>Pedido Mercado Livre</th><th>Cartão</th><th>NF total</th><th>Valor cartão</th><th>Entrega</th><th>NF Lançada?</th><th>Observação</th><th>Status</th><th></th></tr></thead>
      <tbody>{visible.length ? visible.map(r => <tr key={r.id}><td><b>{r.empresa_apelido ?? '—'}</b></td><td><b>{r.nro_requisicao}</b></td><td>{r.nro_oc ?? <span className="warn">Não informado</span>}</td><td>{toDateInput(r.data_compra).split('-').reverse().join('/')}</td><td>{r.ml_order_id ?? '—'}</td><td>•••• {r.ultimos_digitos_cartao ?? '—'}</td><td>{brl(r.valor_nf_total)}</td><td>{brl(r.valor_operacao_cartao)}</td><td>{r.mercado_entregue === true ? 'Sim' : r.mercado_entregue === false ? 'Não' : '—'}</td><td>{canEditErp ? <input type="checkbox" checked={!!r.status_erp} onChange={async e => { const checked = e.target.checked; const { error } = await supabase.rpc('atualizar_status_erp_compra', { p_id: r.id, p_status_erp: checked }); if (error) setMessage(`Não foi possível alterar NF Lançada?: ${error.message}`); else setRows(prev => prev.map(x => x.id === r.id ? { ...x, status_erp: checked } : x)) }} /> : <input type="checkbox" checked={!!r.status_erp} readOnly />} </td><td>{r.observacao ?? '—'}</td><td><span className="tag">{r.status_conferencia}</span></td><td>{canEdit && <button className="mini" onClick={() => edit(r)}>Editar</button>}</td></tr>) : <tr><td colSpan={14}>Nenhum lançamento encontrado.</td></tr>}</tbody></table></div>
      <div className="pagination"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button><span>Página {page} de {pages} · {rows.length} registro(s)</span><button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Próxima</button></div>

      {canEdit && <NotaFiscalLancamento rows={rows} canEdit={canEdit} />}

      {canEdit && <div className="import-box"><h3>Importação de dados do Mercado Livre</h3><p className="muted">Use arquivos <b>CSV, TXT ou Excel</b> para carga manual. Os dados são pré-visualizados antes do processamento.</p>
        <div className="form-grid"><label>Qual empresa corresponde aos arquivos que você está importando? *<select value={importEmpresa} onChange={e => setImportEmpresa(e.target.value)}><option value="">Selecione a empresa</option>{empresas.map(e => <option key={e.id} value={String(e.id)}>{e.nome}</option>)}</select></label></div>
        {importEmpresa && <div className="notice">Empresa da importação: <b>{empresas.find(e => String(e.id) === importEmpresa)?.nome}</b></div>}
        <div className="actions"><label className="file-button">Importar dados CSV, TXT ou Excel do Mercado Livre<input type="file" accept=".csv,.txt,.xlsx,.xls" onChange={e => { const f = e.target.files?.[0]; if (f) prepareFile(f) }} /></label><button disabled className="standby-button" title="Integração automática temporariamente desativada">Integrador com Mercado Livre: importar automaticamente — Em stand by</button></div>
        {importFile && <div className="notice">Arquivo: <b>{importFile.name}</b> · {importRows.length} linha(s) lida(s).</div>}
        {!!importRows.length && <><div className="table-wrap"><table><thead><tr>{Object.keys(importRows[0]).slice(0,8).map(k => <th key={k}>{k}</th>)}</tr></thead><tbody>{importRows.slice(0,8).map((r,i)=><tr key={i}>{Object.keys(importRows[0]).slice(0,8).map(k=><td key={k}>{r[k]}</td>)}</tr>)}</tbody></table></div><div className="actions"><button className="primary" onClick={importManual} disabled={busy || !importEmpresa}>{busy ? 'Processando...' : 'Confirmar importação'}</button><button onClick={() => { setImportRows([]); setImportFile(null); setImportEmpresa('') }}>Cancelar prévia</button></div></>}
      </div>}
    </> : <>
      <div className="form-grid">
        <label>Empresa do lançamento *<select value={lancamentoEmpresa} disabled={!!selected} onChange={e => setLancamentoEmpresa(e.target.value)}><option value="">Selecione a empresa</option>{empresas.map(e => <option key={e.id} value={String(e.id)}>{e.nome}</option>)}</select></label>
        <label>Nº Requisição *<input inputMode="numeric" maxLength={7} value={form.nro_requisicao} onChange={e => setForm(f => ({ ...f, nro_requisicao: e.target.value.replace(/\D/g,'').slice(0,7) }))} placeholder="Até 7 dígitos" /></label>
        <label>Data da compra *<input type="date" value={form.data_compra} onChange={e => setForm(f => ({ ...f, data_compra: e.target.value }))} /></label>
        <label>Nº pedido/compra Mercado Livre<input value={form.ml_order_id} onChange={e => setForm(f => ({ ...f, ml_order_id: e.target.value }))} placeholder="Pedido Mercado Livre" /></label>
        <label>Valor pago no cartão *<input inputMode="decimal" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} placeholder="0,00" /></label>
        <label>Nº do cartão<input inputMode="numeric" maxLength={4} value={form.ultimos_digitos_cartao} onChange={e => setForm(f => ({ ...f, ultimos_digitos_cartao: e.target.value.replace(/\D/g,'').slice(0,4) }))} placeholder="Últimos 4 dígitos" /></label>
        <label>Observação<input maxLength={10} value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value.slice(0,10) }))} placeholder="Até 10 caracteres" /></label>
        <label>Nº Ordem de Compra (OC)<input inputMode="numeric" maxLength={7} value={form.nro_oc} onChange={e => setForm(f => ({ ...f, nro_oc: e.target.value.replace(/\D/g,'').slice(0,7) }))} placeholder="Opcional" /></label>
      </div>
      {message && <div className={message.startsWith('Não') || message.startsWith('Nº') || message.startsWith('Informe') ? 'error-box' : 'notice'}>{message}</div>}
      <div className="actions"><button className="primary" onClick={save} disabled={busy || !lancamentoEmpresa}>{busy ? 'Salvando...' : 'Salvar lançamento'}</button><button onClick={() => setMode('consulta')}>Cancelar</button></div>
      <div className="notice"><b>Regra da OC:</b> se o Nº OC ficar em branco, o lançamento será salvo normalmente. O Nº OC poderá ser preenchido posteriormente pelo comprador ou pelo FATURAMENTO.</div>
      {selected && <p className="tiny">Editando lançamento {selected.nro_requisicao} · ID {selected.id}</p>}
    </>}
  </section>
}
