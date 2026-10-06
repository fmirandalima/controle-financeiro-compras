export const brl=(v:number)=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
export const pct=(v:number)=>`${v.toFixed(1)}%`
export function parseMoney(v:string){const n=Number(v.replace(/[^0-9,-]/g,'').replace(/\./g,'').replace(',','.'));return Number.isFinite(n)?n:0}
export function parseDateBR(v:string){const [d,m,y]=v.split('/').map(Number);return y?new Date(y,m-1,d):new Date(v)}
