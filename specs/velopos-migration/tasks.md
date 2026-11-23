-- Active: 1795089294509@@127.0.0.1@15432

# VELOPOS migration task plan

Status: LOCAL EXECUTION AUTHORIZED 2026-11-22; specification reconciled; application implementation and acceptance pending.
Date: 2026-11-19 (Asia/Bangkok)
Baseline: [approved register](approved-requirements.md), VELOPOS-SCOPE-BASELINE-001.
Read [requirements.md](requirements.md) for exact statements/evidence/B01-B16 and
[design.md](design.md) for D01-D16 before selecting a task.

## Current execution checkpoint - 2026-11-22

The user requested autonomous execution of this migration through goal mode and
explicitly authorized scoped specialists and independent reviewers. This request
supersedes the earlier spec-only execution limit for reversible local work.
Existing review, secret, target-safety and external-action controls still apply.
No commit, push, deployment or primary/retained database operation is authorized.

- [x] Reconfirm HEAD 99afebaa8b2f1287ed61035339f5cf55b0dbfab0 and preserve the
      three pre-existing modified specification files. The older handoff describes
      another branch and is historical, not current authorization or test evidence.
- [x] Recheck all 92 IDs, exact nonempty approved statements/verification intents,
      scope selections and unchanged approved-source SHA-256. The corrected inline
      parser also rejects deliberate first-character and choice mutations.
- [x] Run `node scripts/check-contracts.mjs`: PASS, 18 modules / 115 routes.
      Run `git diff --check`: PASS. These are static checks, not runtime acceptance.
- [x] Record B12 selection: Google plus Email/Password, TOTP MFA and single-use
      recovery codes. Detailed authority/reauthentication/recovery implementation
      and acceptance remain T1.3/T6.4 obligations.
- [x] Selected first slice: organization-native Pickup configuration during
      editable setup (VLP-032; bounded T1.2/T1.3/T2/T3.1 work). Architectural
      assessment found additive storage and presence-aware input are required.
- [x] Define the scoped API/storage contract; add migration 40 after version 39
      without modifying applied migrations. Omitted Pickup preserves configuration
      and legacy command fingerprints; supplied Pickup is unsupported on explicit
      legacy branch setup. Existing profiles start with this new opt-in flag false.
- [x] Follow TDD for independent modes, Pickup-only readiness/completion, old
      client omission, replay/conflicts, authorization/isolation and completed-setup
      refusal. Keep restaurant publication, payment, queue and public checkout closed
      under their existing predicates; this slice does not implement runtime pause.
- [x] Verify fresh and retained-schema upgrades, populated downgrade refusal and
      forward recovery on a uniquely owned disposable database. WSL discovery needed
      the supported native escalation; no permissions or global config were changed.
- [x] Run current focused/affected checks and obtain independent scoped review.
      Preserve all remaining 92-item acceptance work and unresolved B02-B16 inputs.

Recovery: keep legacy data/callers and immutable command results; refuse a
downgrade that loses enabled Pickup configuration. No cutover is part of this
slice. Full migration completion requires every applicable task/review gate.

### Pickup slice evidence - 2026-11-22

Local setup API/storage slice accepted; VLP-032 and its parent tasks remain
incomplete because UI and runtime availability are separate work.

- Production delta: optional presence-aware `ServiceModes.Pickup`, organization
  profile reads/writes, migration 40 and exact schema readiness 40; OpenAPI and
  actual setup-client types preserve optionality and historical omission.
- RED/GREEN: Pickup-only initially failed; explicit JSON null initially passed
  incorrectly; new DB projection initially returned nil. Focused tests now pass.
  Tests retain absent-field command bytes and explicit false/true distinction.
- Database acceptance: task-owned internal-network/tmpfs PostgreSQL 17.6 with
  runtime role; `check-db.mjs full` PASS, including legacy queue/payment/hold and
  closed-draft checks. Four concurrent Pickup commands produce one command and
  one corresponding audit; conflicts, validation rollback, completed refusal,
  foreign access, revoked verification and demoted-Owner replay are covered.
- `check-db.mjs retained` PASS using the preserved schema39 baseline binary and
  synthetic retained rows. Row counts/content hashes and command snapshots are
  unchanged; Pickup defaults false. No retained development/primary DB was used.
- Empty downgrade/reapply PASS. Independent review found a FORCE RLS downgrade
  data-loss path for an owner without BYPASSRLS. Reproduced RED; transaction-local
  `row_security=off` fixed it. `check-db.mjs rls-green` PASS with real restricted
  owner and administrator, incomplete enabled profile and data retention checks.
  Durable recovery regression is integrated into `scripts/check-single-store.mjs`
  through `scripts/pickup-recovery-check.mjs`; actual helper executed in the
  isolated WSL adapter. The stock host runner itself was not replayed.
- Current checks: `go test ./... -count=1`, `go vet ./...`, changed-Go `gofmt -l`,
  workspace `vitest run` (90 files/759 tests), `tsc -b --pretty false`, focused
  ESLint, contracts (18 modules/115 routes), scoped Prettier and diff whitespace
  PASS. Ordinary Go tests skip explicit DB suites; separate DB evidence above
  provides acceptance. Browser/device and race-detector acceptance not run;
  no visual/UI change or mobile-readiness claim is made.
- Corrected attempts retained: Go cache sandbox denial resolved through supported
  escalation with GOPROXY off; wrong-root Vitest run lacked workspace jsdom and
  failed, corrected workspace run passed. Dev-stack's POSIX harness failed on
  default user temp permissions; process-only TMP/TEMP under task-owned project
  scratch made all 7 checks PASS. Log-format checks passed 10/10. No global
  setting, permission or test expectation was changed to obtain these passes.
- Independent reviewer `pickup_independent_review` received scoped source and
  matching evidence, used no shell/network/writes/delegation, identified P1 and
  re-reviewed its fix with no remaining concrete findings. Its pending dev-stack
  evidence gap is resolved by the fresh 7/7 run above. Selection source verified
  from current Main turn context: `titunnn_codex` / high; no provider change.
  Upstream identity, per-agent token usage and monetary cost remain unknown.
- Artifacts: `.local/velopos-pickup-20261122` contains baseline/red/green/full,
  retained and RLS logs plus the scoped disposable runner. All owned containers
  and networks were removed after full-ID and label checks. Migration files1-39
  and approved register remain unchanged; no commit/push/deployment occurred.
- Next: B02 public-document shortlist is recorded in D07; provider remains open.
  Continue dependency-ready setup/identity contracts, then UI/runtime slices;
  do not interpret this bounded result as full migration acceptance.

### Identity slice in progress - 2026-11-22

- [/] T1.3 preparation: inspect password/Google/session/reset and organization
  authority. Security specialist assessed the supplied current contracts;
  separate primary authentication, MFA assurance and current tenant authority.
- [x] Implement test-first internal TOTP verification, factor-secret encryption
      bound to user/factor identity and recovery-code verifiers. This is a bounded
      cryptographic component, not integrated mandatory MFA or a recovery API.
- [x] Check published TOTP vectors, malformed/expired/replayed codes, encryption
      tampering and cross-user/factor substitution; run affected Go checks and
      independent scoped review. Crypto component changed no schema/data/secret
      configuration. Final Go suite, vet and formatting PASS; separate reviewer
      found no remaining concrete defect. Canonical-code test refinement was
      verified RED by removing its guard, exact source restored, suite GREEN.
- [x] User approved B12 five-minute fresh password/Google plus TOTP for sensitive
      actions; recovery code plus primary login for TOTP replacement with prior
      sessions revoked. Email reset does not remove MFA. Manual recovery stays
      restricted pending Admin evidence rules.
- [x] User selected audited server-side management command for platform Admin
      provisioning using a verified user ID; no actual grant is authorized here.
- [?] Manual recovery evidence remains undefined; do not enable unsupported
  privileged recovery. Admin provisioning command has separate local acceptance below.

Next bounded persistence slice (Large/High):

- [x] Add migration 41 for durable encrypted factors/recovery verifiers and
      session assurance, preserving all existing rows. Add internal enrollment,
      confirmation and challenge service, using user-then-session/factor locks.
      Verified primary authentication within five minutes is required to begin
      enrollment; activation consumes the proof step and creates hashed codes
      atomically. No public endpoint, authority cutover or recovery bypass.
- [x] TDD on fresh isolated PostgreSQL: valid/invalid/expired enrollment, concurrent
      challenge replay, cross-user/session denial, revoked/unverified user, audit
      rollback, password reset retaining factor and upgrade/recovery refusal.
- [x] Required Go/static checks and independent scoped persistence review PASS.
      MFA runtime/API and mandatory Owner/Admin enforcement remain pending.

Dependencies: approved B12, existing password/Google session issuance and crypto
component. Key supplied explicitly to service constructor; no real key generated
or environment modified. Recovery: refuse downgrade after any factor exists;
retain encrypted data and use compatible forward build. No retained DB operation.

Crypto component acceptance: tested cryptographic behavior, fail-closed errors,
no secrets in errors/logs and independent review. Production login/session and
permission behavior is unchanged. Persistence acceptance is the separate slice
above; migration 41 has run only on disposable test targets. No runtime cutover.

Next API preparation (Large/High):

- [x] Bind pending enrollment to its initiating primary-authenticated session
      before exposing HTTP enrollment. Add a new migration after 41; retained
      pending factors without a binding cannot activate and may be restarted.
      Test same-user cross-session denial, supersession, expiry after locks,
      retained upgrade and downgrade refusal before independent review.
- [x] Add server-only paired encryption-key configuration with safe startup
      validation and no generated fallback or environment mutation.
- [x] Expose authenticated status/enrollment/confirmation/challenge contracts,
      preserving Origin/CSRF, durable limits, no-store and secret redaction.
      Replayed confirmation must never redisclose recovery codes.
- [x] Add matching client/contract/HTTP checks and independent scoped review.

Dependencies: accepted internal persistence, approved B12 and existing sessions.
Recovery: retain bound factor history and use a compatible forward build; no
permission cutover, factor replacement, real secret or live migration is included.

API slice acceptance, 2026-11-22 (schema42; T1.3 remains incomplete):

- Four authenticated MFA endpoints and matching validated client/OpenAPI contracts
  are implemented with strict JSON, Origin/CSRF, no-store and durable limits.
  Partial/invalid encryption configuration fails startup; absent configuration
  leaves MFA unavailable. No real encryption key or environment value was created.
- Independent review reproduced stale enrollment eligibility after a factor-lock
  wait. Two actual PostgreSQL regressions were RED before the correction and
  GREEN after post-factor-lock primary/session checks. Denial returns no secret
  and preserves exact factor/audit state. Earlier session-lock and Logout
  concurrency regressions remain GREEN. The same reviewer re-reviewed supplied
  changed source and matching evidence with no remaining concrete findings;
  no reviewer tools, shell, network, writes or delegation were used.
- Isolated PostgreSQL MFA/HTTP/negative cases and audit-failure fixtures PASS.
  Synthetic retained40-to42 and retained41-to42 upgrades preserve exact counts
  and content digests, including active encrypted factors and assurance. Empty
  down/reapply PASS; bound-factor downgrade refuses without state changes.
  Existing Logout/Reset revoke sessions rather than deleting them; runtime has
  no session DELETE grant. Retention/deletion policy remains separate work.
- Final offline `go test ./... -count=1` and `go vet ./...` PASS. Root `npm test`
  PASS: 91 web files/762 tests, contracts18/115, logs10 and dev-stack7. The prior
  API-inventory assertion failed until all four new routes were listed explicitly;
  that failed log is retained. Current schema42 existing storefront regression
  also PASS; ordinary Go tests do not replace this isolated database evidence.
- Artifacts: `.local/velopos-identity-20261122/green-1795341598915.log`,
  `api-boundary-root-tests.log`, `api-boundary-storefront.log`; prior failed runs
  retained. Task-owned tmpfs container and internal network cleanup PASS.
  Browser/device and race detector not run; no UI changed or visual claim made.
- Next: audited server-side Admin provisioning command, mandatory authority gates,
  fresh sensitive-action grants and restricted recovery remain implementation
  work. This acceptance is limited to the enrollment/challenge API boundary.

Next Admin provisioning slice (Large/High):

- [x] Add durable platform authority and append-only operation audit after schema42.
      Runtime can read authority but cannot grant, revoke or write authority audit.
      Do not create an operator role, credentials or an actual Admin grant.
- [x] Implement an explicit server command with dedicated connection configuration,
      verified target UUID, operator assertion/reason and operation UUID. Require active,
      verified, MFA-enabled target for grant; allow revocation of ineligible accounts.
      Actual transitions revoke sessions and commit with audit. Matching retries return
      history and cannot reinstate a later-revoked grant; conflicting reuse fails.
- [x] TDD and isolated PostgreSQL permission/negative/concurrency/rollback tests,
      retained upgrade and downgrade refusal; final Go checks and independent review.

Dependencies: accepted MFA API/storage and approved server-command provisioning.
Security specialist assessed the supplied boundary and required privilege checks,
database-principal attribution and audited no-ops. Authority enforcement and
manual recovery remain downstream. Recovery retains authority/audit history in
a compatible forward build; no real operator connection or grant is used.

Admin provisioning acceptance, 2026-11-22 (schema43; T1.3 remains incomplete):

- Migration43 creates empty durable authority and immutable operation audit,
  with no inferred Admin or runtime mutation/audit privileges. Dedicated command
  configuration has no runtime connection fallback; argument validation does not
  read configuration or connect. Real operator provisioning and grants remain
  separately authorized operational actions. See docs/security/platform-admin-command.md.
- Actual transitions revoke sessions with authority/audit in one transaction;
  no-ops retain grant timestamps and newer sessions. Identical operation retries
  return history without undoing later revocation; changed requests conflict.
- Current isolated PostgreSQL suite PASS:12 Admin subtests including denied runtime,
  invalid grants, immutable audit, NULL revocation timestamp refusal, no-op/retry,
  rollback on audit failure, concurrent duplicate requests and concurrent factor
  revocation. Schema40/41-to43 synthetic upgrades preserve exact row counts and
  content digests. Populated downgrade refuses without changing authority/audit.
- Independent review found an ADMIN-option escalation missed by SET-only checks.
  Two real runtime regressions reproduced direct and intermediate-role escalation
  and failed RED. Checking all direct/indirect memberships made both GREEN,
  including deliberately conservative denial of privileged dormant memberships.
  The same independent reviewer inspected the supplied correction and evidence
  with no remaining concrete findings, using no tools/shell/network/writes/delegation.
- Matching final offline `go test ./... -count=1` PASS (CLI0.206s, identity1.427s),
  `go vet ./...`, scoped `gofmt -l` and `git diff --check` PASS. Existing full
  schema43 storefront regression also PASS in this slice. Latest full root npm
  PASS is the preceding MFA API slice; no web source changed in this Admin slice.
  Ordinary Go tests explicitly disable DB suites; isolated evidence is separate.
- Artifacts: `.local/velopos-identity-20261122/green-1795345654142.log` (GREEN),
  `green-1795345583947.log` (expected regression RED),
  `admin-authority-storefront.log`. Exact labelled tmpfs container/internal network
  cleanup PASS. No real Admin grant/operator credential/primary database touched.
  Browser/device and race detector not run; no interface or visual claim is made.
- Separate unresolved risk: tracked legacy `apps/api/cmd/fix_encoding/main.go`
  contains a credential-bearing fallback. User notified without disclosing it;
  rotation/revocation is required through separately authorized operations. The
  unrelated helper was not run or changed, and no credential value was reused.
- Next: MFA enrollment/challenge interface, current session/authority enforcement,
  five-minute sensitive-action proof and restricted recovery. Full migration and
  T1.3 remain open; this acceptance covers only audited Admin provisioning.

Next MFA interface slice (Large/High):

- [x] Implement authenticated, verified account security outside organization
      context, using existing enrollment/challenge APIs and bilingual account shell.
      Keep secrets only in session-scoped component memory; retain one-time codes
      until explicit acknowledgement and guard accidental navigation.
- [x] TDD duplicate submissions, invalid proof, uncertain outcomes, status retry,
      session changes/stale responses and recovery-code acknowledgement.
- [x] Verify current web tests/types/lint/build/contracts and rendered desktop,
      tablet/mobile, enlarged text, keyboard and error/recovery states.
- [x] Independent scoped review and matching evidence before accepting this slice.

