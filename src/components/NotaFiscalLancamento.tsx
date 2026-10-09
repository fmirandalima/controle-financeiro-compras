import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { brl } from '../lib/format'
import * as pdfjsLib from 'pdfjs-dist'
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

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
  observacao?: string | null
  chave_acesso?: string | null
  cnpj_emitente?: string | null
  razao_social_emitente?: string | null
}

type Props = {
  rows: Compra[]
  canEdit: boolean
  initialCompraId?: string
  embedded?: boolean
}

type Candidate = {
  id: string
  data: string
  descricao: string | null
  valor: number
  valor_pago_cartao: number | null
  ultimos_digitos_cartao: string | null
  meio_pagamento: string | null
  exato: boolean
  diferenca_valor: number
  diferenca_dias: number
}

function parseNumber(value: string) {
  const normalized = value.replace(/\./g, '').replace(',', '.')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : NaN
}

function dateOnly(value?: string | null) {
  return value ? value.slice(0, 10) : ''
}

export function NotaFiscalLancamento({ rows, canEdit, initialCompraId, embedded = false }: Props) {
  const [compraId, setCompraId] = useState('')
  const [numero, setNumero] = useState('')
  const [serie, setSerie] = useState('')
  const [data, setData] = useState('')
  const [valor, setValor] = useState('')
  const [observacao, setObservacao] = useState('')
  const [notas, setNotas] = useState<Nota[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [candidateBusy, setCandidateBusy] = useState(false)
  const [editingNotaId, setEditingNotaId] = useState('')
  const [items, setItems] = useState<any[]>([])
  const [itemForm, setItemForm] = useState<any>(null)
  const [patrimonioForm, setPatrimonioForm] = useState({itemId:'',tipo:'AUTOMATICO',codigo:''})

  const selected = useMemo(() => rows.find(r => r.id === compraId) ?? null, [rows, compraId])
  useEffect(() => { if (initialCompraId) setCompraId(initialCompraId) }, [initialCompraId])
  const nfTotal = notas.reduce((sum, n) => sum + Number(n.valor_total || 0), 0)
  const cardTotal = Number(selected?.valor_operacao_cartao || 0)
  const projected = nfTotal + (Number.isFinite(parseNumber(valor)) ? parseNumber(valor) : 0)
  const difference = projected - cardTotal

  function editNota(n: Nota) {
    setNumero(n.numero_nf??'')
    setSerie(n.serie_nf??'')
    setData(dateOnly(n.data_emissao))
    setValor(String(n.valor_total??'').replace('.',','))
    setObservacao(n.observacao??'')
    setEditingNotaId(n.id)
    setMessage('Editando NF '+(n.numero_nf??''))
  }

  async function loadNotas(id: string) {
    if (!id) { setNotas([]); return }
    const { data, error } = await supabase
      .from('compras_ml_notas')
      .select('id,numero_nf,serie_nf,data_emissao,valor_total')
      .eq('compra_id', id)
      .order('data_emissao', { ascending: true })
    if (error) setMessage(`Não foi possível consultar as NF(s): ${error.message}`)
    else {
      const loaded=(data ?? []) as Nota[]; setNotas(loaded)
      if(!loaded.length){setItems([]);return}
      const {data: itemData,error:itemError}=await supabase.from('compras_ml_nf_itens').select('id,nota_fiscal_id,numero_item,codigo_produto,descricao,quantidade,unidade,valor_unitario,valor_produtos,valor_frete,valor_desconto,valor_ipi,imobilizado').in('nota_fiscal_id',loaded.map(n=>n.id)).order('numero_item',{ascending:true})
      if(itemError)setMessage('Notas carregadas, mas houve erro nos itens: '+itemError.message); else setItems(itemData??[])
    }
  }

  useEffect(() => { loadNotas(compraId) }, [compraId, initialCompraId])

  async function save() {
    if (!canEdit || !selected) return
    const amount = parseNumber(valor)
    if (!numero.trim()) { setMessage('Informe o número da NF.'); return }
    if (!data) { setMessage('Informe a data de emissão da NF.'); return }
    if (!Number.isFinite(amount) || amount <= 0) { setMessage('Informe um valor de NF válido.'); return }

    setBusy(true)
    setMessage('')
    setCandidates([])
    const payload = {
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
    }
    const { error } = editingNotaId ? await supabase.from('compras_ml_notas').update(payload).eq('id',editingNotaId) : await supabase.from('compras_ml_notas').insert(payload)
    if (error) {
      setMessage(`Não foi possível lançar a NF: ${error.message}`)
    } else {
      await loadNotas(selected.id)
      let resultMessage = 'NF lançada. Nenhuma transação de cartão compatível foi encontrada na janela de 10 dias; o vínculo ficou pendente.'
      const { data: candidateData, error: candidateError } = await supabase.rpc('buscar_candidatos_cartao_nf', { p_compra_id: selected.id, p_data_nf: data })
      if (candidateError) {
        resultMessage = 'NF lançada, mas não foi possível consultar os candidatos de cartão: ' + candidateError.message
      } else {
        const found = (candidateData ?? []) as Candidate[]
        setCandidates(found)
        const exact = found.filter(x => x.exato)
        if (exact.length === 1) {
          const { error: linkError } = await supabase.rpc('vincular_transacao_compra', { p_compra_id: selected.id, p_transacao_id: exact[0].id })
          if (linkError) resultMessage = 'NF lançada, mas o vínculo automático do cartão falhou: ' + linkError.message
          else { setCandidates([]); resultMessage = 'NF lançada e cartão conciliado automaticamente.' }
        } else if (found.length) {
          resultMessage = exact.length > 1 ? 'NF lançada. Há mais de uma transação exata; selecione manualmente.' : 'NF lançada. Selecione uma transação de cartão para vincular ou deixe pendente.'
        } else {
          resultMessage = 'NF lançada. Nenhuma transação de cartão compatível foi encontrada na janela de 10 dias; o vínculo ficou pendente.'
        }
      }
      setEditingNotaId('')
      setNumero('')
      setSerie('')
      setData('')
      setValor('')
      setObservacao('')
      setMessage(resultMessage)
    }
    setBusy(false)
  }

  if (!canEdit) return null

  async function importXml(file: File) {
    if(!selected)return
    setBusy(true);setMessage('')
    try {
      const doc=new DOMParser().parseFromString(await file.text(),'application/xml')
      if(doc.querySelector('parsererror'))throw new Error('XML inválido.')
      const val=(sel:string[])=>{for(const s of sel){const e=doc.querySelector(s);if(e?.textContent?.trim())return e.textContent.trim()}return ''}
      const nf=val(['infNFe > ide > nNF','ide > nNF','nNF'])
      const total=Number(val(['infNFe > total > ICMSTot > vNF','total > ICMSTot > vNF','vNF'])||0)
      if(!nf||!total)throw new Error('Não encontrei número e valor total da NF-e.')
      const em=val(['ide > dhEmi','ide > dEmi','dhEmi','dEmi'])
      const {data:created,error}=await supabase.from('compras_ml_notas').insert({compra_id:selected.id,numero_nf:nf,serie_nf:val(['ide > serie','serie'])||null,data_emissao:em?em.slice(0,10):null,chave_acesso:doc.querySelector('infNFe')?.getAttribute('Id')?.replace(/^NFe/,'')||null,cnpj_emitente:val(['emit > CNPJ','CNPJ']).replace(/\D/g,'').slice(0,14)||null,razao_social_emitente:val(['emit > xNome','xNome'])||null,valor_produtos:Number(val(['ICMSTot > vProd','vProd'])||0),valor_frete:Number(val(['ICMSTot > vFrete','vFrete'])||0),valor_desconto:Number(val(['ICMSTot > vDesc','vDesc'])||0),valor_ipi:Number(val(['ICMSTot > vIPI','vIPI'])||0),valor_outras_despesas:Number(val(['ICMSTot > vOutro','vOutro'])||0),valor_total:total,status_nf:'IMPORTADA_XML',observacao:'Importada de XML'})
      if(error)throw error
      const id=(created as any[]|null)?.[0]?.id
      if(id)for(const [idx,det] of Array.from(doc.querySelectorAll('det')).entries()){
        const get=(name:string)=>det.querySelector('prod > '+name)?.textContent?.trim()??''
        const qty=Number(get('qCom')||0),unit=Number(get('vUnCom')||0)
        const {error:ie}=await supabase.rpc('salvar_item_nf_patrimonio',{p_id:null,p_nota_fiscal_id:id,p_numero_item:Number(det.getAttribute('nItem')||idx+1),p_codigo_produto:get('cProd')||null,p_descricao:get('xProd')||'Item '+(idx+1),p_quantidade:qty||1,p_unidade:get('uCom')||null,p_valor_unitario:unit,p_valor_produtos:Number(get('vProd')||qty*unit),p_valor_frete:Number(get('vFrete')||0),p_valor_desconto:Number(get('vDesc')||0),p_valor_ipi:0,p_imobilizado:false})
        if(ie)throw ie
      }
      await loadNotas(selected.id);setMessage('XML importado. Revise os dados e marque os itens imobilizados.')
    }catch(e){setMessage('Falha ao importar XML: '+(e instanceof Error?e.message:'erro desconhecido'))}
    setBusy(false)
  }
  async function importPdf(file: File) {
    if(!selected)return
    setBusy(true);setMessage('Lendo PDF...')
    try{
      const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise
      let text=''
      for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p);const content=await page.getTextContent();text+=' '+content.items.map(x=>'str' in x?x.str:'').join(' ')}
      if(!text.trim())throw new Error('PDF digitalizado sem texto selecionável; precisa de OCR e nada foi gravado.')
      const n=text.match(/(?:NF-e|NOTA FISCAL(?: ELETRÔNICA)?|N[º°.]?\s*NF)[^\d]{0,35}(\d{1,20})/i)?.[1]??text.match(/\bnNF\s*[:=]?\s*(\d{1,20})/i)?.[1]??''
      const key=text.match(/\b(\d{44})\b/)?.[1]??''
      const m=text.match(/(?:VALOR TOTAL DA NOTA|VALOR TOTAL NF|vNF)\s*[:=]?\s*(?:R\$\s*)?([\d.]+,\d{2})/i)
      const dt=text.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/)
      setNumero(n||numero);setData(dt?dt[3]+'-'+dt[2]+'-'+dt[1]:data);setValor(m?m[1]:valor);setObservacao((observacao?observacao+' · ':'')+'Extraído de PDF; revisar antes de salvar')
      if(key)setMessage('PDF lido. Confira os campos e salve manualmente; itens do PDF precisam ser conferidos.')
      else setMessage('PDF lido para preenchimento assistido. Confira número, data e valor e salve manualmente.')
    }catch(e){setMessage('Falha ao ler PDF: '+(e instanceof Error?e.message:'erro desconhecido'))}
    setBusy(false)
  }
  function startItem(notaId:string, item?:any) {
    setItemForm(item?{id:item.id,nota_fiscal_id:item.nota_fiscal_id,numero_item:String(item.numero_item??''),codigo_produto:item.codigo_produto??'',descricao:item.descricao,quantidade:String(item.quantidade),unidade:item.unidade??'',valor_unitario:String(item.valor_unitario),valor_produtos:String(item.valor_produtos),valor_frete:String(item.valor_frete??0),valor_desconto:String(item.valor_desconto??0),valor_ipi:String(item.valor_ipi??0),imobilizado:Boolean(item.imobilizado)}:{id:'',nota_fiscal_id:notaId,numero_item:'',codigo_produto:'',descricao:'',quantidade:'1',unidade:'UN',valor_unitario:'',valor_produtos:'',valor_frete:'0',valor_desconto:'0',valor_ipi:'0',imobilizado:false})
  }
  async function saveItem() {
    if(!itemForm||!selected)return
    const qty=Number(String(itemForm.quantidade).replace(',','.')),unit=Number(String(itemForm.valor_unitario).replace(',','.')),products=itemForm.valor_produtos?Number(String(itemForm.valor_produtos).replace(',','.')):qty*unit
    if(!itemForm.descricao.trim()||!Number.isFinite(qty)||qty<=0||!Number.isFinite(unit)||unit<0||!Number.isFinite(products)||products<0){setMessage('Informe descrição, quantidade e valores válidos.');return}
    setBusy(true)
    const {error}=await supabase.rpc('salvar_item_nf_patrimonio',{p_id:itemForm.id||null,p_nota_fiscal_id:itemForm.nota_fiscal_id,p_numero_item:itemForm.numero_item?Number(itemForm.numero_item):null,p_codigo_produto:itemForm.codigo_produto||null,p_descricao:itemForm.descricao.trim(),p_quantidade:qty,p_unidade:itemForm.unidade||null,p_valor_unitario:unit,p_valor_produtos:products,p_valor_frete:Number(itemForm.valor_frete||0),p_valor_desconto:Number(itemForm.valor_desconto||0),p_valor_ipi:Number(itemForm.valor_ipi||0),p_imobilizado:itemForm.imobilizado})
    if(error)setMessage('Não foi possível salvar item: '+error.message);else{setMessage('Item salvo.');setItemForm(null);await loadNotas(selected.id)}
    setBusy(false)
  }
  async function generateAsset(item:any) {
    setBusy(true)
    const {data,error}=await supabase.rpc('gerar_patrimonio_item_nf_config',{p_item_id:item.id,p_tipo_identificacao:patrimonioForm.tipo,p_codigo_patrimonio:patrimonioForm.tipo==='MANUAL'?patrimonioForm.codigo:null,p_descricao_patrimonio:item.descricao})
    if(error)setMessage('Não foi possível gerar patrimônio: '+error.message);else{setMessage('Patrimônio gerado: '+Number(data??0)+' registro(s).');setPatrimonioForm({itemId:'',tipo:'AUTOMATICO',codigo:''});await loadNotas(selected!.id)}
    setBusy(false)
  }


  return <div className="import-box" style={{ marginTop: 20 }}>
    <h3>{embedded ? 'Notas fiscais e itens da compra' : 'Lançamento de NF — vinculado à compra/cartão'}</h3>
    {!embedded && <p className="muted">A NF é vinculada à compra selecionada. Data e valor da NF são independentes do cartão.</p>}

    <div className="form-grid">
      {!embedded && <label>Compra/cartão *
        <select value={compraId} onChange={e => { setCompraId(e.target.value); setMessage('') }}>
          <option value="">Selecione a compra</option>
          {rows.map(r => <option key={r.id} value={r.id}>{r.empresa_apelido ?? 'Empresa'} · {dateOnly(r.data_compra).split('-').reverse().join('/')} · {brl(r.valor_operacao_cartao)} · Req. {r.id.slice(0, 8)}</option>)}
        </select>
      </label>}
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

    {candidates.length > 0 && <div className="notice" style={{ marginTop: 12 }}>
      <b>Transações de cartão candidatas</b>
      <span className="tiny"> — até 10 dias antes da emissão da NF, inclusive a data da NF.</span>
      <div className="table-wrap" style={{ marginTop: 8 }}>
        <table className="data-table"><thead><tr><th>Seleção</th><th>Data</th><th>Descrição</th><th>Cartão</th><th>Valor</th><th>Diferença</th><th>Distância</th><th></th></tr></thead>
        <tbody>{candidates.map(c => <tr key={c.id}>
          <td>{c.exato ? <b>EXATO</b> : 'Candidato'}</td><td>{dateOnly(c.data).split('-').reverse().join('/')}</td><td>{c.descricao ?? '—'}</td>
          <td>•••• {c.ultimos_digitos_cartao ?? '—'}</td><td>{brl(Number(c.valor_pago_cartao ?? c.valor))}</td><td>{brl(Number(c.diferenca_valor))}</td><td>{c.diferenca_dias} dia(s)</td>
          <td><button className="mini" disabled={candidateBusy} onClick={async () => {
            setCandidateBusy(true)
            const { error } = await supabase.rpc('vincular_transacao_compra', { p_compra_id: selected!.id, p_transacao_id: c.id })
            if (error) setMessage('Não foi possível vincular o cartão: ' + error.message)
            else { setMessage('Transação de cartão vinculada à compra. A conferência foi recalculada.'); setCandidates([]) }
            setCandidateBusy(false)
          }}>Vincular</button></td>
        </tr>)}</tbody></table>
      </div>
      <div className="actions" style={{ marginTop: 8 }}>
        <button disabled={candidateBusy} onClick={() => { setCandidates([]); setMessage('NF lançada sem vínculo de cartão. A pendência poderá ser tratada posteriormente.') }}>Deixar pendente</button>
      </div>
    </div>}

    <div className="actions">
      <button className="primary" onClick={save} disabled={busy || !selected}>{busy ? 'Salvando...' : editingNotaId ? 'Salvar alteração da NF' : 'Lançar NF'}</button>
      <label className="file-button">Importar XML NF-e<input type="file" accept=".xml,text/xml,application/xml" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void importXml(f);e.currentTarget.value=''}}/></label>
      <label className="file-button">Ler PDF NF<input type="file" accept=".pdf,application/pdf" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void importPdf(f);e.currentTarget.value=''}}/></label>
    </div>

    {selected && <div className="table-wrap" style={{ marginTop: 12 }}>
      <table className="data-table"><thead><tr><th>NF</th><th>Série</th><th>Emissão</th><th>Valor</th><th>Itens</th><th>Observação</th><th>Ações</th></tr></thead>
      <tbody>{notas.length ? notas.map(n => <tr key={n.id}><td>{n.numero_nf ?? '—'}</td><td>{n.serie_nf ?? '—'}</td><td>{dateOnly(n.data_emissao).split('-').reverse().join('/')}</td><td>{brl(Number(n.valor_total))}</td><td>{items.filter(i=>i.nota_fiscal_id===n.id).length}</td><td>{n.observacao??'—'}</td><td><button className="mini" onClick={()=>editNota(n)}>Editar</button><button className="mini" onClick={()=>startItem(n.id)}>+ Item</button></td></tr>) : <tr><td colSpan={7}>Nenhuma NF vinculada a esta compra.</td></tr>}</tbody></table>
    </div>}

      {notas.map(n=><div className="import-box" key={'items-'+n.id}><h4>Itens da NF {n.numero_nf??'—'}</h4><div className="table-wrap"><table className="data-table"><thead><tr><th>Item</th><th>Código</th><th>Descrição</th><th>Qtd.</th><th>Un.</th><th>Unitário</th><th>Total</th><th>Imobilizado</th><th>Ações</th></tr></thead><tbody>{items.filter(i=>i.nota_fiscal_id===n.id).map(i=><tr key={i.id}><td>{i.numero_item??'—'}</td><td>{i.codigo_produto??'—'}</td><td>{i.descricao}</td><td>{i.quantidade}</td><td>{i.unidade??'—'}</td><td>{brl(Number(i.valor_unitario))}</td><td>{brl(Number(i.valor_produtos))}</td><td>{i.imobilizado?'Sim':'Não'}</td><td><button className="mini" onClick={()=>startItem(n.id,i)}>Editar</button>{i.imobilizado&&<button className="mini" onClick={()=>setPatrimonioForm({itemId:i.id,tipo:'AUTOMATICO',codigo:''})}>Gerar patrimônio</button>}</td></tr>)}{!items.some(i=>i.nota_fiscal_id===n.id)&&<tr><td colSpan={9}>Nenhum item cadastrado.</td></tr>}</tbody></table></div></div>)}
      {itemForm&&<div className="import-box"><h4>{itemForm.id?'Editar item':'Novo item da NF'}</h4><div className="form-grid">
        <label>NF<select value={itemForm.nota_fiscal_id} onChange={e=>setItemForm((f:any)=>({...f,nota_fiscal_id:e.target.value}))}>{notas.map(n=><option key={n.id} value={n.id}>NF {n.numero_nf??'—'}</option>)}</select></label>
        <label>Nº item<input value={itemForm.numero_item} onChange={e=>setItemForm((f:any)=>({...f,numero_item:e.target.value}))}/></label><label>Código produto<input value={itemForm.codigo_produto} onChange={e=>setItemForm((f:any)=>({...f,codigo_produto:e.target.value}))}/></label>
        <label>Descrição<input value={itemForm.descricao} onChange={e=>setItemForm((f:any)=>({...f,descricao:e.target.value}))}/></label><label>Quantidade<input value={itemForm.quantidade} onChange={e=>setItemForm((f:any)=>({...f,quantidade:e.target.value}))}/></label><label>Unidade<input value={itemForm.unidade} onChange={e=>setItemForm((f:any)=>({...f,unidade:e.target.value}))}/></label>
        <label>Valor unitário<input value={itemForm.valor_unitario} onChange={e=>setItemForm((f:any)=>({...f,valor_unitario:e.target.value}))}/></label><label>Valor produtos<input value={itemForm.valor_produtos} onChange={e=>setItemForm((f:any)=>({...f,valor_produtos:e.target.value}))}/></label><label>Frete<input value={itemForm.valor_frete} onChange={e=>setItemForm((f:any)=>({...f,valor_frete:e.target.value}))}/></label><label>Desconto<input value={itemForm.valor_desconto} onChange={e=>setItemForm((f:any)=>({...f,valor_desconto:e.target.value}))}/></label><label>IPI<input value={itemForm.valor_ipi} onChange={e=>setItemForm((f:any)=>({...f,valor_ipi:e.target.value}))}/></label>
        <label><input type="checkbox" checked={itemForm.imobilizado} onChange={e=>setItemForm((f:any)=>({...f,imobilizado:e.target.checked}))}/> Item imobilizado</label>
      </div><div className="actions"><button className="primary" disabled={busy} onClick={()=>void saveItem()}>Salvar item</button><button onClick={()=>setItemForm(null)}>Cancelar</button></div></div>}
      {patrimonioForm.itemId&&<div className="import-box"><h4>Gerar código patrimonial</h4><div className="form-grid"><label>Modo<select value={patrimonioForm.tipo} onChange={e=>setPatrimonioForm(f=>({...f,tipo:e.target.value,codigo:''}))}><option value="AUTOMATICO">Automático</option><option value="MANUAL">Manual</option></select></label>{patrimonioForm.tipo==='MANUAL'&&<label>Código<input value={patrimonioForm.codigo} onChange={e=>setPatrimonioForm(f=>({...f,codigo:e.target.value}))}/></label>}</div><div className="actions"><button className="primary" disabled={busy||(patrimonioForm.tipo==='MANUAL'&&!patrimonioForm.codigo.trim())} onClick={()=>{const i=items.find(i=>i.id===patrimonioForm.itemId);if(i)void generateAsset(i)}}>Gerar patrimônio</button><button onClick={()=>setPatrimonioForm({itemId:'',tipo:'AUTOMATICO',codigo:''})}>Cancelar</button></div></div>}
  </div>
}
