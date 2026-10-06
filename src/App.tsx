import {useEffect,useState} from 'react'
import {supabase} from './lib/supabase'
import {loadProfile} from './lib/auth'
import type {Perfil} from './types'
import {Login} from './components/Login'
import {AppPage} from './pages/AppPage'
import './styles.css'
function Landing({onLogin}:{onLogin:()=>void}){return <main className="auth-shell"><section className="auth-card landing-card"><div className="brand-mark">CF</div><h1>Controle Financeiro</h1><p className="muted">Conta Simples × Sankhya</p><p>Consulta e conciliação financeira com acesso controlado por perfil.</p><button className="primary" onClick={onLogin}>Fazer consulta</button><p className="tiny">O acesso aos dados financeiros exige autenticação.</p></section></main>}
export default function App(){const[session,setSession]=useState<any>(null);const[profile,setProfile]=useState<Perfil|null>(null);const[loading,setLoading]=useState(true);const[loginOpen,setLoginOpen]=useState(false);useEffect(()=>{supabase.auth.getSession().then(async({data})=>{setSession(data.session);if(data.session)setProfile(await loadProfile(data.session.user.id));setLoading(false)});const{data:listener}=supabase.auth.onAuthStateChange((_event,s)=>{setSession(s);if(!s)setProfile(null)});return()=>listener.subscription.unsubscribe()},[]);useEffect(()=>{if(session&&!profile)loadProfile(session.user.id).then(setProfile).catch(console.error)},[session,profile]);if(loading)return <div className="loading">Carregando...</div>;if(!session||!profile)return loginOpen?<Login onLogged={()=>setLoginOpen(true)} onBack={()=>setLoginOpen(false)}/>:<Landing onLogin={()=>setLoginOpen(true)}/>;return <AppPage profile={profile} onLogout={()=>supabase.auth.signOut()}/>}
