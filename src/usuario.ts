/**
 * Quem está do outro lado, e o que essa pessoa pode.
 *
 * A autenticação é do nginx: o htpasswd tem duas entradas e o site repassa o
 * usuário autenticado em `X-Painel-Usuario`. O app não tem tela de login e não
 * guarda senha — ele só lê o resultado.
 *
 * Sem header, o usuário é `chico`: é o caso do acesso local em 127.0.0.1, onde
 * a máquina já é dele. Mas header PRESENTE e desconhecido cai em `procopio`, o
 * menos privilegiado — porque um header estranho significa configuração errada
 * do nginx, e nesse caso errar para menos poder é a única direção segura.
 */
import type { Database } from "bun:sqlite";

import { USUARIO_PADRAO, USUARIOS, type Usuario } from "./config.ts";
import { outroOnline } from "./db.ts";

export const HEADER_USUARIO = "x-painel-usuario";

const MENOS_PRIVILEGIADO: Usuario = "procopio";

export function quemE(req: Request): Usuario {
  const bruto = req.headers.get(HEADER_USUARIO);
  if (bruto === null) return USUARIO_PADRAO;
  const nome = bruto.trim().toLowerCase();
  return (USUARIOS as readonly string[]).includes(nome) ? (nome as Usuario) : MENOS_PRIVILEGIADO;
}

export interface Permissoes {
  /** Pode disparar processo nesta máquina. */
  admin: boolean;
  /** Vê espaço em disco, bytes e contagem de recortes. */
  verDisco: boolean;
  /** Vê fila de transcrição, eventos e erros. */
  verFila: boolean;
  /** Vê caminho absoluto e o botão de revelar no Explorer. */
  verCaminhos: boolean;
  /** Vê o card de transcrições divergentes. */
  verDivergencias: boolean;
}

export function permissoesDe(usuario: Usuario): Permissoes {
  const dono = usuario === "chico";
  return {
    admin: dono, verDisco: dono, verFila: dono, verCaminhos: dono, verDivergencias: dono,
  };
}

/**
 * Rotas que rodam processo na máquina de casa.
 *
 * Estão em 403 no nginx E conferidas aqui. As duas tranças existem porque
 * fazem coisas diferentes: o nginx protege o acesso remoto, e esta lista
 * protege contra o nginx mal configurado.
 */
export const ROTAS_ADMIN = [
  "/api/run", "/api/requeue", "/api/revelar", "/api/abrir", "/api/limpeza",
] as const;

/** Igualdade exata: `/api/runner` não é `/api/run`. */
export function ehRotaAdmin(rota: string): boolean {
  return (ROTAS_ADMIN as readonly string[]).includes(rota);
}

/**
 * As letrinhas do canto superior direito.
 *
 * O `(p)` acende para o chico quando o procópio está online. O contrário NÃO
 * acontece: o procópio nunca fica sabendo quando o chico está no painel. É
 * assimétrico de propósito.
 */
export function indicadores(db: Database, usuario: Usuario): { eu: "c" | "p"; outro: "p" | null } {
  const eu = usuario === "chico" ? "c" : "p";
  const outro = usuario === "chico" && outroOnline(db, "chico") ? "p" : null;
  return { eu, outro };
}
