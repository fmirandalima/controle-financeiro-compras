import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Empresa, Perfil } from '../types'
import { PurchasesPage } from '../components/PurchasesPage'
import { CartaoPage } from '../components/CartaoPage'

export function AppPage({ profile, onLogout }: { profile: Perfil; onLogout: () => void }) {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [tab, setTab] = useState<'compras' | 'cartao'>('compras')

  useEffect(() => {
    supabase.from('empresas').select('id,nome,cnpj,codigo_empresa').order('nome')
      .then(({ data }) => setEmpresas((data ?? []) as Empresa[]))
  }, [])

  return <main className="app-shell">
    <header className="topbar"><div><b>Controle Financeiro</b><span>{profile.nome} · {profile.role}</span></div><button onClick={onLogout}>Sair</button></header>
    <nav className="content" style={{ display: 'flex', gap: 8, paddingBottom: 0 }}>
      <button className={tab === 'compras' ? 'primary' : ''} onClick={() => setTab('compras')}>Compras</button>
      {(profile.is_admin || profile.role === 'ADMIN' || profile.role === 'FINANCEIRO') &&
        <button className={tab === 'cartao' ? 'primary' : ''} onClick={() => setTab('cartao')}>Cartão</button>}
    </nav>
    <section className="content">{tab === 'compras'
      ? <PurchasesPage profile={profile} empresas={empresas} />
      : <CartaoPage profile={profile} empresas={empresas} />}</section>
  </main>
}
