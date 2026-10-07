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
  observacao_divergencia: string | null
  status_erp: boolean
  cartao: boolean
  status_entrega: string | null
  oc_cancelada: boolean
  cidade_uf_destino: string | null
  observacao: string | null
  numeros_nf: string | null
  resumo_conferencia?: string | null
  quantidade_notas?: number
  quantidade_itens?: number
  quantidade_itens?: number
  ml_pack_id?: string | null
  ml_paid_amount?: number | null
  ml_status?: string | null
  ml_status_detail?: string | null
  ml_buying_mode?: string | null
  ml_currency_id?: string | null
  ml_buyer_id?: string | null
  ml_seller_id?: string | null
  ml_shipping_id?: string | null
  ml_tags?: string | null
  ml_date_closed?: string | null
  ml_last_updated?: string | null
  ml_resumo_financeiro?: string | null
  ml_coupon_amount?: number | null
  ml_discount_amount?: number | null
  ml_coupon_id?: string | null
}

type Nota = {
  id: string
  numero_nf: string | null
  serie_nf: string | null
  data_emissao: string | null
  valor_total: number
  status_nf?: string
}

type Item = {
  id: string
  nota_fiscal_id: string
  numero_item?: number | null
  descricao: string
  quantidade: number
  unidade?: string | null
  valor_unitario: number
  valor_produtos: number
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
  const [viewing, setViewing] = useState<Compra | null>(null)
  const [viewingNotas, setViewingNotas] = useState<Nota[]>([])
  const [viewingItens, setViewingItens] = useState<Item[]>([])
  const [viewBusy, setViewBusy] = useState(false)
  const [form, setForm] = useState({ nro_requisicao: '', data_compra: '', ml_order_id: '', valor: '', nro_oc: '', ultimos_digitos_cartao: '', observacao: '' })
  const [lancamentoEmpresa, setLancamentoEmpresa] = useState('')
  const [cartaoMarcado, setCartaoMarcado] = useState(true)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importRows, setImportRows] = useState<Array<Record<string, string>>>([])
  const [importEmpresa, setImportEmpresa] = useState('')
  const [mlStatus, setMlStatus] = useState<Record<string, { empresa_id: string | null; status: string; mensagem: string | null }>>({})
  const [mlMessage, setMlMessage] = useState('')
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
  async function loadMlStatus() {
    const { data, error } = await supabase.from('integracoes_empresa')
      .select('codigo_empresa,empresa_id,status,mensagem').eq('integracao', 'MERCADO_LIVRE')
    if (error) { setMlMessage('Não foi possível consultar o status Mercado Livre: ' + error.message); return }
    const next: Record<string, { empresa_id: string | null; status: string; mensagem: string | null }> = {}
    for (const row of (data ?? []) as Array<{codigo_empresa:string;empresa_id:string|null;status:string;mensagem:string|null}>) next[row.codigo_empresa] = row
    setMlStatus(next)
  }
  useEffect(() => { void loadMlStatus() }, [])

  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const visible = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [rows, page, pageSize])

  function newLaunch() {
    setSelected(null)
    setForm({ nro_requisicao: '', data_compra: '', ml_order_id: '', valor: '', nro_oc: '', ultimos_digitos_cartao: '', observacao: '' })
    setLancamentoEmpresa('')
    setCartaoMarcado(true)
    setMessage('')
    setMode('lancamento')
  }

  function edit(row: Compra) {
    setSelected(row)
    setLancamentoEmpresa(String(row.empresa_id))
    setCartaoMarcado(Boolean(row.cartao))
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


  async function openView(row: Compra) {
    setViewing(row)
    setViewingNotas([])
    setViewingItens([])
    setViewBusy(true)
    const notesResult = await supabase
      .from('compras_ml_notas')
      .select('id,numero_nf,serie_nf,data_emissao,valor_total,status_nf')
      .eq('compra_id', row.id)
      .order('data_emissao', { ascending: true })

    if (notesResult.error) {
      setMessage('Não foi possível carregar os documentos fiscais: ' + notesResult.error.message)
      setViewBusy(false)
      return
    }

    const notes = (notesResult.data ?? []) as Nota[]
    setViewingNotas(notes)

    if (notes.length) {
      const itemsResult = await supabase
        .from('compras_ml_nf_itens')
        .select('id,nota_fiscal_id,numero_item,descricao,quantidade,unidade,valor_unitario,valor_produtos')
        .in('nota_fiscal_id', notes.map(n => n.id))
      if (itemsResult.error) {
        setMessage('Não foi possível carregar os itens das NF(s): ' + itemsResult.error.message)
      } else {
        setViewingItens((itemsResult.data ?? []) as Item[])
      }
    }
    setViewBusy(false)
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
    if (observacao.length > 120) { setMessage('Observação deve ter no máximo 120 caracteres.'); setBusy(false); return }
    const rpcName = selected ? 'atualizar_lancamento_compra' : 'criar_lancamento_compra'
    const rpcArgs = selected
      ? {
          p_id: selected.id, p_empresa_id: lancamentoEmpresa, p_nro_requisicao: req, p_data_compra: form.data_compra,
          p_ml_order_id: form.ml_order_id.trim() || null, p_valor_operacao_cartao: valor, p_nro_oc: oc,
          p_ultimos_digitos_cartao: cartao || null, p_observacao: observacao || null, p_status_erp: Boolean(selected.status_erp),
          p_cartao: cartaoMarcado, p_status_entrega: selected.status_entrega || 'PENDENTE', p_oc_cancelada: Boolean(selected.oc_cancelada), p_cidade_uf_destino: selected.cidade_uf_destino || null,
        }
      : {
          p_empresa_id: lancamentoEmpresa, p_nro_requisicao: req, p_data_compra: form.data_compra,
          p_ml_order_id: form.ml_order_id.trim() || null, p_valor_operacao_cartao: valor, p_nro_oc: oc,
          p_ultimos_digitos_cartao: cartao || null, p_observacao: observacao || null, p_status_erp: false, p_cartao: cartaoMarcado, p_status_entrega: 'PENDENTE', p_oc_cancelada: false, p_cidade_uf_destino: null,
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
      const { error } = await supabase.rpc('criar_lancamento_compra', { p_empresa_id: importEmpresa, p_nro_requisicao: req, p_data_compra: data, p_ml_order_id: order, p_valor_operacao_cartao: valor, p_nro_oc: Number.isInteger(oc) ? oc : null, p_ultimos_digitos_cartao: cartao || null, p_observacao: null, p_status_erp: false, p_cartao: true, p_status_entrega: 'PENDENTE', p_oc_cancelada: false, p_cidade_uf_destino: null })
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
      <div><h2>Compras — Mercado Livre · Layout 2.0</h2><p className="muted">Consulta, visualização e edição dos lançamentos. O cartão permanece como um único pagamento e as NF(s) ficam fracionadas em DOCUMENTO FISCAL.</p></div>
      <div className="actions"><button className={mode === 'consulta' ? 'primary' : ''} onClick={() => setMode('consulta')}>Consulta</button>{canEdit && <button className={mode === 'lancamento' ? 'primary' : ''} onClick={newLaunch}>Novo lançamento</button>}</div>
    </div>

    {mode === 'consulta' ? <>
      <div className="import-box">
        <h3>Integração Mercado Livre por empresa</h3>
        <p className="muted">Conta Simples não participa deste fluxo. As ações abaixo são exclusivas da importação de compras do Mercado Livre.</p>
        {mlMessage && <div className="notice">{mlMessage}</div>}
        <div className="form-grid">
          {[
            ['104','Importar compras Mercado Livre — Empresa 104'],
            ['001','Importar compras Mercado Livre — Empresas Matriz e Filiais 001'],
          ].map(([codigo,titulo]) => {
            const s = mlStatus[codigo]
            const destino = empresas.find(e => e.codigo_empresa === codigo)
            return <article className="panel" key={codigo}>
              <h3>{titulo}</h3>
              <p className="muted">Destino: {destino ? codigo + ' — ' + destino.nome : codigo + ' — empresa não vinculada'}</p>
              <p><strong>Status:</strong> {s?.status ?? 'NÃO CONFIGURADO'}</p>
              <button className="primary" disabled={busy} onClick={async () => {
                if (!s?.empresa_id || s.status !== 'CONECTADO') {
                  setMlMessage('Empresa ' + codigo + ' não está conectada ao Mercado Livre. Nenhuma compra foi importada.')
                  return
                }
                if (codigo !== '104') {
                  setMlMessage('A importação automática da empresa ' + codigo + ' ainda não está habilitada.')
                  return
                }
                setBusy(true)
                setMlMessage('Sincronizando compras da empresa 104 com o Mercado Livre...')
                try {
                  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
                  if (sessionError || !sessionData.session) throw new Error('Sua sessão expirou. Faça login novamente.')
                  const today = new Date()
                  const end = today.toISOString().slice(0, 10)
                  const start = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10)
                  const { data, error } = await supabase.functions.invoke('ml-sync-orders-104', {
                    body: { start_date: start, end_date: end },
                    headers: { Authorization: 'Bearer ' + sessionData.session.access_token },
                  })
                  if (error) throw new Error(error.message || 'Não foi possível executar a sincronização.')
                  if (!data?.ok) throw new Error(data?.error || 'O Mercado Livre não retornou uma confirmação de sincronização.')
                  setMlMessage(
                    'Sincronização concluída. Pedidos encontrados: ' + Number(data.found ?? 0) +
                    '. Novos: ' + Number(data.inserted ?? 0) +
                    '. Atualizados: ' + Number(data.updated ?? 0) +
                    (Array.isArray(data.errors) && data.errors.length
                      ? '. Erros: ' + data.errors.length + '. Motivos: ' + data.errors.map((e: { order_id?: string; error?: string }) => 'Pedido ' + (e.order_id ?? '—') + ': ' + (e.error ?? 'erro não informado')).join(' | ')
                      : '. Nenhum erro.') 
                  )
                  await load()
                  await loadMlStatus()
                } catch (e) {
                  setMlMessage(e instanceof Error ? e.message : 'Falha ao sincronizar compras do Mercado Livre.')
                } finally {
                  setBusy(false)
                }
              }}>{busy ? 'Sincronizando...' : titulo}</button>
            </article>
          })}
        </div>
        <div className="actions"><button onClick={loadMlStatus}>Atualizar status ML</button></div>
      </div>

      <div className="filters purchase-filters">
        <select value={empresa} onChange={e => setEmpresa(e.target.value)}><option value="">Todas as empresas</option>{empresas.map(e => <option key={e.id} value={String(e.id)}>{e.nome}</option>)}</select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Requisição, OC, NF ou pedido ML" onKeyDown={e => { if (e.key === 'Enter') load() }} />
        <select value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos os status</option>{statuses.map(s => <option key={s}>{s}</option>)}</select>
        <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}>{PAGE_OPTIONS.map(n => <option key={n} value={n}>{n} registros</option>)}</select>
        <button onClick={load} disabled={busy}>{busy ? 'Consultando...' : 'Atualizar'}</button>
      </div>
      {message && <div className="notice">{message}</div>}
      <div className="table-wrap"><table className="data-table purchase-table"><thead><tr><th>Empresa</th><th>Requisição</th><th>OC</th><th>Data compra</th><th>Pedido Mercado Livre</th><th>Cartão</th><th>NF(s)</th><th>NF total</th><th>Valor cartão</th><th>Conferência</th><th>Status</th><th>Ações</th></tr></thead>
      <tbody>{visible.length ? visible.map(r => {
        const diff = Number(r.valor_operacao_cartao || 0) - Number(r.valor_nf_total || 0)
        return <tr key={r.id}>
          <td><b>{r.empresa_apelido ?? '—'}</b></td>
          <td><b>{r.nro_requisicao}</b></td>
          <td>{r.nro_oc ?? <span className="warn">Não informado</span>}</td>
          <td>{toDateInput(r.data_compra).split('-').reverse().join('/')}</td>
          <td>{r.ml_order_id ?? '—'}</td>
          <td>{r.cartao ? '✓ Sim' : 'Não'}</td>
          <td>{r.quantidade_notas ?? 0}</td>
          <td>{brl(r.valor_nf_total)}</td>
          <td>{brl(r.valor_operacao_cartao)}</td>
          <td>{diff > 0.01 ? <span className="warn">Faltam {brl(diff)}</span> : diff < -0.01 ? <span className="warn">Excede {brl(Math.abs(diff))}</span> : r.valor_nf_total > 0 ? 'Conciliado' : 'Aguardando NF'}</td>
          <td><span className="tag">{r.status_conferencia}</span></td>
          <td><div className="actions"><button className="mini" onClick={() => void openView(r)}>Visualizar</button>{canEdit && <button className="mini" onClick={() => edit(r)}>Editar</button>}</div></td>
        </tr>
      }) : <tr><td colSpan={12}>Nenhum lançamento encontrado.</td></tr>}</tbody></table></div>
      <div className="pagination"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button><span>Página {page} de {pages} · {rows.length} registro(s)</span><button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Próxima</button></div>

      {canEdit && <NotaFiscalLancamento rows={rows} canEdit={canEdit} />}

      {canEdit && <div className="import-box"><h3>Importação de dados do Mercado Livre</h3><p className="muted">Use arquivos <b>CSV, TXT ou Excel</b> para carga manual. Os dados são pré-visualizados antes do processamento.</p>
        <div className="form-grid"><label>Qual empresa corresponde aos arquivos que você está importando? *<select value={importEmpresa} onChange={e => setImportEmpresa(e.target.value)}><option value="">Selecione a empresa</option>{empresas.map(e => <option key={e.id} value={String(e.id)}>{e.nome}</option>)}</select></label></div>
        {importEmpresa && <div className="notice">Empresa da importação: <b>{empresas.find(e => String(e.id) === importEmpresa)?.nome}</b></div>}
        <div className="actions"><label className="file-button">Importar dados CSV, TXT ou Excel do Mercado Livre<input type="file" accept=".csv,.txt,.xlsx,.xls" onChange={e => { const f = e.target.files?.[0]; if (f) prepareFile(f) }} /></label><button disabled className="standby-button" title="A carga automática é feita pelos botões de sincronização por empresa acima">Integrador com Mercado Livre: importação automática disponível acima</button></div>
        {importFile && <div className="notice">Arquivo: <b>{importFile.name}</b> · {importRows.length} linha(s) lida(s).</div>}
        {!!importRows.length && <><div className="table-wrap"><table><thead><tr>{Object.keys(importRows[0]).slice(0,8).map(k => <th key={k}>{k}</th>)}</tr></thead><tbody>{importRows.slice(0,8).map((r,i)=><tr key={i}>{Object.keys(importRows[0]).slice(0,8).map(k=><td key={k}>{r[k]}</td>)}</tr>)}</tbody></table></div><div className="actions"><button className="primary" onClick={importManual} disabled={busy || !importEmpresa}>{busy ? 'Processando...' : 'Confirmar importação'}</button><button onClick={() => { setImportRows([]); setImportFile(null); setImportEmpresa('') }}>Cancelar prévia</button></div></>}
      </div>
    </> : <>
      <div className="form-grid">
        <label>Empresa do lançamento *
          <select value={lancamentoEmpresa} disabled={!!selected} onChange={e => setLancamentoEmpresa(e.target.value)}>
            <option value="">Selecione a empresa</option>
            {empresas.map(e => <option key={e.id} value={String(e.id)}>{e.nome}</option>)}
          </select>
        </label>
        <label>Nº Requisição *
          <input inputMode="numeric" maxLength={7} value={form.nro_requisicao} onChange={e => setForm(f => ({ ...f, nro_requisicao: e.target.value.replace(/\D/g,'').slice(0,7) }))} />
        </label>
        <label>Data da compra *
          <input type="date" value={form.data_compra} onChange={e => setForm(f => ({ ...f, data_compra: e.target.value }))} />
        </label>
        <label>Nº pedido/compra Mercado Livre
          <input value={form.ml_order_id} onChange={e => setForm(f => ({ ...f, ml_order_id: e.target.value }))} />
        </label>
        <label>Valor pago no cartão *
          <input inputMode="decimal" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} placeholder="0,00" />
        </label>
        <label>Últimos 4 dígitos do cartão
          <input inputMode="numeric" maxLength={4} value={form.ultimos_digitos_cartao} onChange={e => setForm(f => ({ ...f, ultimos_digitos_cartao: e.target.value.replace(/\D/g,'').slice(0,4) }))} />
        </label>
        <label>Observação (até 120 caracteres)
          <input maxLength={120} value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value.slice(0,120) }))} />
        </label>
        <label>Nº Ordem de Compra (OC)
          <input inputMode="numeric" maxLength={7} value={form.nro_oc} onChange={e => setForm(f => ({ ...f, nro_oc: e.target.value.replace(/\D/g,'').slice(0,7) }))} placeholder="Opcional" />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={cartaoMarcado} onChange={e => setCartaoMarcado(e.target.checked)} />
          Cartão — usar na conciliação
        </label>
      </div>
      {message && <div className={message.startsWith('Não') || message.startsWith('Informe') ? 'error-box' : 'notice'}>{message}</div>}
      <div className="actions">
        <button className="primary" onClick={() => void save()} disabled={busy || !lancamentoEmpresa}>{busy ? 'Salvando...' : 'Salvar lançamento'}</button>
        <button onClick={() => setMode('consulta')}>Cancelar</button>
      </div>
      <div className="notice"><b>Regra:</b> o Nº OC é opcional. A compra pode ser salva sem NF; quando as NF(s) chegarem, elas serão lançadas individualmente em DOCUMENTO FISCAL.</div>
    </>}

    {viewing && <div className="modal-backdrop" role="presentation" onClick={() => setViewing(null)}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="compra-detalhe-title" onClick={e => e.stopPropagation()}>
        <div className="panel-head">
          <div><h2 id="compra-detalhe-title">Visualização do lançamento</h2><p className="muted">Detalhes do lançamento, conciliação NF × cartão e retorno do Mercado Livre.</p></div>
          <button onClick={() => setViewing(null)}>Fechar</button>
        </div>
        <div className="detail-grid">
          <div><b>Empresa</b><span>{viewing.empresa_apelido ?? '—'}</span></div>
          <div><b>Nº Requisição</b><span>{viewing.nro_requisicao}</span></div>
          <div><b>Nº OC</b><span>{viewing.nro_oc ?? '—'}</span></div>
          <div><b>Pedido Mercado Livre</b><span>{viewing.ml_order_id ?? '—'}</span></div>
          <div><b>Pack</b><span>{viewing.ml_pack_id ?? '—'}</span></div>
          <div><b>Data da compra</b><span>{toDateInput(viewing.data_compra).split('-').reverse().join('/')}</span></div>
          <div><b>Valor pago no cartão</b><span>{brl(viewing.valor_operacao_cartao)}</span></div>
          <div><b>Valor pago informado pelo ML</b><span>{brl(viewing.ml_paid_amount)}</span></div>
          <div><b>Soma das notas</b><span>{brl(viewing.valor_nf_total)}</span></div>
          <div><b>Diferença cartão × notas</b><span>{brl(Math.abs(viewing.valor_nf_total - viewing.valor_operacao_cartao))}</span></div>
          <div><b>Quantidade de NF</b><span>{viewing.quantidade_notas ?? 0}</span></div>
          <div><b>Quantidade de itens</b><span>{viewing.quantidade_itens ?? 0}</span></div>
          <div><b>Números das NF</b><span>{viewing.numeros_nf ?? '—'}</span></div>
          <div><b>Frete ML</b><span>{brl(viewing.valor_frete)}</span></div>
          <div><b>Desconto</b><span>{brl(viewing.valor_desconto ?? 0)}</span></div>
          <div><b>Cupom</b><span>{viewing.ml_coupon_amount && viewing.ml_coupon_amount > 0 ? brl(viewing.ml_coupon_amount) : 'Nenhum cupom informado'}</span></div>
          <div><b>ID do cupom</b><span>{viewing.ml_coupon_id ?? '—'}</span></div>
          <div><b>Estorno</b><span>{viewing.data_estorno ? new Date(viewing.data_estorno).toLocaleString('pt-BR') : 'Nenhum informado'}</span></div>
          <div><b>Status da conferência</b><span className="tag">{viewing.status_conferencia}</span></div>
          <div style={{gridColumn:'1 / -1'}}><b>Conferência</b><span>{viewing.resumo_conferencia ?? viewing.observacao_divergencia ?? 'Sem divergência informada.'}</span></div>
          <div style={{gridColumn:'1 / -1'}}><b>Observação</b><span>{viewing.observacao ?? '—'}</span></div>
        </div>
        <div className="import-box">
          <h3>Retorno do Mercado Livre</h3>
          <div className="detail-grid">
            <div><b>Status ML</b><span>{viewing.ml_status ?? '—'}</span></div>
            <div><b>Detalhe do status</b><span>{viewing.ml_status_detail ?? '—'}</span></div>
            <div><b>Modo de compra</b><span>{viewing.ml_buying_mode ?? '—'}</span></div>
            <div><b>Moeda</b><span>{viewing.ml_currency_id ?? '—'}</span></div>
            <div><b>Comprador ID</b><span>{viewing.ml_buyer_id ?? '—'}</span></div>
            <div><b>Vendedor ID</b><span>{viewing.ml_seller_id ?? '—'}</span></div>
            <div><b>Envio ID</b><span>{viewing.ml_shipping_id ?? '—'}</span></div>
            <div><b>Tags</b><span>{viewing.ml_tags ?? '—'}</span></div>
            <div><b>Data fechamento ML</b><span>{viewing.ml_date_closed ? new Date(viewing.ml_date_closed).toLocaleString('pt-BR') : '—'}</span></div>
            <div><b>Última atualização ML</b><span>{viewing.ml_last_updated ? new Date(viewing.ml_last_updated).toLocaleString('pt-BR') : '—'}</span></div>
            <div style={{gridColumn:'1 / -1'}}><b>Resumo financeiro ML</b><span>{viewing.ml_resumo_financeiro ?? 'Nenhum ajuste financeiro retornado.'}</span></div>
          </div>
        </div>
<div className="import-box">
          <h3>DOCUMENTO FISCAL</h3>
          <p className="muted">Cada NF é um lançamento fiscal separado. O cartão permanece como um único pagamento. O acumulado mostra quanto das NF(s) já foi lançado contra o valor pago no cartão.</p>
          {viewBusy ? <div className="notice">Carregando documentos fiscais...</div> : viewingNotas.length === 0 ? <div className="notice">Nenhuma NF vinculada a esta compra. Quando a NF estiver disponível, lance-a individualmente e ela aparecerá aqui.</div> : <>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>#</th><th>NF</th><th>Série</th><th>Emissão</th><th>Valor NF</th><th>Acumulado</th><th>Saldo cartão</th><th>Status</th></tr></thead>
                <tbody>{(() => {
                  let accumulated = 0
                  return viewingNotas.map((n, index) => {
                    accumulated += Number(n.valor_total || 0)
                    const remaining = Number(viewing.valor_operacao_cartao || 0) - accumulated
                    return <tr key={n.id}>
                      <td>{index + 1}</td>
                      <td><b>{n.numero_nf ?? '—'}</b></td>
                      <td>{n.serie_nf ?? '—'}</td>
                      <td>{n.data_emissao ? n.data_emissao.slice(0,10).split('-').reverse().join('/') : '—'}</td>
                      <td>{brl(n.valor_total)}</td>
                      <td>{brl(accumulated)}</td>
                      <td>{brl(Math.max(0, remaining))}</td>
                      <td><span className="tag">{n.status_nf ?? 'LANÇADA'}</span></td>
                    </tr>
                  })
                })()}</tbody>
              </table>
            </div>
            <div className="notice"><b>Conferência das NF(s):</b> {viewing.resumo_conferencia ?? viewing.observacao_divergencia ?? 'Soma das NF(s) em conferência.'}</div>
            <div style={{ marginTop: 12 }}>
              <h4>Itens das NF(s)</h4>
              {viewingItens.length === 0 ? <p className="muted">Nenhum item detalhado foi registrado nas NF(s).</p> : <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>NF</th><th>Item</th><th>Descrição</th><th>Qtd.</th><th>Unitário</th><th>Total itens</th></tr></thead>
                  <tbody>{viewingItens.map(item => {
                    const note = viewingNotas.find(n => n.id === item.nota_fiscal_id)
                    return <tr key={item.id}>
                      <td>{note?.numero_nf ?? '—'}</td>
                      <td>{item.numero_item ?? '—'}</td>
                      <td>{item.descricao}</td>
                      <td>{item.quantidade} {item.unidade ?? ''}</td>
                      <td>{brl(item.valor_unitario)}</td>
                      <td>{brl(item.valor_produtos)}</td>
                    </tr>
                  })}</tbody>
                </table>
              </div>}
            </div>
          </>}
        </div>
                <div className="actions"><button onClick={() => { setViewing(null); edit(viewing) }} disabled={!canEdit}>Editar este lançamento</button></div>
      </div>
    </div>}
  </section>
}
