import { useEffect, useState } from 'react'
import { supabase } from './src/lib/supabase'
import { loadProfile } from './src/lib/auth'
import type { Perfil } from './src/types'
import { Login } from './src/components/Login'
import { RecoveryPassword } from './src/components/RecoveryPassword'
import P2PPage from './P2PPage'
import './p2p.css'

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [profile, setProfile] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [recoveryMode, setRecoveryMode] = useState(false)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      if (data.session) {
        try { setProfile(await loadProfile(data.session.user.id)) }
        catch (e) { console.error(e); setProfile(null) }
      }
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, current) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
      setSession(current)
      if (!current) setProfile(null)
      else setRefresh(v => v + 1)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!session) { setProfile(null); return }
    let active = true
    loadProfile(session.user.id).then(p => { if (active) setProfile(p) })
      .catch(e => { console.error(e); if (active) setProfile(null) })
    return () => { active = false }
  }, [session?.user?.id, refresh])

  if (recoveryMode) return <RecoveryPassword />
  if (loading) return <div className="loading">Carregando...</div>
  if (!session) return <Login onLogged={() => setRefresh(v => v + 1)} onBack={() => {}} />
  if (!profile) return <main className="auth-shell"><section className="auth-card"><h1>Acesso não autorizado</h1><p>Não foi possível carregar seu perfil. Entre em contato com o administrador.</p><button className="secondary" onClick={() => void supabase.auth.signOut()}>Sair</button></section></main>
  return <P2PPage />
}
