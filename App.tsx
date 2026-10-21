import { useEffect, useState } from 'react'
import { supabase } from './src/lib/supabase'
import { loadProfile } from './src/lib/auth'
import type { Perfil } from './types'
import { Login } from './src/components/Login'
import { AppPage } from './src/pages/AppPage'
import P2PPage from './P2PPage'
import './styles.css'

function Landing({ onLogin }: { onLogin: () => void }) {
  return (
    <main className="auth-shell">
      <section className="auth-card landing-card">
        <div className="brand-mark">CF</div>
        <h1>Controle Financeiro</h1>
        <p className="muted">Conta Simples × Sankhya</p>
        <p>Consulta e conciliação financeira com acesso controlado por perfil.</p>
        <button className="primary" onClick={onLogin}>Fazer consulta</button>
        <p className="tiny">O acesso aos dados financeiros exige autenticação.</p>
      </section>
    </main>
  )
}

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [profile, setProfile] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)
  const [loginOpen, setLoginOpen] = useState(false)
  const [p2pMode, setP2pMode] = useState(() => new URLSearchParams(window.location.search).get('module') === 'p2p')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session) setProfile(await loadProfile(data.session.user.id))
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (!session) setProfile(null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session && !profile) loadProfile(session.user.id).then(setProfile).catch(console.error)
  }, [session, profile])

  if (loading) return <div className="loading">Carregando...</div>
  if (!session || !profile) return loginOpen
    ? <Login onLogged={() => setLoginOpen(true)} onBack={() => setLoginOpen(false)} />
    : <Landing onLogin={() => setLoginOpen(true)} />

  if (p2pMode) return <P2PPage onBack={() => { const url = new URL(window.location.href); url.searchParams.delete('module'); window.history.pushState({}, '', url); setP2pMode(false) }} />

  return <div>
    <div style={{display:'flex',justifyContent:'flex-end',padding:'10px 24px',background:'#0a192f'}}>
      <button style={{background:'#f59e0b',color:'#0a192f',fontWeight:700}} onClick={() => { const url = new URL(window.location.href); url.searchParams.set('module','p2p'); window.history.pushState({}, '', url); setP2pMode(true) }}>Abrir SIGCF P2P</button>
    </div>
    <AppPage profile={profile} onLogout={() => supabase.auth.signOut()} />
  </div>
}
