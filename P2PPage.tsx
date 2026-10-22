import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './p2p.css'

type Status = 'ABERTA'|'EM_COMPRAS'|'AGUARDANDO_PAGAMENTO'|'EM_FINANCEIRO'|'EM_FISCAL'|'AGUARDANDO_NF'|'CONCLUIDA'|'CANCELADA'
type Formalizacao = 'PENDENTE'|'ENVIADA'|'CONFIRMADA'|'NAO_APLICAVEL'
type SankhyaStatus = 'PENDENTE'|'LANCADO'|'NAO_APLICAVEL'
type Pagamento = { nome: string; path: string; enviado_em?: string }
type Evento = { evento: string; status?: string; status_anterior?: string; status_novo?: string; detalhe?: string; em: string; usuario_id?: string }
type Atividade = {
  id: string; numero_requisicao: string; numero_cotacao: string | null; numero_nf: string | null;
  tem_adiantamento: boolean; status_fluxo: Status; quitacao_confirmada: boolean;
  aguardando_nf: boolean; possui_boleto: boolean; boleto_vencimento: string | null; pagamento_provisionado: boolean;
  anexo_nf_path: string | null; comprovantes_pagamento: Pagamento[]; historico_fluxo: Evento[];
  formalizacao_cliente_status: Formalizacao; formalizacao_cliente_contato: string | null;
  formalizacao_cliente_referencia: string | null; formalizacao_cliente_observacao: string | null;
  formalizacao_cliente_em: string | null;
  sankhya_status: SankhyaStatus; sankhya_numero_documento: string | null;
  sankhya_observacao: string | null; sankhya_lancado_em: string | null;
  criado_em: string; atualizado_em: string;
}
const BUCKET = 'sigcf-p2p-documentos'
const statusLabels: Record<Status,string> = {
  ABERTA:'Aberta', EM_COMPRAS:'Em Compras', AGUARDANDO_PAGAMENTO:'Aguardando pagamento',
  EM_FINANCEIRO:'Em Financeiro', EM_FISCAL:'Em Fiscal', AGUARDANDO_NF:'Aguardando NF (marcação)',
  CONCLUIDA:'Concluída', CANCELADA:'Cancelada'
}
const statusChoices: Status[] = ['ABERTA','EM_COMPRAS','AGUARDANDO_PAGAMENTO','EM_FINANCEIRO','EM_FISCAL','CONCLUIDA','CANCELADA']
const statusDescriptions: Partial<Record<Status,string>> = {
  ABERTA:'Atividade registrada, ainda sem início da negociação.',
  EM_COMPRAS:'Em negociação/cotação; aguarda confirmação da compra pelo vendedor.',
  AGUARDANDO_PAGAMENTO:'Compra confirmada; aguarda pagamento total, parcial ou adiantamento.',
  EM_FINANCEIRO:'O Financeiro assumiu a atividade e está preparando o pagamento; anexe o comprovante quando realizado.',
  EM_FISCAL:'A nota fiscal está sendo lançada e o pagamento será provisionado.',
  CANCELADA:'Requisição ou OC cancelada pela unidade/solicitante ou compra não aprovada pelo gestor.',
  CONCLUIDA:'Nota fiscal lançada e pagamento provisionado.'
}
const formalizacaoLabels: Record<Formalizacao,string> = { PENDENTE:'Pendente', ENVIADA:'Enviada ao cliente', CONFIRMADA:'Confirmada pelo cliente', NAO_APLICAVEL:'Não se aplica' }
const sankhyaLabels: Record<SankhyaStatus,string> = { PENDENTE:'Pendente de lançamento', LANCADO:'Lançado no Sankhya', NAO_APLICAVEL:'Não se aplica' }
const allowed = (f: File) => ['application/pdf','image/jpeg','image/png'].includes(f.type) && f.size <= 15*1024*1024

