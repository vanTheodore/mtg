/**
 * Mesa 0.6 — the glossary the learner can consult at any moment.
 *
 * Words are introduced progressively by the lesson (each step lists the ones it
 * teaches), but the glossary always lists them all: a beginner who meets a
 * word before the lesson explains it deserves an answer right away.
 */
export interface GlossaryEntry {
  term: string;
  meaning: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  { term: 'jugador', meaning: 'Cada persona que juega una partida. Mesa es un juego para dos.' },
  { term: 'vida', meaning: 'Los puntos que decides perder. Empiezas con 20; si llegas a 0, pierdes.' },
  { term: 'rival', meaning: 'El otro jugador. En esta lección es un maniquí que no hace nada.' },
  { term: 'mano', meaning: 'Las cartas que sostienes y que puedes jugar. Al empezar son siete.' },
  { term: 'campo de batalla', meaning: 'Donde viven tus tierras y tus criaturas mientras la partida sigue.' },
  { term: 'tierra', meaning: 'Tu fuente de poder. Se juega una por turno y genera maná al girarla.' },
  { term: 'girar', meaning: 'Usar una tierra: queda acostada y no sirve hasta tu próximo turno.' },
  { term: 'maná', meaning: 'La energía que pagan los hechizos. Cada tierra genera una cantidad al girarla.' },
  { term: 'reserva de maná', meaning: 'El maná que has generado y todavía no has gastado.' },
  { term: 'hechizo', meaning: 'Una carta que pagas con maná. Se resuelve y después va al cementerio.' },
  { term: 'coste', meaning: 'Cuánto maná pide un hechizo. Savannah Lions cuesta un maná blanco.' },
  { term: 'criatura', meaning: 'Una carta con fuerza y resistencia que se queda en el campo y puede atacar.' },
  { term: 'fuerza', meaning: 'El daño que una criatura hace al atacar. Se escribe antes de la barra.' },
  { term: 'resistencia', meaning: 'El daño que una criatura aguanta. Se escribe después de la barra.' },
  { term: 'turno', meaning: 'La ronda de un jugador. Empieza por enderezar, Robar y termina en la limpieza.' },
  { term: 'fase', meaning: 'Cada tramo del turno: mantenimiento, robo, fase principal, combate y final.' },
  { term: 'prioridad', meaning: 'La oportunidad de actuar. Cuando no quieres hacer nada, pasas y el juego sigue.' },
  { term: 'atacar', meaning: 'Declarar que tu criatura golpea al rival. Si nadie la bloquea, le hace daño de fuerza.' },
  { term: 'bloquear', meaning: 'Poner una criatura delante de la atacante para que no le haga daño al rival.' },
  { term: 'bloqueadora', meaning: 'La criatura que bloquea a otra durante el combate.' },
  { term: 'daño', meaning: 'Lo que una criatura quita: la fuerza al rival, la resistencia al recibir.' }
];

const BY_TERM = new Map(GLOSSARY.map((entry) => [entry.term, entry.meaning]));

export function explain(term: string): string | undefined {
  return BY_TERM.get(term);
}
