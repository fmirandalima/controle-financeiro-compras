import { FormEvent, useState } from 'react'
import { signIn, solicitarAcessoGestor } from '../lib/auth'

export function Login({ onLogged, onBack }: { onLogged: () => void; onBack: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [souGestor, setSouGestor] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [motivo, setMotivo] = useState('')
  const [requestSent, setRequestSent] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await signIn(username, password)
    if (error) setError('Usuário ou senha inválidos.')
    else onLogged()
    setBusy(false)
  }

  async function requestAccess(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await solicitarAcessoGestor({ nome, email, username, motivo })
    if (error) setError(error.message)
    else setRequestSent(true)
    setBusy(false)
  }

  if (requestSent) return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark">CF</div>
        <h1>Solicitação enviada</h1>
        <p className="muted">Sua solicitação de acesso como GESTOR foi registrada para análise.</p>
        <button className="primary" onClick={() => { setRequestSent(false); setSouGestor(false) }}>Voltar ao login</button>
      </section>
    </main>
  )

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark">CF</div>
        <h1>Controle Financeiro</h1>
        <p className="muted">Conta Simples × Sankhya</p>

        <label className="checkbox-line">
          <input type="checkbox" checked={souGestor} onChange={e => { setSouGestor(e.target.checked); setError('') }} />
          <span>Sou gestor</span>
        </label>

        {souGestor ? (
          <form onSubmit={requestAccess}>
            <p className="muted">Solicite acesso de consulta. A liberação será analisada pelo administrador.</p>
            <label>Nome<input value={nome} onChange={e => setNome(e.target.value)} required /></label>
            <label>E-mail<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
            <label>Usuário desejado<input value={username} onChange={e => setUsername(e.target.value)} placeholder="ex.: gestor" required /></label>
            <label>Motivo (opcional)<textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} /></label>
            {error && <div className="error">{error}</div>}
            <button className="primary" disabled={busy}>{busy ? 'Enviando...' : 'Solicitar acesso'}</button>
          </form>
        ) : (
          <form onSubmit={submit}>
            <label>Usuário<input value={username} onChange={e => setUsername(e.target.value)} placeholder="compras, faturamento ou financeiro" required /></label>
            <label>Senha<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required /></label>
            {error && <div className="error">{error}</div>}
            <button className="primary" disabled={busy}>{busy ? 'Entrando...' : 'Entrar'}</button>
          </form>
        )}

        <button className="secondary" onClick={onBack}>Voltar</button>
        <p className="tiny">FATURAMENTO alimenta a base · FINANCEIRO audita · GESTOR consulta.</p>
      </section>
    </main>
  )
}