Dependencies: accepted MFA API and security assessment; no new provider flow,
database change or authority cutover. Aborted mutations may have committed:
recheck server status before offering another mutation. Reauthentication returns
through sign-in and the account security menu; no deliberate Google freshness
claim. Recovery removes only this interface; retain server factors/audit and use
the compatible build. Mandatory MFA, code regeneration and recovery stay pending.

MFA interface acceptance, 2026-11-22 (T1.3 remains incomplete):

- `/security` and Account security navigation use the existing bilingual account
  shell outside organization context. Existing authenticated/verified guards apply.
  No new provider, query cache, secret storage or authority grant is introduced.
- Enrollment/challenge use the accepted API. Literal six-digit proof, duplicate
  submission prevention, session-scoped memory, abort/stale-response handling and
  no raw server errors are covered. Unknown mutation results require a status
  check; lost confirmation warns that recovery codes cannot be redisclosed.
- Independent review found missing pending-confirmation navigation protection and
  misleading recovery-use copy. Three regressions failed RED; all13 component
  tests passed after correction. Navigation/unload protection now covers pending
  confirmation and displayed codes; explicit departure warns of possible committed
  activation/code loss. Rejected confirmation resets the warning. Both languages
  state recovery use is unavailable. Same reviewer re-reviewed the supplied delta
  and evidence with no remaining concrete findings; no reviewer tools were used.
- Current root `npm test` PASS:93 web files/776 tests, contracts18/116, logs10,
  dev-stack7. `npm run build` including TypeScript PASS; root `npm run lint`
  PASS with0 errors/12 warnings. Bundle size warning remains. Focused formatting
  and diff checks PASS after correcting the tracker formatting.
- Current intercepted-API Chromium browser suite PASS7/7, Windows Chromium
  156.0.8078.4:360/390 touch emulation,768 tablet and1280 desktop, Thai/English,
  keyboard/focus, leading-zero proof, code retention/acknowledgement,200% text,
  pending confirmation, dependency failure and lost-success status recovery.
  Screenshots inspected across mobile/tablet/desktop and warning/error states;
  no clipping or horizontal overflow found. An offscreen fixed skip-link capture
  artifact was resolved by scrolling to top for the pending/code captures.
  Real devices, other engines and live API/provider/DB browser acceptance NOT RUN.
- Evidence: `.local/velopos-identity-20261122/mfa-pending-red.log`,
  `mfa-ui-root-tests-reviewed.log`, `mfa-ui-build-reviewed.log`,
  `mfa-ui-lint-reviewed.log`, `mfa-ui-browser-accepted.log` and
  `mfa-ui-results-accepted/`. Prior failures and runs retained. No actual key,
  Admin grant, database, deployment or commit changed in this interface slice.

Next live-session/MFA gate core (Large/High):

- [x] Add private server session identity from `Current`, preserving public session
      projection. Acquire live verified user, matching session and factor locks
      before organization/business locks; never trust caller-supplied assurance.
- [x] Return transaction-bound eligibility rechecking after later blocking locks
      and before protected effects/final commit. Validate proof chronology and
      absolute session expiry using current database time, retaining active factors
      beyond their enrollment expiry. No Admin authority is inferred.
- [x] TDD and actual runtime-role isolated PostgreSQL positive/negative, stale,
      lock-wait, revocation and rollback cases; unchanged state on denial.
- [x] Final Go/static checks and independent scoped review before accepting core.

Security specialist assessed the supplied design: user NO KEY UPDATE then session
and factor SHARE locks preserve existing Logout FK compatibility. Lock protection
does not stop time; eligibility is guaranteed at the final check, not physical
commit time. The core grants no organization permission and is not yet mandatory
MFA coverage. Follow-up must wire all actual entry paths and first-restaurant
creation before claiming enforcement. Recovery is a compatible forward build;
no new schema, real key, account grant or primary database operation is included.

Gate core acceptance, 2026-11-22 (bounded foundation; enforcement remains open):

- `Current` now carries an internal, non-serialized session ID. `RequireMFA`
  binds the actor/session/factor and rechecks live account, expiry and proof
  chronology in the original transaction using fresh database time. It grants
  neither organization permissions, Admin authority nor sensitive-action grants.
- Actual isolated PostgreSQL17.6 runtime-role suite PASS27 subtests, including
  missing/foreign context, stale state, unchanged-state denial, historic active
  factor, initial session/factor waits and expiry after a later business wait.
  Real Logout, Reset and synthetic isolated Admin transitions serialize without
  deadlock. No actual account or Admin authority was provisioned.
- Final offline Go suite, vet, scoped formatting and whitespace checks PASS.
  Independent reviewer inspected supplied core/source/contracts and matching
  evidence with no concrete findings; no reviewer tools or delegation were used.
  This records the matching run from the preceding execution checkpoint; it is
  not a new test run after resuming context. Race detector was not run.
- Evidence: `.local/velopos-identity-20261122/mfa-gate-complete-console.log`,
  `mfa-gate-go-tests.log` and retained RED/failure logs. Task-owned tmpfs database
  and internal network cleanup passed full-ID/label checks. Consumer integration
  must acquire before business locks and recheck after waits and before commit;
  no production business consumer is wired by this core acceptance.

Next Owner creation/Context integration (Large/High):

- [x] Require middleware-bound live MFA for both creation methods and Context;
      preserve current tenant/membership checks and verification-denial behavior.
      Acquire before advisory/organization locks; recheck after waits and before
      commit or returning private Context. Keep creation keys across unknown outcomes.
- [x] Exercise real login/enrollment middleware fixtures, positive/negative and
      cross-tenant cases, idempotent replay, lock expiry and atomic rollback on a
      task-owned runtime-role database. Extend existing storefront regression
      fixtures without adding a caller-controlled authority bypass.
- [x] Match HTTP/client/OpenAPI errors and account-security recovery navigation;
      run affected Go/frontend/contracts/browser checks and independent review.

Dependencies: accepted gate core and account security interface. Security
assessment confirms explicit boundary checks avoid a broad transaction wrapper.
List and remaining Authorized consumers are later enforcement work; this slice
does not imply full Owner/Admin MFA coverage. Recovery preserves durable creation
results and uses the same idempotency key after status/security recovery. No new
schema, secrets, operator account or retained database operation is required.

Owner creation/Context acceptance, 2026-11-22 (bounded enforcement only):

- Both creation methods and Context acquire the live session/factor gate before
  business locks and recheck after waits, before effects/commit and private return.
  Context still requires current active OWNER membership and tenant scope. Creation
  may commit before a separately denied Context; no private payload is returned.
- Matching preceding-checkpoint isolated PostgreSQL17.6 runtime-role acceptance
  passed five Owner-gate subtests, including actual expiry waits and committed
  creation replay; full storefront regression, offline Go suite and vet passed.
  These backend inputs are unchanged; this is not a new database run on resume.
- Setup preflights MFA and offers account security without losing entered fields.
  Parent workspace/setup gates expose the same recovery. Unknown creation results
  preserve a per-user, per-tab key and SHA-256 payload fingerprint through reload;
  changed details fail closed. Storage contains no shop fields, proofs or secrets.
  Only a fresh operation's explicit pre-write400 INVALID_INPUT clears its key;
  prior unknown operations retain it. Missing storage/crypto prevents submission.
  Recovery after closing the tab remains outside this per-tab guarantee.
- Final root `npm test` PASS:95 web files/791 tests, contracts18/116, logs10 and
  dev-stack7. `npm run build` PASS; lint PASS with0 errors/12 warnings. Existing
  bundle-size warning remains. Process-only TEMP/TMP selects task-owned scratch;
  no test, ACL or global configuration was weakened. Scoped formatting/diff checks
  passed before this evidence update; final documentation checks follow.
- Intercepted-API Chromium156.0.8078.4 on Windows PASS16/16 at360/390 touch
  emulation,768 and1280 widths: preflight denial, explicit security retry,
  keyboard/focus, same-key unknown-result recovery/reload, changed details,
  unavailable storage, enlarged Thai/English and44px controls. Screenshots were
  inspected at all widths with no clipping/overflow. Real devices, Safari and
  browser-to-live-backend acceptance were not run.
- Independent reviewer inspected supplied backend, frontend, contracts and final
  responsive delta/evidence with no remaining concrete findings. No reviewer
  tools, network, writes or delegation were used. Artifacts remain under
  `.local/velopos-identity-20261122/`: `owner-gate-*.log`,
  `owner-root-tests-responsive.log`, `owner-build-responsive.log`,
  `owner-lint-responsive.log`, `owner-ui-browser-responsive.log` and
  `owner-ui-browser-results-1795350935341/`. Earlier RED/failure logs are retained.
- List and independent Authorized consumers remain ungated; five-minute grants,
  recovery-code consumption and full T1.3 remain pending. Recovery retains durable
  creation records and uses a compatible forward build; no schema or actual
  account authority changed in this slice.

Next Owner List and shared authorization inventory (Large/High):

- [x] Gate List before querying, close rows and recheck immediately before return,
      including empty lists. Preserve active OWNER and single-store filtering.
- [x] Verify real middleware401/403/200, absent/foreign/revoked sessions, empty and
      single-store results, query-wait expiry and unchanged business state on the
      uniquely owned disposable runtime-role database. Extend frontend recovery
      coverage for List denial; update its HTTP contract and obtain scoped review.
- [/] Inventory independent Authorized consumers before changing the shared
  boundary. Preserve public/service-principal flows; migrate explicit module
  transactions with checks after waits and before effects/commit/private return.

Security specialist recommends a transaction-bound authorization handle for the
later shared migration, with explicit rechecks and compile-visible consumers;
Commit-only or automatic pgx wrappers do not prove read/write safety. List is a
separate bounded cutover. No schema changes or retained database actions are
required; recovery uses a compatible forward build and retains all records.

Owner List acceptance, 2026-11-22:

- RED reproduced missing-session/foreign-actor disclosure and data returned after
  query-wait expiry. Gate-before-query and close-rows-before-final-recheck GREEN
  on actual PostgreSQL17.6 runtime role, including empty results, inactive and
  unverified users, primary-only/revoked/expired sessions and single-store scope.
  Real middleware HTTP403/200 and denial without data passed. Seven Owner-suite
  subtests and the full storefront isolated regression passed; cleanup verified
  owned full IDs/labels. No schema or retained database changes were required.
- Final root `npm test` PASS95 files/792 web tests, contracts18/116, logs10 and
  dev-stack7. Offline Go suite/vet, typecheck, scoped formatting and diff checks
  passed; root lint passed0 errors/12 warnings. Earlier direct ESLint invocation
  used the wrong root; the actual workspace lint command passed. Go cache sandbox
  denial was resolved by supported command escalation, without permission changes.
- Browser simulation PASS20/20 at360/390/768/1280 in Windows Chromium156.0.8078.4.
  New List-denial cases reach account security from setup by keyboard, make no
  creation request and retain no horizontal overflow. Production UI is unchanged
  from the preceding reviewed responsive build; real-device/live-backend browser
  acceptance remains unverified. Existing root and component checks cover cached
  List denial removing Context and permissions as well as Context denial.
- Independent reviewer inspected supplied List/contract/test source and final
  matching evidence with no concrete findings or bounded acceptance gap; no
  reviewer tools were used. Logs: `owner-list-red.log`, `owner-list-db-accepted.log`,
  `owner-list-storefront-accepted.log`, `owner-list-root.log`,
  `owner-list-go-corrected.log`, `owner-list-vet.log`, `owner-list-typecheck.log`,
  `owner-list-lint-corrected.log` and `owner-list-browser.log` under the existing
  `.local/velopos-identity-20261122/` directory. Failed fixture runs remain: expiry
  now satisfies both session chronology constraints; old primary-only List200
  expectation is explicitly replaced by403 with no data, not bypassed assurance.

Shared authorization discovery (implementation/flow acceptance still pending):

- Organization-local Update, Branches, SaveBranch and Audit use the private raw
  authorized transaction; catalog, customers, inventory (including Quality),
  loyalty, POS, pricing, purchasing, restaurant, returns and storefront consume
  the public Authorized boundary directly or through module wrappers.
- Extra locks, replay exits, shared finish helpers and private read returns need
  explicit per-flow rechecks. Restaurant setup also calls RequireVerified after
  beginSetup; storefront staff reconciliation and sandbox have independent paths.
- Storefront public slug resolution, tracking-token operations and paymentTx
  use separate scoped transactions/principals. They must not acquire fabricated
  Owner sessions or blanket exemptions. Workspace OrganizationProvider mounts
  only within workspace/setup routing; public customer identity is separate.
- Next bounded cutover: introduce a typed MFA authorization handle, then migrate
  organization-local reads/writes with lock-wait/rollback/denial tests. Preserve
  the existing raw Authorized consumers until each module is deliberately wired;
  their presence continues to block any full mandatory-MFA completion claim.

Organization-local authorization cutover (Large/High):

- [x] Add a typed transaction/MFA handle with explicit Recheck; acquire security
      locks before organization authorization and recheck after that lock wait.
      Migrate only Update, Branches, SaveBranch and Audit in this slice.
- [x] TDD actual missing/primary-only/foreign denial and assured success; prove
      final expiry after business/audit waits returns no private data and rolls
      back mutation/audit effects on the isolated runtime-role database.
- [x] Match existing HTTP/OpenAPI errors, full affected regression/static checks
      and independent review before acceptance. Existing raw Authorized consumers
      remain explicitly pending; no wrapper or new caller-controlled exemption.

Dependencies: accepted session gate and current organization authorization. No
schema/data conversion or retained DB operation; compatible forward-build recovery
retains memberships, branches and immutable audit history. Module-specific rollout
must preserve current permissions, tenant filters and organization-lock ordering.

Organization-local acceptance, 2026-11-22 (bounded slice; T1.3 remains open):

- Missing-session enforcement reproduced RED for all four operations. The typed
  handle acquires user/session/factor locks before organization authorization and
  rechecks after its wait. Update, Branches, SaveBranch and Audit now retain the
  handle through their final checks; reads close rows first, writes return no
  result and roll back business/audit effects on failure. Existing raw Authorized
  consumers are unchanged and remain pending, not covered by this acceptance.
- Final isolated PostgreSQL17.6/schema43 Owner suite PASS10.74s:15 top-level groups
  plus four operation subtests, including actual HTTP403 MFA_REQUIRED without data
  and assured200/201; each operation denies foreign users, historical non-Owner
  roles, suspended membership and mismatched session actors without changing the
  organization/membership/branch/request/audit snapshot. Actual final query/audit
  waits and handle-acquisition waits expire assurance and deny without data or
  committed effects. The API uses verified non-super/non-BYPASSRLS runtime; only
  the audit-table lock fixture uses separately confirmed disposable administrator.
  ID/label-checked tmpfs/internal-network cleanup passed; no retained target used.
- Matching full storefront isolated regression, offline Go suite/vet, contracts
  18/116 and scoped Go formatting/diff checks passed. After the final test-only
  permission additions, isolated Owner suite and focused organization test/vet
  passed again. Earlier frontend/browser evidence above still matches unchanged
  frontend source; no new browser or device acceptance is implied by this slice.
- Independent reviewer inspected supplied handle, all four operations, contracts,
  fixtures, denial/expiry/HTTP source and matching evidence. Its requested missing
  operation-level tenant/permission evidence was supplied and re-reviewed with no
  concrete findings. Reviewer used no tools. Initial audit-lock fixture failed
  42501 under runtime; the corrected fixture uses isolated admin only as blocker,
  with no runtime privilege change. Artifacts in the existing identity directory:
  `owner-local-red.log`, `owner-local-storefront.log`, `owner-local-http-final.log`,
  `owner-local-tenant-final.log`, `owner-local-go-final.log`,
  `owner-local-vet-final.log`, `owner-local-organization-final.log` and
  `owner-local-organization-vet-final.log`. Recovery retains all durable records
  through a compatible forward build. No schema, actual Admin grant or deployment.

Next restaurant setup authorization inventory (Large/High):

- [x] Trace branchless and retained-branch setup read, mutation, replay and finish
      boundaries, their direct HTTP errors, test fixtures and public callers.
- [ ] Define a bounded cutover with typed MFA acquisition, explicit checks after
      waits and before effects/private replay/commit, preserving setup idempotency,
      Pickup semantics, branch isolation and all existing audit/transaction rules.
- [ ] Verify missing/primary-only/foreign/non-Owner denial, assured success, expiry
      waits and unchanged state on denial on the disposable runtime-role target;
      run matching contract/regression checks and obtain independent review.

No production setup authorization changes are accepted by this inventory. Existing
raw module transactions continue to block full mandatory Owner/Admin MFA closure.

Branchless setup private-read cutover, 2026-11-22 (Large/High):

