/**
 * Lightweight Phase source-drift watcher. It NEVER imports engine code.
 * It keeps a single issue open only while relevant Phase sources are ahead.
 * The local pin, not a release number, remains the source of truth.
 */
import { appendFileSync, readFileSync } from 'node:fs';

const apiRoot = 'https://api.github.com';
const issueTitle = 'chore(phase): revisar upstream pendiente';
const sourcePattern = /^crates\/(engine|phase-ast|phase-parser)\//;

type CompareFile = { filename: string; status?: string };
type CompareCommit = { sha: string; commit: { message: string } };
type CompareResponse = {
  status: string;
  ahead_by: number;
  behind_by: number;
  files?: CompareFile[];
  commits?: CompareCommit[];
};
type GitHubIssue = { number: number; title: string; body?: string; pull_request?: object };

export function affectsMesaEngine(path: string): boolean {
  return sourcePattern.test(path) || path === 'Cargo.lock' || path === 'Cargo.toml';
}

function readPin(): string {
  const raw = JSON.parse(readFileSync('docs/PHASE-UPSTREAM-PIN.json', 'utf8')) as { commit?: string };
  if (!raw.commit || !/^[a-f0-9]{40}$/.test(raw.commit)) throw new Error('Invalid Phase pin SHA');
  return raw.commit;
}

async function github<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.body ? { 'Content-Type': 'application/json' } : {})
  };
  const response = await fetch(apiRoot + path, { ...init, headers });
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${path}`);
  return (await response.json()) as T;
}

function markdown(pin: string, compare: CompareResponse): { summary: string; needsReview: boolean } {
  const files = compare.files ?? [];
  const relevant = files.filter((file) => affectsMesaEngine(file.filename));
  const url = `https://github.com/phase-rs/phase/compare/${pin}...main`;
  const commits = (compare.commits ?? []).slice(-8).map((item) =>
    `- [${item.sha.slice(0, 7)}](https://github.com/phase-rs/phase/commit/${item.sha}): ${item.commit.message.split('\n')[0]?.replace(/</g, '&lt;')}`
  );
  const needsReview = relevant.length > 0 || compare.status === 'diverged';
  const summary = [
    '# Phase upstream · revisión automática',
    '',
    `Pin local: [${pin.slice(0, 7)}](https://github.com/phase-rs/phase/commit/${pin})`,
    `Comparación: [Phase main frente a Mesa](${url})`,
    `Diferencia: **${compare.ahead_by} commits adelante / ${compare.behind_by} atrás**, estado \`${compare.status}\`.`,
    `Archivos del motor/parser/AST o Cargo: **${relevant.length}** de ${files.length} listados por GitHub.`,
    '',
    needsReview ? '## Requiere revisión humana, nunca importación automática' : '## Sin cambios relevantes de motor para importar',
    '',
    ...relevant.slice(0, 20).map((item) => `- \`${item.filename.replace(/`/g, '')}\` (${item.status ?? 'modified'})`),
    ...(relevant.length > 20 ? [`- … y ${relevant.length - 20} archivos más.`] : []),
    '',
    '## Últimos commits incluidos en la comparación',
    '',
    ...(commits.length ? commits : ['Sin commits nuevos en la comparación.']),
    '',
    'El listado de archivos de GitHub puede estar limitado por paginación. Inspeccionar siempre el diff completo y ejecutar Rust/WASM, paridad y Chromium antes del merge.',
    ''
  ].join('\n');
  return { summary, needsReview };
}

async function main(): Promise<void> {
  const pin = readPin();
  const compare = await github<CompareResponse>(`/repos/phase-rs/phase/compare/${pin}...main`);
  const { summary, needsReview } = markdown(pin, compare);
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');

  // Only a scheduled/manual workflow with issue-write permission may mutate
  // tracker state. Local audits and forks remain read-only.
  const repository = process.env.GITHUB_REPOSITORY;
  if (!process.env.GITHUB_TOKEN || !repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) return;
  if (!['schedule', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME ?? '')) return;
  const issues = await github<GitHubIssue[]>(`/repos/${repository}/issues?state=open&per_page=100`);
  const existing = issues.find((issue) => !issue.pull_request && issue.title === issueTitle);

  if (needsReview) {
    const body = [
      'Vigilancia semanal de Phase para Mesa. Este issue se actualiza en lugar de abrir duplicados.',
      '',
      summary,
      '**No ejecutar imports ni merges automáticamente.** Un PR nuevo debe actualizar el pin y demostrar procedencia, compatibilidad del puente WASM y pruebas de reglas.'
    ].join('\n');
    if (!existing) {
      await github(`/repos/${repository}/issues`, {
        method: 'POST',
        body: JSON.stringify({ title: issueTitle, body })
      });
    } else if (existing.body !== body) {
      await github(`/repos/${repository}/issues/${existing.number}`, {
        method: 'PATCH',
        body: JSON.stringify({ body })
      });
    }
  } else if (existing) {
    await github(`/repos/${repository}/issues/${existing.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed', state_reason: 'completed' })
    });
  }
}

if (import.meta.main) await main();
