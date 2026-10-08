import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Empresa, Perfil } from '../types'
import { brl } from '../lib/format'

type Props = { profile: Perfil; empresas: Empresa[] }

type Lancamento = {
  lancamento_id: string
  compra_id: string
  nota_fiscal_id: string
  empresa_id: string
  empresa_apelido: string | null
  nro_requisicao: number
  nro_oc: number | null
  data_compra: string
  ml_order_id: string | null
  ml_pack_id: string | null
  valor_operacao_cartao: number
  valor_nf_total: number
  diferenca_cartao_nf: number | null
  status_conferencia: string
  cartao: boolean
  ultimos_digitos_cartao: string | null
  data_estorno: string | null
  valor_frete: number
  valor_desconto: number
  ml_coupon_amount: number
  ml_discount_amount: number
  ml_resumo_financeiro: string | null
  observacao_compra: string | null
  ml_status: string | null
  ml_status_detail: string | null
  ml_tags: string | null
  mercado_entregue: boolean | null
  status_entrega: string | null
  data_lancamento: string
  valor_lancamento: number
  numero_nf: string | null
  serie_nf: string | null
  observacao_lancamento: string | null
  status_erp: boolean
}

type Compra = {
  id: string
  empresa_id: string
  empresa_apelido: string | null
  nro_requisicao: number
  nro_oc: number | null
  data_compra: string
  ml_order_id: string | null
  ml_pack_id: string | null
  valor_operacao_cartao: number
  valor_nf_total: number
  diferenca_cartao_nf: number | null
  status_conferencia: string
  cartao: boolean
  ultimos_digitos_cartao: string | null
  data_estorno: string | null
  valor_frete: number
  valor_desconto: number
  ml_coupon_amount: number
  ml_discount_amount: number
  ml_resumo_financeiro: string | null
  observacao: string | null
  ml_status: string | null
  ml_status_detail: string | null
  ml_tags: string | null
  mercado_entregue: boolean | null
}

type Nota = {
  id: string
  numero_nf: string | null
  serie_nf: string | null
  data_emissao: string | null
  valor_total: number
  observacao: string | null
}

type Item = {
  id: string
  nota_fiscal_id: string
  numero_item: number | null
  descricao: string
  quantidade: number
  unidade: string | null
  valor_unitario: number
  valor_produtos: number
}

function dateBR(v?: string | null) {
  return v ? v.slice(0,10).split('-').reverse().join('/') : '—'
}

