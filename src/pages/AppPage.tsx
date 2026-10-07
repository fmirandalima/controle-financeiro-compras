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
import { brl } from '../lib/format'

type Tab = 'compras' | 'cartao' | 'consulta' | 'importacao' | 'auditoria' | 'administracao'

export function AppPage({ profile, onLogout }: { profile: Perfil; onLogout: () => void }) {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [empresa, setEmpresa] = useState('')
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [rows, setRows] = useState<Transacao[]>([])
  const [tab, setTab] = useState<Tab>('compras')
  const [audit, setAudit] = useState<any[]>([])
  const [alerts, setAlerts] = useState<Array<{ id: string; empresa_id: string; nro_requisicao: number; valor_operacao_cartao: number; valor_nf_total: number; diferenca_cartao_nf: number; observacao_divergencia: string | null }>>([])

  const consulta = useScreenPermissions(profile, 'CONSULTA')
  const importacao = useScreenPermissions(profile, 'IMPORTACAO')
  const auditoria = useScreenPermissions(profile, 'AUDITORIA')
  const compras = useScreenPermissions(profile, 'COMPRAS')
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
    const { data, error } = await supabase
      .from('compras_ml')
      .select('id,empresa_id,nro_requisicao,valor_operacao_cartao,valor_nf_total,diferenca_cartao_nf,observacao_divergencia')
      .eq('status_conferencia', 'DIVERGENCIA')
      .order('updated_at', { ascending: false })
      .limit(20)
    if (error) {
      console.error('Não foi possível carregar os avisos financeiros:', error)
      return
    }
    setAlerts((data ?? []) as typeof alerts)
  }

  async function loadAudit() {
    if (!auditoria.permissions.visualizar) return
    const { data, error } = await supabase.from('auditoria').select('*').order('created_at', { ascending: false }).limit(200)
    if (error) alert(error.message)
    else setAudit(data ?? [])
  }

  useEffect(() => {
    supabase.from('empresas').select('id,nome,cnpj,codigo_empresa').order('nome')
      .then(({ data }) => setEmpresas((data ?? []) as Empresa[]))
  }, [])

  useEffect(() => {
    if (consulta.permissions.visualizar) void load()
  }, [consulta.permissions.visualizar, empresa, inicio, fim])

  useEffect(() => {
    if (tab === 'auditoria') void loadAudit()
  }, [tab, auditoria.permissions.visualizar])

  useEffect(() => {
    if (compras.permissions.visualizar) void loadAlerts()
  }, [compras.permissions.visualizar])

  useEffect(() => {
    if (!consulta.loading && !importacao.loading && !auditoria.loading && !compras.loading && tab === 'compras' && !compras.permissions.visualizar) {
      if (cartao) setTab('cartao')
      else if (consulta.permissions.visualizar) setTab('consulta')
      else if (importacao.permissions.visualizar) setTab('importacao')
      else if (auditoria.permissions.visualizar) setTab('auditoria')
      else if (admin) setTab('administracao')
    }
  }, [tab, consulta.loading, importacao.loading, auditoria.loading, compras.loading, compras.permissions.visualizar, consulta.permissions.visualizar, importacao.permissions.visualizar, auditoria.permissions.visualizar, cartao, admin])

  const receipts = rows.filter(r => r.comprovante_conta_simples).length
  const sankhya = rows.filter(r => r.lancado_sankhya).length
  const finance = rows.filter(r => r.sankhya_ok).length

  return <main className="app-shell">
    <header className="topbar">
      <div><b>Controle Financeiro</b><span>{profile.nome} · {profile.role}</span></div>
      <button onClick={onLogout}>Sair</button>
    </header>

    <nav className="tabs">
      {compras.permissions.visualizar && <button className={tab === 'compras' ? 'active' : ''} onClick={() => setTab('compras')}>Compras</button>}
      {cartao && <button className={tab === 'cartao' ? 'active' : ''} onClick={() => setTab('cartao')}>Cartão</button>}
      {consulta.permissions.visualizar && <button className={tab === 'consulta' ? 'active' : ''} onClick={() => setTab('consulta')}>Consulta</button>}
      {importacao.permissions.visualizar && <button className={tab === 'importacao' ? 'active' : ''} onClick={() => setTab('importacao')}>Importação</button>}
      {auditoria.permissions.visualizar && <button className={tab === 'auditoria' ? 'active' : ''} onClick={() => setTab('auditoria')}>Auditoria</button>}
      {admin && <button className={tab === 'administracao' ? 'active' : ''} onClick={() => setTab('administracao')}>Administração</button>}
    </nav>

    <section className="content">
      {compras.permissions.visualizar && alerts.length > 0 && <section className="panel" style={{ border: '1px solid #c98b2e', marginBottom: 16 }}>
        <div className="panel-head">
          <div>
            <h2>⚠ Avisos financeiros</h2>
            <p className="muted">Há compras em que o total das NF(s) ultrapassa o valor pago no cartão. O lançamento não foi bloqueado.</p>
          </div>
          <button onClick={loadAlerts}>Atualizar avisos</button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Requisição</th><th>Cartão</th><th>NF(s)</th><th>Diferença</th><th>Orientação</th></tr></thead>
            <tbody>{alerts.map(a => <tr key={a.id}>
              <td><b>{a.nro_requisicao}</b></td>
              <td>{brl(Number(a.valor_operacao_cartao))}</td>
              <td>{brl(Number(a.valor_nf_total))}</td>
              <td><b>{brl(Number(a.diferenca_cartao_nf))}</b></td>
              <td>{a.observacao_divergencia ?? 'Financeiro deve verificar a divergência.'}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>}
      {tab === 'compras' && compras.permissions.visualizar && <PurchasesPage profile={profile} empresas={empresas} />}
      {tab === 'cartao' && cartao && <CartaoPage profile={profile} empresas={empresas} />}
      {tab === 'consulta' && consulta.permissions.visualizar && <>
        <div className="filters">
          <select value={empresa} onChange={e => setEmpresa(e.target.value)}><option value="">Todas as empresas</option>{empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select>
          <input type="date" value={inicio} onChange={e => setInicio(e.target.value)} />
          <input type="date" value={fim} onChange={e => setFim(e.target.value)} />
          <button className="primary" onClick={load}>Consultar</button>
        </div>
        <Stats total={rows.length} receipts={receipts} sankhya={sankhya} finance={finance} />
        <section className="panel">
          <div className="panel-head"><div><h2>Transações</h2><p className="muted">FATURAMENTO alimenta · FINANCEIRO audita · GESTOR consulta.</p></div></div>
          <TransactionTable rows={rows} role={profile.role} permissions={consulta.permissions} onChanged={load} />
        </section>
      </>}

      {tab === 'importacao' && importacao.permissions.visualizar && <ImportPanel empresaId={empresa || empresas[0]?.id || ''} canImport={importacao.permissions.importar} onDone={load} />}

      {tab === 'auditoria' && auditoria.permissions.visualizar && <section className="panel">
        <h2>Auditoria</h2><p className="muted">Histórico gerado pelo banco. Somente leitura.</p>
        <div className="table-wrap"><table><thead><tr><th>Data</th><th>Ação</th><th>Transação</th><th>Usuário</th><th>Antes</th><th>Depois</th></tr></thead>
          <tbody>{audit.map(a => <tr key={a.id}><td>{new Date(a.created_at).toLocaleString('pt-BR')}</td><td>{a.acao}</td><td>{a.transacao_id ?? '—'}</td><td>{a.usuario_id ?? 'sistema'}</td><td><code>{JSON.stringify(a.dados_anteriores)}</code></td><td><code>{JSON.stringify(a.dados_novos)}</code></td></tr>)}</tbody>
        </table></div>
      </section>}

      {tab === 'administracao' && admin && <PermissionsAdminPage profile={profile} />}
    </section>
  </main>
}