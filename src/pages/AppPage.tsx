import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Empresa, Perfil, Transacao } from '../types'
import { Stats } from '../components/Stats'
import { ImportPanel } from '../components/ImportPanel'
import { TransactionTable } from '../components/TransactionTable'
import { PurchasesPage } from '../components/PurchasesPage'
import { CartaoPage } from '../components/CartaoPage'
import { PermissionsAdminPage } from '../components/PermissionsAdminPage'
import { useScreenPermissions } from '../lib/permissions'
import { brl } from '../lib/format'

type Tab = 'principal' | 'compras' | 'cartao' | 'consulta' | 'importacao' | 'requisicoes' | 'patrimonio' | 'auditoria' | 'administracao'
type Row = Record<string, unknown>

function RequisicoesPanel() {
  const [rows, setRows] = useState<Row[]>([])
  useEffect(() => {
    supabase.from('requisicoes')
      .select('id,numero,empresa_id,data_solicitacao,data_necessidade,tipo,status,observacao')
      .order('numero', { ascending: false }).limit(100)
      .then(({ data }) => setRows((data ?? []) as Row[]))
  }, [])
  return <section className="panel">
    <div className="panel-head"><div><h2>Requisições</h2><p className="muted">Solicitações de compra e acompanhamento.</p></div></div>
    <div className="table-wrap"><table><thead><tr><th>Nº</th><th>Empresa</th><th>Solicitação</th><th>Necessidade</th><th>Tipo</th><th>Status</th><th>Observação</th></tr></thead>
      <tbody>{rows.length ? rows.map(r => <tr key={String(r.id)}><td><b>{String(r.numero ?? '—')}</b></td><td>{String(r.empresa_id ?? '—')}</td><td>{String(r.data_solicitacao ?? '—')}</td><td>{String(r.data_necessidade ?? '—')}</td><td>{String(r.tipo ?? '—')}</td><td><span className="tag">{String(r.status ?? '—')}</span></td><td>{String(r.observacao ?? '—')}</td></tr>) : <tr><td colSpan={7}>Nenhuma requisição encontrada.</td></tr>}</tbody>
    </table></div>
  </section>
}

function PatrimonioPanel({ profile }: { profile: Perfil }) {
  const [rows, setRows] = useState<Row[]>([])
  const [config, setConfig] = useState<Row | null>(null)
  const [codigo, setCodigo] = useState('')
  const [message, setMessage] = useState('')
  const admin = profile.is_admin || profile.role === 'ADMIN'

  async function load() {
    const [{ data: bens }, { data: cfg }] = await Promise.all([
      supabase.from('bens_patrimoniais').select('id,codigo_patrimonio,empresa_id,data_compra,numero_nota,descricao,marca,modelo,numero_serie,quantidade,valor_compra,status_ativo').order('created_at', { ascending: false }).limit(100),
      supabase.from('patrimonio_configuracao_codigo').select('*').maybeSingle(),
    ])
    setRows((bens ?? []) as Row[])
    setConfig((cfg ?? null) as Row | null)
  }

  useEffect(() => { void load() }, [])

  async function gerarCodigo() {
    setMessage('')
    const { data, error } = await supabase.rpc('gerar_codigo_patrimonio')
    if (error) setMessage('Não foi possível gerar o código: ' + error.message)
    else setCodigo(String(data ?? ''))
  }

  return <section className="panel">
    <div className="panel-head"><div><h2>Patrimônio</h2><p className="muted">Consulta patrimonial e geração segura de código.</p></div></div>
    <div className="form-grid">
      <label>Prefixo<input value={String(config?.prefixo ?? '—')} readOnly /></label>
      <label>Separador<input value={String(config?.separador ?? '—')} readOnly /></label>
      <label>Dígitos NF<input value={String(config?.digitos_nf ?? config?.digitos ?? '—')} readOnly /></label>
      <label>Dígitos sequencial<input value={String(config?.digitos_sequencial ?? '—')} readOnly /></label>
    </div>
    {admin && <div className="actions"><button className="primary" onClick={gerarCodigo}>Gerar código patrimonial</button>{codigo && <div className="notice"><b>Código gerado:</b> {codigo}</div>}</div>}
    {message && <div className="error-box">{message}</div>}
    <div className="table-wrap"><table><thead><tr><th>Código</th><th>Empresa</th><th>Data</th><th>NF</th><th>Descrição</th><th>Marca/Modelo</th><th>Série</th><th>Qtd.</th><th>Valor</th><th>Status</th></tr></thead>
      <tbody>{rows.length ? rows.map(r => <tr key={String(r.id)}><td><b>{String(r.codigo_patrimonio ?? '—')}</b></td><td>{String(r.empresa_id ?? '—')}</td><td>{String(r.data_compra ?? '—')}</td><td>{String(r.numero_nota ?? '—')}</td><td>{String(r.descricao ?? '—')}</td><td>{String(r.marca ?? '')} {String(r.modelo ?? '')}</td><td>{String(r.numero_serie ?? '—')}</td><td>{String(r.quantidade ?? '—')}</td><td>{brl(Number(r.valor_compra ?? 0))}</td><td><span className="tag">{String(r.status_ativo ?? '—')}</span></td></tr>) : <tr><td colSpan={10}>Nenhum bem patrimonial encontrado.</td></tr>}</tbody>
    </table></div>
  </section>
}