export function PurchasesLayout2Page({ profile, empresas }: Props) {
  const canEdit = profile.is_admin || profile.role === 'ADMIN' || profile.role === 'FATURAMENTO' || profile.role === 'COMPRAS'
  const canView = canEdit || profile.role === 'FINANCEIRO' || profile.role === 'GESTOR'
  const [rows,setRows]=useState<Lancamento[]>([])
  const [pending,setPending]=useState<Compra[]>([])
  const [empresa,setEmpresa]=useState(String(empresas[0]?.id ?? ''))
  const [search,setSearch]=useState('')
  const [status,setStatus]=useState('')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [view,setView]=useState<{compra:Compra,notas:Nota[],itens:Item[]}|null>(null)
  const [editRow,setEditRow]=useState<Compra|null>(null)
  const [form,setForm]=useState({nro_requisicao:'',data_compra:'',ml_order_id:'',valor:'',nro_oc:'',cartao:true,ultimos_digitos_cartao:'',observacao:''})

  async function load(){
    if(!canView) return
    setBusy(true)
    let q=supabase.from('vw_acompanhamento_compras_lancamentos').select('*').order('data_lancamento',{ascending:false})
    if(empresa) q=q.eq('empresa_id',empresa)
    if(search.trim()){
      const s=search.trim().replace(/[^0-9A-Za-z-]/g,'')
      if(s) q=q.or(`ml_order_id.ilike.*${s}*,numero_nf.ilike.*${s}*`)
    }
    if(status) q=q.eq('status_conferencia',status)
    const {data,error}=await q.limit(500)
    if(error) setMessage('Erro ao consultar lançamentos: '+error.message)
    else setRows((data??[]) as Lancamento[])
    let p=supabase.from('compras_ml').select('id,empresa_id,empresa_apelido:nome,nro_requisicao,nro_oc,data_compra,ml_order_id,ml_pack_id,valor_operacao_cartao,valor_nf_total,diferenca_cartao_nf,status_conferencia,cartao,ultimos_digitos_cartao,data_estorno,valor_frete,valor_desconto,ml_coupon_amount,ml_discount_amount,ml_resumo_financeiro,observacao,ml_status,ml_status_detail,ml_tags,mercado_entregue').order('data_compra',{ascending:false})
    if(empresa) p=p.eq('empresa_id',empresa)
    const {data:pd}=await p.limit(500)
    setPending(((pd??[]) as Compra[]).filter(c=>!rows.some(r=>r.compra_id===c.id)))
    setBusy(false)
  }

  useEffect(()=>{if(empresas[0]&&!empresa)setEmpresa(String(empresas[0].id))},[empresas])
  useEffect(()=>{void load()},[empresa,status])
  const visible=useMemo(()=>rows,[rows])

  async function openCompra(compraId:string){
    setBusy(true)
    const [cr,nr,ir]=await Promise.all([
      supabase.from('compras_ml').select('id,empresa_id,nro_requisicao,nro_oc,data_compra,ml_order_id,ml_pack_id,valor_operacao_cartao,valor_nf_total,diferenca_cartao_nf,status_conferencia,cartao,ultimos_digitos_cartao,data_estorno,valor_frete,valor_desconto,ml_coupon_amount,ml_discount_amount,ml_resumo_financeiro,observacao,ml_status,ml_status_detail,ml_tags,mercado_entregue').eq('id',compraId).single(),
      supabase.from('compras_ml_notas').select('id,numero_nf,serie_nf,data_emissao,valor_total,observacao').eq('compra_id',compraId).order('data_emissao',{ascending:true}),
      supabase.from('compras_ml_nf_itens').select('id,nota_fiscal_id,numero_item,descricao,quantidade,unidade,valor_unitario,valor_produtos').in('nota_fiscal_id',(await supabase.from('compras_ml_notas').select('id').eq('compra_id',compraId)).data?.map(n=>n.id)??[])
    ])
    if(cr.error||nr.error||ir.error){setMessage('Não foi possível abrir o lançamento: '+(cr.error||nr.error||ir.error)?.message);setBusy(false);return}
    const compra=cr.data as Compra
    setView({compra,notas:(nr.data??[]) as Nota[],itens:(ir.data??[]) as Item[]})
    setBusy(false)
  }

  function startEdit(c:Compra){
    setEditRow(c)
    setForm({
      nro_requisicao:String(c.nro_requisicao??''),
      data_compra:c.data_compra.slice(0,10),
      ml_order_id:c.ml_order_id??'',
      valor:String(c.valor_operacao_cartao??'').replace('.',','),
      nro_oc:c.nro_oc==null?'':String(c.nro_oc),
      cartao:Boolean(c.cartao),
      ultimos_digitos_cartao:c.ultimos_digitos_cartao??'',
      observacao:c.observacao??''
    })
  }

  async function saveEdit(){
    if(!editRow) return
    const valor=Number(form.valor.replace(/\./g,'').replace(',','.'))
    const req=Number(form.nro_requisicao)
    if(!Number.isInteger(req)||req<0||!form.data_compra||!Number.isFinite(valor)||valor<0){setMessage('Preencha requisição, data e valor corretamente.');return}
    setBusy(true)
    const {error}=await supabase.rpc('atualizar_lancamento_compra',{
      p_id:editRow.id,p_empresa_id:editRow.empresa_id,p_nro_requisicao:req,p_data_compra:form.data_compra,
      p_ml_order_id:form.ml_order_id.trim(),p_valor_operacao_cartao:valor,p_nro_oc:form.nro_oc?Number(form.nro_oc):null,
      p_ultimos_digitos_cartao:form.ultimos_digitos_cartao||null,p_observacao:form.observacao||null,
      p_status_erp:Boolean(editRow.status_erp),p_cartao:form.cartao,p_status_entrega:'PENDENTE',p_oc_cancelada:false,p_cidade_uf_destino:null
    })
    if(error) setMessage('Não foi possível salvar a edição: '+error.message)
    else {setMessage('Lançamento atualizado.');setEditRow(null);await load()}
    setBusy(false)
  }

  return <section className="panel purchases-panel">
    <div className="panel-head"><div><h2>Compras — Layout 2.0</h2><p className="muted">Cada NF vinculada aparece como um lançamento fracionado. O pagamento do cartão permanece no pedido Mercado Livre.</p></div></div>
    {message&&<div className="notice">{message}</div>}
    <div className="filters purchase-filters">
      <select value={empresa} onChange={e=>setEmpresa(e.target.value)}><option value="">Todas as empresas</option>{empresas.map(e=><option key={e.id} value={String(e.id)}>{e.nome}</option>)}</select>
      <input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void load()}} placeholder="Pedido ML ou Nº NF"/>
      <select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Todos os status</option>{['AGUARDANDO','AGUARDANDO_NF','CONCILIADO','DIVERGENCIA','ESTORNADO','ENTREGUE','PENDENCIA'].map(s=><option key={s}>{s}</option>)}</select>
      <button onClick={()=>void load()} disabled={busy}>{busy?'Consultando...':'Atualizar'}</button>
    </div>

    <div className="table-wrap"><table className="data-table"><thead><tr><th>Data</th><th>Pedido ML</th><th>NF</th><th>Valor NF</th><th>Pago cartão</th><th>Diferença</th><th>Retornos ML</th><th>Status</th><th></th></tr></thead>
      <tbody>
        {visible.map(r=><tr key={r.lancamento_id}><td>{dateBR(r.data_lancamento)}</td><td>{r.ml_order_id??'—'}</td><td><b>{r.numero_nf??'—'}</b>{r.serie_nf?'/'+r.serie_nf:''}</td><td>{brl(r.valor_lancamento)}</td><td>{brl(r.valor_operacao_cartao)}</td><td>{r.diferenca_cartao_nf!=null?brl(r.diferenca_cartao_nf):'—'}</td><td title={r.ml_resumo_financeiro??''}>{r.ml_resumo_financeiro??'—'}</td><td><span className="tag">{r.status_conferencia}</span></td><td><button className="mini" onClick={()=>void openCompra(r.compra_id)}>Visualizar</button></td></tr>)}
        {pending.map(c=><tr key={'p-'+c.id}><td>{dateBR(c.data_compra)}</td><td>{c.ml_order_id??'—'}</td><td><span className="warn">NF pendente</span></td><td>{brl(c.valor_nf_total)}</td><td>{brl(c.valor_operacao_cartao)}</td><td>{c.diferenca_cartao_nf!=null?brl(c.diferenca_cartao_nf):'—'}</td><td title={c.ml_resumo_financeiro??''}>{c.ml_resumo_financeiro??'—'}</td><td><span className="tag">{c.status_conferencia}</span></td><td>{canEdit&&<button className="mini" onClick={()=>startEdit(c)}>Editar</button>}<button className="mini" onClick={()=>void openCompra(c.id)}>Visualizar</button></td></tr>)}
        {!visible.length&&!pending.length&&<tr><td colSpan={9}>Nenhum lançamento encontrado.</td></tr>}
      </tbody></table></div>

    {editRow&&<div className="import-box"><h3>Editar lançamento da compra</h3><div className="form-grid">
      <label>Nº Requisição<input maxLength={7} value={form.nro_requisicao} onChange={e=>setForm(f=>({...f,nro_requisicao:e.target.value.replace(/\D/g,'').slice(0,7)}))}/></label>
      <label>Data<input type="date" value={form.data_compra} onChange={e=>setForm(f=>({...f,data_compra:e.target.value}))}/></label>
      <label>Pedido ML<input value={form.ml_order_id} onChange={e=>setForm(f=>({...f,ml_order_id:e.target.value}))}/></label>
      <label>Valor pago no cartão<input inputMode="decimal" value={form.valor} onChange={e=>setForm(f=>({...f,valor:e.target.value}))}/></label>
      <label>Final cartão<input maxLength={4} value={form.ultimos_digitos_cartao} onChange={e=>setForm(f=>({...f,ultimos_digitos_cartao:e.target.value.replace(/\D/g,'').slice(0,4)}))}/></label>
      <label>Observação (120)<input maxLength={120} value={form.observacao} onChange={e=>setForm(f=>({...f,observacao:e.target.value.slice(0,120)}))}/></label>
    </div><div className="actions"><button className="primary" onClick={()=>void saveEdit()} disabled={busy}>Salvar</button><button onClick={()=>setEditRow(null)}>Cancelar</button></div></div>}

    {view&&<div className="import-box"><div className="panel-head"><div><h3>Visualização do lançamento</h3><p className="muted">Pedido Mercado Livre {view.compra.ml_order_id??'—'} · Cartão {brl(view.compra.valor_operacao_cartao)}</p></div><button onClick={()=>setView(null)}>Fechar</button></div>
      <div className="form-grid">
        <label>Status<input readOnly value={view.compra.status_conferencia}/></label>
        <label>Estorno<input readOnly value={view.compra.data_estorno?dateBR(view.compra.data_estorno):'Nenhum'}/></label>
        <label>Frete<input readOnly value={brl(view.compra.valor_frete)}/></label>
        <label>Desconto<input readOnly value={brl(view.compra.valor_desconto)}/></label>
        <label>Cupom<input readOnly value={brl(view.compra.ml_coupon_amount)}/></label>
        <label>Retorno ML<input readOnly value={view.compra.ml_resumo_financeiro??'—'}/></label>
      </div>
      {view.compra.diferenca_cartao_nf!=null&&Math.abs(Number(view.compra.diferenca_cartao_nf))>0.01&&<div className="notice"><b>Conferência:</b> {Number(view.compra.diferenca_cartao_nf)<0?'Soma das notas/itens é menor':'Soma das notas/itens é maior'} que o valor pago no cartão em {brl(Math.abs(Number(view.compra.diferenca_cartao_nf)))}. {view.notas.map(n=>n.numero_nf).filter(Boolean).join(', ')||'NF(s) ainda não identificadas'}.</div>}
      {view.compra.observacao&&<div className="notice"><b>Observação da compra:</b> {view.compra.observacao}</div>}
      <h4>DOCUMENTO FISCAL</h4>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>NF</th><th>Série</th><th>Emissão</th><th>Valor</th><th>Itens</th><th>Observação</th></tr></thead><tbody>{view.notas.map(n=>{const its=view.itens.filter(i=>i.nota_fiscal_id===n.id);return <tr key={n.id}><td><b>{n.numero_nf??'—'}</b></td><td>{n.serie_nf??'—'}</td><td>{dateBR(n.data_emissao)}</td><td>{brl(n.valor_total)}</td><td>{its.length?its.map(i=><div key={i.id}>{i.descricao} · {i.quantidade} × {brl(i.valor_unitario)} = {brl(i.valor_produtos)}</div>:'—'}</td><td>{n.observacao??'—'}</td></tr>})}{!view.notas.length&&<tr><td colSpan={6}>Nenhuma nota fiscal vinculada a esta compra.</td></tr>}</tbody></table></div>
      <div className="notice"><b>Resumo:</b> {view.notas.length} NF(s) · soma {brl(view.compra.valor_nf_total)} · cartão {brl(view.compra.valor_operacao_cartao)}.</div>
    </div>}
  </section>
}
