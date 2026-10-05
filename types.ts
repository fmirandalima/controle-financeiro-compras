export type Role = 'ADMIN' | 'FATURAMENTO' | 'FINANCEIRO' | 'GESTOR' | 'COMPRAS'

export type Empresa = {
  id: string
  nome: string
  cnpj: string | null
}

export type Perfil = {
  id: string
  nome: string
  username: string
  role: Role
  is_admin: boolean
}

export type Transacao = {
  id: string
  empresa_id: string
  data: string
  movimentacao: string
  descricao: string | null
  valor: number
  meio_pagamento: string | null
  ultimos_digitos_cartao: string | null
  titular_cartao: string | null
  categoria: string | null
  qtd_recibos_notas: number
  valor_nota_fiscal: number | null
  valor_pago_cartao: number | null
  comprovante_conta_simples: boolean
  lancado_sankhya: boolean
  sankhya_ok: boolean
  conferencia_obs: string | null
  fingerprint: string
  created_at: string
  updated_at: string
}

export type ImportRow = {
  empresa_id: string
  data: string
  movimentacao: string
  descricao?: string | null
  valor: number
  meio_pagamento?: string | null
  ultimos_digitos_cartao?: string | null
  titular_cartao?: string | null
  categoria?: string | null
  qtd_recibos_notas?: number
}
