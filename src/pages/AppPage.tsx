import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Empresa, Perfil, Transacao } from '../types'
import { Stats } from '../components/Stats'
import { ImportPanel } from '../components/ImportPanel'
import { TransactionTable } from '../components/TransactionTable'
import { PurchasesPage } from '../components/PurchasesPage'
import { PurchasesLayout2Page } from '../components/PurchasesLayout2Page'
import { CartaoPage } from '../components/CartaoPage'
import { PermissionsAdminPage } from '../components/PermissionsAdminPage'
import { useScreenPermissions } from '../lib/permissions'
import { brl } from '../lib/format'

type Tab = 'principal' | 'compras' | 'cartao' | 'consulta' | 'importacao' | 'requisicoes' | 'patrimonio' | 'auditoria' | 'administracao'
type Row = Record<string, unknown>

function RequisicoesPanel({ profile, empresas, canCreate, canEdit }: { profile: Perfil; empresas: Empresa[]; canCreate: boolean; canEdit: boolean }) {
  const [rows, setRows] = useState<Row[]>([])
  const [form, setForm] = useState<Record<string, string> | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const today = new Date().toLocaleDateString('en-CA')

  async function load() {
    const { data, error } = await supabase.from('requisicoes')
      .select('id,numero,empresa_id,solicitante_id,data_solicitacao,data_necessidade,tipo,periodicidade,periodo_ano,periodo_numero,status,observacao')
      .order('numero', { ascending: false }).limit(100)
    if (error) setMessage('Não foi possível carregar as requisições: ' + error.message)
    else setRows((data ?? []) as Row[])
  }
  useEffect(() => { void load() }, [])

  function newForm() {
    const maxNumero = rows.reduce((max, r) => Math.max(max, Number(r.numero ?? 0)), 0)
    setMessage('')
    setForm({ id: '', numero: String(maxNumero + 1), empresa_id: empresas[0]?.id ?? '', data_solicitacao: today, data_necessidade: '', tipo: 'TRIMESTRAL', periodicidade: 'TRIMESTRAL', periodo_ano: String(new Date().getFullYear()), periodo_numero: '', status: 'RASCUNHO', observacao: '' })
  }
  function editForm(r: Row) {
    setMessage('')
    setForm({ id: String(r.id), numero: String(r.numero ?? ''), empresa_id: String(r.empresa_id ?? ''), data_solicitacao: String(r.data_solicitacao ?? today).slice(0,10), data_necessidade: String(r.data_necessidade ?? '').slice(0,10), tipo: String(r.tipo ?? 'TRIMESTRAL'), periodicidade: String(r.periodicidade ?? 'TRIMESTRAL'), periodo_ano: String(r.periodo_ano ?? new Date().getFullYear()), periodo_numero: String(r.periodo_numero ?? ''), status: String(r.status ?? 'RASCUNHO'), observacao: String(r.observacao ?? '') })
  }
  async function save() {
    if (!form || !form.empresa_id || !form.data_solicitacao || !form.periodo_ano) { setMessage('Preencha empresa, data da solicitação e ano do período.'); return }
    const payload = {
      numero: Number(form.numero), empresa_id: form.empresa_id, data_solicitacao: form.data_solicitacao,
      data_necessidade: form.data_necessidade || null, tipo: form.tipo, periodicidade: form.periodicidade,
      periodo_ano: Number(form.periodo_ano), periodo_numero: form.periodo_numero ? Number(form.periodo_numero) : null,
      status: form.status, observacao: form.observacao.trim() || null, updated_by: profile.id,
    }
    setBusy(true); setMessage('')
    const result = form.id
      ? await supabase.from('requisicoes').update(payload).eq('id', form.id)
      : await supabase.from('requisicoes').insert({ ...payload, solicitante_id: profile.id, created_by: profile.id })
    if (result.error) setMessage('Não foi possível salvar a requisição: ' + result.error.message)
    else { setMessage(form.id ? 'Requisição atualizada.' : 'Requisição criada.'); setForm(null); await load() }
    setBusy(false)
  }

  return <section className="panel">
    <div className="panel-head"><div><h2>Requisições</h2><p className="muted">Solicitações de compra e acompanhamento.</p></div>
      {canCreate && <button className="primary" onClick={newForm}>Nova requisição</button>}
      <button onClick={() => void load()}>Atualizar</button>
    </div>
    {message && <div className={message.startsWith('Não') || message.startsWith('Preencha') ? 'error-box' : 'notice'}>{message}</div>}
    {form && <div className="import-box"><h3>{form.id ? 'Editar requisição' : 'Nova requisição'}</h3>
      <div className="form-grid">
        <label>Número *<input type="number" min="1" value={form.numero} onChange={e=>setForm(f=>f?({...f,numero:e.target.value}):f)} /></label>
        <label>Empresa *<select value={form.empresa_id} onChange={e=>setForm(f=>f?({...f,empresa_id:e.target.value}):f)}><option value="">Selecione</option>{empresas.map(e=><option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>
        <label>Data da solicitação *<input type="date" value={form.data_solicitacao} onChange={e=>setForm(f=>f?({...f,data_solicitacao:e.target.value}):f)} /></label>
        <label>Data necessária<input type="date" value={form.data_necessidade} onChange={e=>setForm(f=>f?({...f,data_necessidade:e.target.value}):f)} /></label>
        <label>Tipo<select value={form.tipo} onChange={e=>setForm(f=>f?({...f,tipo:e.target.value,periodicidade:e.target.value==='EXTRAORDINARIA'?'TRIMESTRAL':f.periodicidade}):f)}><option value="TRIMESTRAL">Periódica</option><option value="EXTRAORDINARIA">Extraordinária</option></select></label>
        <label>Periodicidade<select value={form.periodicidade} disabled={form.tipo==='EXTRAORDINARIA'} onChange={e=>setForm(f=>f?({...f,periodicidade:e.target.value}):f)}>{['QUINZENAL','MENSAL','BIMESTRAL','TRIMESTRAL','SEMESTRAL','ANUAL'].map(x=><option key={x} value={x}>{x}</option>)}</select></label>
        <label>Ano do período *<input type="number" min="2000" max="2100" value={form.periodo_ano} onChange={e=>setForm(f=>f?({...f,periodo_ano:e.target.value}):f)} /></label>
        <label>Número do período<input type="number" min="1" max="24" value={form.periodo_numero} onChange={e=>setForm(f=>f?({...f,periodo_numero:e.target.value}):f)} /></label>
        <label>Status<select value={form.status} onChange={e=>setForm(f=>f?({...f,status:e.target.value}):f)}>{['RASCUNHO','ENVIADA','EM_ANALISE','APROVADA','REPROVADA','EM_COTACAO','COM_OC','EM_COMPRA','EM_RECEBIMENTO','ENCERRADA','CANCELADA'].map(x=><option key={x} value={x}>{x.replaceAll('_',' ')}</option>)}</select></label>
        <label>Observação<input value={form.observacao} onChange={e=>setForm(f=>f?({...f,observacao:e.target.value}):f)} /></label>
      </div>
      <div className="actions"><button className="primary" disabled={busy || (form.id ? !canEdit : !canCreate)} onClick={()=>void save()}>{busy?'Salvando...':'Salvar requisição'}</button><button disabled={busy} onClick={()=>setForm(null)}>Cancelar</button></div>
    </div>}
    <div className="table-wrap"><table><thead><tr><th>Nº</th><th>Empresa</th><th>Solicitação</th><th>Necessidade</th><th>Tipo / periodicidade</th><th>Status</th><th>Observação</th><th>Ações</th></tr></thead>
      <tbody>{rows.length ? rows.map(r => <tr key={String(r.id)}><td><b>{String(r.numero ?? '—')}</b></td><td>{empresas.find(e=>e.id===String(r.empresa_id))?.nome ?? String(r.empresa_id ?? '—')}</td><td>{String(r.data_solicitacao ?? '—')}</td><td>{String(r.data_necessidade ?? '—')}</td><td>{String(r.tipo ?? '—')} / {String(r.periodicidade ?? '—')}</td><td><span className="tag">{String(r.status ?? '—')}</span></td><td>{String(r.observacao ?? '—')}</td><td>{canEdit && <button className="mini" onClick={()=>editForm(r)}>Editar</button>}</td></tr>) : <tr><td colSpan={8}>Nenhuma requisição encontrada.</td></tr>}</tbody>
    </table></div>
  </section>
}

function PatrimonioPanel({ profile, empresas, canCreate, canEdit }: { profile: Perfil; empresas: Empresa[]; canCreate: boolean; canEdit: boolean }) {
  const [rows, setRows] = useState<Row[]>([])
  const [config, setConfig] = useState<Row | null>(null)
  const [codigo, setCodigo] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<Record<string, string> | null>(null)
  const admin = profile.is_admin || profile.role === 'ADMIN'

  async function load() {
    const [{ data: bens, error }, { data: cfg }] = await Promise.all([
      supabase.from('bens_patrimoniais').select('id,codigo_patrimonio,tipo_cadastro,tipo_identificacao,empresa_id,data_compra,numero_nota,descricao,marca,modelo,numero_serie,quantidade,valor_unitario,valor_compra,status_ativo,origem,observacao').order('created_at', { ascending: false }).limit(100),
      supabase.from('patrimonio_configuracao_codigo').select('*').maybeSingle(),
    ])
    if (error) setMessage('Não foi possível carregar o patrimônio: ' + error.message)
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
  function newForm() {
    setMessage('')
    setForm({ id:'', empresa_id:empresas[0]?.id ?? '', data_compra:new Date().toLocaleDateString('en-CA'), numero_nota:'', tipo_cadastro:'MANUAL_AVULSO', tipo_identificacao:'MANUAL', codigo_patrimonio:'', descricao:'', marca:'', modelo:'', numero_serie:'', quantidade:'1', valor_unitario:'0', valor_compra:'0', status_ativo:'ATIVO', origem:'MANUAL', observacao:'' })
  }
  function editForm(r: Row) {
    setMessage('')
    setForm({ id:String(r.id), empresa_id:String(r.empresa_id ?? ''), data_compra:String(r.data_compra ?? '').slice(0,10), numero_nota:String(r.numero_nota ?? ''), tipo_cadastro:String(r.tipo_cadastro ?? 'MANUAL_AVULSO'), tipo_identificacao:String(r.tipo_identificacao ?? 'AUTOMATICO'), codigo_patrimonio:String(r.codigo_patrimonio ?? ''), descricao:String(r.descricao ?? ''), marca:String(r.marca ?? ''), modelo:String(r.modelo ?? ''), numero_serie:String(r.numero_serie ?? ''), quantidade:String(r.quantidade ?? '1'), valor_unitario:String(r.valor_unitario ?? '0'), valor_compra:String(r.valor_compra ?? '0'), status_ativo:String(r.status_ativo ?? 'ATIVO'), origem:String(r.origem ?? 'MANUAL'), observacao:String(r.observacao ?? '') })
  }
  async function save() {
    if (!form || !form.empresa_id || !form.data_compra || !form.descricao.trim()) { setMessage('Preencha empresa, data da compra e descrição do bem.'); return }
    const qty=Number(form.quantidade), unit=Number(form.valor_unitario), total=Number(form.valor_compra)
    if(!Number.isFinite(qty)||qty<=0||!Number.isFinite(unit)||unit<0||!Number.isFinite(total)||total<0){setMessage('Quantidade e valores precisam ser válidos.');return}
    if(!form.id && form.tipo_identificacao==='AUTOMATICO' && !form.numero_nota.trim()){setMessage('Para gerar código automático, informe o número da NF.');return}
    setBusy(true);setMessage('')
    const common = { empresa_id:form.empresa_id, data_compra:form.data_compra, numero_nota:form.numero_nota.trim()||null, descricao:form.descricao.trim(), marca:form.marca.trim()||null, modelo:form.modelo.trim()||null, numero_serie:form.numero_serie.trim()||null, quantidade:qty, valor_unitario:unit, valor_compra:total, status_ativo:form.status_ativo, observacao:form.observacao.trim()||null, updated_by:profile.id }
    const result = form.id
      ? await supabase.from('bens_patrimoniais').update(common).eq('id',form.id)
      : await supabase.from('bens_patrimoniais').insert({...common, tipo_cadastro:form.tipo_cadastro, tipo_identificacao:form.tipo_identificacao, codigo_patrimonio:form.tipo_identificacao==='MANUAL'?form.codigo_patrimonio.trim():null, origem:form.origem, created_by:profile.id})
    if(result.error) setMessage('Não foi possível salvar o bem: '+result.error.message)
    else {setMessage(form.id?'Bem patrimonial atualizado.':'Bem patrimonial cadastrado.');setForm(null);await load()}
    setBusy(false)
  }

  return <section className="panel">
    <div className="panel-head"><div><h2>Patrimônio</h2><p className="muted">Consulta patrimonial, cadastro manual e edição conforme as permissões existentes.</p></div>
      {canCreate && <button className="primary" onClick={newForm}>Novo bem</button>}<button onClick={()=>void load()}>Atualizar</button>
    </div>
    <div className="form-grid">
      <label>Prefixo<input value={String(config?.prefixo ?? '—')} readOnly /></label>
      <label>Separador<input value={String(config?.separador ?? '—')} readOnly /></label>
      <label>Dígitos NF<input value={String(config?.digitos_nf ?? config?.digitos ?? '—')} readOnly /></label>
      <label>Dígitos sequencial<input value={String(config?.digitos_sequencial ?? '—')} readOnly /></label>
    </div>
    {admin && <div className="actions"><button className="primary" onClick={gerarCodigo}>Gerar código patrimonial</button>{codigo && <div className="notice"><b>Código gerado:</b> {codigo}</div>}</div>}
    {message && <div className={message.startsWith('Não')||message.startsWith('Preencha')||message.startsWith('Quantidade')||message.startsWith('Para gerar')?'error-box':'notice'}>{message}</div>}
    {form && <div className="import-box"><h3>{form.id?'Editar bem patrimonial':'Novo bem patrimonial'}</h3><div className="form-grid">
      <label>Empresa *<select value={form.empresa_id} disabled={Boolean(form.id)} onChange={e=>setForm(f=>f?({...f,empresa_id:e.target.value}):f)}><option value="">Selecione</option>{empresas.map(e=><option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>
      <label>Data da compra *<input type="date" value={form.data_compra} onChange={e=>setForm(f=>f?({...f,data_compra:e.target.value}):f)} /></label>
      <label>Número da NF<input value={form.numero_nota} onChange={e=>setForm(f=>f?({...f,numero_nota:e.target.value}):f)} /></label>
      {!form.id && <label>Identificação<select value={form.tipo_identificacao} onChange={e=>setForm(f=>f?({...f,tipo_identificacao:e.target.value,codigo_patrimonio:''}):f)}><option value="MANUAL">Código manual</option><option value="AUTOMATICO">Código automático</option></select></label>}
      {!form.id && form.tipo_identificacao==='MANUAL' && <label>Código patrimonial *<input value={form.codigo_patrimonio} onChange={e=>setForm(f=>f?({...f,codigo_patrimonio:e.target.value}):f)} /></label>}
      {!form.id && <label>Tipo de cadastro<select value={form.tipo_cadastro} onChange={e=>setForm(f=>f?({...f,tipo_cadastro:e.target.value,origem:e.target.value==='COMPRA_NF'?'NF':'MANUAL'}):f)}><option value="MANUAL_AVULSO">Manual avulso</option><option value="COMPRA_NF">Compra vinculada à NF</option></select></label>}
      <label>Descrição *<input value={form.descricao} onChange={e=>setForm(f=>f?({...f,descricao:e.target.value}):f)} /></label>
      <label>Marca<input value={form.marca} onChange={e=>setForm(f=>f?({...f,marca:e.target.value}):f)} /></label>
      <label>Modelo<input value={form.modelo} onChange={e=>setForm(f=>f?({...f,modelo:e.target.value}):f)} /></label>
      <label>Número de série<input value={form.numero_serie} onChange={e=>setForm(f=>f?({...f,numero_serie:e.target.value}):f)} /></label>
      <label>Quantidade *<input type="number" min="0.01" step="0.01" value={form.quantidade} onChange={e=>setForm(f=>f?({...f,quantidade:e.target.value}):f)} /></label>
      <label>Valor unitário *<input type="number" min="0" step="0.01" value={form.valor_unitario} onChange={e=>setForm(f=>f?({...f,valor_unitario:e.target.value}):f)} /></label>
      <label>Valor total *<input type="number" min="0" step="0.01" value={form.valor_compra} onChange={e=>setForm(f=>f?({...f,valor_compra:e.target.value}):f)} /></label>
      <label>Status<select value={form.status_ativo} onChange={e=>setForm(f=>f?({...f,status_ativo:e.target.value}):f)}>{['ATIVO','EM_TRANSITO','BAIXADO'].map(x=><option key={x} value={x}>{x.replaceAll('_',' ')}</option>)}</select></label>
      <label>Observação<input value={form.observacao} onChange={e=>setForm(f=>f?({...f,observacao:e.target.value}):f)} /></label>
      {form.id && <label>Código atual<input value={form.codigo_patrimonio} readOnly /></label>}
    </div><div className="actions"><button className="primary" disabled={busy||(form.id?!canEdit:!canCreate)} onClick={()=>void save()}>{busy?'Salvando...':'Salvar bem'}</button><button disabled={busy} onClick={()=>setForm(null)}>Cancelar</button></div></div>}
    <div className="table-wrap"><table><thead><tr><th>Código</th><th>Empresa</th><th>Data</th><th>NF</th><th>Descrição</th><th>Marca/Modelo</th><th>Série</th><th>Qtd.</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead>
      <tbody>{rows.length ? rows.map(r => <tr key={String(r.id)}><td><b>{String(r.codigo_patrimonio ?? '—')}</b></td><td>{empresas.find(e=>e.id===String(r.empresa_id))?.nome ?? String(r.empresa_id ?? '—')}</td><td>{String(r.data_compra ?? '—')}</td><td>{String(r.numero_nota ?? '—')}</td><td>{String(r.descricao ?? '—')}</td><td>{String(r.marca ?? '')} {String(r.modelo ?? '')}</td><td>{String(r.numero_serie ?? '—')}</td><td>{String(r.quantidade ?? '—')}</td><td>{brl(Number(r.valor_compra ?? 0))}</td><td><span className="tag">{String(r.status_ativo ?? '—')}</span></td><td>{canEdit && <button className="mini" onClick={()=>editForm(r)}>Editar</button>}</td></tr>) : <tr><td colSpan={11}>Nenhum bem patrimonial encontrado.</td></tr>}</tbody>
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

      {tab === 'compras' && compras.permissions.visualizar && <PurchasesLayout2Page profile={profile} empresas={empresas} />}
      {tab === 'cartao' && cartao && <CartaoPage profile={profile} empresas={empresas} />}
      {tab === 'requisicoes' && (admin || requisicoes.permissions.visualizar) && <RequisicoesPanel profile={profile} empresas={empresas} canCreate={admin || requisicoes.permissions.criar} canEdit={admin || requisicoes.permissions.editar} />}
      {tab === 'patrimonio' && (admin || patrimonio.permissions.visualizar) && <PatrimonioPanel profile={profile} empresas={empresas} canCreate={admin || patrimonio.permissions.criar} canEdit={admin || patrimonio.permissions.editar} />}
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
