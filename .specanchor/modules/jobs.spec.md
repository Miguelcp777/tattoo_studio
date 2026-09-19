---
type: module-spec
module: jobs
status: draft
source_paths:
  - services/worker/jobs/*
last_reviewed: 2026-09-19
---

# Module: jobs

## Responsibility

Own asynchronous execution: enqueue, run, report status, enforce quotas. Every generation in the
system is a job, because every generation takes seconds to minutes.

## Source ownership

`services/worker/jobs/`

## Public interfaces

- `enqueue(kind, payload, user) -> JobRef`
- `status(job_ref) -> JobState` — one of queued, running, succeeded, failed, cancelled
- `cancel(job_ref) -> None`
- Worker registration for each job kind

## Inputs and outputs

Inputs: a validated payload referencing assets by `ImageRef`, never by inline bytes.
Outputs: job state transitions and a result reference on success.

## Domain invariants

- JOBS-INV-001: No image bytes travel through the queue; payloads carry references only.
- JOBS-INV-002: Job execution is idempotent per job id. A redelivered job does not duplicate
  billable generation calls.
- JOBS-INV-003: Per-user quotas are enforced at enqueue time, before any provider cost is
  incurred.
- JOBS-INV-004: A failed job records a typed failure reason that the UI can render without
  exposing provider internals.
- JOBS-INV-005: Jobs referencing a deleted asset fail closed rather than operating on a stale
  reference.

## Data / persistence

A job record per submission: kind, state, timestamps, user, payload reference, result reference,
failure reason, attempt count. Records outlive the assets they reference for audit.

## Dependencies

`contracts`.

## External integrations

Queue backend, undecided (candidates: Redis with RQ, Celery, or a cloud-native queue).

## Error semantics

Transient failures retry with backoff and a cap. Policy rejections and validation failures are
terminal and never retried. Exhausted retries land in a dead-letter state that is visible, not
silent.

## Security and permissions

A job may only be read or cancelled by the user who enqueued it. Payloads carry no secrets.

## Observability

Queue depth, wait time, execution time and failure rate per job kind; retry and dead-letter
counts; quota rejection counts.

## Performance / operational constraints

Queue wait is the dominant component of perceived latency. Job budgets per kind are defined
alongside the backend choice and are currently undefined.

## Tests / verification

Idempotency is tested by redelivering the same job id and asserting a single generation call.
Quota enforcement is tested at the enqueue boundary. Backend-specific behavior is tested against
a real instance, not a mock, in an integration suite.

## Known uncertainties and debt

- Queue backend is undecided.
- Job budgets and timeouts per kind are undefined.
- Whether users may run concurrent jobs, and how many, is undecided.

## Alignment notes

No implementation exists; nothing to align yet.

## Change history

- 2026-09-19: Created during SDD bootstrap.

## Statement evidence
| Statement | Evidence status | Source / revision | Verification result |
|---|---|---|---|
| All generation is asynchronous | INTENT | ADR-0005 | NOT_RUN |
| References, not bytes, in the queue | INTENT | Planning session 2026-09-19 | NOT_RUN |
| Queue backend | UNKNOWN | Undecided | NOT_RUN |