export function AppPage({ profile, onLogout }: { profile: Perfil; onLogout: () => void }) {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [empresa, setEmpresa] = useState('')
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [rows, setRows] = useState<Transacao[]>([])
  const [tab, setTab] = useState<Tab>('principal')
  const [audit, setAudit] = useState<any[]>([])
  const [alerts, setAlerts] = useState<Array<{ id: string; nro_requisicao: number; valor_operacao_cartao: number; valor_nf_total: number; diferenca_cartao_nf: number; observacao_divergencia: string | null }>>([])

  const consulta = useScreenPermissions(profile, 'CONSULTA')
  const importacao = useScreenPermissions(profile, 'IMPORTACAO')
  const auditoria = useScreenPermissions(profile, 'AUDITORIA')
  const compras = useScreenPermissions(profile, 'COMPRAS')
  const requisicoes = useScreenPermissions(profile, 'REQUISICOES' as any)
  const patrimonio = useScreenPermissions(profile, 'PATRIMONIO' as any)
  const cartao = profile.is_admin || profile.role === 'ADMIN' || profile.role === 'FINANCEIRO'
  const admin = profile.is_admin || profile.role === 'ADMIN'

  async function load() {
    if (!consulta.permissions.visualizar) return
    let q = supabase.from('transacoes').select('*').order('data', { ascending: false })
    if (empresa) q = q.eq('empresa_id', empresa)
    if (inicio) q = q.gte('data', inicio)
    if (fim) q = q.lte('data', fim)
    const { data, error } = await q.limit(1000)
    if (error) alert(error.message)
    else setRows((data ?? []) as Transacao[])
  }

  async function loadAlerts() {
    if (!compras.permissions.visualizar) return
    const { data } = await supabase.from('compras_ml').select('id,nro_requisicao,valor_operacao_cartao,valor_nf_total,diferenca_cartao_nf,observacao_divergencia').eq('status_conferencia', 'DIVERGENCIA').order('updated_at', { ascending: false }).limit(20)
    setAlerts((data ?? []) as typeof alerts)
  }

  async function loadAudit() {
    if (!auditoria.permissions.visualizar) return
    const { data, error } = await supabase.from('auditoria').select('*').order('created_at', { ascending: false }).limit(200)
    if (error) alert(error.message)
    else setAudit(data ?? [])
  }

  useEffect(() => {
    supabase.from('empresas').select('id,nome,cnpj,codigo_empresa').order('nome').then(({ data }) => setEmpresas((data ?? []) as Empresa[]))
  }, [])
  useEffect(() => { if (consulta.permissions.visualizar) void load() }, [consulta.permissions.visualizar, empresa, inicio, fim])
  useEffect(() => { if (tab === 'auditoria') void loadAudit() }, [tab, auditoria.permissions.visualizar])
  useEffect(() => { if (compras.permissions.visualizar) void loadAlerts() }, [compras.permissions.visualizar])

  const receipts = rows.filter(r => r.comprovante_conta_simples).length
  const sankhya = rows.filter(r => r.lancado_sankhya).length
  const finance = rows.filter(r => r.sankhya_ok).length

  return <main className="app-shell">
    <header className="topbar">
      <div><b>SIGCF · Controle Financeiro</b><span>Versão 2.0 · {profile.nome} · {profile.role}</span></div>
      <button onClick={onLogout}>Sair</button>
    </header>

    <nav className="tabs" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button className={tab === 'principal' ? 'active' : ''} onClick={() => setTab('principal')}>Principal</button>
      {cartao && <button className={tab === 'cartao' ? 'active' : ''} onClick={() => setTab('cartao')}>Cartão</button>}
      {importacao.permissions.visualizar && <button className={tab === 'importacao' ? 'active' : ''} onClick={() => setTab('importacao')}>Importação</button>}
      {compras.permissions.visualizar && <button className={tab === 'compras' ? 'active' : ''} onClick={() => setTab('compras')}>Compras</button>}
      {(admin || requisicoes.permissions.visualizar) && <button className={tab === 'requisicoes' ? 'active' : ''} onClick={() => setTab('requisicoes')}>Requisições</button>}
      {(admin || patrimonio.permissions.visualizar) && <button className={tab === 'patrimonio' ? 'active' : ''} onClick={() => setTab('patrimonio')}>Patrimônio</button>}
      {consulta.permissions.visualizar && <button className={tab === 'consulta' ? 'active' : ''} onClick={() => setTab('consulta')}>Consulta</button>}
      {auditoria.permissions.visualizar && <button className={tab === 'auditoria' ? 'active' : ''} onClick={() => setTab('auditoria')}>Auditoria</button>}
      {admin && <button className={tab === 'administracao' ? 'active' : ''} onClick={() => setTab('administracao')}>Administração</button>}
    </nav>

    <section className="content">
      {tab === 'principal' && <section className="panel">
        <div className="panel-head"><div><h2>SIGCF 2.0</h2><p className="muted">Controle Financeiro integrado a Compras, Patrimônio, Requisições e auditoria.</p></div></div>
        <Stats total={rows.length} receipts={receipts} sankhya={sankhya} finance={finance} />
        {alerts.length > 0 && <div className="notice"><b>Avisos financeiros:</b> {alerts.length} divergência(s) NF × cartão aguardando análise.</div>}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:10,marginTop:16}}>
          <button onClick={() => setTab('compras')}>Compras</button><button onClick={() => setTab('cartao')}>Cartão</button><button onClick={() => setTab('requisicoes')}>Requisições</button><button onClick={() => setTab('patrimonio')}>Patrimônio</button><button onClick={() => setTab('importacao')}>Importação</button><button onClick={() => setTab('auditoria')}>Auditoria</button>
        </div>
      </section>}

      {tab === 'compras' && compras.permissions.visualizar && <PurchasesPage profile={profile} empresas={empresas} />}
      {tab === 'cartao' && cartao && <CartaoPage profile={profile} empresas={empresas} />}
      {tab === 'requisicoes' && (admin || requisicoes.permissions.visualizar) && <RequisicoesPanel />}
      {tab === 'patrimonio' && (admin || patrimonio.permissions.visualizar) && <PatrimonioPanel profile={profile} />}
      {tab === 'importacao' && importacao.permissions.visualizar && <ImportPanel empresaId={empresa || empresas[0]?.id || ''} canImport={importacao.permissions.importar} onDone={load} />}

      {tab === 'consulta' && consulta.permissions.visualizar && <>
        <div className="filters"><select value={empresa} onChange={e => setEmpresa(e.target.value)}><option value="">Todas as empresas</option>{empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select><input type="date" value={inicio} onChange={e => setInicio(e.target.value)} /><input type="date" value={fim} onChange={e => setFim(e.target.value)} /><button className="primary" onClick={load}>Consultar</button></div>
        <Stats total={rows.length} receipts={receipts} sankhya={sankhya} finance={finance} />
        <section className="panel"><div className="panel-head"><div><h2>Transações</h2><p className="muted">FATURAMENTO alimenta · FINANCEIRO audita · GESTOR consulta.</p></div></div><TransactionTable rows={rows} role={profile.role} permissions={consulta.permissions} onChanged={load} /></section>
      </>}

      {tab === 'auditoria' && auditoria.permissions.visualizar && <section className="panel"><h2>Auditoria</h2><p className="muted">Histórico gerado pelo banco. Somente leitura.</p><div className="table-wrap"><table><thead><tr><th>Data</th><th>Ação</th><th>Transação</th><th>Usuário</th><th>Antes</th><th>Depois</th></tr></thead><tbody>{audit.map(a => <tr key={a.id}><td>{new Date(a.created_at).toLocaleString('pt-BR')}</td><td>{a.acao}</td><td>{a.transacao_id ?? '—'}</td><td>{a.usuario_id ?? 'sistema'}</td><td><code>{JSON.stringify(a.dados_anteriores)}</code></td><td><code>{JSON.stringify(a.dados_novos)}</code></td></tr>)}</tbody></table></div></section>}

      {tab === 'administracao' && admin && <PermissionsAdminPage profile={profile} />}
    </section>
  </main>
}
