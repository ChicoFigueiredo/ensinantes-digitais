/**
 * O que o painel dispara como processo separado.
 *
 * São processos, e não chamadas em linha, porque o scan mede 231 vídeos com
 * ffprobe e a transcrição ocupa a GPU por horas — segurar isso dentro do
 * handler HTTP travaria o painel justamente enquanto há o que mostrar.
 * Cada tarefa escreve no mesmo SQLite, então o progresso aparece na próxima
 * atualização da tela.
 */
export interface Execucao { nome: string; iniciada: string; linhas: string[]; fim?: number }

export const TAREFAS: Record<string, { rotulo: string; dica: string; cmd: string[] }> = {
  scan: {
    rotulo: "Reescanear o acervo",
    dica: "Relê as pastas. Rápido depois da primeira vez — a duração dos vídeos fica no banco.",
    cmd: ["bun", "run", "src/cli.ts", "scan"],
  },
  transcrever: {
    rotulo: "Transcrever a fila",
    dica: "Roda o Whisper na GPU sobre os vídeos pendentes. 42 h de vídeo levam ~2 h.",
    cmd: ["uv", "run", "python", "-m", "ensinantes.worker"],
  },
  requeue: {
    rotulo: "Reenfileirar os com erro",
    dica: "Devolve para a fila o que falhou na transcrição.",
    cmd: ["bun", "run", "src/cli.ts", "requeue"],
  },
  recortes: {
    rotulo: "Refazer relatório de recortes",
    dica: "Regera relatorios/recortes.md e scripts/apagar-recortes.sh. Não apaga nada.",
    cmd: ["bun", "run", "src/cli.ts", "recortes"],
  },
};

const emCurso = new Map<string, Execucao>();

export function disparar(nome: string): { ok: boolean; msg: string } {
  // `Object.hasOwn`, e não `TAREFAS[nome]`: num objeto literal comum,
  // "constructor", "toString" e "__proto__" vêm da cadeia de protótipo e
  // passariam por um `if (!t)`, chegando ao spawn com `cmd` indefinido.
  if (!Object.hasOwn(TAREFAS, nome)) return { ok: false, msg: `tarefa desconhecida: ${nome}` };
  const t = TAREFAS[nome]!;
  if (emCurso.has(nome)) return { ok: false, msg: `${t.rotulo} já está rodando` };

  const exec: Execucao = { nome, iniciada: new Date().toISOString(), linhas: [] };

  let p;
  try {
    p = Bun.spawn(t.cmd, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  } catch (e) {
    // `Bun.spawn` LANÇA quando o binário não está no PATH — `uv`, por exemplo,
    // se a máquina não tiver o ambiente Python configurado. Só marcar como em
    // curso DEPOIS do spawn dar certo: se marcássemos antes, a tarefa ficaria
    // presa em "rodando" para sempre, porque só `p.exited.then` abaixo limpa
    // `emCurso`, e ele nunca roda quando o spawn nem chega a existir.
    return { ok: false, msg: `não consegui iniciar ${t.rotulo}: ${e}` };
  }
  emCurso.set(nome, exec);

  const consumir = async (fluxo: ReadableStream<Uint8Array>) => {
    for await (const pedaco of fluxo) {
      for (const linha of new TextDecoder().decode(pedaco).split("\n")) {
        if (linha.trim()) exec.linhas.push(linha.slice(0, 200));
      }
      // Uma tarefa de horas produz muita linha; guardar tudo é vazamento lento.
      if (exec.linhas.length > 400) exec.linhas.splice(0, exec.linhas.length - 400);
    }
  };
  consumir(p.stdout);
  consumir(p.stderr);
  p.exited.then((c) => { exec.fim = c; setTimeout(() => emCurso.delete(nome), 60_000); });

  return { ok: true, msg: `${t.rotulo} iniciada` };
}

export function estadoTarefas() {
  return Object.entries(TAREFAS).map(([nome, t]) => ({
    nome, rotulo: t.rotulo, dica: t.dica,
    rodando: emCurso.has(nome) && emCurso.get(nome)!.fim === undefined,
    linhas: emCurso.get(nome)?.linhas.slice(-12) ?? [],
  }));
}
