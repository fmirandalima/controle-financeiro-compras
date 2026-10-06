import { useEffect, useState } from 'react'
import type { Empresa, Perfil } from '../types'
import { supabase } from '../lib/supabase'

type Props = { profile: Perfil; empresas: Empresa[] }
type IntegrationStatus = { codigo_empresa: string; empresa_id: string | null; status: string; mensagem: string | null; ultima_sincronizacao: string | null }
const targets = [{ codigo: '104', label: 'Importar Extrato Cartão — Empresa 104' }, { codigo: '001', label: 'Importar Extrato Cartão — Empresa 001' }]

export function CartaoPage({ profile, empresas }: Props) {
  const [status, setStatus] = useState<Record<string, IntegrationStatus>>({})
  const [message, setMessage] = useState('')
  async function loadStatus() {
    const { data, error } = await supabase.from('integracoes_empresa').select('codigo_empresa,empresa_id,status,mensagem,ultima_sincronizacao').eq('integracao', 'CONTA_SIMPLES')
    if (error) { setMessage('A configuração de integração ainda não está publicada no banco. Execute a migration 009.'); return }
    const next: Record<string, IntegrationStatus> = {}; for (const row of data ?? []) next[row.codigo_empresa] = row; setStatus(next)
  }
  useEffect(() => { void loadStatus() }, [])
  function empresaNome(codigo: string) { const e = empresas.find(x => x.codigo_empresa === codigo); return e ? e.nome : 'empresa não vinculada' }
  async function importar(codigo: string) {
    const s = status[codigo]
    if (!s?.empresa_id) { setMessage('Empresa ' + codigo + ' ainda não está vinculada à Conta Simples. Nenhum extrato foi importado.'); return }
    if (s.status !== 'CONECTADO') { setMessage('Conta Simples ' + codigo + ': status atual ' + s.status + '. Nenhum extrato foi importado.'); return }
    setMessage('Conta Simples ' + codigo + ' está conectada, mas o executor seguro de importação ainda não está publicado. Nenhum lançamento foi criado.')
  }
  if (!profile.is_admin && profile.role !== 'ADMIN' && profile.role !== 'FINANCEIRO') return <section className="panel"><div className="error-box">Você não possui permissão para visualizar a tela Cartão.</div></section>
  return <section className="panel">
    <div className="panel-head"><div><h2>Cartão — Conta Simples</h2><p className="muted">Extratos separados por empresa. Este fluxo é independente da tela Compras/Mercado Livre.</p></div><button onClick={loadStatus}>Atualizar status</button></div>
    {message && <div className="notice">{message}</div>}
    <div className="form-grid">{targets.map(t => { const s = status[t.codigo]; return <article className="panel" key={t.codigo}><h3>{t.label}</h3><p><strong>Empresa destino:</strong> {empresaNome(t.codigo)}</p><p><strong>Status:</strong> {s?.status ?? 'NÃO CONFIGURADO'}</p>{s?.ultima_sincronizacao && <p className="tiny">Última sincronização: {new Date(s.ultima_sincronizacao).toLocaleString('pt-BR')}</p>}{s?.mensagem && <p className="tiny">{s.mensagem}</p>}<button className="primary" onClick={() => importar(t.codigo)}>{t.label}</button></article>})}</div>
  </section>
}