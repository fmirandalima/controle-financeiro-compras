import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Empresa, Perfil } from '../types'
import { brl } from '../lib/format'
import { ContaSimplesStatusBadge } from './ContaSimplesStatusBadge'
import { useScreenPermissions } from '../lib/permissions'

/**
 * Espelha EXATAMENTE public.vw_acompanhamento_compras (verificada no banco).
 * Atenção: a view expõe quantidade_notas / quantidade_itens
 * (e NÃO notas_count / itens_count, como a versão anterior assumia).
 */
type CompraView = {
  id: string
  empresa_id: string            // uuid — nunca number
  nro_requisicao: number
  nro_oc: number | null
  data_compra: string
  data_cartao: string | null
  data_estorno: string | null
  ml_order_id: string | null
  ml_pack_id: string | null
  valor_operacao_cartao: number
  valor_nf_total: number
  valor_frete: number
  valor_desconto: number
  valor_outras_despesas: number
  valor_ipi: number
  diferenca_cartao_nf: number | null
  tem_divergencia: boolean | null
  mercado_entregue: boolean | null
  palavra_chave: string | null
  ultimos_digitos_cartao: string | null
  conta_simples_transaction_id: string | null
  conta_simples_attachment_count: number
  conta_simples_comprovante: boolean
  status_conferencia: string
  observacao_divergencia: string | null
  quantidade_notas: number
  quantidade_itens: number
  created_at: string
  updated_at: string
  status_erp: boolean
  observacao: string | null
  empresa_apelido: string | null
}

type Props = { profile: Perfil; empresas: Empresa[] }

const PAGE_OPTIONS = [20, 50]

/** Valores reais da constraint compras_ml_status_check. Não inventar. */
const STATUS_VALIDOS = [
  'AGUARDANDO',
  'AGUARDANDO_NF',
  'CONCILIADO',
  'DIVERGENCIA',
  'ESTORNADO',
  'ENTREGUE',
  'PENDENCIA',
] as const

const OBS_MAX = 10 // limite imposto pelas RPCs no banco

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : ''
}

function formatarData(value?: string | null) {
  const d = toDateInput(value)
  return d ? d.split('-').reverse().join('/') : '—'
}

function parseNumber(value: string) {
  const normalized = value
    .replace(/R\$\s?/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : NaN
}

function normalizeImportKey(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

function normalizeImportDate(value: string) {
  const v = value.trim()
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const br = v.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})$/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  return null
}

const FORM_VAZIO = {
  nro_requisicao: '',
  data_compra: '',
  ml_order_id: '',
  valor: '',
  nro_oc: '',
  ultimos_digitos: '',
  observacao: '',
  status_erp: false,
}