- [x] Reproduce missing-session disclosure RED, acquire the typed MFA handle
      independently for organizationSetup, retain restaurant type/OWNER/tenant
      authorization and recheck after all rows close before returning private state.
- [x] Prove absent/primary-only/foreign/mismatched/non-Owner/suspended denial,
      zero state on failure, real middleware HTTP401/403/200 and session expiry
      during the final menu-table query wait on the disposable runtime-role target.
- [x] Match HTTP/OpenAPI, run full affected isolated regression and offline/static
      checks, and obtain independent review of source, fixtures and evidence.

The Owner suite passed11.78s; full storefront regression passed5.45s with populated
menu, readiness, Pickup and retained-branch behavior, zero FAIL/SKIP. Offline full
Go suite/vet, contracts18/116, scoped gofmt/Prettier and diff checks passed. Only
the disposable fixture administrator holds the menu-table blocker; service reads
use the confirmed non-super/non-BYPASSRLS runtime role. Owned ID/label cleanup
passed, with no retained target, schema change or actual Admin grant. Recovery
uses a compatible forward build preserving all setup and command records.

Independent review inspected the read wrapper, row-closing helpers, HTTP mapping,
contracts, actual denial/expiry test source and matching evidence without tools.
No concrete findings remain in this bounded slice. Two fixture failures remain
recorded: old unverified-user check used another actor's session, then its corrected
real primary session expected the wrong gate error. The accepted fixture logs in
as that user and expects MFA_REQUIRED because the existing gate rejects a missing
factor before assurance eligibility checks. No production control was weakened.
Artifacts under the identity directory: `setup-read-red.log`, `setup-read-green.log`,
`setup-read-go.log`, `setup-read-vet.log`, `setup-read-storefront.log`,
`setup-read-storefront-final.log` and `setup-read-storefront-accepted.log`.

This cutover changes only the branchless private read and shared HTTP error
mapping. Branchless setup writes/replays and retained-branch setup reads/writes
remain pending; shared raw Authorized consumers still prevent full MFA closure.

Branchless setup mutation/replay cutover (Large/High, accepted 2026-11-22):

- [x] Add session/tenant/permission and replay RED cases for every setup mutation,
      including stored QR-token replay and completed/readiness return paths.
- [x] Carry typed MFA authorization through branchless setup and its menu/table
      writers. Recheck after command/business waits, before further effects and
      before private replay/result return or commit. Preserve fingerprints,
      immutable command results, Pickup, readiness and atomic audit/QR changes.
- [x] Prove full rollback after final expiry and helper waits using the disposable
      runtime role; verify real HTTP denials/success, concurrent revocation and
      affected frontend recovery, contract/regression checks and independent review.

Scope: organization_setup.go, organization_menu.go, matching integration fixtures,
HTTP/OpenAPI and affected consumers only. Retained-branch setup remains a separate
pending cutover. No schema conversion or retained DB execution; compatible forward
build recovery retains setup, historical command results and QR hashes.

Acceptance evidence, 2026-11-22 (bounded scope; full T1.3 remains open):

- All seven setup writes and matching replays independently require live MFA,
  active OWNER and scoped organization authorization. Rechecks cover command,
  menu/table/unit, audit and result waits; failures return zero SetupState and
  roll back changes. Current matching isolated schema43 runtime-role Owner suite
  PASS (29.92s), including all seven operations and concurrent real logout.
  Full isolated storefront suite PASS (5.87s), no FAIL/SKIP; populated Pickup
  downgrade refusal, preserved data and compatible forward recovery PASS.
- Offline Go suite PASS (19 tested packages), vet and scoped gofmt PASS; contracts
  PASS (18 modules/116 routes). Failed diagnostic, JSON replay canonicalization,
  old unverified-owner fixture and duplicate-YAML runs remain in local evidence;
  corrections preserve actual behavior assertions and contract prerequisites.
- Completion recovery now offers account security or sign-in and retains only a
  UUID in per-tab storage, scoped by user/organization/branch, across remount and
  uncertain results. Missing/corrupt/unavailable storage prevents submission;
  cleanup removes only the matching confirmed operation. Sign-in-remount RED
  reproduced key loss; final focused frontend regression PASS (4 files/109 tests),
  typecheck, build, scoped Prettier and diff whitespace PASS. Lint: 0 errors,
  12 warnings; OrganizationPages bundle-size warning remains.
- Final production-build Chromium 156.0.8078.4 Windows intercepted-API browser
  suite PASS (24/24, 30.6s). Completion recovery checks cover 360/390/768/1280px,
  keyboard popup/challenge, explicit same-key retry, 200% text, overflow and 44px
  security target. All four completion screenshots inspected. This is emulation
  with synthetic APIs, not real-device or full browser sign-in acceptance.
- Independent reviewer inspected supplied source/contracts/evidence with no
  tools, shell, network, writes or delegation: no unresolved concrete findings.
  Artifacts: `.local/velopos-identity-20261122/setup-write-*`; final key evidence
  uses `setup-write-completion-*`. No retained DB, actual Admin grant, commit,
  push or deployment. Retained-branch setup and raw Authorized consumers pending.

Retained-branch setup cutover (Large/High, accepted 2026-11-22):

- [x] Trace retained setup reads, writes, helper waits, cached-result replay and
      completed/readiness early returns; define typed authorization boundaries.
- [x] Add runtime-role MFA/tenant/permission/rollback RED cases, then carry typed
      authorization through affected retained helpers without schema conversion.
- [x] Verify retained setup/readiness/QR/idempotency, expiry and revocation using
      only task-owned disposable data; run affected regression/contracts and
      independent review. Preserve retained history and forward recovery.

Scope: restaurant/setup.go and matching tests/contracts; branchless accepted
behavior remains a regression requirement. Dependencies: accepted typed gate and
branchless setup cutover. No primary/retained DB execution or schema conversion.
Rollback/recovery: compatible forward build; no removal of commands or QR hashes.

Retained setup acceptance evidence:

- Missing-session reads and all seven writes reproduced behavioral RED on the
  disposable runtime role. Typed acquisition and checks now protect reads, helper
  waits, replay, result/audit writes and both completion paths. Denials return
  zero state and preserve all25 snapshotted organization/setup/catalog/audit tables.
- Schema43/PostgreSQL17.6 Owner suite PASS50.83s, including branchless regression,
  retained read1.18s and retained writes19.05s. Actual lock waits prove expiry;
  foreign/unknown/inactive branches, non-Owner and suspended memberships, actor
  mismatch, real middleware401/403/200, QR replay, cancellation after partial
  scanning, deferred commit failure, concurrent identical commands with one audit
  and serialized logout all pass. Full-ID/label-verified disposable cleanup passed.
- Full storefront regression PASS6.11s after correcting the foreign-user fixture
  to use its own existing MFA session. The old fixture paired guest ID with Owner
  session and failed at authentication; the tenant-denial assertion is preserved.
  Offline full Go tests/vet, contracts18/116, scoped gofmt/Prettier and diff checks
  passed. Earlier failure logs remain; no schema, retained DB or account grant.
- Independent reviewer inspected supplied current source/contracts/test evidence
  without tools and found no concrete findings or unresolved bounded acceptance
  gap. Evidence: `retained-setup-red-isolated.log`, `retained-setup-expanded.log`,
  `retained-setup-storefront-corrected.log`, `retained-setup-go.log` and
  `retained-setup-vet.log` in the existing identity artifacts directory.
  No new browser/device claim; other consumers and full T1.3 remain pending.

Restaurant employee endpoint cutover (Large/High, bounded backend accepted):

- [x] Trace Settings/SaveSettings, Recipes/SaveRecipe, Tables/SaveTable, Queue and
      ForecastStatus; preserve their exact permissions, branch checks and public
      helper/principal boundaries. Security specialist supplied bounded guidance.
- [x] Add disposable runtime-role denial/expiry/rollback/replay tests before
      migrating the eight employee entrypoints to the typed authorization handle.
      Generalize the existing typed command helpers without changing wire hashes.
- [x] Verify all eight operations, actual HTTP errors, concurrency/revision and
      existing paid-kitchen/public-storefront behavior; run matching Go/contracts
      checks and obtain independent review before acceptance.

Scope: restaurant/service.go, forecast.go, typed command helper callsites and
matching tests/contracts. Dependencies: accepted retained setup and typed gate.
Keep raw public/settlement helpers and kitchen eligibility predicates unchanged;
ForecastStatus remains local status only. No schema/data conversion, external AI
call, primary/retained DB operation or new business capability. Recovery retains
all records and immutable command results through a compatible forward build.

Backend acceptance, 2026-11-22 (full T1.3 remains incomplete):

- Missing-session RED failed all eight entrypoints before the cutover. Current
  runtime-role PostgreSQL17.6 Owner suite PASS64.80s, including all eight methods,
  three update paths, missing/primary-only/foreign/mismatched actor and non-Owner
  denial, branch isolation, actual middleware401/403/200, blocked-query/audit/replay
  expiry, deferred commit rollback and concurrent create convergence. Denials
  return zero private results and preserve all27 scoped business-table digests.
  Recipe/Table creation replay preserves exact response, command and audit counts.
- Current full isolated storefront suite PASS5.79s, zeroFAIL/SKIP. Added real-flow
  queue assertions cover unpaid/open/processing denial, PAID-held inclusion,
  expired/released and late-PAID exclusion, FULFILLMENT_REVIEW, and all four refund
  exclusions REQUESTED/PENDING/REQUIRES_ACTION/SUCCEEDED. Existing public tracking,
  ordering, settlement and setup regressions remain intact. Both runners verified
  owned full IDs/labels before cleanup; no retained data or provider calls.
- Offline `go test ./... -count=1`, `go vet ./...`, contracts18/116, scoped gofmt,
  OpenAPI Prettier and diff whitespace PASS. Six existing HTTP descriptions now
  describe independent MFA and zero-data failures; no routes or schemas added.
  Independent reviewer inspected supplied scoped source, contracts and matching
  evidence with no concrete findings or unresolved bounded backend acceptance gap;
  reviewer used no tools, shell, filesystem, network, writes or delegation.
- Evidence: `restaurant-employee-red.log`, `restaurant-employee-final.log`,
  `restaurant-employee-storefront.log`, `restaurant-employee-go.log` and
  `restaurant-employee-vet.log` under `.local/velopos-identity-20261122/`.
  Historical intermediate runs are retained. No new browser/device or race claim.
  Frontend uncertain-operation recovery remains a separate pending consumer slice;
  other raw Authorized consumers and five-minute sensitive authority remain open.

Storefront employee private-read cutover (Large/High, accepted backend slice):

- [x] Trace private Settings, Order and Orders independently of public slug,
      tracking-token, settlement and provider principals. Preserve current
      permissions, branch filtering, null settings and pagination contracts.
- [x] Add runtime-role denial and blocked-read expiry RED cases, then acquire
      typed live MFA authorization and recheck before every private result,
      including null settings and empty pages. Failed reads return zero data.
- [x] Verify middleware401/403/200, tenant/Owner and single-store isolation,
      cancellation, read-wait expiry, unchanged data, full public/storefront
      regressions, matching contracts/static checks and independent review.

Scope: storefront/service.go private Settings, orders.go private Order/Orders,
HTTP error mapping and matching tests/contracts. The raw authorization wrapper
remains available to other pending consumers. No schema change, provider work,
public-helper MFA or financial mutation. Recovery uses a compatible forward
build and retains all records. Frontend operation recovery remains pending.

Matching evidence: `storefront-read-final.log` in the existing identity scratch
directory records the full isolated runtime-role storefront suite PASS13.27s,
203 PASS entries, zero FAIL/SKIP. Five private result variants and interrupted
count/ID/later-detail reads return no partial data; middleware no-store,
pagination, inactive history and anonymous public redaction remain covered.
Fresh offline full Go, vet, contracts18/116, scoped formatting and diff checks
PASS. The independent message-only reviewer found no remaining concrete defect
or bounded acceptance gap, including OpenAPI3.1 object/null compatibility.
No schema, provider or financial-write delta; full T1.3 remains open.

Storefront employee catalog-read cutover (Large/High, accepted backend slice):

- [x] Trace private Products for retained-branch and organization-native menus,
      retaining the separate anonymous slug path, current scope and pagination.
- [x] Add missing/primary-session denial RED, then typed live MFA acquisition,
      final checks and zero-result failure handling for both private projections.
- [x] Verify real runtime-role expiry/cancellation and partial-page rejection,
      middleware, tenant/Owner/single-store and anonymous catalog regressions;
      run matching checks and independent review before acceptance.

Scope: catalog.go Products entrypoint, focused tests and existing OpenAPI
description only. No publication, settings writes, quotes, settlement or schema
changes. Read-only helpers retain their public behavior. Recovery uses a
compatible forward build; no records are removed or rewritten.

Matching evidence: `storefront-catalog-expanded.log` records the full isolated
runtime-role suite PASS24.96s, catalog PASS10.94s, 216 PASS entries and zero
FAIL/SKIP. Four populated/empty projections and eight count/ID/detail/projection
interruptions cover expiry, cancellation and discarded partial results. Exact
draft prices, pagination, Owner/tenant/pinned scope, business snapshots and
anonymous public selection remain covered. Corrected behavioral RED demonstrates
all four projections accepted missing sessions; the first attempt instead found
a missing profile fixture and is retained separately. Full offline Go/vet,
contracts18/116, scoped formatting and diff checks PASS. Initial sandbox cache
denials are retained; supported escalation passed without ACL/config changes.
Independent message-only review found no concrete defect or bounded gap.

Storefront settings/publication write cutover (Large/High, accepted backend slice):

- [x] Trace SaveSettings and Publish, including organization-native helper
      commits, legacy source checks, revision guards and atomic audit effects.
- [x] Demonstrate missing-session denial RED; carry typed MFA authorization
      through both settings paths and publication, returning zero on failure.
- [x] Verify runtime-role permission/isolation, waits/expiry/cancellation,
      rollback, revision concurrency and existing public/financial regressions;
      obtain matching static checks and independent review.

Scope: service.go SaveSettings, organization_settings.go helper, catalog.go
Publish, matching tests and existing OpenAPI descriptions. Preserve exact
shipping fees, publication/live-order guards and source/revision semantics.
No schema, provider, payment settlement or receiving-account change. Recovery
uses a compatible forward build; no historical records are removed.

Matching evidence: `storefront-write-expanded-corrected.log` records full isolated
runtime-role PASS35.98s, write sub-suite PASS10.97s, 221 PASS entries and zero
FAIL/SKIP. Publication, legacy settings, branchless create/update cover real
middleware401/403/200, non-Owner/tenant/pinned denial, expiry/cancellation waits,
post-write audit interruption with unchanged24-table snapshots, one-success/
one-conflict revision concurrency and exact shipping/price preservation. The
initial audit-table lock attempt failed42501; the corrected test uses a scoped
query tracer without privilege changes. Full offline Go/vet, contracts18/116,
scoped Prettier/gofmt and diff checks PASS. Message-only independent review of
source, matching evidence and exact OpenAPI descriptions found no concrete
findings or remaining bounded gaps. Controlled precommit denial rolls back;
connection-loss Commit errors can remain uncertain and require reconciliation.
No frontend/browser claim or full T1.3 acceptance is implied.

Storefront organization quote cutover (Large/High, accepted backend slice):

- [x] Trace QuoteOrganization, read-only helper and retained callers; preserve
      exact prices, deterministic digest, source and fulfillment validation.
- [x] Demonstrate missing-session denial RED; use the typed MFA transaction,
      recheck after waits/helper errors and return zero Quote on any failure.
- [x] Verify runtime-role session/Owner/tenant/pinned denial, settings/menu waits,
      expiry/cancellation, partial-result rejection, no business effects and
      public quote regressions; run matching checks and independent review.

Scope: organization_quote.go entrypoint and focused integration tests only.
No new route, public/shared helper change, schema, provider or financial write.
Recovery uses a compatible forward build; no records are removed or rewritten.

Matching evidence: `storefront-quote-final.log` records isolated runtime-role
PASS39.16s, quote PASS3.31s, 227 PASS entries and zero FAIL/SKIP. Behavioral RED
showed missing sessions received quotes. The initial implementation exposed a
cancellation-classification failure after a closed pgx connection; explicit
context checks before rechecks preserve cancellation. Tests cover actual
primary/MFA/actor/tenant/Owner/pinned scope, settings/menu expiry/cancellation,
partial helper errors with zero results, disabled delivery, incompatible legacy
source, exact totals/digest and unchanged24-table business/MFA proof snapshots.
Existing cross-tenant product, saleability/currency, revision freshness and public
quote regressions remain covered. Full offline Go/vet, contracts18/116, scoped
formatting/diff checks PASS. Message-only independent review found no concrete
findings or bounded gaps. No route, public helper, schema or browser delta; full
T1.3 remains open.

