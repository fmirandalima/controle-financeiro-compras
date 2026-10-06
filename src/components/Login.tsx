import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { cadastrarUsuario, signIn, solicitarAcessoGestor, verificarUsername } from '../lib/auth'

export function Login({ onLogged, onBack }: { onLogged: () => void; onBack: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [souGestor, setSouGestor] = useState(false)
  const [modoCadastro, setModoCadastro] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [cadastroUsername, setCadastroUsername] = useState('')
  const [cadastroPassword, setCadastroPassword] = useState('12345')
  const [confirmPassword, setConfirmPassword] = useState('12345')
  const [setor, setSetor] = useState<'COMPRAS' | 'FINANCEIRO'>('COMPRAS')
  const [cadastroOk, setCadastroOk] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [requestSent, setRequestSent] = useState(false)

  const emailLogin = useMemo(() => email.trim().split('@')[0].toLowerCase(), [email])

  function abrirCadastro() {
    setModoCadastro(true)
    setSouGestor(false)
    setError('')
    setCadastroOk(false)
    setNome('')
    setEmail('')
    setCadastroUsername('')
    setCadastroPassword('123456')
    setConfirmPassword('123456')
    setSetor('COMPRAS')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await signIn(username, password)
    if (error) setError('Usuário ou senha inválidos.')
    else onLogged()
    setBusy(false)
  }

  async function submitCadastro(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')

    const normalizedEmail = email.trim().toLowerCase()
    const normalizedUsername = cadastroUsername.trim().toLowerCase()
    const expectedUsername = normalizedEmail.split('@')[0]

    if (!nome.trim()) { setError('Informe o nome.'); setBusy(false); return }
    if (!normalizedEmail || !normalizedEmail.includes('@')) { setError('Informe um e-mail válido.'); setBusy(false); return }
    if (!normalizedUsername) { setError('Informe o login.'); setBusy(false); return }
    if (normalizedUsername !== expectedUsername) { setError('O login deve ser o texto antes do arroba do e-mail.'); setBusy(false); return }
    if (cadastroPassword.length < 6) { setError('A senha deve ter no mínimo 6 caracteres.'); setBusy(false); return }
    if (cadastroPassword !== confirmPassword) { setError('As senhas não conferem.'); setBusy(false); return }

    const check = await verificarUsername(normalizedUsername)
    if (check.error) { setError('Não foi possível validar o usuário.'); setBusy(false); return }
    if (!check.disponivel) { setError('usuario com nome não disponivel'); setBusy(false); return }

    const { data, error } = await cadastrarUsuario({
      nome,
      email: normalizedEmail,
      username: normalizedUsername,
      password: cadastroPassword,
      role: setor,
    })

    if (error) {
      setError(error.message.includes('não disponível') ? 'usuario com nome não disponivel' : error.message)
    } else if (data?.session) {
      onLogged()
    } else {
      setCadastroOk(true)
    }
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

  if (cadastroOk) return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark">CF</div>
        <h1>Cadastro realizado</h1>
        <p className="muted">Usuário <b>{cadastroUsername}</b> cadastrado no setor <b>{setor}</b>.</p>
        <p className="muted">Se a confirmação de e-mail estiver ativada, verifique a caixa de entrada antes do primeiro acesso.</p>
        <button className="primary" onClick={() => { setCadastroOk(false); setModoCadastro(false); setUsername(cadastroUsername) }}>Voltar ao login</button>
      </section>
    </main>
  )

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark">CF</div>
        <h1>Controle Financeiro</h1>
        <p className="muted">Conta Simples × Sankhya</p>

        {!modoCadastro && (
          <label className="checkbox-line">
            <input type="checkbox" checked={souGestor} onChange={e => { setSouGestor(e.target.checked); setError('') }} />
            <span>Sou gestor</span>
          </label>
        )}

        {modoCadastro ? (
          <form onSubmit={submitCadastro}>
            <h3>Novo usuário</h3>
            <label>Nome<input value={nome} onChange={e => setNome(e.target.value)} required /></label>
            <label>E-mail<input type="email" value={email} onChange={e => { setEmail(e.target.value); if (!cadastroUsername || cadastroUsername === emailLogin) setCadastroUsername(e.target.value.split('@')[0].toLowerCase()) }} required /></label>
            <label>Login<input value={cadastroUsername} onChange={e => setCadastroUsername(e.target.value.trim().toLowerCase().replace(/\s/g, ''))} placeholder="texto antes do @" required /></label>
            <p className="tiny">O login deve ser o texto antes do @ do e-mail.</p>
            <label>Senha<input type="password" maxLength={6} value={cadastroPassword} onChange={e => setCadastroPassword(e.target.value)} placeholder="123456" required /></label>
            <label>Confirmar senha<input type="password" maxLength={6} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required /></label>
            <label>Setor<select value={setor} onChange={e => setSetor(e.target.value as 'COMPRAS' | 'FINANCEIRO')}><option value="COMPRAS">Compras</option><option value="FINANCEIRO">Financeiro</option></select></label>
            {error && <div className="error">{error}</div>}
            <button className="primary" disabled={busy}>{busy ? 'Cadastrando...' : 'Cadastrar usuário'}</button>
            <button type="button" className="secondary" onClick={() => { setModoCadastro(false); setError('') }}>Voltar ao login</button>
          </form>
        ) : souGestor ? (
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
            <label>Usuário<input value={username} onChange={e => setUsername(e.target.value)} placeholder="login" required /></label>
            <label>Senha<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••" required /></label>
            {error && <div className="error">{error}</div>}
            <button className="primary" disabled={busy}>{busy ? 'Entrando...' : 'Entrar'}</button>
            <button type="button" className="secondary" onClick={abrirCadastro}>Novo usuário</button>
          </form>
        )}

        {!modoCadastro && <button className="secondary" onClick={onBack}>Voltar</button>}
        <p className="tiny">FATURAMENTO alimenta a base · COMPRAS consulta, lança e edita · FINANCEIRO audita · GESTOR consulta.</p>
      </section>
    </main>
  )
}
