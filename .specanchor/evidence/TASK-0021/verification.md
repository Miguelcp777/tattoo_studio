# TASK-0021 verification — 2026-09-20

## Scope and review

Implemented natural-language edits from a selected proposal, version history (latest 20
successful jobs during retention), owned parent resolution and one edited source for
master/stencil/mockup. Earlier proposals remain immutable and available after failure.
The provider receives the flat master first and original references, never the body image.
Recorded change instructions may override original artistic treatment, including colors;
physical dimensions and placement stay attached to the parent. This is not pixel-exact
editing or an implementation of the older exact-professional-stencil target.

Code-to-Spec and Spec-to-Code review: contracts, BFF, modal/page, queue and worker match
the four scoped requirements. Full product targets in TASK-0019/0020 remain open.
Pre-existing working-tree changes are retained, not newly attributed to this task.

## Automated verification

- TypeScript: contracts 101, consultation 17, web 18 tests passed. BFF test now exercises
  edits, rejects missing adult consent and proves forged master/brief fields are not forwarded.
- Python contracts: 113 passed, including valid edit and empty/oversized edit fixtures.
- Worker: 272 passed. Integration test covers completed-parent ownership, shared source
  identity, parent revision, master-first input, background reuse, idempotency, invalid
  instructions, owner-isolated history and preserved successful results after edit failure.
- Provider test verifies exact master-first multipart input and requested change, one call.
- TypeScript typecheck, scoped ESLint, worker mypy (9 files) and scoped ruff passed.
- No production deployment, commit, or modification of the user's stored proposal.

## Rendered verification

Opened the actual user's existing proposal through the new history entry. Verified labeled
change field, full-width responsive form, original mockup/stencil previews, clear generation
action and explicit consent controls. Entered then cleared a test instruction without
submitting or asserting the user's age/consent. The form is left ready for the user.
Generation uses the existing phase/elapsed-time indicator and scrolls it into view.

## Live verification

The first isolated public-QA edit was interrupted by a pre-existing health-test isolation bug:
Settings loaded the developer's .env and the test app opened the live SQLite queue, marking
the running job interrupted. Fixed health tests to explicitly disable .env/studio credentials;
both health tests and mypy passed. No successful user proposal was changed. First failure
is retained in live-result.json. One explicit corrective rerun is recorded separately in
live-result-after-isolation-fix.json. No automatic provider retry was introduced.

Corrective live run SUCCEEDED: revision 2, edit provenance present, original still succeeded,
common identity across master/stencil/mockup confirmed in live-result-after-isolation-fix.json.
A transient status GET disconnected; collected the existing completed job with read-only
GETs, without submitting another generation. Visually inspected the edited master: smaller
crest and recognizable retained composition. Fine details can vary; the UI asks users to
review unrequested details too. Local previews are in services/worker/.artifacts/qa-task0021/.

Both directional reviews are ALIGNED for TASK-0021's scoped iteration behavior, not for
the unresolved product-wide fidelity/geometry targets. SDD documentary guard PASS with
--base HEAD and this task's impact-review.json; it does not prove semantic correctness.