Storefront order transition cutover (Large/High, backend slice accepted):

- [x] Trace Transition, actual payment/refund serialization, read helpers and
      retained callers; preserve kitchen eligibility and transition guards.
- [x] Demonstrate missing-session denial RED; carry typed MFA through the same
      transaction and return zero Order on all failures.
- [x] Verify runtime-role session/permission/isolation, waits, post-write rollback,
      revision concurrency and payment/hold/refund/review predicates; obtain
      matching checks and independent review before bounded acceptance.

Scope: orders.go Transition, focused tests and existing OpenAPI description.
Preserve order/event/audit atomicity, exact stock units and all existing payment
and source guards. No provider call, schema or payment/refund implementation
change. Recovery uses a compatible forward build; Commit errors can require
state reconciliation and must not be blindly replayed.

Matching evidence: `storefront-transition-corrected.log` records isolated
runtime-role PASS44.66s, transition PASS5.59s, 228 PASS entries and zero FAIL/SKIP.
The missing-session cancellation regression first failed RED. An initial fixture
attempt to lock append-only events was denied42501; a query tracer replaced that
fixture without changing grants or production behavior. Tests cover actual
primary/MFA/actor/tenant/Owner/pinned scope, order/event/audit waits, expiry and
cancellation with zero results and unchanged24-table snapshots, stale/invalid
transitions and competing requests committing one revision/event/audit. Owner
HTTP READY preserves10.00 price and1.000 quantity. Existing payment/hold/refund/
review/source/kitchen regressions remain covered. Cooperating payment/refund
writers and Transition retain the same organization lock; this serialization is
not supplied by MFA alone. Offline Go/vet, contracts18/116 and scoped formatting/
diff checks PASS. Message-only independent review found no concrete findings or
bounded acceptance gaps. This is not exhaustive payment acceptance or full T1.3.

Storefront private payment review cutover (Large/High, backend slice accepted):

- [x] Trace CustomerPaymentReview, staff payment locking, errors and retained callers;
      retain both permissions, branch/tenant scope and payment projections.
- [x] Prove missing-session denial RED; introduce a typed staff-payment gate for
      this read entrypoint with checks after waits and before private return.
- [x] Verify real session/permission/isolation denials, expiry/cancellation,
      partial-result rejection and unchanged business/MFA proof state; obtain
      matching Go/contracts/format checks and independent review.

Scope: CustomerPaymentReview and its typed authorization helper and focused tests.
No HTTP caller/route was found; no public contract change is needed.
Retained financial writers keep their
current helper pending their own cutover. No provider call, schema, refund or
payment mutation change. Recovery uses a compatible forward build.

Matching evidence: `storefront-payment-review-expanded.log` records isolated
runtime-role PASS49.77s, private payment review PASS4.47s, 229 PASS entries and
zero FAIL/SKIP. Missing-session read first failed RED with populated private data.
Tests cover actual primary/MFA/actor/tenant/Owner/pinned scope, no attempt and
foreign order, order-lock and payment/projection expiry/cancellation, zero partial
results, exact1000 minor units and unchanged24-table business/MFA proof snapshots.
Actual flag/refund services block behind the read transaction, observed through
pg_blocking_pids; committed views retain PAID_HELD -> REFUND_REVIEW_REQUIRED ->
REFUNDED precedence. Synthetic provider responses remain local. Existing broader
payment/refund regressions pass. Offline Go/vet, contracts18/116 and scoped
formatting/diff checks PASS. Message-only independent review found no concrete
findings; final document-format verification closes its remaining check. Retained
financial writers and full T1.3 remain open.

Storefront fulfillment-review write cutover (Large/High, bounded acceptance):

- [x] Trace FlagCustomerPaymentFulfillment replay, eligibility, reconciliation
      and audit effects; preserve both permissions and scoped serialization.
- [x] Prove missing-session denial RED; carry typed MFA through replay, waits,
      effects and commit, returning zero PaymentReview on every failure.
- [x] Verify denial/isolation, expiry/cancellation rollback, replay/conflict and
      concurrent same-key behavior; obtain matching checks and independent review.

Scope: FlagCustomerPaymentFulfillment and focused tests only. No public route,
schema, external provider, payment/refund mutation or shared raw helper change.
Keep reconciliation/audit atomic; commit uncertainty needs state reconciliation.
Recovery uses a compatible forward build and preserves immutable records.

Matching evidence: `storefront-fulfillment-review-expanded.log` records isolated
runtime-role PASS58.78s, fulfillment review PASS8.74s, 230 PASS entries and zero
FAIL/SKIP. Missing-session writes first failed RED. Tests cover real session,
permission and tenant denials; order waits and replay/projection/insert/audit
interruptions; zero results and unchanged24-table/MFA-proof snapshots; one audit
and reconciliation for concurrent same-key calls; changed replay identities;
actual local refund followed by current REFUNDED replay; and actual POS settlement
followed by fresh-write rejection. Synthetic provider responses remain local.
Matching offline Go/vet, contracts18/116 and scoped formatting/diff checks passed.
Message-only independent review found no concrete findings, with document
formatting checked separately. Other financial writers and full T1.3 remain open.

Storefront reconciliation preflight cutover (Large/High, bounded acceptance):

- [x] Trace prepareStaffVerification and provider-dispatch/replay contracts.
- [x] Prove unassured preflight denial RED, acquire typed MFA authorization and
      recheck after replay/dispatch reads; discard partial private results.
- [x] Verify real session/tenant/permission denials, interrupted waits, no denied
      provider calls, unchanged state and unlocked successful dispatch; obtain
      matching local checks and independent review.

Scope: prepareStaffVerification and focused public-service acceptance tests.
Post-provider ReconcileCustomerPayment effects and refund writers remain pending.
No schema, public route, provider configuration or financial mutation change.
Replay keeps its current projection and immutable identity. Recovery uses a
compatible forward build; actual provider calls remain unauthorized.

Acceptance, 2026-11-23: user confirmed commit6c1f839 as the current baseline.
`storefront-reconciliation-preflight-resume-baseline.log` reproduced the two
legacy fixtures passing an Owner session with another actor ID. Fixtures now use
that actor's real MFA session and separately retain mismatched-actor denial.
`storefront-reconciliation-preflight-resume-isolated.log` records PASS63.10s,
preflight PASS4.44s, 231 PASS entries and zero FAIL/SKIP. The prior concurrent
Go/vet run hit the shared90-second suite deadline; it is preserved, with unchanged
assertions/deadlines passing in the standalone rerun. Tests cover26-table snapshots,
unchanged MFA factor state, used recovery-code and MFA audit counts,
replay/dispatch/order interruption, no denied provider calls,
exact dispatch tuple and released organization/session locks before retrieval.
Absent dispatch rows retain the existing configured-fingerprint fallback; matching
and changed provider identities are exercised with local synthetic callbacks only.
Offline Go/vet, contracts18/116 and scoped formatting/diff checks passed.
Message-only independent review found no concrete findings. Post-provider effects,
refund writers and full T1.3 remain pending.

Storefront reconciliation result cutover (Large/High, bounded acceptance):

- [x] Trace post-provider authorization, observation/payment effects, replay and
      commit boundaries; preserve exact payment state, identity and deduplication.
- [x] Reproduce expired authorization during Retrieve RED; reacquire typed live
      MFA and recheck after waits, between effects and before commit/private replay.
- [x] Verify revocation/cancellation, transactional rollback and deduplicated
      observations, same/different-key concurrency and stale provider evidence;
      obtain matching full regressions/static checks and independent review.

Scope: ReconcileCustomerPayment post-provider orchestration, explicitly checked
observation stages and focused tests. Provider dispatch remains outside database
transactions. Retain shared public checkout behavior and refund helpers; no schema,
route, provider configuration or actual external call change. Controlled failures
must return zero and roll back all effects. Unknown commit outcomes retain the
original key for reconciliation; recovery uses a compatible forward build.

Acceptance, 2026-11-23: `storefront-reconciliation-result-red.log` reproduced
expired provider-time authorization committing and returning a reconciliation.
The typed post-provider transaction and checked observation stages pass the
minimal GREEN and `storefront-reconciliation-result-expanded.log`: full
PASS77.61s, result group PASS14.37s, 232 PASS entries, zero FAIL/SKIP. Tests cover
provider-time expiry/revocation/MFA removal/cancellation, eleven interrupted SQL
stages with26-table rollback snapshots, unchanged MFA factor state, used
recovery-code and MFA audit counts, same/different-key
concurrency, deduplicated observation preservation and stale OPEN evidence after
PAID. Shared public checkout and legacy payment/refund regression groups passed.
The43-migration runtime-role target was a uniquely labelled tmpfs PostgreSQL17.6;
owned container/network cleanup passed. Offline `go test ./... -count=1` and
`go vet ./...`, contracts18/116, scoped gofmt and diff checks passed. Message-only
independent review of supplied source/tests/evidence found no concrete findings;
the reviewer executed no checks. Commit errors remain potentially uncertain.
No live provider/browser or full T1.3 acceptance is implied. Refund writers remain
pending.

Storefront refund preparation cutover (Large/High, bounded acceptance):

- [x] Trace durable refund preparation, replay, authorization and provider boundary.
- [x] Reproduce missing MFA preparation denial RED; carry typed authorization
      through request insertion, audit and final locked intent read.
- [x] Verify no denied provider dispatch, rollback, exact durable identity,
      cancellation/expiry/replay/concurrency and matching independent review.

Scope: prepareCustomerCancellation, cancellation check before bounded dispatch,
and focused synthetic-provider tests through CancelPaidCustomerOrder. Preserve
current full-charge pre-shipment semantics,
durable refund identity and retry rules. No schema, public route or live provider
call change. Discovered-refund preflight and post-provider finalization remain
separate pending cuts. Controlled denial must return zero; ambiguous Commit
outcomes retain the original operation identity and require reconciliation.

Acceptance, 2026-11-23: missing-session RED reached a synthetic provider and
created an intent. A separate cancellation RED reproduced dispatch after local
fingerprinting canceled the request. Typed preparation and the dispatch guard
pass focused GREEN and `storefront-refund-preparation-expanded.log`: full
PASS83.42s, 233 PASS entries, zero FAIL/SKIP. Six SQL-stage expiry/cancellation
checks, existing-intent replay interruption, session/tenant/permission denials,
concurrent same-key preparation, conflicting-key rejection and terminal replay
retain the exact1000-minor-unit charge/key/fingerprint. Provider callbacks verify
committed intent plus one request audit and released locks before dispatch.
Controlled failures preserve26-table snapshots, MFA factor state, used recovery
codes and MFA audit counts. The cancellation guard retains the durable intent
for explicit retry. One legacy delivery fixture now uses the actual foreign
actor's MFA session while separately retaining mismatched-actor denial.
Standalone schema43/PostgreSQL17.6 runtime-role checks and owned-resource cleanup
passed. Matching offline full Go/vet, contracts18/116, scoped gofmt/Prettier and
diff checks passed. Message-only independent review found no concrete findings
or unmet bounded checks; reviewer executed no checks. Intermediate fixture and
snapshot failures remain recorded. Discovered-ID preflight, result finalization,
five-minute sensitive authority and full T1.3 remain pending.

Storefront discovered-refund preflight cutover (Large/High, bounded acceptance):

- [x] Trace discovered-ID preflight, terminal replay, immutable charge and locks;
      add missing/primary-session denial RED before typed authorization changes.
- [x] Recheck after the locked intent read, discard private partial results and
      release locks before bounded retrieval; preserve key/provider-ID conflicts.
- [x] Verify real denial/isolation, interrupted read/replay, exact dispatch tuple,
      unknown-result identity and matching regression/static checks with review.

Scope: the discovered-ID branch of processCustomerRefund and focused synthetic
provider tests. Result finalization is a separate pending slice. No schema,
public route, provider configuration or live provider call. Existing full-charge
pre-shipment semantics and23-hour creation limit remain; discovered retrieval
must not create or replace the durable refund. Recovery retains the original
identity and all records through a compatible forward build.

Acceptance, 2026-11-23: `storefront-refund-preflight-red.log` reproduced an
unassured Retrieve call. Minimal and expanded focused GREEN passed. Matching
`storefront-refund-preflight-expanded.log` records full PASS88.30s, new group
PASS3.56s, 234 PASS entries and zero FAIL/SKIP. Tests cover real session/actor/
Owner/tenant/pinned-scope denials, order-lock and intent-read interruption,
terminal replay, changed key and known provider-ID conflict, cancellation after
fingerprinting and exact1000-minor-unit retrieval with released organization/
session locks. Unknown outcomes preserve the original durable intent. Controlled
failures retain26-table snapshots, MFA factor state, used recovery codes and MFA
audit counts. The schema43 runtime-role disposable target and owned-resource
cleanup passed. Fresh offline full Go/vet, contracts18/116, scoped gofmt/Prettier
and diff checks passed. Message-only independent review found no concrete
findings or mandatory bounded gap and executed no checks. A local runner syntax
failure was corrected before database execution and remains recorded separately.
Result finalization, five-minute sensitive authority and full T1.3 remain pending.

Storefront refund result cutover (Large/High, bounded acceptance):

- [x] Trace result-time authorization, current intent validation and every
      financial effect; reproduce provider-time session expiry before changes.
- [x] Reacquire typed authorization after provider response; recheck after waits,
      between effects and before commit; discard partial intent on errors.
- [x] Verify expiry/revocation/cancellation rollback, exact identity and
      concurrent/deduplicated/stale observations; run matching full regression,
      static checks and independent review before bounded acceptance.

Scope: processCustomerRefund post-provider transaction and focused tests. Preserve
full frozen-charge/provider evidence, terminal conflict rules, derived hold
release and atomic cancellation/event/audit. Provider calls remain outside DB
transactions. No schema, public route or live provider work; original durable
identity supports recovery after uncertain commit. The aggregate isolated suite
budget grows from90 to120 seconds for added explicit expiry cases after measured
88.30-second preflight regression; individual operation/provider/barrier bounds
and assertions stay unchanged. This is not a performance acceptance claim.

Acceptance, 2026-11-23: provider-time expiry RED committed a successful refund
and returned private data. Typed result authorization passes minimal GREEN and
matching `storefront-refund-result-final.log`: full PASS97.66s, new group
PASS11.94s, 235 PASS entries and zero FAIL/SKIP. Create and discovered Retrieve
cover provider-time expiry, revocation, lost assurance and cancellation. Ten
SQL-stage expiry/cancellation cases and interrupted deduplication preserve
26-table snapshots, factor fields, used recovery-code counts and MFA audit
counts; session proof timestamps are not part of those snapshots. An actual
concurrent service binds the provider ID before the outer result, which then
rejects conflicting evidence. Four unlocked provider callbacks cover identical
successes, stale pending and contradictory failed responses: one hold release,
one cancellation event/audit, preserved terminal state and rolled-back conflicting
observation. Terminal replay has no dispatch or new effects. Schema43 runtime-role
tmpfs PostgreSQL17.6 and ID/label-verified cleanup passed. Fresh offline full Go
tests/vet, contracts18/116, changed-Go gofmt, scoped Prettier and diff checks passed.
Independent message-only review found no concrete findings or unmet bounded
checks and executed no tests. Corrected test-local naming and provider-binding
fixture failures remain recorded separately. Authorization is point-in-time;
Commit errors remain potentially uncertain and retain the original recovery
identity. Sandbox, five-minute sensitive authority and full T1.3 remain pending.

Storefront sandbox MFA cutover (Large/High, bounded acceptance):

- [x] Trace all four sandbox actions and reproduce primary-only private access;
      retain test-only provider scope, exact values and operation identities.
- [x] Use short typed MFA authorization transactions before local work, again
      before dispatch or local status, and after provider success/error. Keep locks
      outside body/configuration/provider calls and discard denied private results.
- [x] Verify real session/Owner/tenant denials and provider-time changes,
      cancellation, lock release, original-key recovery and unchanged local data;
      run matching regression/contracts and independent review.

Scope: SandboxHandler, matching OpenAPI descriptions and focused HTTP/database
tests. Initial authorization still precedes disabled/status and syntax responses.
Final status/configuration checks follow local work; sanitized syntax errors do
not disclose private state. Provider effects can precede postflight denial and
cannot roll back: recovery retains the same key and existing retrieve/refund
identity. No live Stripe calls, new provider, schema change or five-minute
sensitive-action grant. Recovery uses a compatible forward build and preserves
all prior provider identities and local records. Security specialist supplied
message-only sequencing advice; independent review remains required.

