import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Perfil } from '../types'

export type ScreenKey =
  | 'CONSULTA'
  | 'COMPRAS'
  | 'CARTAO'
  | 'IMPORTACAO'
  | 'AUDITORIA'
  | 'ADMINISTRACAO'

export type ScreenAction = 'visualizar' | 'criar' | 'editar' | 'excluir' | 'importar'

export type ScreenPermissions = Record<ScreenAction, boolean>

export const NO_PERMISSIONS: ScreenPermissions = {
  visualizar: false,
  criar: false,
  editar: false,
  excluir: false,
  importar: false,
}

export function useScreenPermissions(profile: Perfil | null | undefined, screen: ScreenKey) {
  const [permissions, setPermissions] = useState<ScreenPermissions>(NO_PERMISSIONS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!profile) {
        setPermissions(NO_PERMISSIONS)
        setLoading(false)
        return
      }

      // ADMIN continua com acesso total; a regra também é aplicada no banco.
      if (profile.is_admin || profile.role === 'ADMIN') {
        setPermissions({ visualizar: true, criar: true, editar: true, excluir: true, importar: true })
        setLoading(false)
        return
      }

      setLoading(true)
      const actions = ['visualizar', 'criar', 'editar', 'excluir', 'importar'] as ScreenAction[]
      const results = await Promise.all(actions.map(async action => {
        const { data, error } = await supabase.rpc('tem_permissao_tela', {
          p_tela: screen,
          p_acao: action,
        })
        return [action, !error && Boolean(data)] as const
      }))

      if (!cancelled) {
        setPermissions(Object.fromEntries(results) as ScreenPermissions)
        setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [profile?.id, profile?.is_admin, profile?.role, screen])

  return { permissions, loading }
}

export function can(permissions: ScreenPermissions, action: ScreenAction) {
  return permissions[action]
}
