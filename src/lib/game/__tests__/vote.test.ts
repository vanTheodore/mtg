import { expect, test } from 'bun:test';
import { voteAction, voteCandidateAction, votePrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 101.4 + CR 701.38a–d (`VoteChoice`): a vote is a **session**, not one
 * question. Every voter casts its ballots in APNAP order, extra votes resolve at
 * the moment the player would vote once (CR 701.38d), and the tally waits for the
 * queue to empty.
 *
 * Two ballot shapes share the prompt and answer differently: named votes send the
 * canonical option word (`ChooseOption`), object-pool votes send the candidate's
 * **index** (`SubmitVoteCandidate`), because two candidates can share a name
 * (CR 701.38b).
 *
 * `actor` decides who may answer: `SubjectActs` is the voter, `Delegated(p)` hands
 * the ballot to another seat (friend-or-foe), so the screen gates on the resolved
 * seat rather than on `player`. A secret vote (`visibility: Secret`) has its
 * running tallies and ballots scrubbed for viewers until the simultaneous reveal.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 5,
    revision: 161,
    actions_applied: 161,
    metrics: {},
    state: {
      turn_number: 16,
      active_player: viewer,
      priority_player: viewer,
      phase: 'PreCombatMain',
      players: [],
      battlefield: [],
      stack: [],
      exile: [],
      objects: {},
      waiting_for: waiting
    },
    derived: {},
    legal: { actions: [], spell_costs: {}, by_object: {} }
  }) as unknown as EngineSnapshot;

const vote = (data: Record<string, unknown> = {}) =>
  withWaiting({
    type: 'VoteChoice',
    data: {
      player: 0,
      remaining_votes: 1,
      options: ['profit', 'security'],
      option_labels: ['Profit', 'Security'],
      remaining_voters: [[1, 1]],
      tallies: [0, 0],
      ballots: [],
      candidate_objects: [],
      controller: 0,
      source_id: 385,
      actor: 'SubjectActs',
      tally_mode: 'PerVote',
      visibility: 'Open',
      chain_root_targets: [],
      ...data
    }
  });

test('a named vote publishes its options, labels and the tally so far', () => {
  const prompt = votePrompt(vote())!;
  expect(prompt.objectPool).toBe(false);
  expect(prompt.entries).toEqual([
    { label: 'Profit', option: 'profit', candidateId: null, tally: 0 },
    { label: 'Security', option: 'security', candidateId: null, tally: 0 }
  ]);
  expect(prompt.remainingVotes).toBe(1);
  expect(prompt.remainingVoters).toEqual([{ player: 1, votes: 1 }]);
  expect(prompt.ballots).toEqual([]);
  expect(prompt.visibility).toBe('open');
  expect(prompt.sourceId).toBe(385);
});

test('an object-pool vote is answered by index and carries the candidate ids', () => {
  const prompt = votePrompt(
    vote({
      options: ['bears', 'lions'],
      option_labels: ['Grizzly Bears', 'Savannah Lions'],
      candidate_objects: [100, 101],
      tallies: [1, 0],
      ballots: [[1, 0]],
      controller: 1,
      remaining_voters: []
    })
  )!;
  expect(prompt.objectPool).toBe(true);
  expect(prompt.entries).toEqual([
    { label: 'Grizzly Bears', option: null, candidateId: 100, tally: 1 },
    { label: 'Savannah Lions', option: null, candidateId: 101, tally: 0 }
  ]);
  expect(prompt.ballots).toEqual([{ player: 1, choice: 0 }]);
  expect(prompt.controller).toBe(1);
});

test('a missing label falls back to the canonical option, never to a made-up name', () => {
  const prompt = votePrompt(vote({ option_labels: [] }))!;
  expect(prompt.entries.map((entry) => entry.label)).toEqual(['profit', 'security']);
});

test('CR 701.38d: the same voter may owe several ballots', () => {
  const prompt = votePrompt(vote({ remaining_votes: 3 }))!;
  expect(prompt.remainingVotes).toBe(3);
  // A payload that omits the count still means one ballot.
  expect(votePrompt(vote({ remaining_votes: undefined }))!.remainingVotes).toBe(1);
  expect(votePrompt(vote({ remaining_votes: 0 }))!.remainingVotes).toBe(1);
});

test('a delegated ballot is answered by another seat, not by the voter', () => {
  const prompt = votePrompt(vote({ player: 1, actor: { Delegated: 0 } }))!;
  // CR 101.4: friend-or-foe — the voter is 1, the answering seat is 0.
  expect(prompt.player).toBe(1);
  expect(prompt.voter).toBe(0);
  expect(prompt.delegated).toBe(true);
  // The voter answering for itself is not a delegation.
  const own = votePrompt(vote({ player: 0, actor: { Delegated: 0 } }))!;
  expect(own.voter).toBe(0);
  expect(own.delegated).toBe(false);
});

test('CR 701.38: a secret vote is marked secret', () => {
  expect(votePrompt(vote({ visibility: 'Secret' }))!.visibility).toBe('secret');
  // Absent or open is the public default.
  expect(votePrompt(vote({ visibility: undefined }))!.visibility).toBe('open');
  expect(votePrompt(vote({ visibility: 'Open' }))!.visibility).toBe('open');
});

test('junk entries are dropped instead of becoming nameless ballots', () => {
  const prompt = votePrompt(
    vote({ ballots: [[1, 0], [null, 1], ['x', 1], [2]], remaining_voters: [[1, 1], [null, 1], 'x'] })
  )!;
  expect(prompt.ballots).toEqual([{ player: 1, choice: 0 }]);
  expect(prompt.remainingVoters).toEqual([{ player: 1, votes: 1 }]);
});

test('tallies past the options are ignored, and a missing tally reads zero', () => {
  const prompt = votePrompt(vote({ tallies: [2] }))!;
  expect(prompt.entries.map((entry) => entry.tally)).toEqual([2, 0]);
});

test('the defaults fall back to the viewer seat', () => {
  const prompt = votePrompt(vote({ player: undefined, controller: undefined, source_id: undefined }))!;
  expect(prompt.player).toBe(0);
  expect(prompt.voter).toBe(0);
  expect(prompt.controller).toBe(0);
  expect(prompt.sourceId).toBe(0);
});

test('the two ballots use the engine actions this session expects', () => {
  // CR 701.38a: the canonical option word, lowercased on the wire.
  expect(voteAction('profit')).toEqual({ type: 'ChooseOption', data: { choice: 'profit' } });
  // CR 701.38b: the candidate index.
  expect(voteCandidateAction(1)).toEqual({ type: 'SubmitVoteCandidate', data: { candidate_index: 1 } });
});

test('another prompt is not this block', () => {
  expect(votePrompt(withWaiting({ type: 'ChooseObjectsSelection', data: {} }))).toBeNull();
  expect(votePrompt(withWaiting({ type: 'CategoryChoice', data: {} }))).toBeNull();
  expect(votePrompt(null)).toBeNull();
});
