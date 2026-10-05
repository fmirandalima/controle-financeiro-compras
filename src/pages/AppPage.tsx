import { useEffect,useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Empresa, Perfil } from '../types'
import { PurchasesPage } from '../components/PurchasesPage'

export function AppPage({profile,onLogout}:{profile:Perfil;onLogout:()=>void}){
 const [empresas,setEmpresas]=useState<Empresa[]>([])
 useEffect(()=>{supabase.from('empresas').select('id,nome,cnpj').order('nome').then(({data})=>setEmpresas((data??[]) as Empresa[]))},[])
 return <main className="app-shell">
  <header className="topbar"><div><b>Controle Financeiro</b><span>{profile.nome} · {profile.role}</span></div><button onClick={onLogout}>Sair</button></header>
  <section className="content"><PurchasesPage profile={profile} empresas={empresas}/></section>
 </main>
}