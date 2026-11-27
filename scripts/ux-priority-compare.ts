#!/usr/bin/env bun
/**
 * UX-PRIORITY 1.0 evidence gate.
 *
 * Compares three Phase modes on equivalent GameScenario states and validates
 * the captured Worker events and visible decisions. Counts are observations
 * from this run, not a general or statistically significant UX-improvement claim.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';

interface EvidenceMetric {
  scenario: string;
  mode: string;
  engineMode: string;
  engineModeConfirmed: boolean;
  initialPriorityWindowObserved: boolean;
  manuallyExecutedPasses: number;
  gameplayInterventionsExecuted: number;
  acceptedPriorityPasses: number;
  automaticPasses: number;
  windowsOmittedWithoutManualIntervention: number;
  p1PriorityOpportunityPreserved: boolean;
  p1ResponseOffered: boolean | null;
  responseCastAccepted: boolean | null;
  stackEntriesAfterResponse: number | null;
  p1ModeBeforeTemporaryOverride: string | null;
  fullControlNotPersisted: boolean | null;
  privateIdentityHiddenBeforeHandoff: boolean;
  privateIdentityShownAfterHandoff: boolean;
  cancellationAccepted: boolean | null;
  cancellationDuringInFlightAction: boolean | null;
  cancellationActor: number | null;
  cancellationGameIdentityPreserved: boolean | null;
  passRevisionAtAcceptance: number | null;
  cancellationExpectedRevision: number | null;
  cancellationRevisionMatched: boolean | null;
  autoPassSessionCleared: boolean | null;
  controlRecoveredAfterCancellation: boolean | null;
  manualActionAcceptedAfterCancellation: boolean | null;
  screenshot: string;
  observedFrames: number;
}
interface EvidenceFile {
  phasePin: string;
  phaseVersion: string;
  rows: EvidenceMetric[];
}

const expectedPin = 'c551672cd7f262579a6cdcd25db128376b1fd9c7';
const expectedModes = ['Standard', 'SkipLowUseWindows', 'FullControl'];
const path = process.env.MESA_PRIORITY_EVIDENCE_FILE ?? 'evidence/priority/metrics.json';
const output = process.env.MESA_PRIORITY_EVIDENCE_OUT ?? 'evidence/priority';
const evidence = JSON.parse(await readFile(path, 'utf8')) as EvidenceFile;
const failures: string[] = [];
const require = (condition: unknown, message: string) => { if (!condition) failures.push(message); };

require(evidence.phasePin === expectedPin, `se esperaba Phase 0.134.0 (${expectedPin}), recibido ${evidence.phasePin}`);
require(evidence.phaseVersion === '0.134.0', `se esperaba Phase 0.134.0, recibido ${evidence.phaseVersion}`);
require(evidence.rows.length === 7, `se esperaban 7 mediciones (3 modos × 2 escenarios + recuperación), recibidas ${evidence.rows.length}`);

const rowFor = (scenario: string, mode: string): EvidenceMetric | undefined =>
  evidence.rows.find((row) => row.scenario === scenario && row.engineMode === mode);

for (const mode of expectedModes) {
  const low = rowFor('priority-low-use', mode);
  const sequence = rowFor('priority-response-sequence', mode);
  require(!!low, `falta la medición priority-low-use para ${mode}`);
  require(!!sequence, `falta la secuencia priority-response-sequence para ${mode}`);
  if (low) {
    require(low.engineModeConfirmed, `${mode}: Phase no confirmó el modo de la ventana de poco uso`);
    if (mode !== 'SkipLowUseWindows') require(low.initialPriorityWindowObserved, `${mode}: no se observó la prioridad inicial P0`);
    require(low.acceptedPriorityPasses === 1, `${mode}: se esperó un pase Phase aceptado en la ventana de poco uso, se observaron ${low.acceptedPriorityPasses}`);
    require(low.p1PriorityOpportunityPreserved, `${mode}: P1 no conservó su oportunidad legal con Spectral Sailor`);
    require(low.privateIdentityHiddenBeforeHandoff && low.privateIdentityShownAfterHandoff, `${mode}: identidad privada incorrecta antes/después del handoff`);
    if (mode === 'SkipLowUseWindows') {
      require(low.automaticPasses === 1 && low.manuallyExecutedPasses === 0, 'Fluido: se esperaba un pase recomendado aceptado y ninguna intervención manual de pase');
    } else {
      require(low.automaticPasses === 0 && low.manuallyExecutedPasses === 1, `${mode}: se esperaba retener P0 y registrar un pase manual`);
    }
    require(low.windowsOmittedWithoutManualIntervention === low.automaticPasses, `${mode}: las ventanas omitidas no coinciden con los pases automáticos observados`);
  }
  if (sequence) {
    require(sequence.engineModeConfirmed, `${mode}: Phase no confirmó el modo para la secuencia`);
    require(sequence.acceptedPriorityPasses === 1, `${mode}: se esperaba un pase aceptado hasta la oportunidad rival, se observaron ${sequence.acceptedPriorityPasses}`);
    require(sequence.p1PriorityOpportunityPreserved, `${mode}: no se preservó la prioridad del rival`);
    require(sequence.p1ResponseOffered === true, `${mode}: la respuesta real de P1 no estuvo disponible`);
    require(sequence.responseCastAccepted === true, `${mode}: Counterspell no se aceptó mediante Phase`);
    require(sequence.stackEntriesAfterResponse === 2, `${mode}: se esperaban dos hechizos en pila tras la respuesta, se observaron ${sequence.stackEntriesAfterResponse}`);
    require(sequence.p1ModeBeforeTemporaryOverride === 'Standard', `${mode}: P1 heredó una preferencia ajena antes de Control total temporal`);
    require(sequence.fullControlNotPersisted === true, `${mode}: Control total temporal de P1 se persistió`);
    require(sequence.privateIdentityHiddenBeforeHandoff && sequence.privateIdentityShownAfterHandoff, `${mode}: la mano de P1 no respetó el handoff`);
    // Phase auto-selects Counterspell's sole legal target; no separate
    // ChooseTarget action is sent for that unambiguous target. The real actions
    // are two CastSpell requests plus P0's Lightning Bolt target, with Full
    // Control adding its one manual pass before P1 responds.
    const minimumInterventions = mode === 'FullControl' ? 4 : 3;
    require(
      sequence.gameplayInterventionsExecuted >= minimumInterventions,
      `${mode}: faltan acciones reales de lanzamiento/objetivo${mode === 'FullControl' ? '/pase manual' : ''}; mínimo ${minimumInterventions}, observadas ${sequence.gameplayInterventionsExecuted}`
    );
    if (mode === 'FullControl') {
      require(sequence.automaticPasses === 0 && sequence.manuallyExecutedPasses === 1, 'Control completo: se esperaba pase manual, no automático');
    } else {
      require(sequence.automaticPasses === 1 && sequence.manuallyExecutedPasses === 0, `${mode}: el pase sobre el hechizo propio no se produjo automáticamente`);
    }
  }
}
const recovery = rowFor('cancel-and-recover', 'Standard');
require(!!recovery, 'falta la medición de recuperación tras CancelAutoPass');
if (recovery) {
  require(recovery.cancellationAccepted === true, 'CancelAutoPass no fue aceptado por Phase');
  require(recovery.cancellationDuringInFlightAction === true, 'la cancelación no se solicitó mientras la respuesta del pase enviado seguía en vuelo');
  require(recovery.cancellationActor === 0, 'la cancelación encolada no conservó la identidad del asiento solicitante');
  require(recovery.cancellationGameIdentityPreserved === true, 'la cancelación no permaneció en la misma sesión Phase sin reiniciar la partida');
  require(typeof recovery.passRevisionAtAcceptance === 'number', 'falta la revisión publicada por Phase al aceptar el pase');
  require(recovery.cancellationExpectedRevision === recovery.passRevisionAtAcceptance, 'CancelAutoPass no usó la revisión Phase posterior al pase aceptado');
  require(recovery.cancellationRevisionMatched === true, 'la revisión de CancelAutoPass no coincide con la revisión aplicada del pase');
  require(recovery.autoPassSessionCleared === true, 'Phase no retiró la sesión auto_pass del asiento que la solicitó');
  require(recovery.controlRecoveredAfterCancellation === true, 'no volvió a quedar disponible una acción manual de P1');
  require(recovery.manualActionAcceptedAfterCancellation === true, 'la acción manual posterior a cancelar no fue aceptada');
  require(recovery.acceptedPriorityPasses === 1, 'el pase automático que ya estaba en vuelo no se observó exactamente una vez');
  require(recovery.automaticPasses === 1, 'el pase ya enviado no se completó antes de cancelar');
  require(recovery.windowsOmittedWithoutManualIntervention === 1, 'la ejecución no registró exactamente la ventana omitida antes de cancelar');
}

const rows = evidence.rows.map((row) => ({
  ...row,
  // These are descriptive labels for measured observations, not inferred
  // improvements or a model of what every game will do.
  priorityPassesAccepted: row.acceptedPriorityPasses,
  omittedPriorityWindows: row.windowsOmittedWithoutManualIntervention,
  responsesPreserved: row.p1ResponseOffered === true && row.responseCastAccepted === true
    && row.stackEntriesAfterResponse === 2
}));
const summary = {
  phaseVersion: evidence.phaseVersion,
  phasePin: evidence.phasePin,
  measuredRows: evidence.rows.length,
  modes: expectedModes,
  scenarios: ['priority-low-use', 'priority-response-sequence', 'cancel-and-recover'],
  failures
};
await mkdir(output, { recursive: true });
await writeFile(`${output}/comparison.json`, JSON.stringify({ summary, rows }, null, 2));
const tableRows = rows.map((row) =>
  `| ${row.mode} | ${row.scenario} | ${row.gameplayInterventionsExecuted} | ${row.priorityPassesAccepted} | ${row.omittedPriorityWindows} | ${row.responsesPreserved ? 'Sí · Counterspell aceptado; 2 en pila' : row.p1PriorityOpportunityPreserved ? 'Oportunidad legal verificada' : 'No aplica'} | ${row.controlRecoveredAfterCancellation === true ? 'Sí · pase manual aceptado' : 'No aplica'} | ${row.cancellationRevisionMatched === true ? `Sí · revisión ${row.passRevisionAtAcceptance}` : 'No aplica'} | [captura](${row.screenshot}) |`
);
const markdown = [
  '# UX-PRIORITY 1.0 · evidencia comparativa',
  '',
  `- Phase: \`${evidence.phaseVersion}\` · pin \`${evidence.phasePin}\``,
  `- Mediciones: **${evidence.rows.length}** · Standard, Fluido (SkipLowUseWindows), Control completo`,
  '- Los escenarios parten de fixtures GameScenario idénticos por grupo de comparación; las transiciones contadas son respuestas reales de Phase.',
  '',
  '| Modo | Situación | Intervenciones ejecutadas | Pases aceptados | Ventanas omitidas sin pase manual | Respuesta/oportunidad conservada | Recuperación del control | Misma sesión/revisión de cancelación | Captura |',
  '|---|---|---:|---:|---:|---|---|---|---|',
  ...tableRows,
  '',
  'La secuencia representativa lanza Lightning Bolt, conserva la prioridad de P1, ofrece y acepta Counterspell y verifica ambos hechizos en la pila. En la recuperación, el pase ya enviado y aceptado por Phase no se deshace: se verifica que CancelAutoPass conserva la misma sesión Phase, usa la revisión publicada tras aplicar el pase, cancela el asiento solicitante, retira su sesión y permite que P1 complete una acción legal posterior.',
  '',
  'Los números son conteos observados en esta ejecución y estos fixtures. **No constituyen una afirmación de mejora cuantitativa general** ni sustituyen una evaluación con más partidas y participantes.',
  '',
  ...(failures.length ? ['## Incumplimientos del gate', '', ...failures.map((failure) => `- ${failure}`)] : ['**Gate de evidencia: OK** — modos, eventos, oportunidad de respuesta, privacidad y recuperación observados.']),
  ''
].join('\n');
await writeFile(`${output}/COMPARACION.md`, markdown);
console.log(JSON.stringify(summary, null, 2));
console.log(markdown);
console.log(`::notice title=UX-PRIORITY evidence::${JSON.stringify({ rows: evidence.rows.length, modes: expectedModes, failures })}`);
if (failures.length) process.exit(1);