Acceptance, 2026-11-23: primary-only access RED returned HTTP200 configuration.
Typed MFA GREEN and matching `storefront-sandbox-mfa-final.log` pass full101.84s,
new group4.19s,236 PASS entries and zero FAIL/SKIP. Four actions cover enabled/
disabled, missing/primary/foreign/pinned-context and non-Owner/suspended denials.
Provider success and error cases cover expired/revoked/unassured sessions,
cancellation and Owner demotion/suspension; authority denial wins without data.
Actual transactions verify released organization/session locks during provider,
configuration and decoder work. Configuration interruption, decoder cancellation
and three authorization-stage expiry/cancellation pairs prevent premature
dispatch or private return. Runtime snapshots preserve26 business tables, factor
fields, used recovery-code counts and MFA audit counts, excluding expected
middleware session-use updates. Strict empty JSON/body bounds, Origin/CSRF,
exactTHB2000 and unchanged scope/key/session forwarding remain covered. Provider
effects are synthetic and not asserted to roll back. OpenAPI documents MFA and
uncertain external outcomes. Client16/16 tests preserve401/403 codes, prohibit
automatic retries and forward the original key on explicit recovery. No UI or
browser claim. Fresh offline Go/vet, contracts18/116, web typecheck, focused ESLint,
changed-Go gofmt, scoped Prettier and diff checks pass. Initial runner omitted its
Pickup fixture; its gate test passed but downgrade assertion failed. Corrected
fixture selection passes focused/full runs and ID/label-verified cleanup. A
wrong-root formatting command, Go cache sandbox denial and initial TypeScript
formatting warning are retained separately; supported escalation/scoped formatting
resolved them without ACL/config changes. Independent message-only review found
no concrete findings or unmet bounded checks and executed no checks. Synchronous
body/configuration callbacks still depend on their own return; cancellation is
checked before subsequent dispatch/response. Live provider, five-minute sensitive
authority, other consumers and full T1.3 remain open.

Restaurant in-memory command recovery core (High risk, accepted 2026-11-23):

- [x] Reproduce loss of the original attempt on network/auth errors and after
      later definitive rejection of a previously uncertain request.
- [x] Bind immutable serialized payload/key to user, organization, branch, path
      and method; retain uncertainty on the attempt until matching success.
      Permit refreshed CSRF, explicit same-command retry and synchronous duplicate
      protection; prevent stale callbacks/private results crossing contexts.
- [x] Verify hook and actual consumer regressions, client/type/lint/static checks
      and independent review. No new storage, public contract, DOM or styling.

Scope: useRestaurantCommand and focused tests. Known first-request rejection may
permit correction; an uncertain earlier request cannot be disproved by a later
400/409. Backend authorization remains authoritative. Existing caller remounts
already fence context changes; the core must additionally refuse a retained
attempt in a different operation/context. Security specialist supplied bounded
message-only advice. Navigation/remount/reload durability and a full recovery UX
remain pending; payloads/proofs are not written to browser storage. Recovery and
rollback preserve the existing provider/server command identities; no automatic
retry, new provider calls or database changes.

Bounded frontend acceptance, 2026-11-23 (full recovery and T1.3 remain open):

- Baseline RED: network0 incorrectly cleared uncertainty; the expanded baseline
  suite failed16/19 cases for auth/malformed-success responses, sticky later
  rejection, nested mutation, context results and throwing callbacks. GREEN:
  27 hook cases and12 actual RestaurantPage cases passed, including the real
  TableForm's explicit0/403/400/success retry sequence with one immutable key/body.
- The core snapshots JSON before dispatch and parses a fresh body per attempt,
  preserves exact decimal strings, permits refreshed CSRF and refuses retries
  across user/organization/branch/path/method. It checks context again immediately
  before transport, suppresses late private results/callbacks and invalidates only
  the original tenant. Matching success clears uncertainty; a throwing consumer
  callback does not relock an acknowledged write or strand the duplicate guard.
- Current root regression:97 web files/842 tests, contracts18/116 and logs10 PASS.
  Root exit1 retained in `restaurant-command-root-test.log`: dev-stack's disposable
  Git-shell fixture could not create its temp directory. Read-only sandbox/path
  inspection followed by supported native escalation of the unchanged dev-stack
  test passed7/7,0 skipped (`restaurant-command-dev-stack-final.log`). No ACL or
  global configuration changed. Artifacts are in `.local/velopos-identity-20261122/`.
- Current `tsc -b --pretty false`, scoped ESLint, scoped Prettier and diff checks
  PASS. Vite build PASS (`restaurant-command-build.log`) with a chunk-size advisory;
  jsdom logged unsupported document navigation during the passing web suite.
  Independent reviewer inspected the supplied core, tests, contracts and matching
  evidence with no concrete findings or unmet bounded checks; reviewer ran no tools.
  Browser/device, reload durability, live provider and new database acceptance are
  not claimed. No production DOM/CSS, public contract, storage or schema changed.

Catalog private read authority (Large/High, bounded acceptance):

- [x] TDD independent missing/primary-only denial for taxonomy, product/list,
      barcode lookup, import-job and labels reads, including the inline labels path.
- [x] Acquire typed MFA before business locks and recheck before populated or
      empty private return, closing rows and discarding accumulated data on error.
      Preserve existing permissions, own-import visibility, exact prices and scope.
- [x] Verify actual isolated runtime-role denial, expiry/lock waits, cancellation,
      tenant/Owner/pinned-context cases, middleware contracts and unchanged state;
      run affected Go/client/static checks and independent review.

Scope: catalog read services/labels handler and matching tests/OpenAPI. All catalog
writers and other raw Authorized consumers remain separate pending work. No schema,
retained database, provider or UI change. Dependencies: accepted typed MFA core and
organization authorization; security specialist advice requested within existing
message-only authorization. Recovery keeps existing data and uses a compatible
forward build; this is not full mandatory-MFA or five-minute sensitive authority.

Bounded acceptance, 2026-11-23; full T1.3 remains open:

- Valid RED reproduced seven direct missing/primary-only disclosures and nine
  HTTP primary-only successes before the cutover. The final eight service
  entrypoints and nine GET routes now acquire typed MFA with their existing
  catalog.read, catalog.import or catalog.labels.print permission. Variants still
  delegate Product; labels prepare existing product data without printing.
- Actual runtime-role tests cover missing/primary/mismatched/foreign principals,
  active non-Owner and suspended membership, pinned deployment, nested tenant
  IDs and same-code foreign barcodes, creator-only imports, exact prices,
  pagination, empty/not-found responses and no-store. Real table-lock waits,
  count/projection/nested/final expiry and cancellation return zero data and
  metadata. Malformed import JSON and injected nested SQL failures disclose no
  partial results. Protected business/audit digests remain unchanged.
- `node .local/velopos-pickup-20261122/check-db.mjs full`: PASS300 entries,
  FAIL0/SKIP0,127.82s. The Catalog group passed in26.04s. Task-owned tmpfs
  PostgreSQL17.6/schema43, non-BYPASSRLS runtime role, empty downgrade/reapply,
  refused populated unsafe downgrade and verified container/network cleanup all
  passed. Evidence: `.local/velopos-identity-20261122/catalog-read-full.log`;
  valid RED and expanded focused evidence remain alongside it.
- Offline `go test -count=1 ./...` and `go vet ./...` passed with database flags
  cleared. Vitest organization-api/api/pos-api/CatalogPages: four files/59tests
  passed, including stable401/403 codes and no automatic retry on all nine read
  paths. TypeScript, scoped ESLint/gofmt/Prettier, contracts18/116 and diff checks
  passed. Offline unit results are separate from real database acceptance.
- Independent review accepted the supplied code/tests/evidence. Its P2 found
  OpenAPI overstated rechecks after aborted SQL; corrected all nine descriptions
  to distinguish usable-transaction rechecks from sanitized zero-payload aborted
  failures. Fresh contracts/format checks and focused re-review passed; reviewer
  executed no tools. No schema, public response shape, browser/device or live
  provider acceptance is claimed. Catalog writers and full authority/recovery
  remain pending.

Catalog mutation authority (Large/High, bounded acceptance):

- [x] Reproduce independent unassured mutation/replay access before changing
      taxonomy, product/variant, barcode and import writers.
- [x] Carry typed MFA through their transaction and nested write helpers; check
      after waits, between effects, before audit/private replay/commit and discard
      outward partial results on failures. Preserve permissions and exact values.
- [x] Verify disposable runtime-role denial/isolation, expiry/cancellation and
      atomic business/audit rollback, import replay/concurrency, current contracts
      and clients, then independent review before bounded acceptance.

Scope: all catalog mutation entrypoints and their package-private write helpers,
matching integration tests and existing HTTP/OpenAPI contracts. Main owns edits;
the existing security adviser and independent reviewer remain message-only.
Dependencies: accepted typed MFA/read gate. No schema, retained data, provider,
printing or UI change. Recovery preserves data with a compatible forward build;
commit uncertainty requires reconciliation using the original operation, not an
assumed rollback. Full five-minute authority/recovery and T1.3 remain pending.

Bounded acceptance, 2026-11-23; full migration remains open:

- Valid initial RED reproduced thirteen unassured mutation paths committing
  effects. All eight public writers now acquire typed MFA and pass the same
  authorization transaction through nested product, variant and barcode effects.
  Existing archive permissions, tenant predicates, creator-only imports, exact
  decimal values, revisions and import modes remain. Errors return zero outward
  data; usable transactions recheck domain errors, while aborted SQL keeps its
  existing error classification without a futile recheck. Completed same-mode
  import replay rechecks assurance and returns stored results without new effects.
- Runtime-role acceptance covers fifteen HTTP mutation routes with real
  cookie/Origin/CSRF and primary-only denial, plus SKIP/UPDATE confirmation modes.
  Direct tests cover missing/mismatched principals, non-Owner and suspended
  membership, pinned deployment and foreign nested references. Actual table-lock
  waits and post-effect expiry/cancellation roll back products, variants, primary
  demotion/promotion, import completion and audit together. A second-row barcode
  SQL failure rolls back earlier imported effects. Concurrent confirm produces one
  completion audit; replay/conflicting mode, creator isolation, prices, revisions,
  SKU immutability/uniqueness, last-active variant, taxonomy/base-unit and barcode-limit checks
  retain their existing behavior.
- `node .local/velopos-pickup-20261122/check-db.mjs full`: PASS378 entries,
  FAIL0/SKIP0,157.96s; mutation group30.17s. Task-owned tmpfs PostgreSQL17.6,
  schema43 and non-BYPASSRLS runtime role; empty downgrade/reapply, populated
  unsafe downgrade refusal/forward recovery and full-ID/label-verified cleanup
  passed. Evidence: `.local/velopos-identity-20261122/catalog-write-full-final.log`.
  Valid RED, focused and earlier full logs remain alongside it. One expanded
  run failed because category/brand HTTP fixtures supplied a unit-only field;
  corrected fixtures passed without relaxing production validation.
- Offline `go test -count=1 ./...` and `go vet ./...` passed. An initial sandbox
  run could not read a Go cache entry; supported escalation passed without ACL or
  configuration changes. Client/API/POS/CatalogPages Vitest passed four files and
  74 tests, including assurance errors and one-attempt ambiguous failures across
  fifteen mutation paths. TypeScript, scoped ESLint/gofmt/Prettier,
  contracts18/116 and whitespace checks passed. These are separate from real
  database acceptance. OpenAPI preserves response schemas and documents MFA,
  zero error payloads, creator/mode replay and commit uncertainty.
- The existing independent reviewer inspected the supplied scoped source,
  contracts, tests and matching evidence and accepted this bounded cutover with
  no concrete findings; it executed no tools. No schema, retained database,
  printing, browser/device or provider acceptance is claimed. Other retained
  consumers, sensitive five-minute authority, recovery UX and full T1.3 remain
  open. The user commits; no staging, commit, push or deployment was performed.

Customer writer authority (Large/High, bounded acceptance, 2026-11-23):

- [x] Add independent live MFA gates to Save, SaveGroup, Archive and Membership,
      covering seven routes plus creation replay and membership no-op results.
      Preserve normalized fingerprints, creator scope, revisions, archived-group
      removal, masking and atomic audit. Reuse typed authorization through waits,
      related writes, result reads and commit. Readers share the same gate.
- [x] Verify direct and cookie HTTP denial, Origin/CSRF, tenant and nested-object
      isolation, replay/conflict/concurrency, post-effect expiry/cancellation,
      late SQL failure and exact business/audit rollback on isolated runtime DB.
      Run matching Go, client/contract/static checks and independent review.

Scope excludes POS selection, schema, providers and UI. Recovery uses a compatible
forward build preserving records. Uncertain commit errors return zero payload;
they do not prove rollback. T1.3 and the full migration remain incomplete.

Matching evidence, 2026-11-23:

- RED demonstrated direct creation/update and replay without a live MFA session.
  A separate valid membership no-op RED returned success without a session before
  any other RED mutation changed fixture revisions. The four entrypoints now
  independently acquire typed MFA. The old raw customer begin helper is removed;
  prior readers mechanically use the renamed shared beginMFA helper. The same
  authorization transaction rechecks before effects, between membership writes,
  before private replay/no-op results and before/after audit before commit. All
  failures return zero Customer/Group or nil Archive payload.
- Isolated acceptance covers all ten service variants and seven real cookie
  HTTP routes, missing/primary-only/mismatched/revoked sessions, removed/Manager/
  suspended memberships, pinned deployments, cross-tenant and mixed customer/group
  references, Origin/CSRF and no-store. Actual customer/group table locks and
  query-end expiry/cancellation cover creation lookup, each write, both membership
  directions, final reads, replay/no-op results and audit. Exact business/history/
  audit digests match after every rollback. Five real aborted SQL projections or
  audit failures discard partial results and effects. Middleware session-use
  metadata is deliberately outside the business snapshot.
- Creation replay returns the current resource/revision without new effects;
  changed normalized input conflicts. Matching concurrent creates return one ID
  and one audit event; the same key under another synthetic Owner creates an
  independent resource. Stale Save/SaveGroup/Archive and membership revisions
  conflict. Concurrent membership change yields one success and one conflict.
  Adding to an archived group fails even if already present; removing from it
  increments only the active customer. Archiving preserves membership/history;
  archived-customer no-op requests still fail validation. Both membership
  permissions remain required; current Owner-only roles do not expose a role
  with only one of those permissions, so no artificial permission seam was added.
- `node .local/velopos-pickup-20261122/check-db.mjs full`: PASS536 entries,
  FAIL0/SKIP0,205.70s; customer writers30.61s and prior customer reads17.13s.
  PostgreSQL17.6/schema43, actual non-super/non-BYPASSRLS runtime role, unique
  task-owned tmpfs container/internal network, no host ports or retained volume.
  Empty downgrade/reapply, populated unsafe downgrade refusal/forward recovery,
  and exact-ID/label cleanup passed. Evidence:
  `.local/velopos-identity-20261122/customer-write-full.log`.
- Fresh offline `go test -count=1 ./...` and `go vet ./...` passed. Vitest passed
  three files/58 tests, including all thirteen customer read/write method/path
  cases retaining assurance errors, same-origin cookies, AbortSignal and mutation
  body/CSRF. TypeScript, scoped ESLint/gofmt/Prettier, contracts18/116 and diff
  whitespace checks passed. Existing OpenAPI request/success schemas are retained;
  seven writer descriptions/403 contracts now describe MFA. Evidence includes
  `customer-write-go-final.log` and `customer-write-vet.log` in the same directory.
- Intermediate failures remain recorded: stale-update test used invalid revision0
  instead of prior revision1; corrected test passed with no production change.
  A wrong working-directory path caused a missing-helper compile failure before
  the two history callsites were renamed correctly. One contract-edit command
  failed parsing without editing files; the corrected bounded edit passed. An
  offline Go run hit a sandbox cache access denial; supported escalation passed
  without ACL/configuration changes. No assertions or runtime grants weakened.
- The existing independent reviewer inspected supplied scoped source, tests,
  contracts and matching evidence, finding no concrete defects or unmet bounded
  checks. Reviewer executed no tools, shell, network, filesystem writes or
  delegation. No browser/device, race-detector, provider, real Admin, primary or
  retained-data acceptance is claimed. User commits; no staging/commit/push/deploy.

