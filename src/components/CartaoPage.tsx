import { useEffect, useState } from 'react'
import type { Empresa, Perfil } from '../types'
import { supabase } from '../lib/supabase'

type Props = { profile: Perfil; empresas: Empresa[] }
type IntegrationStatus = { codigo_empresa: string; empresa_id: string | null; status: string; mensagem: string | null; ultima_sincronizacao: string | null }

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
  const [message, setMessage] = useState('')

  async function carregarStatus() {
    const { data, error } = await supabase.from('integracoes_empresa')
      .select('codigo_empresa,empresa_id,status,mensagem,ultima_sincronizacao')
      .eq('integracao', 'CONTA_SIMPLES')
    if (error) {
      setMessage('Não foi possível consultar a configuração do Cartão: ' + error.message)
      return
    }
    const next: Record<string, IntegrationStatus> = {}
    for (const row of (data ?? []) as IntegrationStatus[]) next[row.codigo_empresa] = row
    setStatus(next)
  }

  async function importar(codigo: string) {
    const cfg = status[codigo]
    if (!cfg?.empresa_id || cfg.status !== 'CONECTADO') {
      setMessage('Empresa ' + codigo + ' não está conectada à integração de cartão. Nenhum lançamento foi importado.')
      return
    }
    setMessage('Empresa ' + codigo + ' está conectada, mas o executor seguro de importação ainda não foi publicado. Nenhum lançamento foi importado.')
  }

  useEffect(() => { void carregarStatus() }, [])

  if (!profile.is_admin && !['ADMIN', 'FINANCEIRO'].includes(profile.role))
    return <section className="panel"><div className="error-box">Você não possui permissão para visualizar a tela Cartão.</div></section>

  return <section className="panel">
    <div className="panel-head">
      <div><h2>Cartão — Conta Simples</h2><p className="muted">Extratos separados por empresa. Esta tela é independente de Compras/Mercado Livre.</p></div>
      <button onClick={carregarStatus}>Atualizar status</button>
    </div>
    {message && <div className="notice">{message}</div>}
    <div className="form-grid">
      {alvo.map(item => {
        const s = status[item.codigo]
        return <article className="panel" key={item.codigo}>
          <h3>{item.titulo}</h3>
          <p className="muted">Destino: {empresaLabel(empresas, item.codigo)}</p>
          <p><strong>Status:</strong> {s?.status ?? 'NÃO CONFIGURADO'}</p>
          {s?.ultima_sincronizacao && <p className="tiny">Última sincronização: {new Date(s.ultima_sincronizacao).toLocaleString('pt-BR')}</p>}
          {s?.mensagem && <p className="tiny">{s.mensagem}</p>}
          <button className="primary" onClick={() => importar(item.codigo)}>{item.titulo}</button>
        </article>
      })
      }
    </div>
  </section>
}