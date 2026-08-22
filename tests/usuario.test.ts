import { expect, test } from "bun:test";

import { conectar, tocarSessao } from "../src/db.ts";
import { ehRotaAdmin, indicadores, permissoesDe, quemE, ROTAS_ADMIN } from "../src/usuario.ts";

const comHeader = (v?: string) =>
  new Request("http://x/", { headers: v !== undefined ? { "X-Painel-Usuario": v } : {} });

test("sem header o usuário é o chico — é o acesso local", () => {
  expect(quemE(comHeader())).toBe("chico");
});

test("o header do nginx identifica cada um", () => {
  expect(quemE(comHeader("chico"))).toBe("chico");
  expect(quemE(comHeader("procopio"))).toBe("procopio");
});

test("header desconhecido NÃO vira chico — cai no menos privilegiado", () => {
  expect(quemE(comHeader("ninguem"))).toBe("procopio");
  expect(quemE(comHeader("admin"))).toBe("procopio");
  expect(quemE(comHeader(""))).toBe("procopio");
});

test("o chico tem tudo", () => {
  expect(permissoesDe("chico")).toEqual({
    admin: true, verDisco: true, verFila: true, verCaminhos: true, verDivergencias: true,
  });
});

test("o procópio não tem nada além do conteúdo", () => {
  expect(permissoesDe("procopio")).toEqual({
    admin: false, verDisco: false, verFila: false, verCaminhos: false, verDivergencias: false,
  });
});

test("as rotas administrativas são exatamente as cinco da spec", () => {
  expect([...ROTAS_ADMIN].sort()).toEqual(
    ["/api/abrir", "/api/limpeza", "/api/requeue", "/api/revelar", "/api/run"]);
});

test("ehRotaAdmin não é enganado por prefixo nem por query", () => {
  expect(ehRotaAdmin("/api/run")).toBe(true);
  expect(ehRotaAdmin("/api/runner")).toBe(false);
  expect(ehRotaAdmin("/api/sync")).toBe(false);
  expect(ehRotaAdmin("/api/tudo")).toBe(false);
});

test("indicador do chico: (c), e (p) quando o procópio está online", () => {
  const db = conectar(":memory:");
  expect(indicadores(db, "chico")).toEqual({ eu: "c", outro: null });
  tocarSessao(db, "procopio");
  expect(indicadores(db, "chico")).toEqual({ eu: "c", outro: "p" });
});

test("o procópio vê (p) e NUNCA sabe que o chico está online", () => {
  const db = conectar(":memory:");
  tocarSessao(db, "chico");
  expect(indicadores(db, "procopio")).toEqual({ eu: "p", outro: null });
});