Customer read authority (Large/High, bounded acceptance, 2026-11-23):

- [x] Reproduce independent denial failures for Get, List, Groups, History and
      Audit, including the POST search route sharing List.
- [x] Add typed read-only MFA authorization; preserve writer paths, tenant and
      branch predicates, masking and exact historical amounts. Close rows before
      rechecking and return zero private data/metadata on failures.
- [x] Verify real runtime-role positive/negative/isolation, lock expiry and
      cancellation, partial-result suppression, HTTP/CSRF/client contracts and
      unchanged business state; obtain independent scoped review.

Main owns customer service/HTTP, matching tests/contracts and this tracker.
Existing security adviser and reviewer are message-only; no tools or delegation.
Dependencies: accepted typed organization authorization. No schema, provider or
UI change. Recovery is a compatible forward build preserving existing data;
reverting only this slice's local delta does not require a database downgrade.
Customer writers were outside this read checkpoint and are accepted above.
POS selection helpers and full T1.3 remain separate pending work. The historical
read evidence below is superseded for integrated source by the writer run above.

Bounded evidence, 2026-11-23; full migration remains open:

- Valid RED: all five service readers returned data for missing, primary-only
  and mismatched session contexts (fifteen failures). Get, List, Groups, History
  and Audit now independently acquire the existing typed MFA transaction. The
  original writer helpers and POS selection paths are unchanged. All outward
  read failures return zero data and pagination/summary metadata. Rows close
  before rechecks; aborted SQL preserves sanitized error classification without
  attempting assurance queries in a failed transaction. HTTP maps assurance
  failures to401 UNAUTHENTICATED or403 MFA_REQUIRED with no data and no-store.
- Acceptance covers all six routes with actual cookie/Origin/CSRF, direct
  principal and membership denial, pinned deployment, foreign customer/group/
  branch identifiers, stale revoked context, real table-lock expiry/cancellation,
  interruptions after counts, customer lookup, history summary and accumulated
  rows, final-check cancellation and four aborted SQL projections. Organization-
  scoped business/history/audit digests remain unchanged after reads and faults.
  Real Catalog/POS fixture settlement verifies exact10.00 history, inclusive
  date boundaries and branch filtering. Existing group counts, search escaping,
  pagination and Owner contact fields remain. Audit retains customer-object and
  event-prefix scope and its existing lack of branch/date filtering. No stronger
  multi-query snapshot or malformed-JSON/scan-fixture coverage is claimed.
- `node .local/velopos-pickup-20261122/check-db.mjs full`: PASS437 entries,
  FAIL0/SKIP0,175.98s; customer group17.20s. PostgreSQL17.6/schema43, actual
  non-super/non-BYPASSRLS runtime role, unique task-owned tmpfs container/internal
  network, no host ports or retained volumes. Empty downgrade/reapply, populated
  unsafe downgrade refusal/forward recovery and full-ID/label cleanup passed.
  Evidence: `.local/velopos-identity-20261122/customer-read-full.log`; valid RED
  and focused logs remain in `.local/velopos-pickup-20261122/customer-read-*.log`.
- Offline `go test -count=1 ./...` and `go vet ./...` passed; ordinary Go tests
  do not replace the separate database run. Vitest passed three files/51 tests
  (customers-api, organization-api, api), including six actual client method/path
  cases retaining status/code, one request, cancellation signal and body-only
  search/CSRF. TypeScript, scoped ESLint/gofmt/Prettier, contracts18/116 and diff
  whitespace checks passed. Shared suite deadline increased to four minutes
  (browser mode five) for added deliberate expiry waits; runner timeout unchanged.
- Intermediate fixture failures are retained: incorrect Context branch field and
  customer-ID pointer, a reused source fixture requiring an absent storefront,
  and42501 when attempting exclusive locks on read-only sales/audit tables.
  Fixtures now use actual Catalog/POS APIs and customer-lookup locks; history and
  audit query boundaries also have explicit interruption/fault checks. Runtime
  grants, production validation and assertions were not weakened.
- The existing independent reviewer inspected supplied source, contracts, tests
  and matching evidence and found no concrete issue or unmet check for this
  bounded slice; it used no tools. No schema, primary/retained database, UI,
  browser/device, race-detector or live-provider acceptance is claimed. Full
  customer writer/POS selection, sensitive five-minute authority, recovery and
  T1.3 acceptance remain open. User commits; no staging/commit/push/deploy occurred.

Persistence checks on task-owned tmpfs PostgreSQL 17.6, 2026-11-22:

- Schema40 RED rejected the new MFA scope; schema41 enrollment and challenge
  tests GREEN. Confirmed OTP replay/concurrency commits one effect and audit.
  Five failed attempts remain limited even when their proof transaction rolls back.
- Real expired-factor, unknown-key and tampered-ciphertext fixtures deny access.
  Admin-injected audit failure rolls back begin, activation/recovery creation and
  challenge/assurance together. Durable fixture helper:
  `scripts/mfa-acceptance-fixtures.mjs`; explicit test target marker required.
- Lock regression RED reproduced PostgreSQL 40P01 when logout and MFA crossed
  session/user/audit FK locks. User `FOR NO KEY UPDATE` correction GREEN; existing
  login/reset/logout code is unchanged. Password reset retains factor and recovery
  verifiers while revoking sessions. Foreign, unverified, disabled, expired and
  revoked-session cases deny enrollment/elevation.
- Independent review found that session-lock waits could retain stale primary,
  expiry and proof-clock checks. Three real PostgreSQL regressions reproduced
  RED across a held lock followed by rollback. Separate post-lock eligibility
  and database-time reads made all three GREEN; Logout lock compatibility stayed
  GREEN. Re-review found no remaining concrete findings. Final matching isolated
  MFA/retained-upgrade/failure-fixture/downgrade checks, offline Go suite (identity
  1.362s), vet and formatting PASS. Reviewer used supplied scoped source/evidence
  only, with no tools, shell, network, writes or delegation.
- Synthetic retained schema40 identity/session/reset/audit/rate-limit/Google rows
  retain exact counts and sorted-content digests through schema41 upgrade and
  empty-MFA down/reapply. No legacy session acquires assurance. Populated MFA
  downgrade refuses and retains state; recovery is a compatible forward build.
- Final offline `go test ./... -count=1`, `go vet ./...`, changed-Go formatting,
  root `npm test` (90 web files/759 tests, contracts18/115, logs10, dev-stack7),
  scoped Prettier and diff whitespace PASS. Fresh schema41 full isolated existing
  storefront suite: 194 PASS entries, zero FAIL/SKIP, payment/hold/queue/isolation
  and Pickup guards retained. Browser/device and race detector not run.
- Artifacts: `.local/velopos-identity-20261122`; isolated runs use random labels,
  internal network, no host ports/retained volumes/downloads, and full-ID/label
  cleanup. Schema41 broad legacy regression is in the Pickup scratch full log.
  No primary/retained database, actual secret, Admin grant or deployment changed.

## Execution boundary

All 92 decisions are approved scope. Task numbering is proposed engineering
sequencing, not an approved MVP or a demotion of advanced features. T6 tracks are
parallel capability tracks after their actual prerequisites, not post-release
candidates. No task may introduce mixed-restaurant baskets, food commissions,
platform riders, staff/co-owners, ingredient inventory requirements, LINE,
scheduled pickup, referral rewards or Scope 93 media management.

Use [ ] pending, [/] in progress, [?] blocked and [x] only for verified gates.
This existing task plan is the scope tracker; no duplicate root TODO is created.
Task owners below are future responsibilities, not dispatched agents. Any future
multi-owner task must be split into disjoint write scopes before authorized
dispatch. No model/provider/delegation authorization is inferred from this plan.

Preserve unrelated work and all retained records/applied migrations. Inspect
actual commands/fixtures/targets before tests. No primary DB reset, push, remote
branch, billable service, data transmission, deployment or persistent monitor
without exact authorization. Local commits require an explicit commit request.
Actual auth/tenant/secrets/financial/transaction/concurrency/migration and blast-
radius control changes require applicable TDD, multilayer checks and separate
independent review. Reviewer availability/authorization is a required gate, not
permission to dispatch. Main self-review does not replace it.

The following test cases and file scopes are future plans, not tests already
implemented/run. New module names, schema fields, public signatures and policy
values are not silently approved here. B01 Option A is user-approved; resolve
affected B02-B16 and compatibility acceptance before any authorized coding.

## Phase 0. Requirements and compatibility gate

<a id="t0-1"></a>

### T0.1 Import and reconcile approved baseline

- [x] Verify 92 unique ordered IDs VLP-001 through VLP-092, matching Scope numbers,
      decisions A/B/C/D, non-placeholder approved statements and verification intents.
- [x] Replace all old unverified target slots in requirements.md with exact source
      statements/selections, current bounded evidence and explicit gaps.
- [x] Map every approved item to defined D01-D16 design ownership and one or more
      executable future tasks without inventing a priority or reduced MVP.
- [x] Record source identity/date/hash, approval provenance limits, current HEAD
      and unresolved policy/provider details; preserve the source register unchanged.

Files: requirements.md, design.md, tasks.md. Source: approved-requirements.md
(read only). Dependencies: none.
Acceptance: all 92 have source-backed statements and no target requirement is
inferred from current code. Implementation status is separately evidence-based
and does not imply runtime acceptance.

Reassessment: **PASS for the source/import/reconciliation gate**, 2026-11-19
(Asia/Bangkok). The old missing-register blocker is resolved by the user-supplied
register at the requested repository path. The former request for unprovided
item priorities/dependencies is not treated as a reason to invent them or block
an otherwise complete source import. Exact document checks are recorded in the
verification section; no feature/application test PASS is claimed.

<a id="t0-2"></a>

### T0.2 Resolve only remaining dependent decisions

- [x] B01 mapping selected by user on 2026-11-19: Option A, one organization per restaurant; one Owner may manage separate organizations. This closes the mapping decision only.
- [?] B02-B16 in requirements.md remain unresolved as recorded.
- [ ] Record product/provider evidence for the policy inputs needed by a selected
      slice; do not reopen already settled product scope.
- [ ] Review proposed technical mapping, state/transaction contracts and task
      ordering before implementation. Preserve explicit TBDs for unaffected work.

Files: requirements.md, design.md, tasks.md. Dependencies: T0.1.
Acceptance: each selected task has its required decisions/evidence and does not
use guessed rates, durations, provider capabilities, authority or scope.
Status: BLOCKED for the affected decisions, not for the now-complete import gate.

<a id="t0-3"></a>

### T0.3 Freeze compatibility and validation targets

- [x] Capture current HEAD 99afebaa8b2f1287ed61035339f5cf55b0dbfab0 on
      feature/fix-system- with no initial Git changes reported.
- [x] Read current schema-required version 39 and highest migration 39; count
      18 route modules and 115 route entries. Neither proves live schema or parity.
- [x] Inspect root validation script names/effects; do not run application
      integration/build/browser checks for a documentation-only reconciliation.
- [ ] Confirm selected slice baseline, live dependencies, explicit disposable DB
      target ownership/recovery and safe test environment before implementation.

Files: source evidence E01-E17 (read only); future scoped compatibility/runbook
notes if required. Dependencies: T0.1; selected B01/T1.1/T2.1 decisions.
Acceptance: reproducible source and runtime target evidence for the selected
slice, no mixed user changes or assumed disposable retained data.
Status: PARTIAL preparation; database/runtime/route-parity acceptance not run.

## Implementation and acceptance tasks

Each task preserves the global constraints and exact requirements linked from
requirements.md. Independent capability tracks must integrate before their
shared release acceptance; this is not a license to implement them now.

<a id="t1-1"></a>

### T1.1 Define aggregates and independent lifecycles

