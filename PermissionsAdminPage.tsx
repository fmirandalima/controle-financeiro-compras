import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Perfil } from '../types'

type Grupo = { id: string; nome: string; ativo: boolean }
type Tela = { id: string; chave: string; nome: string; ordem: number; ativo: boolean }
type Permissao = { grupo_id: string; tela_id: string; visualizar: boolean; criar: boolean; editar: boolean; excluir: boolean; importar: boolean }
type Usuario = { id: string; nome: string; username: string; role: string; is_admin: boolean }
type Membro = { grupo_id: string; perfil_id: string }
type Props = { profile: Perfil }

const ACOES = [
  ['visualizar', 'Visualizar'],
  ['criar', 'Criar'],
  ['editar', 'Editar'],
  ['excluir', 'Excluir'],
  ['importar', 'Importar'],
] as const

export function PermissionsAdminPage({ profile }: Props) {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [telas, setTelas] = useState<Tela[]>([])
  const [permissoes, setPermissoes] = useState<Record<string, Permissao>>({})
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [membros, setMembros] = useState<Set<string>>(new Set())
  const [grupoId, setGrupoId] = useState('')
  const [novoGrupo, setNovoGrupo] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)

  const isAdmin = profile.is_admin || profile.role === 'ADMIN'
  const grupoSelecionado = useMemo(() => grupos.find(g => g.id === grupoId), [grupos, grupoId])

  async function load() {
    if (!isAdmin) return
    setBusy(true); setMessage(''); setError(false)
    const [g, t, p, u, m] = await Promise.all([
      supabase.from('app_grupos').select('id,nome,ativo').eq('ativo', true).order('nome'),
      supabase.from('app_telas').select('id,chave,nome,ordem,ativo').eq('ativo', true).order('ordem'),
      supabase.from('app_permissoes_grupo').select('grupo_id,tela_id,visualizar,criar,editar,excluir,importar'),
      supabase.from('perfis').select('id,nome,username,role,is_admin').order('nome'),
      supabase.from('app_grupo_membros').select('grupo_id,perfil_id'),
    ])
    const firstError = g.error || t.error || p.error || u.error || m.error
    if (firstError) {
      setError(true); setMessage(`Não foi possível carregar as permissões: ${firstError.message}`); setBusy(false); return
    }
    setGrupos((g.data ?? []) as Grupo[])
    setTelas((t.data ?? []) as Tela[])
    const map: Record<string, Permissao> = {}
    for (const row of (p.data ?? []) as Permissao[]) map[`${row.grupo_id}:${row.tela_id}`] = row
    setPermissoes(map)
    setUsuarios((u.data ?? []) as Usuario[])
    setMembros(new Set((m.data ?? []).map((row: Membro) => `${row.grupo_id}:${row.perfil_id}`)))
    if (!grupoId && g.data?.[0]) setGrupoId(g.data[0].id)
    setBusy(false)
  }

  useEffect(() => { void load() }, [profile.id, profile.is_admin, profile.role])

  function membro(perfilId: string) {
    return membros.has(`${grupoId}:${perfilId}`)
  }

  async function toggleMembro(perfilId: string, value: boolean) {
    if (!grupoId || !isAdmin) return
    const key = `${grupoId}:${perfilId}`
    const next = new Set(membros)
    if (value) next.add(key); else next.delete(key)
    setMembros(next)

    const result = value
      ? await supabase.from('app_grupo_membros').upsert({ grupo_id: grupoId, perfil_id: perfilId }, { onConflict: 'grupo_id,perfil_id' })
      : await supabase.from('app_grupo_membros').delete().eq('grupo_id', grupoId).eq('perfil_id', perfilId)

    if (result.error) {
      const rollback = new Set(next)
      if (value) rollback.delete(key); else rollback.add(key)
      setMembros(rollback)
      setError(true); setMessage(`Não foi possível alterar o grupo do usuário: ${result.error.message}`)
    } else {
      setError(false); setMessage(`Usuário ${value ? 'adicionado ao' : 'retirado do'} grupo ${grupoSelecionado?.nome ?? ''}.`)
    }
  }

  function current(telaId: string): Permissao {
    return permissoes[`${grupoId}:${telaId}`] ?? {
      grupo_id: grupoId, tela_id: telaId, visualizar: false, criar: false, editar: false, excluir: false, importar: false,
    }
  }

  async function criarGrupo() {
    const nome = novoGrupo.trim().toUpperCase()
    if (!nome || !isAdmin) return
    if (grupos.some(g => g.nome.toUpperCase() === nome)) {
      setError(true); setMessage('Já existe um grupo com esse nome.'); return
    }
    const { data, error: createError } = await supabase.from('app_grupos').insert({ nome }).select('id,nome,ativo').single()
    if (createError) { setError(true); setMessage(`Não foi possível criar o grupo: ${createError.message}`); return }
    setGrupos(prev => [...prev, data as Grupo].sort((a, b) => a.nome.localeCompare(b.nome)))
    setGrupoId(data.id)
    setNovoGrupo('')
    setError(false); setMessage(`Grupo ${nome} criado.`)
  }

  async function setAction(tela: Tela, action: keyof Omit<Permissao, 'grupo_id' | 'tela_id'>, value: boolean) {
    if (!grupoId || !isAdmin) return
    const next = { ...current(tela.id), [action]: value }
    setPermissoes(prev => ({ ...prev, [`${grupoId}:${tela.id}`]: next }))
    const { error: saveError } = await supabase.from('app_permissoes_grupo').upsert(next, { onConflict: 'grupo_id,tela_id' })
    if (saveError) {
      setError(true); setMessage(`Não foi possível salvar a permissão: ${saveError.message}`)
      setPermissoes(prev => ({ ...prev, [`${grupoId}:${tela.id}`]: current(tela.id) }))
    } else {
      setError(false); setMessage(`Permissão atualizada para ${grupoSelecionado?.nome ?? 'grupo'}.`)
    }
  }

  if (!isAdmin) return <section className="panel"><div className="error-box">Acesso restrito à administração.</div></section>

  return <section className="panel">
    <div className="panel-head">
      <div>
        <h2>Permissões por grupo</h2>
        <p className="muted">Defina, por tela, o que cada grupo pode visualizar, criar, editar, excluir e importar.</p>
      </div>
      <button onClick={load} disabled={busy}>{busy ? 'Atualizando...' : 'Atualizar'}</button>
    </div>

    {message && <div className={error ? 'error-box' : 'notice'}>{message}</div>}

    <div className="filters">
      <label>Grupo
        <select value={grupoId} onChange={e => setGrupoId(e.target.value)}>
          {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
        </select>
      </label>
      <label>Novo grupo
        <input value={novoGrupo} onChange={e => setNovoGrupo(e.target.value)} placeholder="Ex.: SUPERVISAO" maxLength={60} />
      </label>
      <button onClick={() => void criarGrupo()} disabled={!novoGrupo.trim()}>Criar grupo</button>
    </div>

    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th>Usuário</th><th>Login</th><th>Perfil</th><th>Administrador</th><th>Membro do grupo</th></tr></thead>
        <tbody>{usuarios.map(usuario => <tr key={usuario.id}>
          <td><b>{usuario.nome}</b></td><td>{usuario.username}</td><td>{usuario.role}</td><td>{usuario.is_admin ? 'Sim' : 'Não'}</td>
          <td><input type="checkbox" checked={membro(usuario.id)} onChange={e => void toggleMembro(usuario.id, e.target.checked)} disabled={usuario.is_admin} /></td>
        </tr>)}</tbody>
      </table>
    </div>

    <h3 className="mt-6">Permissões do grupo: {grupoSelecionado?.nome ?? '—'}</h3>
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th>Tela</th>{ACOES.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{telas.map(tela => {
          const p = current(tela.id)
          return <tr key={tela.id}>
            <td><b>{tela.nome}</b><div className="tiny">{tela.chave}</div></td>
            {ACOES.map(([action, label]) => <td key={action}>
              <input
                type="checkbox"
                aria-label={`${grupoSelecionado?.nome ?? ''} - ${tela.nome} - ${label}`}
                checked={Boolean(p[action])}
                onChange={e => void setAction(tela, action, e.target.checked)}
              />
            </td>)}
          </tr>
        })}</tbody>
      </table>
    </div>
  </section>
}