export default function P2PPage({ onBack }: { onBack?: () => void }) {
  const [rows,setRows] = useState<Atividade[]>([])
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [query,setQuery] = useState('')
  const [statusFilter,setStatusFilter] = useState('TODOS')
  const [selected,setSelected] = useState<Atividade|null>(null)
  const [req,setReq] = useState('')
  const [cot,setCot] = useState('')
  const [adiantamento,setAdiantamento] = useState(false)
  const [specialFilter,setSpecialFilter] = useState<'NONE'|'AGUARDANDO_NF'|'BOLETO'>('NONE')
  const [creating,setCreating] = useState(false)
  const [saving,setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const { data, error } = await supabase.from('p2p_atividades').select('*').order('atualizado_em',{ascending:false})
    if(error) setError('Não foi possível carregar as atividades: '+error.message)
    else setRows((data ?? []) as Atividade[])
    setLoading(false)
  },[])
  useEffect(()=>{ void load() },[load])

  const filtered = useMemo(()=>rows.filter(r => {
    const q=query.trim().toLowerCase()
    const matches=!q || [r.numero_requisicao,r.numero_cotacao ?? '',r.numero_nf ?? ''].some(v=>v.toLowerCase().includes(q))
    const statusMatches=statusFilter==='TODOS' || r.status_fluxo===statusFilter
    const isActive=!['CONCLUIDA','CANCELADA'].includes(r.status_fluxo)
    const specialMatches=specialFilter==='NONE' || (specialFilter==='AGUARDANDO_NF'&&r.aguardando_nf&&isActive) || (specialFilter==='BOLETO'&&r.possui_boleto&&isActive)
    return matches && statusMatches && specialMatches
  }),[rows,query,statusFilter,specialFilter])

  async function createActivity(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(''); setNotice('')
    const { data, error } = await supabase.from('p2p_atividades').insert({
      numero_requisicao:req.trim(), numero_cotacao:cot.trim() || null, tem_adiantamento:adiantamento,
      status_fluxo:'ABERTA'
    }).select('*').single()
    setSaving(false)
    if(error){setError('Falha ao criar atividade: '+error.message);return}
    setRows(prev=>[data as Atividade,...prev]); setSelected(data as Atividade); setReq('');setCot('');setAdiantamento(false);setCreating(false);setNotice('Atividade criada. A OC poderá ser informada antes de avançar para Compras.')
  }

  async function updateActivity(patch: Partial<Atividade>) {
    if(!selected)return
    setSaving(true);setError('');setNotice('')
    const {data,error}=await supabase.from('p2p_atividades').update(patch).eq('id',selected.id).select('*').single()
    setSaving(false)
    if(error){setError('Falha ao salvar: '+error.message);return}
    setSelected(data as Atividade);setRows(prev=>prev.map(r=>r.id===data.id?data as Atividade:r));setNotice('Alterações salvas.')
  }

  async function uploadFile(kind:'nf'|'pagamento', file?:File) {
    if(!selected || !file)return
    if(!allowed(file)){setError('Arquivo inválido. Use PDF, JPG ou PNG de até 15 MB.');return}
    setSaving(true);setError('');setNotice('')
    const path = selected.id+'/'+kind+'/'+Date.now()+'-'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_')
    const {error:uploadError}=await supabase.storage.from(BUCKET).upload(path,file,{contentType:file.type,upsert:false})
    if(uploadError){setSaving(false);setError('Falha no upload: '+uploadError.message);return}
    let patch:Partial<Atividade>
    if(kind==='nf') patch={anexo_nf_path:path,aguardando_nf:false}
    else patch={comprovantes_pagamento:[...(selected.comprovantes_pagamento??[]),{nome:file.name,path,enviado_em:new Date().toISOString()}]}
    const {data,error}=await supabase.from('p2p_atividades').update(patch).eq('id',selected.id).select('*').single()
    setSaving(false)
    if(error){setError('Arquivo enviado, mas não foi possível vincular à atividade: '+error.message);return}
    setSelected(data as Atividade);setRows(prev=>prev.map(r=>r.id===data.id?data as Atividade:r));setNotice('Documento anexado.')
  }

  async function download(path:string,name:string) {
    const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(path,90)
    if(error||!data?.signedUrl){setError('Não foi possível gerar o download: '+(error?.message??'URL indisponível'));return}
    const a=document.createElement('a');a.href=data.signedUrl;a.download=name;a.target='_blank';a.rel='noreferrer';a.click()
  }

  const nfReady=Boolean(selected?.numero_nf?.trim() && selected?.anexo_nf_path)
  const canComplete=Boolean(nfReady && selected?.pagamento_provisionado)

  return <main className="p2p-shell">
    <header className="p2p-top"><div className="p2p-brand"><div className="p2p-logo">P2P</div><div><strong>SIGCF P2P</strong><small>Acompanhamento de atividades</small></div></div><div className="p2p-top-actions">{onBack&&<button onClick={onBack}>Voltar ao SIGCF</button>}<button onClick={()=>void load()}>Atualizar</button></div></header>
    <section className="p2p-main">
      <div className="p2p-heading"><div><p className="p2p-eyebrow">CENTRAL DE ATIVIDADES</p><h1>Compras, documentos e pagamentos</h1><p className="p2p-subtitle">Reúna o status, a nota fiscal, os comprovantes e o histórico em um único lugar.</p></div><button className="p2p-primary" onClick={()=>{setCreating(v=>!v);setSelected(null)}}>＋ Nova atividade</button></div>
      <div className="p2p-stats"><article><span>Total de atividades</span><strong>{rows.length}</strong></article><article><span>Em andamento</span><strong>{rows.filter(r=>!['CONCLUIDA','CANCELADA'].includes(r.status_fluxo)).length}</strong></article><article><span>Em Compras</span><strong>{rows.filter(r=>r.status_fluxo==='EM_COMPRAS').length}</strong></article><article><span>Aguardando pagamento</span><strong>{rows.filter(r=>r.status_fluxo==='AGUARDANDO_PAGAMENTO'||r.status_fluxo==='EM_FINANCEIRO').length}</strong></article><article><span>Concluídas</span><strong>{rows.filter(r=>r.status_fluxo==='CONCLUIDA').length}</strong></article></div>
      {error&&<div className="p2p-alert error">{error}</div>}{notice&&<div className="p2p-alert success">{notice}</div>}
      {creating&&<form className="p2p-card p2p-create" onSubmit={createActivity}><div className="p2p-card-title"><div><h2>Nova atividade</h2><p>Informe apenas os números de referência necessários.</p></div><button type="button" onClick={()=>setCreating(false)}>Cancelar</button></div><div className="p2p-form-grid"><label>Nº da requisição<input required value={req} onChange={e=>setReq(e.target.value)} /></label><label>Nº da OC (Ordem de Compra)<input value={cot} onChange={e=>setCot(e.target.value)} placeholder="Opcional na abertura" /></label></div><label className="p2p-check"><input type="checkbox" checked={adiantamento} onChange={e=>setAdiantamento(e.target.checked)}/> Há adiantamento ou pagamento parcial</label><button className="p2p-primary" disabled={saving}>{saving?'Salvando…':'Criar atividade'}</button></form>}
      <div className="p2p-layout">
        <aside className="p2p-attention-sidebar"><h2>Precisa de atenção</h2><button className={'p2p-attention-card '+(specialFilter==='AGUARDANDO_NF'?'active':'')} onClick={()=>{setSpecialFilter(v=>v==='AGUARDANDO_NF'?'NONE':'AGUARDANDO_NF');setStatusFilter('TODOS')}}><span>Aguardando NF</span><strong>{rows.filter(r=>r.aguardando_nf&&!['CONCLUIDA','CANCELADA'].includes(r.status_fluxo)).length}</strong><small>Pagamento confirmado, nota ainda não recebida</small></button><button className={'p2p-attention-card boleto '+(specialFilter==='BOLETO'?'active':'')} onClick={()=>{setSpecialFilter(v=>v==='BOLETO'?'NONE':'BOLETO');setStatusFilter('TODOS')}}><span>Possui boleto</span><strong>{rows.filter(r=>r.possui_boleto&&!['CONCLUIDA','CANCELADA'].includes(r.status_fluxo)).length}</strong><small>Priorize o vencimento para evitar cancelamento da compra</small></button></aside>
        <section className="p2p-card p2p-list"><div className="p2p-card-title"><div><h2>Atividades</h2><p>{filtered.length} registro(s)</p></div></div><div className="p2p-filters"><input placeholder="Buscar requisição, OC ou NF…" value={query} onChange={e=>setQuery(e.target.value)}/><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="TODOS">Todos os status</option>{statusChoices.map(s=><option key={s} value={s}>{statusLabels[s]}</option>)}</select><button type="button" className="p2p-clear-filter" onClick={()=>{setStatusFilter('TODOS');setSpecialFilter('NONE')}}>Limpar filtros</button></div>
        {loading?<p className="p2p-empty">Carregando atividades…</p>:filtered.length===0?<p className="p2p-empty">Nenhuma atividade encontrada.</p>:<div className="p2p-activity-list">{filtered.map(r=><button key={r.id} className={'p2p-activity '+(selected?.id===r.id?'selected':'')} onClick={()=>{setSelected(r);setCreating(false);setError('');setNotice('')}}><div className="p2p-activity-head"><strong>Req. {r.numero_requisicao}</strong><span className={'p2p-status '+r.status_fluxo.toLowerCase()}>{statusLabels[r.status_fluxo]}</span></div><span>OC {r.numero_cotacao||'não informada'}{r.numero_nf?' · NF '+r.numero_nf:''}</span>{r.aguardando_nf&&!['CONCLUIDA','CANCELADA'].includes(r.status_fluxo)&&<span className="p2p-activity-alert">Aguardando NF</span>}{r.possui_boleto&&!['CONCLUIDA','CANCELADA'].includes(r.status_fluxo)&&<span className={'p2p-activity-alert boleto '+(r.boleto_vencimento&&new Date(r.boleto_vencimento+'T23:59:59')<new Date()?'overdue':'')}>Boleto · {r.boleto_vencimento?'vence em '+new Date(r.boleto_vencimento+'T00:00:00').toLocaleDateString('pt-BR'):'vencimento não informado'}</span>}<small>Atualizada {new Date(r.atualizado_em).toLocaleString('pt-BR')}</small></button>)}</div>}</section>
        <section className="p2p-card p2p-detail">{!selected?<div className="p2p-empty p2p-empty-detail"><div className="p2p-empty-icon">↗</div><h2>Detalhes da atividade</h2><p>Selecione uma atividade na lista ou crie uma nova para consultar documentos, status e histórico.</p></div>:<>
          <div className="p2p-card-title"><div><p className="p2p-eyebrow">REQUISIÇÃO {selected.numero_requisicao}</p><h2>Detalhes da atividade</h2><p>OC {selected.numero_cotacao||'não informada'} · Criada em {new Date(selected.criado_em).toLocaleDateString('pt-BR')}</p></div><span className={'p2p-status '+selected.status_fluxo.toLowerCase()}>{statusLabels[selected.status_fluxo]}</span></div>
          <div className="p2p-section"><h3>Referências da atividade</h3><div className="p2p-form-grid"><label>Nº da requisição<input value={selected.numero_requisicao} onChange={e=>setSelected({...selected,numero_requisicao:e.target.value})} onBlur={()=>{const value=selected.numero_requisicao.trim();if(!value){setError('O Nº da requisição é obrigatório.');setNotice('');return}if(value!==rows.find(r=>r.id===selected.id)?.numero_requisicao)void updateActivity({numero_requisicao:value})}} required /></label><label>Nº da OC (Ordem de Compra)<input value={selected.numero_cotacao??''} onChange={e=>setSelected({...selected,numero_cotacao:e.target.value})} onBlur={()=>{const value=selected.numero_cotacao?.trim()||null;if(!value&&!['ABERTA','CANCELADA'].includes(selected.status_fluxo)){setError('Não é possível remover a OC enquanto a atividade estiver em uma etapa de compra.');setNotice('');return}if(value!==rows.find(r=>r.id===selected.id)?.numero_cotacao)void updateActivity({numero_cotacao:value})}} placeholder="Opcional enquanto estiver Aberta ou Cancelada" /></label></div><p className="p2p-help">Você pode corrigir os números de referência a qualquer momento. A OC é obrigatória antes de avançar para as etapas de compra, exceto ao cancelar.</p></div>
          <div className="p2p-section"><h3>Fluxo de trabalho</h3><label>Status atual<select value={selected.status_fluxo} disabled={saving} onChange={e=>{const nextStatus=e.target.value as Status;if(!['ABERTA','CANCELADA'].includes(nextStatus)&&!selected.numero_cotacao?.trim()){setError('Informe o Nº da OC (Ordem de Compra) antes de avançar para uma etapa de compra. É permitido cancelar sem OC.');setNotice('');return}if(nextStatus==='CONCLUIDA'&&!canComplete){setError('Para concluir, informe e anexe a NF e confirme que o pagamento foi provisionado.');setNotice('');return}void updateActivity({status_fluxo:nextStatus})}}>{statusChoices.map(s=><option key={s} value={s}>{statusLabels[s]}</option>)}</select></label><p className="p2p-help">{statusDescriptions[selected.status_fluxo]??'Aguardando recebimento da nota fiscal é uma marcação independente do status.'}</p><p className="p2p-help">Ao mudar o status, o banco registra automaticamente a movimentação no histórico.</p></div>
          <div className="p2p-section"><h3>Nota fiscal</h3><label className="p2p-check"><input type="checkbox" checked={Boolean(selected.aguardando_nf)} onChange={e=>void updateActivity({aguardando_nf:e.target.checked})}/> Aguardando NF — compra paga/confirmada e nota fiscal ainda não recebida</label><p className="p2p-help">Marque quando o pagamento tiver sido confirmado e a NF ainda não tiver chegado. Isso é uma sinalização de atenção, não uma etapa do fluxo.</p><label>Número da NF<input value={selected.numero_nf??''} onChange={e=>setSelected({...selected,numero_nf:e.target.value})} onBlur={()=>void updateActivity({numero_nf:selected.numero_nf,aguardando_nf:selected.numero_nf?.trim()?false:selected.aguardando_nf})} placeholder="Informe o número quando disponível"/></label><div className="p2p-file-row">{selected.anexo_nf_path?<><span className="p2p-file-icon">PDF</span><div className="p2p-file-meta"><strong>Nota fiscal anexada</strong><small>{selected.anexo_nf_path.split('/').pop()}</small></div><button onClick={()=>void download(selected.anexo_nf_path!,'nota-fiscal')}>Baixar NF</button></>:<span className="p2p-help">Nenhuma nota fiscal anexada.</span>}<label className="p2p-upload">Anexar NF<input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={e=>void uploadFile('nf',e.target.files?.[0])}/></label></div></div>
          <div className="p2p-section"><h3>Boleto e vencimento</h3><label className="p2p-check"><input type="checkbox" checked={Boolean(selected.possui_boleto)} onChange={e=>void updateActivity({possui_boleto:e.target.checked})}/> Esta compra possui boleto</label><label>Vencimento do boleto<input type="date" value={selected.boleto_vencimento??''} onChange={e=>setSelected({...selected,boleto_vencimento:e.target.value||null})} onBlur={()=>void updateActivity({boleto_vencimento:selected.boleto_vencimento||null})} /></label><p className="p2p-help">Boleto sem vencimento informado ficará destacado para revisão. Priorize o pagamento dentro do prazo para evitar cancelamento da compra.</p></div>
          <div className="p2p-section"><div className="p2p-card-title"><h3>Comprovantes de pagamento</h3><label className="p2p-upload">＋ Anexar comprovante<input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={e=>void uploadFile('pagamento',e.target.files?.[0])}/></label></div>{(selected.comprovantes_pagamento??[]).length===0?<p className="p2p-help">Nenhum comprovante anexado. Cada pagamento parcial pode ter seu próprio arquivo.</p>:<div className="p2p-files">{selected.comprovantes_pagamento.map((p,i)=><div className="p2p-file-row" key={p.path}><span className="p2p-file-icon">DOC</span><div className="p2p-file-meta"><strong>{p.nome||'Comprovante '+(i+1)}</strong><small>{p.enviado_em?new Date(p.enviado_em).toLocaleString('pt-BR'):''}</small></div><button onClick={()=>void download(p.path,p.nome||'comprovante')}>Baixar</button></div>)}</div>}</div>
          <div className="p2p-section">
            <h3>Formalização com o cliente</h3>
            <label>Status da formalização<select value={selected.formalizacao_cliente_status} disabled={saving} onChange={e=>{const value=e.target.value as Formalizacao;void updateActivity({formalizacao_cliente_status:value,formalizacao_cliente_em:['ENVIADA','CONFIRMADA'].includes(value)?selected.formalizacao_cliente_em??new Date().toISOString():null})}}>{Object.entries(formalizacaoLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
            <div className="p2p-form-grid">
              <label>Contato do cliente<input defaultValue={selected.formalizacao_cliente_contato??''} key={selected.id+'-contato-'+(selected.formalizacao_cliente_contato??'')} onBlur={e=>{const value=e.currentTarget.value.trim()||null;if(value!==selected.formalizacao_cliente_contato)void updateActivity({formalizacao_cliente_contato:value})}} placeholder="Nome ou área responsável"/></label>
              <label>Referência de envio<input defaultValue={selected.formalizacao_cliente_referencia??''} key={selected.id+'-ref-'+(selected.formalizacao_cliente_referencia??'')} onBlur={e=>{const value=e.currentTarget.value.trim()||null;if(value!==selected.formalizacao_cliente_referencia)void updateActivity({formalizacao_cliente_referencia:value})}} placeholder="E-mail, protocolo ou referência"/></label>
            </div>
            <label>Observações da formalização<textarea defaultValue={selected.formalizacao_cliente_observacao??''} key={selected.id+'-formalizacao-obs-'+(selected.formalizacao_cliente_observacao??'')} onBlur={e=>{const value=e.currentTarget.value.trim()||null;if(value!==selected.formalizacao_cliente_observacao)void updateActivity({formalizacao_cliente_observacao:value})}} rows={3} placeholder="Registre o que foi comunicado ou combinado com o cliente"/></label>
            {selected.formalizacao_cliente_em&&<p className="p2p-help">Data registrada: {new Date(selected.formalizacao_cliente_em).toLocaleString('pt-BR')}</p>}
            <p className="p2p-help">Registro manual, sem envio de e-mail ou integração externa.</p>
          </div>
          <div className="p2p-section">
            <h3>Lançamento no Sankhya</h3>
            <label>Status do lançamento<select value={selected.sankhya_status} disabled={saving} onChange={e=>{const value=e.target.value as SankhyaStatus;if(value==='LANCADO'&&!selected.sankhya_numero_documento?.trim()){setError('Antes de marcar como lançado, informe e salve o número ou a referência do lançamento no Sankhya.');setNotice('');return}void updateActivity({sankhya_status:value,sankhya_lancado_em:value==='LANCADO'?selected.sankhya_lancado_em??new Date().toISOString():null})}}>{Object.entries(sankhyaLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
            <label>Número ou referência no Sankhya<input defaultValue={selected.sankhya_numero_documento??''} key={selected.id+'-sankhya-doc-'+(selected.sankhya_numero_documento??'')} onBlur={e=>{const value=e.currentTarget.value.trim()||null;if(value!==selected.sankhya_numero_documento)void updateActivity({sankhya_numero_documento:value})}} placeholder="Nº do lançamento, título ou documento"/></label>
            <label>Observações do lançamento<textarea defaultValue={selected.sankhya_observacao??''} key={selected.id+'-sankhya-obs-'+(selected.sankhya_observacao??'')} onBlur={e=>{const value=e.currentTarget.value.trim()||null;if(value!==selected.sankhya_observacao)void updateActivity({sankhya_observacao:value})}} rows={3} placeholder="Informações para conferência ou acompanhamento"/></label>
            {selected.sankhya_lancado_em&&<p className="p2p-help">Data registrada: {new Date(selected.sankhya_lancado_em).toLocaleString('pt-BR')}</p>}
            <p className="p2p-help">O sistema apenas registra o acompanhamento. O lançamento continua sendo feito manualmente no Sankhya.</p>
          </div>
          <div className="p2p-section"><h3>Confirmação financeira</h3><label className="p2p-check"><input type="checkbox" checked={selected.pagamento_provisionado} onChange={e=>void updateActivity({pagamento_provisionado:e.target.checked})}/> Confirmo que o pagamento foi provisionado no Financeiro</label><p className="p2p-help">A conclusão exige NF informada e anexada e pagamento provisionado. O comprovante de pagamento real pode ser anexado quando o pagamento for executado.</p><label className="p2p-check"><input type="checkbox" checked={selected.quitacao_confirmada} onChange={e=>void updateActivity({quitacao_confirmada:e.target.checked})}/> Confirmo que o pagamento total foi efetivamente realizado</label><button className="p2p-primary" disabled={saving||!canComplete||selected.status_fluxo==='CONCLUIDA'} onClick={()=>void updateActivity({status_fluxo:'CONCLUIDA'})}>Concluir atividade</button></div>
          <div className="p2p-section"><h3>Histórico de movimentações</h3>{(selected.historico_fluxo??[]).length===0?<p className="p2p-help">O histórico será preenchido pelo banco.</p>:<ol className="p2p-timeline">{[...selected.historico_fluxo].reverse().map((ev,i)=><li key={i}><span className="p2p-timeline-dot"/><div><strong>{ev.evento==='CRIADA'?'Atividade criada':ev.evento==='FORMALIZACAO_CLIENTE'?'Formalização com cliente: '+(formalizacaoLabels[ev.status_novo as Formalizacao]??ev.status_novo):ev.evento==='SANKHYA'?'Sankhya: '+(sankhyaLabels[ev.status_novo as SankhyaStatus]??ev.status_novo):ev.evento==='REFERENCIAS'?'Referências atualizadas':ev.evento==='AGUARDANDO_NF'?'Marcação Aguardando NF: '+(ev.status_novo==='true'?'ativada':'desativada'):ev.evento==='BOLETO'?'Boleto atualizado':ev.evento==='PAGAMENTO_PROVISIONADO'?'Pagamento provisionado: '+(ev.status_novo==='true'?'sim':'não'):ev.status_novo?statusLabels[ev.status_novo as Status]??ev.status_novo:ev.evento}</strong><small>{new Date(ev.em).toLocaleString('pt-BR')}</small>{ev.status_anterior&&<p>{statusLabels[ev.status_anterior as Status]??ev.status_anterior} → {statusLabels[ev.status_novo as Status]??ev.status_novo}</p>}{ev.detalhe&&<p>{ev.detalhe}</p>}</div></li>)}</ol>}</div>
        </>}</section>
      </div>
      <footer className="p2p-footer">SIGCF P2P · Módulo independente · Sem integração externa</footer>
    </section>
  </main>
}
