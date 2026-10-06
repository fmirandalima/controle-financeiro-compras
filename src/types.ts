export type Role='ADMIN'|'FATURAMENTO'|'FINANCEIRO'|'GESTOR'|'COMPRAS'
export interface Empresa{id:string;nome:string;cnpj?:string|null;codigo_empresa?:string|null}
export interface Perfil{id:string;nome:string;username:string;role:Role;is_admin?:boolean}
export interface Transacao{id:string;empresa_id?:string|null;descricao?:string|null;valor?:number|null;data?:string|null;created_at?:string}
export interface ImportRow{[key:string]:unknown}
