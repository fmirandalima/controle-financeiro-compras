import { supabase } from './supabase'
import type { Perfil } from '../types'

export async function loadProfile(userId: string): Promise<Perfil | null> {
  const { data, error } = await supabase
    .from('perfis')
    .select('id,nome,username,role,is_admin')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data as Perfil | null
}

export async function verificarUsername(username: string) {
  const { data, error } = await supabase.rpc('verificar_username_disponivel', {
    p_username: username.trim().toLowerCase(),
  })
  return { disponivel: data === true, error }
}

export async function signIn(username: string, password: string) {
  const normalized = username.trim().toLowerCase()
  const { data: email, error: lookupError } = await supabase.rpc('obter_email_por_username', {
    p_username: normalized,
  })

  if (lookupError || !email) {
    return { data: { user: null, session: null }, error: lookupError ?? new Error('Usuário ou senha inválidos.') }
  }

  const result = await supabase.auth.signInWithPassword({
    email: String(email),
    password,
  })

  if (!result.error && result.data.user) {
    const { error: logError } = await supabase.rpc('registrar_login')
    if (logError) console.error('Não foi possível registrar o login:', logError.message)
  }

  return result
}

export async function cadastrarUsuario(input: {
  nome: string
  email: string
  username: string
  password: string
  role: 'COMPRAS' | 'FINANCEIRO'
}) {
  const nome = input.nome.trim()
  const email = input.email.trim().toLowerCase()
  const username = input.username.trim().toLowerCase()

  const check = await verificarUsername(username)
  if (check.error) return { data: null, error: check.error }
  if (!check.disponivel) return { data: null, error: new Error('Usuário com nome não disponível') }

  const result = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: {
        nome,
        username,
        role: input.role,
      },
    },
  })

  if (result.error) {
    const msg = result.error.message.toLowerCase()
    if (msg.includes('username') && msg.includes('unique')) {
      return { data: null, error: new Error('Usuário com nome não disponível') }
    }
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
