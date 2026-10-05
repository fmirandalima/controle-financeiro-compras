import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Empresa, PublicTransacao } from '../types'
import { brl } from '../lib/format'
import { Stats } from '../components/Stats'

export function PublicPage({ onLogin }: { onLogin: () => void }) {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [empresa, setEmpresa] = useState('')
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [rows, setRows] = useState<PublicTransacao[]>([])

  async function load() {
    let q = supabase.from('consulta_publica').select('*').order('data', { ascending: false })
    if (empresa) q = q.eq('empresa_id', empresa)
    if (inicio) q = q.gte('data', inicio)
    if (fim) q = q.lte('data', fim)
    const { data } = await q.limit(500)
    setRows((data ?? []) as PublicTransacao[])
  }

  useEffect(() => { supabase.from('empresas').select('*').order('nome').then(({ data }) => setEmpresas(data ?? [])); load() }, [])

  const receipts = rows.filter(r => r.comprovante_conta_simples).length
  const sankhya = rows.filter(r => r.lancado_sankhya).length
  const finance = rows.filter(r => r.sankhya_ok).length

  return <main className="app-shell">
    <header className="topbar"><div><b>Controle Financeiro</b><span>Consulta gerencial</span></div><button onClick={onLogin}>Acesso interno</button></header>
    <section className="content">
      <div className="hero"><div><h1>Conta Simples × Sankhya</h1><p>Acompanhamento de conciliação financeira.</p></div></div>
      <div className="filters">
        <select value={empresa} onChange={e => setEmpresa(e.target.value)}><option value="">Todas as empresas</option>{empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select>
        <input type="date" value={inicio} onChange={e => setInicio(e.target.value)} />
        <input type="date" value={fim} onChange={e => setFim(e.target.value)} />
        <button className="primary" onClick={load}>Consultar</button>
      </div>
      <Stats total={rows.length} receipts={receipts} sankhya={sankhya} finance={finance} />
      <section className="panel"><div className="table-wrap"><table><thead><tr><th>Data</th><th>Movimentação</th><th>Valor</th><th>Categoria</th><th>NF</th><th>Pago cartão</th><th>CS</th><th>Sankhya</th><th>Financeiro</th><th>Obs.</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.id}><td>{r.data.split('-').reverse().join('/')}</td><td><b>{r.movimentacao}</b><small>{r.descricao}</small></td><td>{brl(r.valor)}</td><td>{r.categoria ?? '—'}</td><td>{brl(r.valor_nota_fiscal)}</td><td>{brl(r.valor_pago_cartao)}</td><td>{r.comprovante_conta_simples ? '✓' : '—'}</td><td>{r.lancado_sankhya ? '✓' : '—'}</td><td>{r.sankhya_ok ? '✓' : '—'}</td><td>{r.conferencia_obs ?? '—'}</td></tr>)}</tbody></table></div></section>
    </section>
  </main>
}
