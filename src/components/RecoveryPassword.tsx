import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function RecoveryPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('A senha deve ter pelo menos 8 caracteres.'); return }
    if (password !== confirm) { setError('As senhas não conferem.'); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError('Não foi possível atualizar a senha. Solicite um novo link de recuperação e tente novamente.')
    else {
      setDone(true)
      await supabase.auth.signOut()
    }
  }

  return <main className="auth-shell"><section className="auth-card">
    <div className="brand-mark">CF</div>
    <h1>Redefinir senha</h1>
    {done ? <><p className="muted">Senha atualizada. Você já pode entrar com a nova senha.</p><button className="primary" onClick={() => { window.location.href = window.location.origin }}>Voltar ao login</button></> :
    <form onSubmit={submit}>
      <p className="muted">Escolha uma nova senha para sua conta.</p>
      <label>Nova senha<input type="password" autoComplete="new-password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} required /></label>
      <label>Confirmar nova senha<input type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)} required /></label>
      {error && <div className="error">{error}</div>}
      <button className="primary" disabled={busy}>{busy ? 'Salvando...' : 'Salvar nova senha'}</button>
    </form>}
  </section></main>
}