export function PurchasesPage({ profile, empresas }: Props) {
  const [mode, setMode] = useState<'consulta' | 'lancamento'>('consulta')
  const [rows, setRows] = useState<CompraView[]>([])
  const [empresa, setEmpresa] = useState('')            // '' = todas
  const [empresaLancamento, setEmpresaLancamento] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [pageSize, setPageSize] = useState(20)
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [selected, setSelected] = useState<CompraView | null>(null)
  const [form, setForm] = useState({ ...FORM_VAZIO })
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importRows, setImportRows] = useState<Array<Record<string, string>>>([])

  const { permissions, loading: permissionsLoading } = useScreenPermissions(profile, 'COMPRAS')
  const canView = permissions.visualizar
  const canCreate = permissions.criar
  const canEdit = permissions.editar
  const canImport = permissions.importar

  function notificar(texto: string, erro = false) {
    setMessage(texto)
    setIsError(erro)
  }

  async function load() {
    setBusy(true)
    notificar('')
    let q = supabase
      .from('vw_acompanhamento_compras')
      .select('*')
      .order('data_compra', { ascending: false })

    if (empresa) q = q.eq('empresa_id', empresa)          // uuid, sem Number()
    if (status) q = q.eq('status_conferencia', status)
    if (search.trim()) {
      const s = search.trim()
      q = /^\d{1,7}$/.test(s) ? q.eq('nro_requisicao', Number(s)) : q.ilike('ml_order_id', `%${s}%`)
    }

    const { data, error } = await q
    if (error) {
      console.error('[Compras] erro na consulta:', error)
      notificar(`Erro ao consultar Compras: ${error.message}`, true)
    } else {
      setRows((data ?? []) as CompraView[])
      if (!data?.length) notificar('Nenhum lançamento encontrado para os filtros aplicados.')
    }
    setPage(1)
    setBusy(false)
  }

  useEffect(() => {
    if (!empresaLancamento && empresas[0]) setEmpresaLancamento(empresas[0].id)
  }, [empresas, empresaLancamento])

  useEffect(() => { if (mode === 'consulta' && canView) load() }, [empresa, status, mode, canView])

  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const visible = useMemo(
    () => rows.slice((page - 1) * pageSize, page * pageSize),
    [rows, page, pageSize]
  )

  function newLaunch() {
    setSelected(null)
    setForm({ ...FORM_VAZIO })
    notificar('')
    setMode('lancamento')
  }

  function edit(row: CompraView) {
    setSelected(row)
    setEmpresaLancamento(row.empresa_id)
    setForm({
      nro_requisicao: String(row.nro_requisicao ?? ''),
      data_compra: toDateInput(row.data_compra),
      ml_order_id: row.ml_order_id ?? '',
      valor: String(row.valor_operacao_cartao ?? '').replace('.', ','),
      nro_oc: row.nro_oc == null ? '' : String(row.nro_oc),
      ultimos_digitos: row.ultimos_digitos_cartao ?? '',
      observacao: row.observacao ?? '',
      status_erp: !!row.status_erp,
    })
    notificar('')
    setMode('lancamento')
  }

  /** Validações espelhando as regras das RPCs, para errar no cliente antes do banco. */
  function validar(): string | null {
    const req = Number(form.nro_requisicao)
    if (!Number.isInteger(req) || req < 0 || req > 9999999)
      return 'Nº Requisição é obrigatório: inteiro de até 7 dígitos.'
    if (!form.data_compra) return 'Informe a data da compra.'
    if (!form.ml_order_id.trim())
      return 'O Nº do pedido Mercado Livre é obrigatório (o banco exige este campo).'
    const valor = parseNumber(form.valor)
    if (!Number.isFinite(valor) || valor < 0) return 'Informe um valor válido para o cartão.'
    if (form.nro_oc.trim()) {
      const oc = Number(form.nro_oc)
      if (!Number.isInteger(oc) || oc < 0 || oc > 9999999)
        return 'Nº OC deve ser um inteiro de até 7 dígitos.'
    }
    if (form.ultimos_digitos.trim() && !/^\d{4}$/.test(form.ultimos_digitos.trim()))
      return 'Os últimos dígitos do cartão devem conter exatamente 4 números.'
    if (form.observacao.length > OBS_MAX)
      return `Observação deve ter no máximo ${OBS_MAX} caracteres.`
    if (!empresaLancamento) return 'Selecione a empresa do lançamento.'
    return null
  }

  async function save() {
    const allowed = selected ? canEdit : canCreate
    if (!allowed) {
      notificar(selected ? 'Você não possui permissão para editar lançamentos de Compras.' : 'Você não possui permissão para criar lançamentos de Compras.', true)
      return
    }
    const erro = validar()
    if (erro) { notificar(erro, true); return }

    setBusy(true)
    notificar('')

    const req = Number(form.nro_requisicao)
    const valor = parseNumber(form.valor)
    const oc = form.nro_oc.trim() ? Number(form.nro_oc) : null
    const digitos = form.ultimos_digitos.trim() || null
    const obs = form.observacao.trim() || null

    // Edição usa atualizar_lancamento_compra (8 params, sem empresa e sem status_erp).
    // Criação usa criar_lancamento_compra (9 params). Nenhuma tem DEFAULT no banco:
    // todos os parâmetros precisam ser enviados, senão o PostgREST não acha a função.
    const { error } = selected
      ? await supabase.rpc('atualizar_lancamento_compra', {
          p_id: selected.id,
          p_nro_requisicao: req,
          p_data_compra: form.data_compra,
          p_ml_order_id: form.ml_order_id.trim(),
          p_valor_operacao_cartao: valor,
          p_nro_oc: oc,
          p_ultimos_digitos_cartao: digitos,
          p_observacao: obs,
        })
      : await supabase.rpc('criar_lancamento_compra', {
          p_empresa_id: empresaLancamento,   // uuid
          p_nro_requisicao: req,
          p_data_compra: form.data_compra,
          p_ml_order_id: form.ml_order_id.trim(),
          p_valor_operacao_cartao: valor,
          p_nro_oc: oc,
          p_ultimos_digitos_cartao: digitos,
          p_observacao: obs,
          p_status_erp: form.status_erp,
        })

    if (error) {
      console.error('[Compras] erro ao salvar:', error)
      notificar(`Não foi possível salvar: ${error.message}`, true)
      setBusy(false)
      return
    }

    // status_erp na edição tem RPC própria
    if (selected && form.status_erp !== selected.status_erp) {
      const { error: e2 } = await supabase.rpc('atualizar_status_erp_compra', {
        p_id: selected.id,
        p_status_erp: form.status_erp,
      })
      if (e2) console.error('[Compras] erro ao atualizar status ERP:', e2)
    }

    notificar(
      oc === null
        ? 'Lançamento salvo. Atenção: Nº OC não informado — pode ser preenchido depois.'
        : 'Lançamento salvo com sucesso.'
    )
    await load()
    setSelected(null)
    setMode('consulta')
    setBusy(false)
  }

  async function importManual() {
    if (!importRows.length) {
      notificar('Selecione um arquivo CSV/TXT/Excel e faça a prévia antes de importar.', true)
      return
    }
    if (!empresaLancamento) { notificar('Selecione a empresa do lote de importação.', true); return }

    setBusy(true)
    notificar('')
    let ok = 0
    const falhas: string[] = []

    for (const [i, r] of importRows.entries()) {
      const get = (...names: string[]) => {
        const wanted = names.map(normalizeImportKey)
        const key = Object.keys(r).find(k => wanted.includes(normalizeImportKey(k)))
        return key ? String(r[key] ?? '').trim() : ''
      }

      const req = Number(get('nro requisicao', 'nº requisicao', 'requisicao', 'nro_requisicao'))
      const dataRaw = get('data da compra', 'data', 'data_compra')
      const data = normalizeImportDate(dataRaw)
      const order = get('nro pedido', 'nº pedido', 'pedido', 'ml_order_id', 'numero do pedido')
      const valor = parseNumber(
        get(
          'valor pago no cartao',
          'valor',
          'valor_operacao_cartao',
          'valor do pedido',
          'valor_total',
          'valor total'
        )
      )
      const ocRaw = get('nro oc', 'nº oc', 'oc', 'nro_ordem_compra')
      const digitos = get('ultimos digitos', 'últimos dígitos', 'final cartao', 'cartao')
      const statusRaw = get('status_erp', 'status erp').toLowerCase()
      const statusErp = ['sim', 's', 'true', '1', 'yes'].includes(statusRaw)

      if (!Number.isInteger(req) || req < 0 || req > 9999999) { falhas.push(`Linha ${i + 1}: requisição inválida`); continue }
      if (!data) { falhas.push(`Linha ${i + 1}: data inválida ou ausente (use DD/MM/AAAA ou AAAA-MM-DD)`); continue }
      if (!order) { falhas.push(`Linha ${i + 1}: pedido ML ausente (obrigatório)`); continue }
      if (!Number.isFinite(valor) || valor < 0) { falhas.push(`Linha ${i + 1}: valor inválido`); continue }
      if (ocRaw && (!/^\d+$/.test(ocRaw) || Number(ocRaw) > 9999999)) { falhas.push(`Linha ${i + 1}: Nº OC inválido`); continue }

      const { error } = await supabase.rpc('importar_lancamento_compra', {
        p_empresa_id: empresaLancamento,
        p_nro_requisicao: req,
        p_data_compra: data,
        p_ml_order_id: order,
        p_valor_operacao_cartao: valor,
        p_nro_oc: ocRaw ? Number(ocRaw) : null,
        p_ultimos_digitos_cartao: /^\d{4}$/.test(digitos) ? digitos : null,
        p_observacao: null,
        p_status_erp: statusErp,
      })

      if (error) falhas.push(`Linha ${i + 1}: ${error.message}`)
      else ok++
    }

    setImportRows([])
    setImportFile(null)
    await load()
    notificar(
      `Importação concluída: ${ok} registro(s) processado(s).` +
        (falhas.length ? ` ${falhas.length} com erro — ${falhas.slice(0, 3).join(' · ')}` : ''),
      falhas.length > 0
    )
    setBusy(false)
  }

  async function prepareFile(file: File) {
    setImportFile(file)
    notificar('')
    const ext = file.name.toLowerCase().split('.').pop()
    try {
      let linhas: Array<Record<string, string>> = []
      if (ext === 'xlsx' || ext === 'xls') {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
        linhas = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      } else {
        const Papa = await import('papaparse')
        const parsed = Papa.default.parse<Record<string, string>>(await file.text(), {
          header: true, skipEmptyLines: true,
        })
        linhas = parsed.data
      }
      setImportRows(linhas)
      // corrigido: usa o total recém-lido, não o estado antigo
      notificar(`Prévia pronta: ${file.name} · ${linhas.length} linha(s) lida(s).`)
    } catch (e) {
      console.error('[Compras] falha ao ler arquivo:', e)
      notificar(e instanceof Error ? e.message : 'Falha ao ler o arquivo.', true)
    }
  }

  if (permissionsLoading) {
    return <section className="panel purchases-panel"><div className="notice">Verificando permissões de Compras...</div></section>
  }

  if (!canView) {
    return <section className="panel purchases-panel"><div className="error-box">Você não possui permissão para visualizar a tela Compras.</div></section>
  }

  return <section className="panel purchases-panel">
    <div className="panel-head">
      <div>
        <h2>Compras — Mercado Livre</h2>
        <p className="muted">Consulta e lançamento de compras. Integração automática em stand by.</p>
      </div>
      <div className="actions">
        <button className={mode === 'consulta' ? 'primary' : ''} onClick={() => { setSelected(null); setMode('consulta') }}>Consulta</button>
        {canCreate && <button className={mode === 'lancamento' ? 'primary' : ''} onClick={newLaunch}>Novo lançamento</button>}
      </div>
    </div>

    <ContaSimplesStatusBadge />

    {message && <div className={isError ? 'error-box' : 'notice'}>{message}</div>}

    {mode === 'consulta' ? <>
      <div className="filters purchase-filters">
        <select value={empresa} onChange={e => setEmpresa(e.target.value)}>
          <option value="">Todas as empresas</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Nº Requisição ou pedido ML"
          onKeyDown={e => { if (e.key === 'Enter') load() }} />
        <select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {STATUS_VALIDOS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}>
          {PAGE_OPTIONS.map(n => <option key={n} value={n}>{n} registros</option>)}
        </select>
        <button onClick={load} disabled={busy}>{busy ? 'Consultando...' : 'Atualizar'}</button>
      </div>

      <div className="table-wrap">
        <table className="data-table purchase-table">
          <thead><tr>
            <th>Empresa</th><th>Requisição</th><th>OC</th><th>Data compra</th>
            <th>Pedido ML</th><th>Cartão</th><th>Valor cartão</th><th>NF total</th>
            <th>NFs</th><th>Entrega</th><th>ERP</th><th>Status</th><th>Obs</th><th></th>
          </tr></thead>
          <tbody>{visible.length ? visible.map(r => <tr key={r.id}>
            <td>{r.empresa_apelido ?? '—'}</td>
            <td><b>{r.nro_requisicao}</b></td>
            <td>{r.nro_oc ?? <span className="warn">Não informado</span>}</td>
            <td>{formatarData(r.data_compra)}</td>
            <td>{r.ml_order_id ?? '—'}</td>
            <td>{r.ultimos_digitos_cartao ? `•••• ${r.ultimos_digitos_cartao}` : '—'}</td>
            <td>{brl(r.valor_operacao_cartao)}</td>
            <td>{brl(r.valor_nf_total)}</td>
            <td>{r.quantidade_notas}</td>
            <td>{r.mercado_entregue === true ? 'Sim' : r.mercado_entregue === false ? 'Não' : '—'}</td>
            <td>{r.status_erp ? 'Sim' : 'Não'}</td>
            <td><span className="tag">{r.status_conferencia}</span></td>
            <td>{r.observacao ?? '—'}</td>
            <td>{canEdit && <button className="mini" onClick={() => edit(r)}>Editar</button>}</td>
          </tr>) : <tr><td colSpan={14}>Nenhum lançamento encontrado.</td></tr>}</tbody>
        </table>
      </div>

      <div className="pagination">
        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
        <span>Página {page} de {pages} · {rows.length} registro(s)</span>
        <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Próxima</button>
      </div>

      {canImport && <div className="import-box">
        <h3>Importação de dados do Mercado Livre</h3>
        <p className="muted">Arquivos <b>CSV, TXT ou Excel</b> para carga manual, com prévia antes de processar.</p>
        <div className="filter-inline">
          <label>Empresa do lote
            <select value={empresaLancamento} onChange={e => setEmpresaLancamento(e.target.value)}>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </label>
        </div>
        <div className="actions">
          <label className="file-button">Importar CSV, TXT ou Excel
            <input type="file" accept=".csv,.txt,.xlsx,.xls"
              onChange={e => { const f = e.target.files?.[0]; if (f) prepareFile(f) }} />
          </label>
          <button disabled className="standby-button" title="Integração automática temporariamente desativada">
            Integrador Mercado Livre — Em stand by
          </button>
        </div>
        {importFile && <div className="notice">Arquivo: <b>{importFile.name}</b> · {importRows.length} linha(s).</div>}
        {!!importRows.length && <>
          <div className="table-wrap"><table>
            <thead><tr>{Object.keys(importRows[0]).slice(0, 8).map(k => <th key={k}>{k}</th>)}</tr></thead>
            <tbody>{importRows.slice(0, 8).map((r, i) =>
              <tr key={i}>{Object.keys(importRows[0]).slice(0, 8).map(k => <td key={k}>{r[k]}</td>)}</tr>)}
            </tbody>
          </table></div>
          <div className="actions">
            <button className="primary" onClick={importManual} disabled={busy}>
              {busy ? 'Processando...' : 'Confirmar importação'}
            </button>
            <button onClick={() => { setImportRows([]); setImportFile(null) }}>Cancelar prévia</button>
          </div>
        </>}
      </div>}
    </> : <>
      <div className="form-grid">
        <label>Empresa *
          <select value={empresaLancamento} onChange={e => setEmpresaLancamento(e.target.value)} disabled={!!selected}>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </label>
        <label>Nº Requisição *
          <input inputMode="numeric" maxLength={7} value={form.nro_requisicao}
            onChange={e => setForm(f => ({ ...f, nro_requisicao: e.target.value.replace(/\D/g, '').slice(0, 7) }))}
            placeholder="Até 7 dígitos" />
        </label>
        <label>Data da compra *
          <input type="date" value={form.data_compra}
            onChange={e => setForm(f => ({ ...f, data_compra: e.target.value }))} />
        </label>
        <label>Nº pedido/compra Mercado Livre *
          <input value={form.ml_order_id}
            onChange={e => setForm(f => ({ ...f, ml_order_id: e.target.value }))}
            placeholder="Obrigatório" />
        </label>
        <label>Valor pago no cartão *
          <input inputMode="decimal" value={form.valor}
            onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} placeholder="0,00" />
        </label>
        <label>Nº Ordem de Compra (OC)
          <input inputMode="numeric" maxLength={7} value={form.nro_oc}
            onChange={e => setForm(f => ({ ...f, nro_oc: e.target.value.replace(/\D/g, '').slice(0, 7) }))}
            placeholder="Opcional" />
        </label>
        <label>Últimos 4 dígitos do cartão
          <input inputMode="numeric" maxLength={4} value={form.ultimos_digitos}
            onChange={e => setForm(f => ({ ...f, ultimos_digitos: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
            placeholder="Opcional" />
        </label>
        <label>Observação (máx. {OBS_MAX})
          <input maxLength={OBS_MAX} value={form.observacao}
            onChange={e => setForm(f => ({ ...f, observacao: e.target.value.slice(0, OBS_MAX) }))} />
        </label>
        <label className="checkbox-line">
          <input type="checkbox" checked={form.status_erp}
            onChange={e => setForm(f => ({ ...f, status_erp: e.target.checked }))} />
          <span>Lançado no ERP</span>
        </label>
      </div>

      <div className="actions">
        <button className="primary" onClick={save} disabled={busy}>
          {busy ? 'Salvando...' : selected ? 'Atualizar lançamento' : 'Salvar lançamento'}
        </button>
        <button onClick={() => { setSelected(null); setMode('consulta') }}>Cancelar</button>
      </div>

      <div className="notice">
        <b>Regra da OC:</b> se o Nº OC ficar em branco, o lançamento é salvo normalmente e a OC
        pode ser preenchida depois por COMPRAS ou FATURAMENTO.
      </div>
      {selected && <p className="tiny">Editando requisição {selected.nro_requisicao} · ID {selected.id}</p>}
    </>}
  </section>
}
