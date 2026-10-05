import { supabase } from './supabase'
import { Perfil } from '../types'

export async function loadProfile(userId: string): Promise<Perfil | null> {
  const { data, error } = await supabase
    .from('perfis')
    .select('id,nome,username,role,is_admin')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data as Perfil | null
}

export async function signIn(username: string, password: string) {
  const email = `${username.trim().toLowerCase()}@controle.local`
  const result = await supabase.auth.signInWithPassword({ email, password })

  if (!result.error && result.data.user) {
    const { error: logError } = await supabase.rpc('registrar_login')
    if (logError) console.error('Não foi possível registrar o login:', logError.message)
  }

  return result
}

export async function solicitarAcessoGestor(input: {
  nome: string
  email: string
  username: string
  motivo?: string
}) {
  return supabase.from('solicitacoes_acesso').insert({
    nome: input.nome.trim(),
    email: input.email.trim().toLowerCase(),
    username: input.username.trim().toLowerCase(),
    role: 'GESTOR',
    status: 'PENDENTE',
    motivo: input.motivo?.trim() || null,
  })
}