- [ ] Define restaurant identity, separate payment/kitchen/fulfillment states, verified completion, immutable snapshots, transaction boundaries and lock order. Resolve equal-paid-time and delayed earlier-payment dispatch before queue implementation.
- [x] Planning checkpoint recorded: current ownership facts, Options A/B, compatibility boundary, lifecycle frame and required evidence are documented in [D01](design.md#d01). User subsequently selected B01 Option A on 2026-11-19; implementation acceptance remains pending.
- [x] Static inventory checkpoint: D01 records 12 inspected boundary groups, draft-only source guards, distinct dining/operational tables, prepayment tickets versus paid kitchen eligibility, POS coupling and cache dependencies. Tests are seams only, not executed acceptance.
- [x] Settled Option A design-only deliverables reviewed on 2026-11-19: independent lifecycle vectors, atomic boundaries and the expanded source-based transitive planning graph in D01. Runtime lock behavior is not proven by this graph; B04 dispatch policy remains deferred separately.
- [x] Design-draft checkpoint: Option A aggregate/constraint and independent lifecycle tables now cover tenant ownership, immutable snapshots, replay/stale revision, unknown payment, kitchen eligibility, handover, corrections and refund boundaries. These are engineering proposals pending review, not implemented behavior.
- [?] B04-dependent queue-policy design remains deferred: equal-time/late-earlier-paid dispatch and provider evidence/completeness guarantees require an approved decision. This does not block acceptance of the settled design-only package. No legacy test-card behavior establishes production-provider guarantees.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: architect. Dependencies: T0.1; approved B01 Option A; resolve B04.
Design: [D01](design.md#d01), [D02](design.md#d02), [D06](design.md#d06), [D07](design.md#d07), [D08](design.md#d08), [D09](design.md#d09).
Future files: specs/velopos-migration/design.md; docs/architecture (future scoped design).
Acceptance: Reviewed transition/ownership tables cover valid/invalid transitions, stale revisions, replay, provider unknown, refunded work, cross-tenant access and late-event recovery. No linear state chain may imply Ready=Completed or receipt=Paid. Design-only acceptance records the source-based graph and future test requirements, not executed DB behavior. T1.2 wire contracts and T1.3 detailed authority/recovery contracts are downstream obligations, not circular prerequisites for recording this architecture. Full T1.1 closure still requires resolution of its policy inputs and applicable implementation checks.

<a id="t1-2"></a>

### T1.2 Specify versioned contracts for each selected slice

- [ ] Inventory affected producers/consumers and define approved request/response/error/event projections, pagination and idempotency. Extend existing contracts or introduce compatible restaurant-native contracts only after ownership is settled.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: backend-engineer. Dependencies: T1.1; affected policy inputs.
Design: [D01](design.md#d01), [D05](design.md#d05), [D14](design.md#d14).
Future files: packages/contracts/openapi.yaml; packages/contracts/routes.json; apps/api/internal/transport; apps/web/src/lib.
Acceptance: Every changed route has a producer, consumer and contract test; no guessed public endpoint or destructive compatibility removal. Partner APIs cannot create orders.

<a id="t1-3"></a>

### T1.3 Define customer, Owner, Admin and guest authority

- [ ] Specify single active Owner, platform Admin capabilities, customer/guest proof, required MFA/reauth/recovery, context revocation and legacy branch isolation. No new staff/co-owner module.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: security-auditor. Dependencies: T1.1; approved B01 Option A; resolve B12.
Design: [D05](design.md#d05), [D12](design.md#d12).
Future files: docs/security/security-model.md; apps/api/internal/modules/organization (future scope); apps/web/src/app (future scope).
Acceptance: Positive/negative matrix covers every protected query/command/stream/attachment/export, stale/revoked sessions, cross-restaurant access and MFA recovery bypass. Independent review required before control changes.

<a id="t2-1"></a>

### T2.1 Choose additive restaurant schema compatibility

- [x] Design-only Option A package reviewed: organization remains tenant/restaurant identity with retained branch FKs/callers. D01 records proposed storage/keys, constraints, adapter rules, lock impact and recovery strategy. Actual schema/data acceptance remains pending.
- [x] Planning checkpoint recorded: migration 000001-000039 compatibility rules, additive sequencing, backfill evidence, RLS/FK/unique constraints and forward-recovery requirements are documented in [D01](design.md#d01). B01 Option A is now user-approved; no migration is authorized.
- [x] Static schema checkpoint: D01 distinguishes org-native setup/menu/drafts from NOT NULL branch/terminal/location order FKs, immutable source/order identities and branch queue keys. A branch adapter alone cannot enable draft checkout.
- [x] Reviewed the specified additive source/table/queue compatibility, explicit mapping dispositions, resumable checkpoint/cutover/recovery contract and DB-01 through DB-14 acceptance plan in D01. No legacy mapping or fake infrastructure row is invented.
- [x] Design-draft checkpoint: D01 records an eight-phase target/classification/rehearsal/backfill/history/comparison/cutover/recovery runbook, source-kind/table-family boundaries and explicit exception handling. No backfill or schema operation ran.
- [ ] Future implementation/schema acceptance requires actual retained-data classification, a confirmed isolated disposable target, separately authorized implementation/execution and the relevant T1.2/T1.3 contracts. These are not prerequisites for accepting the compatibility/backfill design and DB acceptance specification. DB-11 remains deferred under B04; all 14 cases are NOT RUN.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: database-engineer. Dependencies: T1.1; approved B01 Option A; T1.3 integration before implementation; compatibility/data acceptance pending.
Design: [D01](design.md#d01).
Future files: database/migrations (read current, future additive files); docs/database.
Acceptance: Design-only acceptance requires reviewed mapping/disposition rules, atomic resumable batches, drift handling, one-writer cutover/callback ownership and explicit DB acceptance cases. Full schema acceptance requires evidence that the one-organization-per-restaurant mapping preserves retained retail/history obligations without fake locations or duplicated queues. Approval is not evidence that existing data already fits; verify legacy exceptions and recovery before cutover.

#### T1.1/T2.1 closure evidence matrix

| Gate                                                     | Current result                             | Required evidence / owning dependency                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approved identity and source integrity                   | PASS, static                               | User selected B01 A; preserve all 92 approved statements/selections/intents and the source hash.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Settled design-only package                              | PASS, bounded independent planning review  | D01 includes storage/constraint proposals, lifecycle vectors and atomic boundaries, source-based transitive graph/direct-writer obligations, mapping/checkpoint/cutover/recovery rules and 14 DB acceptance specifications. Source inspection does not prove runtime correctness.                                                                                                                                                                                                                                                             |
| Paid-time FIFO/ETA policy                                | BLOCKED                                    | B04 equal-time and late earlier-paid dispatch policy, authoritative evidence/completeness guarantees with B02 where needed, and ETA/load acceptance inputs. No guessed wait duration or FIFO exception.                                                                                                                                                                                                                                                                                                                                       |
| Authority/contract compatibility                         | DOWNSTREAM, before affected implementation | T1.3 authority and affected B12 recovery decisions; T1.2 exact API/event projections and changed callers. Undefined authority denies; do not reopen single-Owner scope or remove retained memberships. These obligations do not prevent recording architecture.                                                                                                                                                                                                                                                                               |
| Fresh/retained schema, isolation, replay and concurrency | NOT RUN, future implementation gate        | DB-01 through DB-14 specify preflight, fixtures/actions and assertions/evidence. No target, implementation or execution is authorized here. DB-11 policy-dependent assertions remain DEFERRED B04. Missing DB execution is not a design-document failure.                                                                                                                                                                                                                                                                                     |
| Independent correctness/security/schema review           | PASS for settled design-only delta         | On 2026-11-19 the authorized independent reviewer inspected supplied design/task text, source excerpts and static evidence without tools, shell, network, writes or sub-delegation. Initial corroboration gaps for validation locks, triggers/deferred constraints, direct-writer entries and provider guards were resolved by additional source excerpts. Consolidated verdict: PASS, no identified actionable defect. Neither this nor the earlier resolved late-Paid finding certifies unexecuted schema/runtime behavior or approves B04. |

Existing test seams for the future isolated run include storefront payment_checkout_integration_test.go, payment_holds_integration_test.go, payment_reconciliation_integration_test.go, payment_prepaid_integration_test.go, queue_integration_test.go and queue_schema_integration_test.go, plus the inventoried branchless setup/menu/catalog tests. Inspect their target selection and effects before choosing an exact command. Existing legacy tests do not assert the proposed native schema or production provider model. No test execution or PASS is inferred from a filename.

<a id="t2-2"></a>

### T2.2 Add only the selected slice migrations

- [ ] Add scoped keys, uniqueness, immutable ledger/event links, RLS/check/index constraints and readiness updates needed by the selected slice. Recheck latest version before allocating; never edit applied 000001-000039.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: database-engineer. Dependencies: T2.1,T1.2; slice policy inputs.
Design: [D01](design.md#d01), [D06](design.md#d06), [D07](design.md#d07), [D08](design.md#d08), [D09](design.md#d09), [D10](design.md#d10), [D13](design.md#d13).
Future files: database/migrations (next unused versions); apps/api/internal/platform/database; tests/integration.
Acceptance: Fresh and retained-schema-39 upgrades pass against confirmed isolated task-owned targets. Verify counts/hashes of preserved data, denial paths, duplicate/replay and race constraints. No assumed disposable primary DB.

<a id="t2-3"></a>

### T2.3 Prove migration rollback refusal and forward recovery

- [ ] Exercise empty-target reapply where supported; refuse populated destructive rollback and document forward recovery for partial/dirty states with named operator ownership.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: database-engineer. Dependencies: T2.2.
Design: [D01](design.md#d01), [D16](design.md#d16).
Future files: database/migrations; owning migration tests; docs/database.
Acceptance: Captured fresh/retained and recovery outputs show no business-data loss. Unavailable database acceptance stays BLOCKED, not substituted by static SQL checks.

<a id="t3-1"></a>

### T3.1 Implement verified setup, menus, modes and table sessions

- [ ] Build Admin-verifiable setup, identity/site/receiving-account approval, independent restaurant context, four service modes, opening schedules, global/per-mode pause and private persistent table QR sessions. Add modifier-capable menu foundation with T3.7.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: backend-engineer. Dependencies: T1.2,T1.3,T2.2; resolve B02/B10 as applicable.
Design: [D02](design.md#d02), [D03](design.md#d03).
Future files: apps/api/internal/modules/restaurant; apps/api/internal/modules/storefront; apps/api/internal/modules/organization.
Acceptance: Tests reject selling before approval, unsafe account changes and cross-restaurant access. Pause does not stop paid work. Same-table orders remain separate; fresh session cannot see previous private data. Replay/stale revision/concurrent setup pass.

<a id="t3-2"></a>

### T3.2 Implement persistent carts and single-restaurant checkout intents

- [ ] Persist scoped checkout intent/key/fingerprint and immutable order snapshots. Revalidate current menu/options/prices/modes and separate cart save from payment reservations. Guest device carts and member sync integrate with T6.4.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: backend-engineer. Dependencies: T3.1,T1.2,T2.2; resolve B14.
Design: [D06](design.md#d06), [D10](design.md#d10).
Future files: apps/api/internal/modules/storefront; apps/api/internal/modules/restaurant; apps/web/src/lib.
Acceptance: Tests cover mixed-restaurant rejection, changed-payload key conflict, identical/concurrent retry returning the same order, stale price/option/quote, empty cart, saved-cart conflict/expiry and table-session isolation. No scheduled pickup or automatic payment.

<a id="t3-3"></a>

### T3.3 Implement merchant-direct PromptPay and safe recovery

- [ ] Replace test-only assumptions for the selected new flow with verified merchant-direct PromptPay. Persist callback/query evidence and real paid time, global timeout, periodic reconciliation, same-order safe retry and degraded-mode recovery. Separate platform billing.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: backend-engineer. Dependencies: T3.2,T2.2; resolve B02/B03; quota integration T3.7.
Design: [D07](design.md#d07).
Future files: apps/api/internal/modules/storefront/payment_*.go; apps/api/internal/platform (selected provider adapter); owning tests.
Acceptance: Tests cover forged/mismatched callbacks, duplicate callback/query, concurrent retry, missing/late callback, amount/currency/merchant mismatch, paid-within-window recovery, unknown holds, safe confirmed-unpaid release, no new QR while unknown, outage/reopen and rollback. Provider capability acceptance remains BLOCKED without real evidence.

<a id="t3-4"></a>

### T3.4 Implement paid-time FIFO, ETA, delay and correction

- [ ] Use one restaurant queue across four modes ordered by verified paid time. Maintain paid/hold/refund/reconciliation eligibility, whole-order kitchen state, dynamic ETA, owner delay reports and audited allowed status corrections.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: backend-engineer. Dependencies: T3.3,T2.2,T1.1; resolve B04/B15.
Design: [D08](design.md#d08).
Future files: apps/api/internal/modules/restaurant/queue.go; apps/api/internal/modules/storefront/orders.go; queue/schema/integration tests.
Acceptance: Tests include out-of-order callbacks, equal paid times, period rollover with unfinished work, one queue identity, unpaid/refund/FULFILLMENT_REVIEW exclusion, concurrent allocation/transition, Ready-to-Preparing correction before handover and Admin review afterward. No overload alert/auto-pause or rewritten FIFO time.

<a id="t3-5"></a>

### T3.5 Implement handover, self-delivery, No-Show and receipts

- [ ] Verify channel-specific handover and independent completion. Add restaurant-radius/flat-fee prepayment validation, owner delivery status/ETA, Pickup/Takeaway No-Show evidence and numbered paid receipts/kitchen-ticket print data.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: backend-engineer. Dependencies: T3.3,T3.4,T1.3; resolve B15; refund references T3.6.
Design: [D09](design.md#d09).
Future files: apps/api/internal/modules/restaurant; apps/api/internal/modules/storefront; apps/api/internal/modules/pos (compatibility only); owning tests.
Acceptance: Tests deny wrong/replayed handover codes, out-of-area checkout and completion from Ready/No-Show alone. No-Show grants no points/review/auto-refund. Preserve payment/receipt history and refund references; printing has no order/status side effect. No mandatory thermal/e-Tax.

<a id="t3-6"></a>

### T3.6 Implement customer cancellation, amendment and manual food refunds

- [ ] Separate pre-Preparing customer request/merchant approval from merchant inability-to-serve exceptions. Require customer-approved non-increasing amendments, manual full/partial/difference food refunds, deadlines/reminders/escalation and evidence disputes.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: backend-engineer. Dependencies: T3.2,T3.3,T3.5; resolve B07/B09; support T6.7.
Design: [D09](design.md#d09).
Future files: apps/api/internal/modules/storefront; apps/api/internal/modules/restaurant; apps/api/internal/modules/returns (legacy boundary); owning tests.
Acceptance: Tests reject unilateral/increasing/post-Preparing routine amendments, preserve original paid/FIFO time, adjust reserved/earned benefits once, and keep support open when merchant proof does not establish receipt. No provider/platform-funded food refund in the new flow.

<a id="t3-7"></a>

### T3.7 Implement promotions, quotas and benefit reservations

- [ ] Add restaurant promotion/coupon eligibility and limits, optional menu/modifier quotas, real-time availability and atomic menu-plus-option/coupon/points reservation at payment.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: backend-engineer. Dependencies: T3.1,T3.2,T2.2; resolve B09/B14; integrate T3.3/T6.5 before acceptance.
Design: [D03](design.md#d03), [D06](design.md#d06).
Future files: apps/api/internal/modules/pricing; apps/api/internal/modules/restaurant; apps/api/internal/modules/storefront; apps/api/internal/modules/loyalty.
Acceptance: Concurrent tests cannot oversell/exceed usage; one coupon XOR points with promotion price; changed/sold-out option requires customer reconfirmation. Unknown retains all reservations; confirmed unpaid releases once. No ingredient inventory prerequisite.

<a id="t3-8"></a>

### T3.8 Implement secure transfer, suspension and archival

- [ ] Add verified recovery/transfer with one active Owner and session revocation, warning/suspension/revocation/appeal, owner-requested closure, obligation review, Admin archive/reopen.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: backend-engineer. Dependencies: T1.3,T3.1; resolve B10/B12/B13; obligation integration T6.5/T6.7/T6.8/T6.9.
Design: [D05](design.md#d05), [D12](design.md#d12).
Future files: apps/api/internal/modules/organization; apps/api/internal/modules/restaurant; lifecycle/identity tests.
Acceptance: Race/denial tests prevent dual owners, unverified receiving-account replacement and stale-owner access. Suspended/archived paths stop new selling/ad spend while preserving paid work/refunds/support/wallet/points/history. No automatic balance/liability transfer or deletion.

<a id="t3-9"></a>

### T3.9 Implement immutable menu history and CSV/Excel bulk editing

- [ ] Reuse safe parsing/preview seams for approved restaurant categories/options/toppings. Add duplicate/error outcomes, price/category/status bulk changes, revision/audit and restore-as-new-revision.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: backend-engineer. Dependencies: T3.1,T3.7,T1.3; resolve B16.
Design: [D03](design.md#d03).
Future files: apps/api/internal/modules/catalog/imports.go; apps/api/internal/modules/restaurant; revision/import tests; future scoped web menu UI.
Acceptance: Tests cover malformed/duplicate/wrong-tenant input, selected transactional error semantics, replay/stale revision and immutable paid snapshots. Pending carts revalidate changed price/options/availability. No new media-management scope.

<a id="t4-1"></a>

### T4.1 Build verified setup and menu management UI

- [ ] Reuse existing provider/layouts/tokens. Expose pending approval/reverification, four modes, per-mode pause, table privacy, modifier/menu availability and controlled bulk-edit outcomes.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: frontend-engineer. Dependencies: T3.1,T3.7,T3.9,T1.2.
Design: [D02](design.md#d02), [D03](design.md#d03), [D16](design.md#d16).
Future files: apps/web/src/features/organization; apps/web/src/features/restaurant; owning API clients/tests.
Acceptance: Component/browser checks cover loading/empty/error/recovery, long labels, stale revision, keyboard/focus and 360/390/1280px plus tablet. No hidden retail prerequisite or ingredient-stock requirement.

<a id="t4-2"></a>

### T4.2 Build customer discovery, cart and payment recovery UI

- [ ] Show approved discovery, single-restaurant cart/quote, Guest/member modes, current availability, radius rejection, countdown/checking/unknown recovery and support. Do not infer Paid from redirect/slip or expose tokens in public views.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: frontend-engineer. Dependencies: T3.2,T3.3,T3.5,T6.1,T6.4; relevant T6.6/T6.12.
Design: [D04](design.md#d04), [D06](design.md#d06), [D07](design.md#d07), [D09](design.md#d09).
Future files: apps/web/src/features/storefront; apps/web/src/layouts/StorefrontLayout.tsx; API clients/tests.
Acceptance: Component/browser cases cover empty directory, stale price/option, expired cart, concurrent edits, duplicate submit, provider outage, money-debited unknown and safe retry on the same order. Mobile/keyboard/recovery checks required.

<a id="t4-3"></a>

### T4.3 Build Owner queue, fulfillment and exception UI

- [ ] Display independent payment/kitchen/fulfillment, FIFO and ETA, delays/corrections, handover, No-Show, refund obligations and protected paused/suspended work.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: frontend-engineer. Dependencies: T3.4,T3.5,T3.6,T3.8; notifications T6.6.
Design: [D08](design.md#d08), [D09](design.md#d09), [D11](design.md#d11).
Future files: apps/web/src/features/restaurant; apps/web/src/features/storefront/OnlineOrderPages.tsx; tests/e2e.
Acceptance: Browser tests prove UI cannot bypass server eligibility/permissions, Ready is not completion, wrong code fails, correction appends history and refunded/review-blocked work stays excluded. Check empty/error/stale/long-content and responsive focus.

<a id="t4-4"></a>

### T4.4 Reconcile navigation and legacy route disposition

- [ ] Classify active/compatibility/planned/deprecated routes against approved Customer/Owner/Admin journeys. Preserve retained callers and deny retired staff/co-owner entry without adding a new staff module.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: frontend-engineer. Dependencies: T1.2; affected T4/T6 surfaces.
Design: [D01](design.md#d01), [D05](design.md#d05).
Future files: packages/contracts/routes.json; apps/web/src/app; apps/api/internal/transport; route tests.
Acceptance: Inventory, Go/OpenAPI and React consumers have no unexplained mismatch. Direct-link denial and context-change cache tests pass. Removal requires replacement acceptance, not a renamed navigation label.

<a id="t5-1"></a>

### T5.1 Run focused unit, contract and build checks

- [ ] Inspect actual scripts/effects, then run focused Go/React tests and npm run contracts:check; expand to affected typecheck/lint/build checks. Inspect current target selection before running any integration script.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: test-engineer. Dependencies: Selected implementation slice and integrations complete.
Design: [D01](design.md#d01), [D16](design.md#d16).
Future files: Existing owning Go/React tests; scripts/check-contracts.mjs; package.json.
Acceptance: Fresh exact commands/exit codes/case counts match changed inputs. Root npm test is a composite web/contracts/log/dev-stack suite, not DB/browser/provider acceptance. Failures are not dismissed as historical without evidence.

<a id="t5-2"></a>

### T5.2 Run isolated database and retained-data acceptance

- [ ] Confirm task-owned disposable target and inspect fixture/startup/cleanup effects first. Run fresh/retained migration, tenant/RLS, constraints, replay, concurrency, transaction rollback and forward recovery cases.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: test-engineer. Dependencies: T2.2,T2.3; affected payment/queue/ledger implementation.
Design: [D01](design.md#d01), [D06](design.md#d06), [D07](design.md#d07), [D08](design.md#d08), [D10](design.md#d10), [D13](design.md#d13).
Future files: tests/integration; owning Go integration/schema tests.
Acceptance: Current outputs prove no duplicate financial/quota/points/queue effect and preserved legacy records. No primary/retained database or volume is reset. Missing target/authorization is BLOCKED.

<a id="t5-3"></a>

### T5.3 Run browser, language and accessibility acceptance

- [ ] Exercise primary/negative/recovery journeys at 360px, 390px, 1280px and representative tablet with zoom, long Thai/English content, keyboard/focus, screen-reader semantics and contrast. Check PWA/cache/push where in slice.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: test-engineer. Dependencies: Affected T4/T6 UIs and local backend ready.
Design: [D04](design.md#d04), [D05](design.md#d05), [D16](design.md#d16).
Future files: tests/e2e; playwright.config.ts; affected component tests.
Acceptance: Record screenshots/flows, viewport and emulated versus real-device source. No clipping/overlap/overflow or missing essential text. No WCAG/mobile readiness claim where rendering/device behavior remains unverified.

<a id="t5-4"></a>

### T5.4 Obtain independent security and correctness review

- [ ] Provide only authorized relevant evidence and inspect findings against actual source/preconditions. Required domains include auth/tenant scope/secrets, financial integrity, callbacks, idempotency, wallet/points/quota concurrency and migration/release safety.
- [ ] Inspect matching current test evidence and request focused regressions from
      the implementation owner when needed; keep this review read-only.

Owner: code-reviewer/security-auditor. Dependencies: T5.1,T5.2,T5.3 as applicable; explicit reviewer dispatch authorization.
Design: [D05](design.md#d05), [D06](design.md#d06), [D07](design.md#d07), [D08](design.md#d08), [D09](design.md#d09), [D10](design.md#d10), [D13](design.md#d13), [D16](design.md#d16).
Future files: Scoped redacted diff; affected contracts/source; matching current checks.
Acceptance: Separate authorized reviewer independently inspects relevant evidence. No unresolved blocking findings; fixes receive matching regression/review. Main self-review is not independent review. No dispatch is authorized by this task plan.

<a id="t5-5"></a>

### T5.5 Decide accepted scope and compatibility cutover

- [ ] Compare selected-release acceptance with every VLP item. Keep unimplemented approved scope visible; request explicit agreement for any reduced release, never relabel it unapproved. Record rollout target/version/impact and data-preserving rollback/forward recovery.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: Lead/Main. Dependencies: T5.1,T5.2,T5.3,T5.4; all tasks for the explicitly selected release.
Design: [D01](design.md#d01), [D16](design.md#d16).
Future files: Approved release evidence and runbook; no deployment in current scope.
Acceptance: No claim all 92 are complete while any required acceptance is pending. No push/deploy/production migration without exact authorization. A full-baseline release requires all approved capabilities and applicable operational evidence.

<a id="t6-1"></a>

### T6.1 Build marketplace registry, search and controlled storefronts

- [ ] Add Admin/request-reviewed markets/communities/categories, one real location/primary market, multiple approved discovery associations, geo-consented rich filters and design-system-limited storefront configuration.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: backend-engineer + frontend-engineer (future disjoint scopes). Dependencies: T1.2,T1.3,T3.1; B01 mapping.
Design: [D02](design.md#d02), [D04](design.md#d04).
Future files: apps/api/internal/modules/storefront; future bounded registry ownership; apps/web/src/features/storefront.
Acceptance: Tests prevent duplicate restaurant/queue creation from community placement, unapproved registry publication and nonconsented location use. All approved filters and customization work with short/long content. No mixed-restaurant basket, commissions, platform riders or Scope 93 expansion.

<a id="t6-2"></a>

### T6.2 Build grounded internal AI shopping assistance

- [ ] Replace seeded/keyword/fallback claims with typed real-data restaurant/menu/price/queue/availability assistance, modifier selection and single-restaurant cart suggestions. Keep Sponsored transparent and explicit customer order/payment confirmation.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: backend-engineer + frontend-engineer (future disjoint scopes). Dependencies: T1.2,T3.1,T3.2,T6.1; separately authorized model/provider/data use.
Design: [D15](design.md#d15).
Future files: apps/ai; typed Go client in apps/api/internal; apps/web/src/features/storefront/VeloAssistantChat.tsx.
Acceptance: Tests/evaluation reject nonexistent/stale items, hidden ads, cross-tenant context and autonomous order/payment. Missing data/timeouts/outage have safe fallback; normal checkout works without AI. No retail forecasting/purchasing feature is added.

<a id="t6-3"></a>

### T6.3 Deliver measured operations, recovery and release controls

- [ ] Add encrypted separate-store PITR/drills and post-restore reconciliation; centralized redacted logs/metrics/traces/alerts; measured scaling/load and controlled CI/staging/manual production rolling release with rollback.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: devops-engineer. Dependencies: T1.1; resolve B04/B08; actual services complete for acceptance.
Design: [D16](design.md#d16).
Future files: infra; .github/workflows; scoped runtime observability; docs/runbooks and load/restore tests (future).
Acceptance: Current restore/load/security/staging evidence meets approved target values. About 1000 restaurants/5000 concurrent/10000 orders/day are design targets until measured. No mandatory auto-HA failover; no actual external monitoring/deployment without separate authorization.

<a id="t6-4"></a>

### T6.4 Build member profiles, secure claims, cart sync and history

- [ ] Add approved customer login/recovery, Owner/Admin MFA/reauth integration, profiles/addresses/favorites, account-bound cross-device cart sync, per-order secure guest claiming, history filters and current-data reorder.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: backend-engineer + frontend-engineer (future disjoint scopes). Dependencies: T1.3,T3.2,T3.5; resolve B12/B14.
Design: [D05](design.md#d05), [D06](design.md#d06), [D10](design.md#d10).
Future files: apps/api/internal/modules/identity; customer/restaurant/storefront ownership selected in T1.1; apps/web/src/features.
Acceptance: Tests deny order-number/email/phone-only claims, duplicate/stolen claims, foreign-user data and MFA bypass. Claim grants no automatic points/review. Reorder revalidates and never restores old benefits/table session or starts payment.

<a id="t6-5"></a>

### T6.5 Build restaurant loyalty and retroactive request ledgers

- [ ] Earn on Paid AND verified Completed net eligible food; support restaurant-only redeem, expiring FEFO batches, explicit post-claim retroactive requests, full/partial-refund reverse/restore/debt and program notice/grace/suspension/closure.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: backend-engineer. Dependencies: T3.5,T3.6,T6.4,T2.2; resolve B09/B13.
Design: [D06](design.md#d06), [D10](design.md#d10).
Future files: apps/api/internal/modules/loyalty; restaurant/storefront pricing integration; ledger tests.
Acceptance: Race/replay tests grant once per order, reject ineligible/late/unclaimed requests and preserve expiry/history/tenant boundaries. No delivery-based earn, claim auto-award, cross-store transfer or cash conversion. Spent-earns/partial-refund cases use approved policy.

<a id="t6-6"></a>

### T6.6 Build real-time events, consent, chat and reminders

- [ ] Add website real-time updates, permitted browser push/dashboard sound, granular marketing consent/history, pre/post-order customer-restaurant text/attachments and reports/moderation. Publish filtered event timeline and pickup/delay notifications.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: backend-engineer + frontend-engineer (future disjoint scopes). Dependencies: T1.2,T1.3,T3.4,T3.5; resolve B07/B15.
Design: [D11](design.md#d11).
Future files: storefront/restaurant event ownership; protected attachment storage selected in design; affected web features/tests.
Acceptance: Tests deny cross-order/restaurant/guest attachment/event reads; no internal fraud/audit/PII leakage. Withdrawal/denied push does not block in-web service updates. Corrections append events; timeline is read-only. No LINE/LIFF integration.

<a id="t6-7"></a>

### T6.7 Build Admin support, fraud review and privacy lifecycle

- [ ] Add protected platform operations, scoped support/dispute tickets/evidence/replies/status, rule-based cross-domain fraud alerts and data access/correction/deletion schedule enforcement. Integrate merchant lifecycle decisions without paying food refunds.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: backend-engineer + frontend-engineer (future disjoint scopes). Dependencies: T1.3,T3.1,T3.3; resolve B07/B10; affected T6.9 ledger events.
Design: [D05](design.md#d05), [D12](design.md#d12).
Future files: Future scoped Admin/support modules in Go monolith; privacy/audit ownership; web Admin surfaces.
Acceptance: Tests cover member/guest/Owner/Admin permission matrix, private documents/attachments, lawful retention of immutable evidence and auditable review/escalation. No ML fraud engine or arbitrary access/deletion.

<a id="t6-8"></a>

### T6.8 Build Free/Pro entitlements and separate platform billing

- [ ] Implement approved Free core/Pro advanced matrix, monthly/yearly manual renewal, expiry notification, data-preserving downgrade and platform PromptPay with audited Admin manual fallback.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: backend-engineer. Dependencies: T1.2,T1.3,T2.2; resolve B02/B05.
Design: [D13](design.md#d13).
Future files: Future bounded platform billing/entitlements in Go monolith; web Owner/Admin billing; ledger tests.
Acceptance: Tests retain Free menu/order/FIFO/payment/Pickup/Delivery, reject auto-charge and prevent food-money mixing/commission. Paid/duplicate/expired/manual-review paths do not grant duplicate entitlement or erase restaurant data.

<a id="t6-9"></a>

### T6.9 Build reviewed ads, prepaid wallet and attribution

- [ ] Add fixed/CPC/CPM campaigns, targeting/duration/budget/Admin review, labeled relevant placements, atomic available/reserved/spend/refund-lock ledger and manual unused-credit refund. Measure deduplicated privacy-aware Paid attribution/ROAS with refund adjustment.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: backend-engineer. Dependencies: T6.8,T6.1,T3.3,T3.6; resolve B06.
Design: [D13](design.md#d13).
Future files: Future bounded ads/wallet modules in Go monolith; Owner/Admin/web Sponsored surfaces; transaction tests.
Acceptance: Race/replay tests prevent overspend, duplicate charges/refunds/conversions and spending refund-locked funds. Require payment plus campaign approval. Keep Organic/AI labels truthful and food funds separate; no advanced cross-device attribution.

<a id="t6-10"></a>

### T6.10 Build advanced reports, safe export and partner read access

- [ ] Add approved sales/refund/busy/repeat/queue/trend CSV/Excel analytics and comprehensive CSV/Excel/JSON batch exports with redaction/history/expiry. Add approved scoped partner read APIs/webhooks with credentials/rate limits/audit.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: backend-engineer. Dependencies: T1.2,T1.3,T3.5; affected loyalty/ads data; resolve B11.
Design: [D14](design.md#d14).
Future files: Owning report/export/partner modules selected in T1.1; web reports/download history; tests.
Acceptance: Tests prevent cross-restaurant/unauthorized PII export, leaked/expired downloads and partner order creation. Check signed webhook/replay/failure behavior and refund-adjusted totals. No net-profit assertion without costs.

<a id="t6-11"></a>

### T6.11 Complete bilingual, accessible PWA behavior

- [ ] Support Thai/English across customer/Owner/Admin, merchant bilingual menu fields with Thai fallback and THB. Add installable PWA public-only offline reads and logout/context cleanup; keep writes online/revalidated.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: frontend-engineer. Dependencies: Affected T4/T6 journeys; T1.2 identity/cache contract.
Design: [D16](design.md#d16).
Future files: apps/web/src/i18n; language/menu fields; PWA integration; component/browser tests.
Acceptance: Tests cover missing English fallback, online/offline/auth-context changes, no private cached leakage or offline order/payment/queue mutation. WCAG and responsive acceptance uses T5.3; no conformance claim from source alone.

<a id="t6-12"></a>

### T6.12 Build verified reviews and rule-based recommendations

- [ ] Add one 1-5 star/text review per genuinely Completed order for member/secure guest, and explainable favorites/history/interest/current-context recommendations with opt-out and general Guest results.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: backend-engineer + frontend-engineer (future disjoint scopes). Dependencies: T3.5,T6.4,T6.1; Sponsored integration T6.9.
Design: [D04](design.md#d04), [D10](design.md#d10).
Future files: Future scoped reviews/recommendations ownership; storefront web features; negative/replay tests.
Acceptance: Tests reject Ready/No-Show/unowned/duplicate reviews, preserve access after personalization opt-out and label Sponsored separately from Organic/AI. No required review photos/replies or referral codes/rewards/analytics.

## Dependency and release rules

T0.1 completes the source gate. Resolve the subset of T0.2 inputs required by
T1/T2 and the selected domain task; T0.3 freezes actual target safety. T1 defines
ownership/contracts/authority; T2 adds accepted compatible schema. T3 domain
slices and T6 approved capability tracks follow their listed prerequisites.
T4 exposes the accepted backend contracts. T5 verifies the selected integrated
scope and preserves unmet full-baseline requirements for an explicit release
decision. No T6 task depends on cutover T5.5; this avoids the previous post-MVP
cycle/omission. T3.3/T3.7 and T3.6/T6.5 integrate shared transaction contracts
before their combined acceptance; initial implementations must use disjoint
ownership or sequential work, never overlapping writes by default.

Preserve legacy branch-linked retail modules, APIs, memberships, stock, financial
records and applied migrations until replacement evidence and authorization
cover deprecation. No table/route is obsolete merely because new scope excludes
its use. Rollback for this documentation task is a scoped three-file diff review;
future data changes need reviewed forward-recovery/data-preserving rollback.

## Current document verification

Planning checkpoint, 2026-11-19 (Asia/Bangkok): D01 now separates settled design-only acceptance, deferred B04 policy and future implementation/runtime acceptance. The expanded package covers lifecycle vectors, atomic transaction boundaries, source-based transitive settlement/trigger/ledger paths, direct-writer obligations, compatibility mapping and resumable backfill/cutover/recovery, and DB-01 through DB-14 acceptance specifications. All DB cases are NOT RUN; DB-11 additionally needs B04. No production-provider guarantees or retained-data mappings are inferred.

Fresh saved-file static checks on 2026-11-19 found 92 exact source/reconciled matches, 17 evidence groups, 59 evidence paths, 16 design sections, 39 task definitions, 389 Markdown links and 16 preserved source TBD rows, with no hard-dependency cycle. The 14 DB case IDs are unique and ordered; 47 explicitly quoted repository paths in design.md exist. requirements.md is unchanged by this follow-up. Approved register SHA-256 remains fb144837c29f2c3c97428844a60bb4ee8de0b844396f2479c1d0426218419e74. Git diff whitespace check passed. An initial DB-ID parser assertion failed because it did not allow case titles; correcting the parser and rerunning passed without changing the cases. These checks validate documents, not runtime behavior.

Historical bounded independent review resolved the late-Paid/irreversibly-released-hold ambiguity: preserve evidence, route to review, never restore the released hold or expose kitchen work. Current expanded planning review returned consolidated PASS after source corroboration gaps were resolved. No actionable defect remains identified in the supplied settled design-only package. The same independent reviewer was reused within the authorized read-only scope; no model override or upstream identity claim was made. This is not schema/runtime acceptance or approval of B04.

Application/unit/integration/browser/provider/restore/load/release checks: NOT RUN; outside this documentation-only scope. No database or service startup, network/provider call, commit, push or deployment is authorized by this work. Required future implementation tests and independent review are retained, not waived.

## Current stop condition

T0.1 is no longer blocked. The 92 decisions are reconciled; only two exclusion requirements have IMPLEMENTED static evidence. Counts: 49 PARTIAL, 35 MISSING, 6 CONFLICTING, 0 OBSOLETE. These are bounded source classifications, not test passes or release readiness. T0.2 policy/provider/design inputs and T0.3 runtime preparation remain open. All application implementation tasks remain pending.

The settled T1.1/T2.1 design-only package is complete with static checks and bounded independent review. B04-dependent dispatch policy remains deferred, not guessed. T1.2 wire contracts, T1.3 authority/recovery and real retained-data/isolated DB acceptance remain separate downstream implementation gates, not reasons to block the completed settled planning. Full T1.1/T2.1 and runtime/schema acceptance remain open. Do not modify application code, contracts, migrations, data, permissions or deployment from this spec-only request.
