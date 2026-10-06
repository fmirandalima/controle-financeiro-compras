import { useMemo } from 'react'
import type { Perfil } from '../types'
export type ScreenKey='consulta'|'importacao'|'auditoria'|'compras'|'administracao'
export type ScreenAction='view'|'create'|'edit'|'delete'
const allow:Record<string,Partial<Record<ScreenKey,ScreenAction[]>>>= {ADMIN:{consulta:['view'],importacao:['view','create','edit'],auditoria:['view'],compras:['view','create','edit','delete'],administracao:['view','edit']},FATURAMENTO:{consulta:['view'],importacao:['view','create'],compras:['view']},FINANCEIRO:{consulta:['view'],importacao:['view'],auditoria:['view'],compras:['view']},GESTOR:{consulta:['view'],auditoria:['view']},COMPRAS:{consulta:['view'],compras:['view','create','edit']}}
export const NO_PERMISSIONS={can:()=>false}
export function can(profile:Perfil|undefined,screen:ScreenKey,action:ScreenAction){return !!profile&&(profile.is_admin||!!allow[profile.role]?.[screen]?.includes(action))}
export function useScreenPermissions(profile:Perfil|undefined){return useMemo(()=>({can:(screen:ScreenKey,action:ScreenAction)=>can(profile,screen,action)}),[profile])}
