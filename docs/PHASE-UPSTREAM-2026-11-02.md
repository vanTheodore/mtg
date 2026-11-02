# Phase upstream — experimental upgrade (2 Nov 2026)

Old pin: c2fbb7a6634a440c7c6b47e6a87a554cc7382f05 (29 Oct).
Proposed: 0dd35e4a9dfe1dfba697224775d2205d56f7f20d (2 Nov; 105 commits ahead).
Upstream split rules code into phase-engine, phase-ast and phase-parser.
This branch imports ONLY those three crates and their licenses, not the React app or server.
Imported by one-time CI job 41387141493; temporary write-enabled import workflow removed from branch.
No import workflow or push credentials are included in the PR.

Acceptance: pinned provenance, locked Cargo, WASM compile, native parity, 10E Chromium, tutorial 0.6.
If any criterion fails, keep a draft PR; never weaken tests to obtain a green check.
Never deploy. Never push to main from this import.
