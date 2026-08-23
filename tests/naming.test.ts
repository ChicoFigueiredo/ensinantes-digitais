import { expect, test } from "bun:test";
import { lerItem, lerLinhaLista, lerModulo, ordenarPorCodigo } from "../src/naming.ts";

test("módulo pontilhado vira título com espaços", () => {
  expect(lerModulo("01.A.Jornada.do.Ensinante.Digital"))
    .toEqual({ codigo: "01", titulo: "A Jornada do Ensinante Digital" });
});

test("módulo que já tem espaço fica literal", () => {
  expect(lerModulo("02-O Que Todo Ensinante Digital Deveria Saber"))
    .toEqual({ codigo: "02", titulo: "O Que Todo Ensinante Digital Deveria Saber" });
});

test("módulo curto e pontilhado também converte", () => {
  expect(lerModulo("00-Lives.de.Leads"))
    .toEqual({ codigo: "00", titulo: "Lives de Leads" });
});

test("módulo bônus mantém o B no código", () => {
  expect(lerModulo("B01-Direitos Autorais Sobre Curso On-line - Dr. Pedro Maia"))
    .toEqual({ codigo: "B01", titulo: "Direitos Autorais Sobre Curso On-line - Dr. Pedro Maia" });
});

test("hífen dentro do título não é confundido com o separador do código", () => {
  expect(lerModulo("B09-A missão do Explicador - Clóvis de Barros").titulo)
    .toBe("A missão do Explicador - Clóvis de Barros");
});

test("pasta sem código nenhum devolve codigo null", () => {
  expect(lerModulo("Repo")).toEqual({ codigo: null, titulo: "Repo" });
});

test("item de vídeo perde a extensão", () => {
  expect(lerItem("01.02-A Ordem do Ensinantes Digitais.mp4"))
    .toEqual({ codigo: "01.02", titulo: "A Ordem do Ensinantes Digitais" });
});

test("a extensão sai ANTES de ponto virar espaço", () => {
  expect(lerItem("01.03-Mapa+do+Curso+On-line+(Completo).xlsx"))
    .toEqual({ codigo: "01.03", titulo: "Mapa do Curso On-line (Completo)" });
});

test("mais vira espaço junto com ponto", () => {
  expect(lerItem("06.08-Dna+de+produto.pdf"))
    .toEqual({ codigo: "06.08", titulo: "Dna de produto" });
});

test("código de três níveis com letra é preservado inteiro", () => {
  expect(lerItem("B01.01.c-Apresentação Direitos autorais.pdf"))
    .toEqual({ codigo: "B01.01.c", titulo: "Apresentação Direitos autorais" });
});

test("código de três níveis com dígito também", () => {
  expect(lerItem("B01.01.0-Direitos Autorais Sobre Curso On-line - Dr. Pedro Maia.mp4").codigo)
    .toBe("B01.01.0");
});

test("nome sem código devolve null e mantém o título inteiro", () => {
  expect(lerItem("Aula 3 - Atraindo Alunos para o Seu Curso On-line.mp4"))
    .toEqual({ codigo: null, titulo: "Aula 3 - Atraindo Alunos para o Seu Curso On-line" });
});

test("aspas tipográficas atravessam intactas", () => {
  expect(lerItem("09.01-Ferramentas Próprias - A Chave Para o “Customer Success”.mp4").titulo)
    .toBe("Ferramentas Próprias - A Chave Para o “Customer Success”");
});

test("linha do lista.txt do curso 2 usa o padrão Módulo NN -", () => {
  expect(lerLinhaLista("Módulo 01 - O SAK(IA)\r"))
    .toEqual({ codigo: "01", titulo: "O SAK(IA)" });
});

test("linha do lista.txt com acento no título", () => {
  expect(lerLinhaLista("Módulo 05 - Pré-Produção\r"))
    .toEqual({ codigo: "05", titulo: "Pré-Produção" });
});

test("linha vazia do lista.txt é descartada", () => {
  expect(lerLinhaLista("   \r")).toBeNull();
});

test("o mais vira espaço mesmo quando o nome já tem espaço", () => {
  // Arquivo real do acervo: o ` (1)` de duplicata introduz um espaço que
  // desligava a conversão inteira, deixando os + no título.
  expect(lerItem("20.02-Mo_dulo+20+I+Aula+02_+E-book+-+10+Ideias+para+Conteu_do+de+Conexa_o (1).pdf"))
    .toEqual({
      codigo: "20.02",
      titulo: "Mo_dulo 20 I Aula 02_ E-book - 10 Ideias para Conteu_do de Conexa_o (1)",
    });
});

test("os sem código vão para o fim, e os numerados antes dos bônus", () => {
  const entrada = [
    { codigo: null, titulo: "Zebra" },
    { codigo: "B01", titulo: "Bônus um" },
    { codigo: "02", titulo: "Dois" },
    { codigo: "01", titulo: "Um" },
    { codigo: "10", titulo: "Dez" },
  ];
  expect(ordenarPorCodigo(entrada).map((x) => x.titulo))
    .toEqual(["Um", "Dois", "Dez", "Bônus um", "Zebra"]);
});

test("ordenação é numérica, não alfabética: 10 vem depois de 2", () => {
  const entrada = [
    { codigo: "01.10", titulo: "dez" },
    { codigo: "01.02", titulo: "dois" },
  ];
  expect(ordenarPorCodigo(entrada).map((x) => x.titulo)).toEqual(["dois", "dez"]);
});

// Dois arquivos reais do acervo perdiam o número: `AJUSTES_V3.0.2.md` virava
// "AJUSTES_V3 0 2" e `Lei.Direitos.Autorais.9.610.pdf` virava "…Autorais 9 610".
// Ponto entre dígitos é número, não separador.
test("ponto entre dígitos sobrevive; os outros continuam virando espaço", () => {
  expect(lerItem("AJUSTES_V3.0.2.md").titulo).toBe("AJUSTES_V3.0.2");
  expect(lerItem("Lei.Direitos.Autorais.9.610.pdf").titulo).toBe("Lei Direitos Autorais 9.610");
  expect(lerItem("Mapa.Completo.md").titulo).toBe("Mapa Completo");
  expect(lerItem("Modulo.3.Aula.4.pdf").titulo).toBe("Modulo 3 Aula 4");
  expect(lerModulo("01.A.Jornada.do.Heroi")).toEqual({ codigo: "01", titulo: "A Jornada do Heroi" });
});
