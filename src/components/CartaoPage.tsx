import { useEffect, useState } from 'react'
import type { Empresa, Perfil } from '../types'
import { supabase } from '../lib/supabase'
import { brl } from '../lib/format'

type Props = { profile: Perfil; empresas: Empresa[] }
type IntegrationStatus = { codigo_empresa: string; empresa_id: string | null; status: string; mensagem: string | null; ultima_sincronizacao: string | null }
type CardRow = { id:string; empresa_id:string; data:string; movimentacao:string; descricao:string|null; valor:number; meio_pagamento:string|null; ultimos_digitos_cartao:string|null; titular_cartao:string|null; valor_nota_fiscal:number|null; valor_pago_cartao:number|null }
type CardForm = { id:string; empresa_id:string; data:string; movimentacao:string; descricao:string; valor:string; meio_pagamento:string; ultimos_digitos_cartao:string; titular_cartao:string; valor_nota_fiscal:string; valor_pago_cartao:string }

const alvo = [
  { codigo: '104', titulo: 'Importar Extrato Cartão — Empresa 104' },
  { codigo: '001', titulo: 'Importar Extrato Cartão — Empresa 001' },
]
function empresaLabel(empresas: Empresa[], codigo: string) {
  const e = empresas.find(e => e.codigo_empresa === codigo)
  return e ? codigo + ' — ' + e.nome : codigo + ' — empresa ainda não vinculada'
}
export function CartaoPage({ profile, empresas }: Props) {
  const [status, setStatus] = useState<Record<string, IntegrationStatus>>({})
  const [rows, setRows] = useState<CardRow[]>([])
  const [form, setForm] = useState<CardForm|null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const canCreate = profile.is_admin || profile.role === 'ADMIN'
  const canEdit = canCreate || profile.role === 'FINANCEIRO'

  async function carregarStatus() {
    const { data, error } = await supabase.from('integracoes_empresa')
      .select('codigo_empresa,empresa_id,status,mensagem,ultima_sincronizacao')
      .eq('integracao', 'CONTA_SIMPLES')
    if (error) setMessage('Não foi possível consultar a configuração do Cartão: ' + error.message)
    else {
      const next: Record<string, IntegrationStatus> = {}
      for (const row of (data ?? []) as IntegrationStatus[]) next[row.codigo_empresa] = row
      setStatus(next)
    }
  }
  async function carregarLancamentos() {
    const {data,error}=await supabase.from('transacoes').select('id,empresa_id,data,movimentacao,descricao,valor,meio_pagamento,ultimos_digitos_cartao,titular_cartao,valor_nota_fiscal,valor_pago_cartao').ilike('meio_pagamento','%cart%').order('data',{ascending:false}).limit(100)
    if(error)setMessage('Não foi possível carregar os lançamentos de cartão: '+error.message)
    else setRows((data??[]) as CardRow[])
  }
  useEffect(() => { void carregarStatus(); void carregarLancamentos() }, [])

  function novo() {
    setMessage('')
    setForm({id:'',empresa_id:empresas[0]?.id??'',data:new Date().toLocaleDateString('en-CA'),movimentacao:'DESPESA',descricao:'',valor:'',meio_pagamento:'CARTAO',ultimos_digitos_cartao:'',titular_cartao:'',valor_nota_fiscal:'',valor_pago_cartao:''})
  }
  function editar(r:CardRow) {
    setMessage('')
    setForm({id:r.id,empresa_id:r.empresa_id,data:r.data.slice(0,10),movimentacao:r.movimentacao,descricao:r.descricao??'',valor:String(r.valor),meio_pagamento:r.meio_pagamento??'CARTAO',ultimos_digitos_cartao:r.ultimos_digitos_cartao??'',titular_cartao:r.titular_cartao??'',valor_nota_fiscal:r.valor_nota_fiscal==null?'':String(r.valor_nota_fiscal),valor_pago_cartao:r.valor_pago_cartao==null?'':String(r.valor_pago_cartao)})
  }
  async function salvar() {
    if(!form||(!form.id&&!canCreate)|| (form.id&&!canEdit))return
    const amount=Number(form.valor.replace(',','.'))
    if(!form.empresa_id||!form.data||!form.descricao.trim()||!Number.isFinite(amount)||amount<=0){setMessage('Informe empresa, data, descrição e um valor maior que zero.');return}
    if(form.ultimos_digitos_cartao && !/^\d{4}$/.test(form.ultimos_digitos_cartao)){setMessage('Informe somente os 4 últimos dígitos do cartão.');return}
    setBusy(true);setMessage('')
    const payload={empresa_id:form.empresa_id,data:form.data,movimentacao:form.movimentacao,descricao:form.descricao.trim(),valor:amount,meio_pagamento:form.meio_pagamento||'CARTAO',ultimos_digitos_cartao:form.ultimos_digitos_cartao||null,titular_cartao:form.titular_cartao.trim()||null,valor_nota_fiscal:form.valor_nota_fiscal===''?null:Number(form.valor_nota_fiscal.replace(',','.')),valor_pago_cartao:form.valor_pago_cartao===''?null:Number(form.valor_pago_cartao.replace(',','.'))}
    const result=form.id?await supabase.from('transacoes').update(payload).eq('id',form.id):await supabase.from('transacoes').insert({...payload,fingerprint:'manual-cartao:'+crypto.randomUUID()})
    if(result.error)setMessage('Não foi possível salvar o lançamento: '+result.error.message)
    else{setMessage(form.id?'Lançamento atualizado.':'Lançamento manual criado.');setForm(null);await carregarLancamentos()}
    setBusy(false)
  }
  async function importar(codigo: string) {
    const cfg = status[codigo]
    if (!cfg?.empresa_id || cfg.status !== 'CONECTADO') {
      setMessage('Empresa ' + codigo + ' não está conectada à integração de cartão. Nenhum lançamento foi importado.')
      return
    }
    setMessage('Empresa ' + codigo + ' está conectada, mas o executor seguro de importação ainda não foi publicado. Nenhum lançamento foi importado.')
  }
  if (!profile.is_admin && !['ADMIN', 'FINANCEIRO'].includes(profile.role))
    return <section className="panel"><div className="error-box">Você não possui permissão para visualizar a tela Cartão.</div></section>

  return <section className="panel">
    <div className="panel-head">
      <div><h2>Cartão — Conta Simples</h2><p className="muted">Extratos separados por empresa. Esta tela é independente de Compras/Mercado Livre.</p></div>
      <button onClick={()=>{void carregarStatus();void carregarLancamentos()}}>Atualizar status</button>
    </div>
    {message && <div className={message.startsWith('Não')||message.startsWith('Informe')?'error-box':'notice'}>{message}</div>}
    <div className="form-grid">
      {alvo.map(item => {
        const s = status[item.codigo]
        return <article className="panel" key={item.codigo}>
          <h3>{item.titulo}</h3><p className="muted">Destino: {empresaLabel(empresas, item.codigo)}</p>
          <p><strong>Status:</strong> {s?.status ?? 'NÃO CONFIGURADO'}</p>
          {s?.ultima_sincronizacao && <p className="tiny">Última sincronização: {new Date(s.ultima_sincronizacao).toLocaleString('pt-BR')}</p>}
          {s?.mensagem && <p className="tiny">{s.mensagem}</p>}
          <button className="primary" onClick={() => importar(item.codigo)}>{item.titulo}</button>
        </article>
      })}
    </div>
    <div className="panel-head" style={{marginTop:20}}><div><h3>Lançamentos manuais de cartão</h3><p className="muted">Registro e edição sem duplicar os dados importados do Mercado Livre.</p></div>{canCreate&&<button className="primary" onClick={novo}>Novo lançamento</button>}</div>
    {form&&<div className="import-box"><h3>{form.id?'Editar lançamento de cartão':'Novo lançamento de cartão'}</h3><div className="form-grid">
      <label>Empresa *<select value={form.empresa_id} disabled={Boolean(form.id)} onChange={e=>setForm(f=>f?({...f,empresa_id:e.target.value}):f)}><option value="">Selecione</option>{empresas.map(e=><option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>
      <label>Data *<input type="date" value={form.data} onChange={e=>setForm(f=>f?({...f,data:e.target.value}):f)}/></label>
      <label>Movimentação<select value={form.movimentacao} onChange={e=>setForm(f=>f?({...f,movimentacao:e.target.value}):f)}><option value="DESPESA">Despesa</option><option value="RECEITA">Receita / estorno</option></select></label>
      <label>Descrição *<input value={form.descricao} onChange={e=>setForm(f=>f?({...f,descricao:e.target.value}):f)}/></label>
      <label>Valor *<input inputMode="decimal" value={form.valor} onChange={e=>setForm(f=>f?({...f,valor:e.target.value}):f)} placeholder="0,00"/></label>
      <label>Meio de pagamento<input value={form.meio_pagamento} onChange={e=>setForm(f=>f?({...f,meio_pagamento:e.target.value}):f)}/></label>
      <label>Últimos 4 dígitos<input maxLength={4} inputMode="numeric" value={form.ultimos_digitos_cartao} onChange={e=>setForm(f=>f?({...f,ultimos_digitos_cartao:e.target.value.replace(/\D/g,'').slice(0,4)}):f)}/></label>
      <label>Titular do cartão<input value={form.titular_cartao} onChange={e=>setForm(f=>f?({...f,titular_cartao:e.target.value}):f)}/></label>
      <label>Valor da NF<input inputMode="decimal" value={form.valor_nota_fiscal} onChange={e=>setForm(f=>f?({...f,valor_nota_fiscal:e.target.value}):f)}/></label>
      <label>Valor pago no cartão<input inputMode="decimal" value={form.valor_pago_cartao} onChange={e=>setForm(f=>f?({...f,valor_pago_cartao:e.target.value}):f)}/></label>
    </div><div className="actions"><button className="primary" disabled={busy||(form.id?!canEdit:!canCreate)} onClick={()=>void salvar()}>{busy?'Salvando...':'Salvar lançamento'}</button><button disabled={busy} onClick={()=>setForm(null)}>Cancelar</button></div></div>}
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Data</th><th>Empresa</th><th>Movimentação</th><th>Descrição</th><th>Valor</th><th>Meio</th><th>Cartão</th><th>NF</th><th>Ações</th></tr></thead><tbody>
      {rows.length?rows.map(r=><tr key={r.id}><td>{r.data.slice(0,10).split('-').reverse().join('/')}</td><td>{empresas.find(e=>e.id===r.empresa_id)?.nome??'—'}</td><td>{r.movimentacao}</td><td>{r.descricao??'—'}</td><td>{brl(Number(r.valor))}</td><td>{r.meio_pagamento??'—'}</td><td>{r.ultimos_digitos_cartao?'•••• '+r.ultimos_digitos_cartao:r.titular_cartao??'—'}</td><td>{r.valor_nota_fiscal==null?'—':brl(Number(r.valor_nota_fiscal))}</td><td>{canEdit&&<button className="mini" onClick={()=>editar(r)}>Editar</button>}</td></tr>):<tr><td colSpan={9}>Nenhum lançamento de cartão encontrado.</td></tr>}
    </tbody></table></div>
  </section>
}
