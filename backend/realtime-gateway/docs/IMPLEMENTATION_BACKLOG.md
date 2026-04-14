# Nullxes AI Prototype - Implementation Backlog

## Scope

Backlog for architecture-first prototype delivery:
- Nullxes AI interview runtime
- JobAI interview source integration
- Interview list/table experience
- Candidate/spectator join links and runtime checks
- Avatar question feed/read execution

Security hardening is intentionally deprioritized in this backlog.

## Milestone M1 - Interview Data Foundation

### BL-001 JobAI client adapter
- Build typed client for:
  - `GET /ai-api/interviews`
  - `GET /ai-api/interviews/{id}`
  - `POST /ai-api/interviews/{id}/status`
- **DoD**
  - retry wrapper for transient failures
  - typed response mapping
  - smoke test with real dev credentials

### BL-002 Interview ingest webhook
- Create `POST /webhooks/jobai/interviews` endpoint.
- Accept incoming event/id and fetch full interview object from JobAI.
- **DoD**
  - payload fetched and stored
  - idempotent reprocessing by `jobai_id`
  - logs include correlation id + jobai_id

### BL-003 Interview storage model
- Add persistence (preferred: PostgreSQL) tables:
  - `interviews`
  - `interview_payloads`
  - `interview_sync_events`
- **DoD**
  - raw payload stored 1:1 JSON
  - projection fields populated for table listing
  - migration files and rollback included

## Milestone M2 - Interview Table & View APIs

### BL-004 List API
- Build `GET /interviews` with pagination and filter by status/date.
- **DoD**
  - returns fields required by table
  - stable sorting by `meeting_at`, `created_at`
  - includes `nullxes_status` and `jobai_status`

### BL-005 Detail API
- Build `GET /interviews/:nullxesId` returning:
  - interview details
  - specialty + questions tree
  - greeting/final/vacancy texts
- **DoD**
  - payload shape mirrors source where required
  - response time acceptable on realistic sample size

### BL-006 Front table integration contract
- Freeze response schemas for FE:
  - list row shape
  - details modal shape
- **DoD**
  - shared JSON examples in docs
  - FE stub data generated from API contracts

## Milestone M3 - Candidate/Spectator Entry Links

### BL-007 Candidate link issuance
- `POST /interviews/:nullxesId/links/candidate`
- Generates short-lived signed token and join URL.
- **DoD**
  - includes TTL and interview/role binding
  - old links can be invalidated/regenerated

### BL-008 Spectator link issuance
- `POST /interviews/:nullxesId/links/spectator`
- Returns spectator join URL and UI-open helper URL.
- **DoD**
  - role-specific token semantics
  - audit trail for link generation events

### BL-009 Join endpoint contract
- `GET /join/candidate/:token`
- `GET /join/spectator/:token`
- Resolve token -> interview context -> runtime bootstrap payload.
- **DoD**
  - invalid/expired token handling
  - returns enough data to initialize frontend room state

## Milestone M4 - Avatar Question Runtime

### BL-010 Question tree feed
- Backend exposes ordered questions from `specialty.questions`.
- **DoD**
  - strict ordering by `order`
  - preserved original text and structure

### BL-011 Avatar script bundle
- Build runtime payload:
  - greetingSpeech
  - ordered questions
  - finalSpeech
  - vacancyText
- **DoD**
  - one API call to bootstrap interview script
  - matches stored interview payload

### BL-012 Runtime event persistence
- Persist avatar progress events:
  - current question index
  - question asked/completed
  - transcript delta references
- **DoD**
  - events queryable by interview id
  - timeline export for demo

## Milestone M5 - Candidate/Spectator Video Validation

### BL-013 Media checkpoints API
- Add runtime checkpoints:
  - candidate video connected
  - spectator video connected
  - stream interrupted/recovered
- **DoD**
  - checkpoints visible in interview timeline
  - status badge derivation supported

### BL-014 Live session view model
- API exposes current session participants and stream states.
- **DoD**
  - candidate/spectator role separation
  - near real-time polling compatibility

## Milestone M6 - Documentation & Demo Pack

### BL-015 Technical documentation
- Update docs:
  - component architecture
  - sequence flows
  - API contracts
  - state diagrams
- **DoD**
  - single docs index links all sections
  - runnable curl examples included

### BL-016 Demo scripts
- Prepare step-by-step demo scenarios:
  1. JobAI interview ingest
  2. interview list render
  3. candidate link join
  4. spectator link join
  5. avatar question progression
  6. status sync back to JobAI
- **DoD**
  - each scenario has input, expected output, and rollback notes

### BL-017 Daily summary format
- Add `DAILY_SUMMARY_TEMPLATE.md` with:
  - delivered features
  - blockers
  - next day plan
  - demo-ready status
- **DoD**
  - template used at least once with real run

## Execution Order

1. M1 (foundation)
2. M2 (table APIs)
3. M3 (entry links)
4. M4 (avatar runtime data)
5. M5 (media validation)
6. M6 (docs/demo)

## Suggested Delivery Rhythm

- Day 1-2: M1
- Day 3: M2
- Day 4: M3
- Day 5: M4 + M5 baseline
- Day 6: M6 and end-to-end demo preparation
