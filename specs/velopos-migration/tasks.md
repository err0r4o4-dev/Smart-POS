-- Active: 1795089294509@@127.0.0.1@15432@smartpos

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

#### B12 decision draft: loss of TOTP and all recovery codes

Neither option below is approved. Keep privileged access restricted and leave
the current code-based replacement path unchanged until this policy is settled.
This is recovery of the same verified user, not restaurant transfer (B10) or
new platform Admin provisioning.

1. Recommended: require fresh primary proof for the existing account plus
   corroboration against an authority record established before the request.
   For Owners, bind evidence to the active Owner and the specific restaurant
   using the approved B10 verification record when available. For platform
   Admins, use a separately controlled record of the verified Admin identity
   and require independent approval by two authorized people. This offers a
   recovery path but requires reliable records and reviewer coverage; missing
   or conflicting records keep the case restricted.
2. Conservative fallback: keep manual recovery unavailable for any role
   without approved records or reviewer coverage. This avoids forcing a
   decision from incomplete evidence but leaves affected accounts restricted.

Decisions still needed: which pre-existing records and corroboration are
acceptable by role, who can review and approve (including reviewer
unavailability), and which approved channel, access limits and retention
apply to evidence. Do not collect documents or invent evidence rules while
these are open.

Proposed acceptance after approval: primary login or email reset alone
cannot restore privileged access; neither can mismatched, missing, or
conflicting evidence. Approval is bound to the existing user and case,
cannot create membership or Admin authority, and cannot authorize a sensitive
command. Recovery permits only enrollment and confirmation of a new factor;
successful completion revokes prior sessions and records an audit decision
without raw evidence or secrets. Verify cross-user and cross-restaurant
denial, invalidated authority before completion, self-approval denial,
replay/concurrency and rollback, with isolated tests and independent review.

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

POS customer-selection authority (Large/High, bounded acceptance, 2026-11-23):

- [x] Reproduce independent missing/primary-only/mismatched-session denial for
      SelectCustomer, then acquire the existing typed MFA authorization before
      cart/customer locks. Preserve Owner-only permissions and existing scope.
- [x] Recheck after blocking helpers, before effects/private results, and around
      atomic audit/commit. Return zero Cart on all failed outcomes.
- [x] Prove runtime-role denial/isolation, lock expiry/cancellation, exact rollback,
      revision/concurrency and active-customer/checkout compatibility. Match HTTP,
      OpenAPI/client behavior and obtain independent supplied-source review.
- [x] Resolve reviewer P3: a primary-only session expiring during the shared MFA
      security-lock wait must return invalid authentication rather than missing
      MFA. Real lock-expiry and invalid-primary gate regressions reproduced RED;
      the minimal empty-factor liveness check passed matching verification and
      independent re-review. Preserve live primary-only MFA_REQUIRED denial.

Main owns the POS selection service, focused integration/HTTP/client tests and
matching contract. No schema, provider, retained-data or UI change. The approved
92-item baseline remains open. Recovery uses a compatible forward build retaining
all records; an uncertain commit must be reconciled rather than blindly replayed.
Use this existing tracker rather than creating a duplicate root TODO/plan.
Current execution uses the existing feature branch; no stage/commit/push/deploy.

Matching evidence, 2026-11-23:

- Direct missing/primary-only/mismatched-session RED and actual cart-lock expiry
  RED preceded the typed gate and post-helper rechecks. Runtime-role acceptance
  covers removed/Manager/suspended membership, pinned deployment, revoked session,
  cross-tenant cart/customer references, cart/checkout/customer lock expiry and
  cancellation, interruption after reads/writes/audit, aborted SQL, exact twelve-
  table rollback digests, revision concurrency, clear/HELD/archived behavior and
  actual selected-customer CASH checkout with exact 10.00 total. Cookie HTTP
  checks cover denial, success, Origin/CSRF and no-store; client denial never
  automatically retries. Other-cashier/inactive-branch guards were source-reviewed
  without dedicated new cases. No production UI or browser/device change.
- Reviewer P3 reproduced primary-only expiry during the initial user-lock wait
  returning missing-MFA403. The empty-factor branch now checks current active
  account and session creation/expiry/revocation after security locks using the
  database clock. Live unverified-primary onboarding retains MFA_REQUIRED403;
  an initial verification-inclusive fix failed that existing expectation and was
  narrowed. Assured-factor behavior and shared raw Authorized remain unchanged.
- Final isolated full DB: 576 PASS, zero FAIL/SKIP, 217.89s; shared gate34 and
  Owner55 PASS with exact owned tmpfs container/internal-network cleanup. Empty
  Pickup reapply, populated downgrade refusal and forward recovery PASS. Ordinary
  offline Go tests/vet PASS separately; they do not replace DB acceptance.
- Matching root npm test: web98/883, contracts18/116, logs10, dev-stack7 PASS;
  focused POS/organization client tests2/45 and typecheck PASS. Process-only
  TEMP/TMP under task scratch fixed the first root dev-stack sandbox failure;
  no global setting, permission, production expectation or script was weakened.
  gofmt, changed TS Prettier and diff whitespace checks PASS.
- Independent supplied-source reviewer accepted this bounded cutover and the P3
  correction with no unresolved findings after inspecting current deltas and
  matching checks; no reviewer tests/shell/network/writes/delegation occurred.
  Artifacts: `.local/velopos-identity-20261122/pos-reviewed-full.log`,
  `pos-primary-gate-final.log`, `pos-reviewed-owner.log`,
  `pos-customer-root-tests-corrected.log` and scoped review packages. RED and failed
  first-fix logs are retained. T1.3, remaining POS consumers and full migration
  stay open; uncertain physical commit outcomes still require reconciliation.

POS cart/checkout detail-read authority (Large/High, bounded acceptance, 2026-11-23):

- [x] Reproduce direct Cart and Checkout reads without independent live MFA,
      then acquire typed authorization and discard partial results on failure.
- [x] Recheck after the existing blocking read helpers and immediately before
      private return. Preserve own-cart, Owner, tenant/branch, exact pricing and
      frozen customer/checkout snapshots; do not migrate shared raw begin.
- [x] Verify runtime-role cookie HTTP and direct denial, success, isolation,
      real lock expiry/cancellation, late SQL failures and unchanged business
      state. Match OpenAPI/client behavior and independent scoped review.

Main owns these two service readers and focused integration/contract/client tests.
Other POS readers/writers remain separate inventory items. Dependencies are the
existing typed MFA gate and retained POS helpers. No schema/provider/UI change.
Recovery uses a compatible forward build preserving all records; read-only
transactions roll back and must not expose partial business results.

Matching evidence, 2026-11-23:

- Missing/primary-only/mismatched session RED6 preceded typed MFA. Actual lock
  expiry/cancellation RED4 preceded final guards. Runtime-role focused80 and
  full626 PASS, zero FAIL/SKIP; full230.68s. Tests cover membership/deployment/
  tenant/ownership scope, exact amounts and snapshots, revoked cookie HTTP,
  late projection failure, aborted SQL and twelve-table unchanged-state digests.
  Expiry is decided at the final database clock check; cancellation is also
  checked after that decision. An initial test incorrectly expected future
  expiry after that decision to override it; failed evidence remains retained.
- Root npm test: web98 files/885 tests, contracts18/116, logs10, dev-stack7 PASS.
  Focused client2/47, typecheck, offline Go suite/vet, gofmt, changed-file Prettier
  and diff whitespace PASS. Client tests prove signal forwarding and no denial
  retry; they do not perform a live request abort. No UI/browser/device claim.
- Full DB forward recovery and exact ID/label-owned tmpfs container/internal
  network cleanup PASS. Independent supplied-source reviewer returned bounded
  PASS with no unresolved findings, without shell/network/writes/test execution.
  Evidence: `.local/velopos-identity-20261122/pos-read-full.log`,
  `pos-read-focused-final.log`, `pos-read-root-tests.log`, `pos-read-typecheck.log`
  and the scoped source/evidence review packages. T1.3 remains open.

POS list-read authority (Large/High, bounded acceptance, 2026-11-23):

- [x] Reproduce independent live-MFA denial for List across terminals, carts,
      shifts, checkouts, sales, receipts and products, including the barcode
      HTTP alias. Acquire typed authorization while preserving existing SQL,
      permissions, tenant/branch/own-cart scope, pagination and exact values.
- [x] Guard every list return after blocking count/projection/product helpers;
      discard the entire Page on failure, expiry or cancellation. Preserve
      MENU_ONLY availability and existing historical compatibility.
- [x] Prove direct/cookie denial, branch and tenant isolation, actual lock waits,
      late failure, empty and success pages, unchanged business state, matching
      API/client checks and scoped independent review on an isolated runtime DB.

Main owns List and its focused integration/client/contract checks. Existing
typed MFA and privateReadResult are dependencies. Shared raw begin, detail
readers, writers, schema and UI are outside this bounded step. Recovery retains
all records through a compatible forward build; read transactions roll back.

Matching List evidence, 2026-11-23:

- Direct RED21 and valid actual-lock RED10 preceded typed MFA/final Page guards.
  Four immutable sales/receipt lock attempts failed for runtime privileges and
  are harness failures, not RED. Those paths use count/projection/decision
  interruption tests instead; no grants were widened. Focused196 PASS,0 FAIL/SKIP
  covers exact10.00 CASH history, MENU_ONLY, pagination/empty/error results,
  membership/deployment/branch/tenant/ownership scope, revoked cookies and
  twelve-table unchanged digests. Full792 PASS,0 FAIL/SKIP,255.48s with recovery
  and exact ID/label-owned cleanup. Initial full240.00s FAIL hit the test parent
  deadline after added deliberate waits; harness4->5minutes/browser5->6minutes,
  assertions and production timeouts unchanged. Failed logs are retained.
- Root web98/893,contracts18/116,logs10,dev-stack7; client2/55,typecheck,Go suite/
  vet, formatting and diff whitespace PASS. Initial sandbox Go cache-read failure
  was resolved through supported check escalation, without ACL/global changes.
  Independent supplied-source reviewer accepted List/harness with no unresolved
  findings. Artifacts: `.local/velopos-identity-20261122/pos-list-full-final.log`,
  `pos-list-focused-final.log`, `pos-list-root-tests.log`, `pos-list-go-final.log`
  and scoped review packages. Later independent reader RED preparation is not
  covered by this compiled List acceptance. No live client-abort/browser claim;
  T1.3 and full migration remain open.

Remaining POS private readers (Large/High, bounded acceptance, 2026-11-23):

- [x] Prove missing/primary-only/mismatched authentication on Shift, Sale,
      receipt and Quote, plus primary-only cookie payment-method access. Verify
      no private result survives denied or failed pricing/loyalty helpers.
- [x] Carry typed MFA through these remaining read-only paths and recheck before
      all returns. Keep internal helpers, historical snapshots, exact amounts,
      own-cart rules, Owner history visibility and payment permission filtering.
- [x] Verify denial/scope/revocation, waits and late failures on isolated runtime
      DB, HTTP/client/OpenAPI consistency and authorized independent review.

Main owns these reader entry points and bounded tests/contracts. No settlement,
schema, provider, UI or shared raw authorization change.
Recovery keeps records through a compatible forward build; reads roll back.

Matching remaining-reader evidence, 2026-11-23:

- Entry RED14 and final-result RED10 preceded typed entry/final guards. Quote
  loyalty-error prices are now discarded. Focused127 PASS,0 FAIL/SKIP,14.68s;
  full889 PASS,0 FAIL/SKIP,268.04s on matching production source. Expanded test
  wrapper initially panicked on untyped nil; corrected typed-zero wrapper only,
  assertions and production unchanged. Failed evidence retained. Forward recovery,
  populated downgrade refusal and exact ID/label-owned cleanup PASS.
- Root98 web files/898tests,contracts18/116,logs10,dev-stack7; typecheck,offline
  Go suite/vet,formatting/whitespace PASS. Explicit client selection1file/22tests
  PASS; an extra nonmatching filename added no coverage. Independent scoped
  source+exact diff review PASS, no unresolved findings. No nonzero loyalty-reward,
  live browser-abort or full T1.3 claim. Later register-test preparation is excluded
  from this compiled full binary. Artifacts: pos-other-focused-final.log,
  pos-other-full.log,pos-other-root-tests.log,pos-other-go.log,pos-other-vet.log,
  pos-other-typecheck.log and scoped reviewer packages in
  `.local/velopos-identity-20261122`. T1.3/full migration remain open.
POS terminal/register mutations (Large/High, bounded acceptance, 2026-11-23):

- [x] Prove independent missing/primary-only/mismatched MFA denial for terminal
      create/update and shift open/close, including idempotent replay. Main owns
      service.go SaveTerminal and registers.go entry points; no shared raw begin,
      cart/checkout/settlement, financial SQL, schema or UI redesign.
- [x] Carry typed authorization through waits, effects, result reads, audit and
      commit; return zero results on failure. Preserve revision/own-cashier rules,
      exact cash, pending reconciliation close guards and immutable closed shifts.
- [x] Verify isolated runtime DB denial/scope/revocation, expiry/cancel rollback,
      replay/concurrency/faults, HTTP/client/contracts and independent review.

Dependencies: accepted typed organization MFA and prior POS reader helpers.
Recovery uses compatible forward code retaining all historical records/keys;
failed local transactions roll back, uncertain commit requires reconciliation.
No actual Admin grant, retained database change, commit/push or external action.

Evidence: entry RED12 and result RED8; focused final146 PASS,0 FAIL/SKIP,27.26s.
Reviewer found changed OpenShift replay returning409 after blocked-header expiry;
real register_shifts lock RED reproduced it, then successful header recheck fixed
it. Cancellation and live changed-payload conflict remain covered. Full corrected
binary1005 PASS,0 FAIL/SKIP,294.22s; recovery/refusal and exact owned cleanup PASS.
Root98web files/902tests,contracts18/116,logs10,dev-stack7,typecheck,final offline
Go suite/vet,formatting/whitespace PASS. Independent reviewer bounded PASS with no
unresolved findings. Logs pos-register-review-{red,green,full,go,vet}.log under
`.local/velopos-identity-20261122`. Later cart preparation is excluded from this
compiled full result. No full current-tree, T1.3 or migration completion claim.

POS cart lifecycle mutations (Large/High, bounded acceptance, 2026-11-23):

- [x] Main owns CreateCart/UpdateCart in pos/carts.go and a focused integration
      test file, HTTP/client contract evidence. Prove missing/primary/mismatched
      MFA denial before create replay and update/hold/resume/cancel. Reuse typed
      authorization and accepted write helpers; preserve own-cart, revisions,
      exact pricing, customer clearing, pending-payment and online-release rules.
- [x] Recheck after waits/effects/projections/audit, discard failed results and
      roll back coupled state. Use test-first expiry/cancel/SQL-failure cases,
      concurrent/replayed commands and positive/negative scope checks.
- [x] Run isolated runtime DB, contracts/client/Go regressions and authorized
      independent review. No acceptance until matching required checks pass.

Dependencies: typed MFA and terminal/register helpers; checkout/settlement and
shared raw begin/finish remain separate. Recovery: compatible forward build,
retain historical records and keys; reconcile uncertain commit without replay.
Cart acceptance: focused172 PASS, full1147 PASS/0 FAIL/SKIP in326.50s, exit0.
Root98 files/907 web tests, contracts18/116,logs10,dev-stack7,typecheck,offline
Go suite/vet,gofmt/Prettier/whitespace PASS. Independent supplied-source reviewer
final PASS; no unresolved findings. Populated downgrade refusal/forward recovery
and full-ID/label task-owned cleanup PASS. Evidence: pos-cart-{focused-final,full}.log
under .local/velopos-identity-20261122. Full binary predates checkout preparation.
No T1.3 or full migration completion claim.

POS checkout mutation authority (Large/High, bounded acceptance, 2026-11-23):

- [x] Main owns PrepareCheckout/ConfirmPayment/EndCheckout in checkouts.go and
      CompleteCheckout in sales.go, plus dedicated tests and affected contracts.
      Prove independent live MFA before new commands and completed replay; retain
      method permissions, own cashier, exact money, immutable sale snapshots and
      atomic posting/reconciliation behavior. Existing settle SQL is unchanged.
- [x] Carry typed authorization through waits, validation, savepoint recovery,
      results, audit and commit. Authority failures must return zero Checkout
      and roll back local effects, including reconciliation writes. Valid funds
      evidence and domain posting failures retain their established recovery path.
- [x] Verify isolated runtime DB positive/negative/replay/concurrency/late-failure
      cases, financial consistency, HTTP/client/contracts and independent review.

Dependencies: accepted typed MFA and POS write checks; cart acceptance passed its bounded full run/review. No shared raw helper migration, provider call or schema edit.
Recovery retains payment/sale/command identity; uncertain commits require status
reconciliation. No external transfer, retained DB change, commit/push or release.
Checkout checkpoint: entry RED30 bypass failures, entry GREEN. Post-result RED16
valid partial-data failures;4 consequential boundary-not-reached cases excluded.
Corrected2 test assumptions about existing Owner reconciliation across cashiers.
Final focused261 PASS/0 FAIL/SKIP,54.48s (session66942,exit0);root98 files/912
web tests,contracts18/116,logs10,dev-stack7,typecheck,offline Go suite/vet,scoped
format/whitespace PASS. Savepoint SQL/domain recovery, rollback after payment/
receipt/shift/audit,exact12.34/20.00/7.66,concurrent same-key posting and5 cookie
HTTP matrices verified. Final full11691:1378 PASS/0 FAIL/SKIP,379.54s,exit0;
recovery/down-refusal and full-ID/label task-owned cleanup PASS. Reviewer found
P3 customer-conflict classification regression; verified RED91054, fixed and
GREEN66942/full11691. Same independent reviewer final bounded PASS, no unresolved
findings. Final offline Go suite/vet exit0. New manual-reference,NONE/loyalty,
rollback and exactly-once replay cases included. Evidence: pos-checkout-final-full.log,
pos-checkout-customer-review-green.log and scoped review packages under
.local/velopos-identity-20261122. Full binary predates online preparation.
Harness8/9min and scratch600000ms accommodate prior326.50s+checkout51.86s;
assertions,production timeouts and isolated target safeguards preserved.

POS online import/prepaid authority (Large/High, bounded acceptance, 2026-11-23):

- [x] Main owns ImportOnlineOrder in pos/online_orders.go and
      SettlePrepaidOnlineOrder in pos/prepaid.go, dedicated tests and2 contracts.
      Prove independent MFA before fresh/import-resume/completed replay. Retain
      own cashier, scope,revision,paid/unreleased-hold/refund-review predicates,
      exact amounts and atomic sale/order/event/audit posting.
- [x] Add live rechecks after waits/helpers/effects/results/audit; zero failed
      Cart/Checkout; preserve paid evidence and historical IDs on rollback.
- [x] Verify isolated runtime DB,denial/replay/concurrency/financial failures,
      HTTP/client/contracts and authorized independent review before acceptance.

Dependencies: accepted cart and checkout helpers; checkout full/review PASS.
Focused evidence: entry RED15 intended bypass failures; projection RED5 intended
expiry failures. Focused GREEN session70622: 46 PASS, 0 FAIL/SKIP, 7.65s, exit0.
Covers actual order lock wait/expiry, interrupted writes (pos_carts, pos_cart_items,
sales, sale_items, sale_payments, receipts, online_orders, events, audit), tenant/
membership isolation, direct cookie HTTP matrices (pos-cart, settle-prepaid) and
concurrent replay idempotency. Root98 files/912 web tests, contracts18/116 routes,
logs10, dev-stack7, typecheck and offline Go suite/vet PASS. Scoped review package
prepared under .local/velopos-identity-20261122. Raw pos begin/finish callers reduced to 0; both dead raw helpers removed from pos/service.go.
No provider calls, schema change or shared settle modification. All POS entrypoints now use typed MFA.
Recovery: forward compatible build,retained identities; reconcile uncertain commit.

Current verification: independent source review caught a row-scan error path
that skipped the final authority check; rows now close before writeCheck.
Two historical settlement fixtures now use the assured session for the actual
nonmember rather than the Owner's session. The import result now includes its
stored pricing revision internally so the creation and replay results agree.
Earlier full runs failed these three checks; both logs are retained. Matching
full session35841: 1539 PASS, zero FAIL/SKIP, 422.07s, exit0. Focused assured
HTTP replay session82796: both routes return 200/no-store and exact THB12.34
without changing business or audit state. Recovery/refusal and ID/label-verified
cleanup passed. Current offline Go tests/vet, contracts18/116, focused Vitest
4/75 and formatting/diff checks passed. The independent reviewer accepted the
scoped source, contracts and evidence with no unresolved findings. Evidence:
`pos-online-corrected-full.log` and `pos-online-assured-http.log` under
`.local/velopos-identity-20261122/`.

Inventory and Quality private reads (Large/High, bounded acceptance, 2026-11-23):

- [x] Scope and test-first service checks for List, Get and ReadQuality. Nine
      negative cases reproduced on isolated PostgreSQL before the typed gate.
- [x] Carry typed live MFA through private reads; preserve resource permission,
      branch/tenant scope and exact quantities; discard results on any failure.
- [x] Verify matching HTTP/contracts, expired/canceled reads, isolation and
      independent review. Keep all stock write paths and retained data intact.

Main owns Inventory/Quality reader service, related GET contract descriptions
and focused acceptance checks. Recovery uses a compatible forward build;
the read-only transaction rolls back and never updates inventory state.
Matching isolated tests: 69 PASS, zero FAIL/SKIP, 4.93s, including cookie
denial on 19 GET routes, cross-tenant IDs and a live nonmember, and expiry or
cancellation after count/detail/quality SQL. Combined full PASS1539 with the
current production code and initial tests; the added cases ran separately.
Offline Go suite/vet, contracts18/116, focused Vitest4/75 and format/diff checks
passed. Message-only independent reviewer accepted the scoped delta and checks;
no unresolved findings. Evidence: `inventory-read-isolation.log`.

Inventory location and reorder settings authority (High, bounded acceptance, 2026-11-23):

- [x] Prove missing/primary/mismatched MFA denial for location create/update
      and reorder save/replay. Main owns only these methods and focused tests.
- [x] Recheck after scope, reads and writes; retain revision, exact quantities,
      durable replay and audit. Roll back every interrupted transaction.
- [x] Verify isolated HTTP denial, failure, isolation, replay and concurrent revision
      behavior; obtain independent review before accepting either mutation.

Dependencies: typed organization MFA, accepted Inventory read checks, existing
location/reorder permissions and ledger protections. Recovery preserves data and
uses a compatible forward build; reconcile uncertain commits before retrying.

Current schema43 isolated runtime result: `inventory-read-1795447142495.log`,
78 PASS, 0 FAIL/SKIP, exit 0. Service success and replay, HTTP MFA denials,
nonmember and foreign object/branch denials, interrupted writes, competing
location revisions, exact quantities and audit/operation totals passed. Go tests,
vet, contract inventory (18 modules/116 routes), OpenAPI formatting and diff
checks passed. Independent message-only reviewer PASS, with no open findings.
Remaining Inventory writes and full T1.3 remain open.

Inventory opening balance authority (High, bounded acceptance, 2026-11-23):

- [x] Bind opening balance posting and replay to current typed MFA, retaining
      inventory permission, active location/branch scope and exact stock quantities.
- [x] Check rollback of balances, movements, replay and audit on interrupted
      transactions; run isolated acceptance and independent review.

Dependencies: accepted Inventory settings authority and existing ledger trigger.
Recovery preserves immutable movements and reconciles uncertain commits by key.

Matching isolated runtime run `inventory-read-1795447388248.log`: 79 PASS,
0 FAIL/SKIP, exit 0. Verified HTTP MFA denial, nonmember and foreign location
denials, expiry/cancellation after ledger insertion, exact `4.000` balance and
one movement, audit and replay operation after an assured retry. Focused Go
tests/vet, contracts and formatting passed. Independent reviewer PASS.
Next: live Inventory document and Quality writes; QuickStock has no current
caller and its former HTTP route is covered by the retired-routes test.

Inventory document creation authority (High, bounded acceptance, 2026-11-23):

- [x] Apply live MFA to adjustment, count and transfer creation and replay.
- [x] Verify tenant and branch scope, replay and atomic rollback of document,
      items, saved result and audit in the isolated runtime; obtain review.

Dependencies: existing Inventory permissions, document states, and balance
snapshots. Recovery preserves prior documents and reconciles uncertain commits
by original key. Count updates, transitions and Quality writes are separate.

Matching schema43 isolated run `inventory-read-1795447641984.log`: 83 PASS,
0 FAIL/SKIP, exit 0. Covered HTTP MFA denial on all three create routes,
nonmember/foreign locations, expiry/cancellation after item insertion, stable
exact replay, and one document, item, saved operation and audit per kind.
Go tests/vet, contracts, formatting, diff check and independent review passed.

Loyalty private read authority (High, bounded acceptance, 2026-11-23):

- [x] Require live MFA for programs, accounts and ledger history reads; retain
      active membership, tenant/branch scoping and existing quantities.
- [x] Verify no data on denial or interruption, isolated acceptance and review.

Depends on typed organization authorization. Loyalty write commands are separate.

Loyalty write authority (High, bounded acceptance, 2026-11-23):

- [x] Require live MFA for program and account creation/update and points
      adjustments, including exact replay. Preserve tenant, permission and branch
      scope, revisions, exact points and atomic mutation/audit/result.
- [x] Verify all five HTTP routes with primary-only and assured sessions, service
      denials for nonmembers/foreign branch, and expiry or cancellation after
      write and during result finalization. Verify zero persisted operation after
      interruption, exact replay after retry, and no result after replay expiry.
- [x] Align the five OpenAPI descriptions and obtain independent review.

Schema 43 isolated run `inventory-read-1795449894555.log`: 115 PASS, 0 FAIL/SKIP,
exit 0; task-owned database and network removed. RED log
`inventory-read-1795449581087.log` confirmed the missing primary-only gate.
Contracts: 18 modules/116 routes. Independent review PASS, no actionable findings.
The final authorization check is before commit; physical commit completion and
browser behavior are outside this slice. T1.3 remains open.

Pricing read authority (High, bounded acceptance, 2026-11-23):

- [x] Apply live MFA to price-list and promotion collection/detail and discount
      approval reads. Recheck after the query before returning data. Keep tenant,
      branch and requester predicates and the existing response shapes.
- [x] Verify five GET routes with current owner and primary-only sessions, direct
      nonmember denial, expiry and cancellation after queries, and no-store.
- [x] Align five OpenAPI descriptions and obtain independent review.

Schema 43 isolated runs: RED `inventory-read-1795450104501.log`; GREEN
`inventory-read-1795450247509.log`: 121 PASS, 0 FAIL/SKIP, exit 0. Offline Go
test/vet, contract inventory (18 modules/116 routes), format and diff checks
passed. Independent review PASS. Approvals were tested with an empty result;
populated approvals and a branch-scoped member were not exercised by this slice.
Pricing writes, five-minute sensitive authority and full T1.3 remain open.

Pricing definition write authority (High, bounded acceptance, 2026-11-23):

- [x] Require live MFA for create, update, submit, approve, activate and pause
      of price lists and promotions. Retain scope, permissions, revisions,
      state transitions and atomic audits. Return no definition on error.
- [x] Verify primary-only HTTP denial across 12 routes, direct nonmember
      denial, expiry and cancellation after SQL mutation, and expiry after
      audit. Verify successful revisions, states and audit counts after retry.
- [x] Align 12 OpenAPI descriptions and obtain independent review.

Schema 43 isolated RED `inventory-read-1795450436175.log` reproduced primary-only
creation success in both resources. GREEN `inventory-read-1795450617661.log`:
134 PASS, 0 FAIL/SKIP, exit 0. Offline Go test/vet, contracts (18 modules/116
routes), format and diff checks passed. Independent review PASS. Paused-to-active
and a branch-scoped member were not exercised. Discount approval writes,
five-minute sensitive authority and full T1.3 remain open.

Pricing discount approval writes (High, bounded acceptance, 2026-11-23):

- [x] Require live MFA for discount request, approve and reject, including
      request replay. Preserve existing cashier/branch authority, amount and
      revision checks, current approver validation and atomic audit effects.
- [x] Verify three POST routes, exact replay, expiry/cancellation rollback, and
      no approval data on denial. Align OpenAPI and obtain independent review.

Schema 43 RED `inventory-read-1795450846292.log` reproduced primary-only
creation success. GREEN `inventory-read-1795450980282.log`: 137 PASS,
0 FAIL/SKIP, exit 0. Go test/vet, contracts (18 modules/116 routes), format
and diff checks passed. Independent review PASS for the supplied delta.
Branch-scoped members, five-minute sensitive authority, and browser behavior
were outside this acceptance. Continue with Purchasing and Returns under T1.3.

Purchasing read authority (High, bounded acceptance, 2026-11-23):

- [x] Require live MFA on 19 GET routes, retaining permissions, tenant and
      branch filters. Recheck after scoped reads and before returning data or
      pagination totals. Align OpenAPI and obtain independent review.

Schema 43 RED `inventory-read-1795451416747.log` reproduced primary-only
reads. GREEN `inventory-read-1795451538151.log`: 157 PASS, 0 FAIL/SKIP, exit 0.
Go test/vet, contracts (18 modules/116 routes), format and diff checks passed.
Independent review PASS. Populated non-supplier detail, branch-scoped members
and browser behavior were not exercised. Purchasing writes and full T1.3 remain
open.

Schema 49 Purchasing read follow-up: all 19 GET routes returned `404 NOT_FOUND`
with no data and `Cache-Control: no-store` to an MFA-verified nonmember. The
primary-only Owner denials and verified Owner expectations also passed on all
19 routes. `check-db.mjs inventory-read` exited 0 (267 PASS entries including
parents, 0 FAIL/SKIP; `inventory-read-1795523252616.log`), with disposal of the
temporary container and internal network confirmed. Focused Storefront and
Purchasing Go test and vet passed. Only test coverage changed; populated
non-supplier details and browser behavior remain unverified.

Schema 49 populated Purchasing document details: the authorized Owner read
the saved purchase order (draft and submitted), posted receipt and dispatched
supplier return over HTTP. Each response matched the persisted document ID,
status, revision and item ID. The primary-only Owner received `403 MFA_REQUIRED`
and the MFA-verified nonmember received `404 NOT_FOUND` for the same documents,
without data. All responses used `Cache-Control: no-store`. The isolated
`check-db.mjs inventory-read` run exited 0 (267 PASS entries including parents,
0 FAIL/SKIP; `inventory-read-1795523851760.log`); container and network cleanup
were confirmed. Focused Storefront/Purchasing Go test and vet passed. Only
test coverage changed; this does not verify other details or browser behavior.

Schema 49 populated shelf and replenishment details: the verified Owner read
the shelf, its slot and assignment collections, and the completed replenishment
task over HTTP. The response matched fixture IDs, task revision 3 and quantity
`1.000`. The primary-only Owner received `403 MFA_REQUIRED` and the MFA-verified
nonmember received `404 NOT_FOUND` on all four routes without data. All responses
used `Cache-Control: no-store`. `check-db.mjs inventory-read` exited 0 (271 PASS
entries including parents, 0 FAIL/SKIP; `inventory-read-1795524443725.log`), with
temporary container and network cleanup confirmed. Focused Storefront/Purchasing
Go test and vet passed. Only test coverage changed.

Schema 49 populated receipt discrepancy detail: a receipt with `2.000`
delivered, `1.000` rejected and a reason posted only the accepted `1.000`.
The verified Owner read the matching receipt and item through the discrepancy
detail endpoint. The primary-only Owner received `403 MFA_REQUIRED` and the
MFA-verified nonmember received `404 NOT_FOUND`, both without data. All
responses used `Cache-Control: no-store`. `check-db.mjs inventory-read` exited 0
(271 PASS entries including parents, 0 FAIL/SKIP; `inventory-read-1795525001079.log`),
and temporary container and network cleanup were confirmed. Focused Go test and
vet passed. Only tests changed.

Schema 49 populated receipt discrepancy list: filtering by the purchase order
returned the posted receipt with the expected ID, status and revision, one
result and a total of one. The same request returned `403 MFA_REQUIRED` for a
primary-only Owner and `404 NOT_FOUND` for an MFA-verified nonmember, without
items or a pagination total. All responses used `Cache-Control: no-store`.
`check-db.mjs inventory-read` exited 0 (271 PASS entries including parents,
0 FAIL/SKIP; `inventory-read-1795525577209.log`); temporary container and network
cleanup were confirmed. Focused Storefront/Purchasing Go test and vet passed.
Only test coverage changed.

Schema 49 retained Purchasing branch assignment: an MFA-verified account
with an active legacy `PURCHASING_STAFF` membership and a grant for the
order's own branch received `403 FORBIDDEN` on the order list, the list
filtered to that branch, and the existing order detail. All three responses
omitted data and used `Cache-Control: no-store`. The current Owner-only policy
was unchanged. `check-db.mjs inventory-read` exited 0 (272 PASS entries
including parents, 0 FAIL/SKIP; `inventory-read-1795526230851.log`), and the
temporary container and network were removed. Focused Go test and vet passed.

Schema 49 Purchasing logout: the MFA-verified Owner read the populated order
list and an existing order detail before logout. After the real identity
service revoked that session, both requests with the same cookie returned
`401 UNAUTHENTICATED` without data. Direct service calls using the previously
authenticated context also rejected the session and returned neither order
data nor pagination metadata. `check-db.mjs inventory-read` exited 0 (273 PASS
entries including parents, 0 FAIL/SKIP; `inventory-read-1795526545803.log`),
with temporary container and network cleanup confirmed. Focused Storefront
and Purchasing Go test and vet passed. Only test coverage changed.

Schema 49 Purchasing logout replay follow-up: while the MFA-verified Owner
session was active, the original purchase-order create payload and idempotency
key returned the saved result. After logout, the same HTTP request returned
`401 UNAUTHENTICATED` without data, and the direct call with the old context
returned `ErrInvalidToken` without the cached result. Counts for purchasing
documents, inventory operations and organization audit events were unchanged.
`check-db.mjs inventory-read` exited 0 (273 PASS entries including parents,
0 FAIL/SKIP; `inventory-read-1795526787522.log`), with temporary container and
network cleanup confirmed. Focused Go test and vet passed. Only tests changed.

Schema 49 Purchasing write routes after logout: the previously MFA-verified
Owner's revoked cookie returned `401 UNAUTHENTICATED` without data on all 38
write routes. The existing primary-only Owner and MFA-verified nonmember
cases passed again, and the order replay and unchanged business row-count
checks remained in place. `check-db.mjs inventory-read` exited 0 (311 PASS
entries including parents, 0 FAIL/SKIP; `inventory-read-1795527023846.log`),
with temporary container and network cleanup confirmed. Focused Go test and
vet passed. This is HTTP entry-gate evidence; only tests changed.

Purchasing supplier write authority (High, bounded acceptance, 2026-11-23):

- [x] Require live MFA on supplier and supplier-product POST/PATCH. Recheck
      after reads, mutations, projection and audit before commit; preserve scope,
      archive permission, revision and exact decimals. Align four OpenAPI operations.
- [x] Require live MFA for order, receipt and supplier return writes and replays.
      Verify rollback, replay and representative stock effects in isolation.
- [x] Require live MFA for shelf and replenishment writes, including stock transfer.
- [x] Continue the separate Returns module, starting with private reads.
- [x] Require live MFA for customer return creation/transitions and refund
      settlement, including rollback and cached replay.
- [x] Require live MFA for exchange and void writes, including savepoint recovery.

Schema 43 RED `inventory-read-1795451871789.log` reproduced a primary-only
supplier write. GREEN `inventory-read-1795452017807.log`: 158 PASS, 0 FAIL/SKIP,
exit 0. The four commands verified MFA denial, nonmember denial, expiry and
cancellation rollback, retry with the expected revision, and one audit event per
successful command. Go test/vet, contracts, formatting and diff checks passed.
Independent review PASS for the supplied delta. Browser behavior and expiry
during COMMIT were not exercised. Full T1.3 remains open.

Customer Returns reads: schema 43 RED `returns-read-1795455159295.log`
failed the promised MFA response on nine GET routes; the two quote requests
hit Origin validation, so their RED results are inconclusive. GREEN
`returns-read-1795455304592.log`: 48 PASS, 0 FAIL/SKIP, exit 0. Verified four
Owner lists, nonmember denial, 11 HTTP primary-only denials (including two
POST quotes with valid Origin/CSRF), return-list expiry/cancellation after
projection, and financial-only returns/exchanges regressions. Go Returns
test/vet, contract inventory, and diff checks passed. Scoped independent
review PASS. Browser and other late-expiry paths were not exercised.

Customer return and refund writes: schema 43 RED
`returns-read-1795455421092.log` returned draft/refund data after authority
expired. GREEN `returns-read-1795455573949.log`: 52 PASS, 0 FAIL/SKIP, exit 0.
Verified draft expiry, canceled completion rollback, cash refund expiry and
same-key retry (one 10.00 disbursement, two settlement events), and denial after
cached result lookup. Focused Go test/vet and contract inventory passed;
independent review found no actionable issues. Coverage does not establish all
nine POST paths, regulated stock mutations, expiry during commit or browser
behavior. Full T1.3 remains open.

Exchange and void writes: schema 43 RED `returns-read-1795455687844.log`
returned data on late expiry and persisted the completed exchange. GREEN
`returns-read-1795455866533.log`: 55 PASS, 0 FAIL/SKIP, exit 0. Verified expiry
after exchange draft insert and final projection, original revision preserved
before retry, one replacement, no refund or phantom stock for an equal
exchange, and Void reconciliation/forward recovery after a SQL failure.
Focused Go test/vet, contract inventory and diff checks passed. Independent
review found no actionable issues. Direct expiry after savepoint rollback,
taxed/non-menu stock and exhaustive route/browser checks were not exercised.

Schema 49 Returns HTTP entry denial: all 25 write routes (9 return/refund and
16 exchange/void) returned `403 MFA_REQUIRED` with no data and
`Cache-Control: no-store` for a primary-only Owner with valid session and
CSRF credentials. The 11 read/quote checks and existing financial-only
rollback, replay and recovery cases passed in the same run.
`check-db.mjs returns-read` exited 0 (102 PASS entries including parents,
0 FAIL/SKIP, 41.69s; `returns-read-1795513361500.log`) and removed the
disposable container and network after ID/label verification. Focused
Storefront/Returns Go test and vet passed. Production code was unchanged;
positive and late-expiry coverage remains representative.

Schema 49 Returns tenant boundary: all 36 mounted operations in the matrix
(25 writes and 11 reads/quotes) denied a session with MFA but no membership
in the addressed organization with `404 NOT_FOUND`, no data, and
`Cache-Control: no-store`. The primary-only Owner matrix passed again.
`check-db.mjs returns-read` exited 0 (142 PASS entries including parents,
0 FAIL/SKIP; `returns-read-1795518094831.log`) and removed the disposable
container and network. Focused Storefront/Returns Go test and vet passed.

Schema 49 Returns revoked session: all 36 mounted operations in the matrix
(25 writes and 11 reads/quotes) returned `401 UNAUTHENTICATED` without data
when presented with the revoked cookie of the previously MFA-verified Owner.
The fixture revoked only the synthetic session and restored it for later
checks in the disposable database. Existing MFA and nonmember denials and
financial reversal/refund checks also passed. `check-db.mjs returns-read`
exited 0 (181 PASS entries including parents, 0 FAIL/SKIP;
`returns-read-1795527276857.log`), with temporary container and network cleanup
confirmed. Focused Storefront/Returns Go test and vet passed. This verifies
the HTTP entry gate; only tests changed.

Schema 49 Returns HTTP success: a verified Owner created, submitted, approved,
and completed a menu-only return, then reported and confirmed a cash refund.
All six routes returned the expected success status and `Cache-Control: no-store`.
Exact completion and confirmation replays returned identical data. The fixture
still verified rollback on cancellation or expiry, unchanged stock, and one
10.00 cash disbursement with two settlement events. `check-db.mjs returns-read`
exited 0 (142 PASS entries including parents, 0 FAIL/SKIP;
`returns-read-1795520478591.log`) and removed the disposable container and
network. Focused Storefront/Returns Go test and vet passed.

Schema 49 refund confirmation replay: the same key with a changed note returned
`409 CONFLICT`; the original payload returned `403 MFA_REQUIRED` from a
primary-only Owner session and `401 UNAUTHENTICATED` after that session was
revoked. No denial returned refund data. Readback preserved the confirmed
status and revision, one 10.00 cash disbursement, and two settlement events.
`check-db.mjs returns-read` exited 0 (143 PASS entries including parents,
0 FAIL/SKIP; `returns-read-1795521879123.log`) and confirmed container and
network cleanup. Focused Storefront/Returns Go test and vet passed.

Schema 49 Returns replay/logout ordering: PostgreSQL reported that actual
logout waited for the session lock held by a refund confirmation replay after
its saved-result lookup. The earlier replay returned the saved refund; the
same service call after logout returned `ErrInvalidToken` without data. The
fixture still recorded one cash disbursement and two settlement events.
The initial run compared raw database JSON with compact HTTP JSON; comparing
decoded values passed. `check-db.mjs returns-read` exited 0 (182 PASS entries
including parents, 0 FAIL/SKIP; `returns-read-1795527562770.log`), and temporary
container and network cleanup were confirmed. Focused Go test and vet passed.
Only tests changed; this verifies replay ordering, not concurrent fresh posting.

Schema 49 first refund confirmation and logout: PostgreSQL showed logout
waiting on the session lock after the confirmation attempted the cash
disbursement insert. Canceling the confirmation before commit returned no data
and left disbursement and settlement-event counts unchanged. Logout then
succeeded, and a subsequent attempt with the same session was rejected.
The existing concurrent confirmation test still completed with one
disbursement. The first harness run timed out on a stale application-name
filter; using the traced connection's configured name fixed the observation.
`check-db.mjs returns-read` exited 0 (183 PASS entries including parents,
0 FAIL/SKIP; `returns-read-1795527839611.log`), with temporary container and
network cleanup confirmed. Focused Go test and vet passed. Only tests changed.

Schema 49 successful first refund confirmation and logout: a separate cash
sale and return produced a fresh refund. PostgreSQL showed logout waiting on
the session lock at the disbursement insert; releasing the confirmation let
it commit `CONFIRMED` at the next revision. The same HTTP request after
logout returned `401 UNAUTHENTICATED` without data. The ledger recorded one
`10.00` disbursement and two settlement events. `check-db.mjs returns-read`
exited 0 (184 PASS entries including parents, 0 FAIL/SKIP;
`returns-read-1795528000873.log`), with container and network cleanup confirmed.
Focused Storefront/Returns Go test and vet passed. Only tests changed.

Schema 49 Returns legacy branch assignment: an active synthetic Cashier
with MFA and an assignment to the addressed organization's branch received
`403 FORBIDDEN`, no data, and `Cache-Control: no-store` on all 36 mounted
operations in the matrix. `check-db.mjs returns-read` exited 0 with 221 PASS
entries including parents, no FAIL/SKIP, and verified container/network
cleanup (`returns-read-1795528527088.log`). Focused Storefront/Returns Go
test and vet passed. Only tests changed.

Schema 49 Returns legacy-role follow-up: the branch-assigned, MFA-verified
fixture was tested separately as Cashier, Manager, Inventory Staff and
Purchasing Staff. Each role received `403 FORBIDDEN` with `no-store` and no
data on all 36 routes (144 role/route pairs). `check-db.mjs returns-read`
exited 0 with 332 PASS entries including parents, no FAIL/SKIP, and verified
container/network cleanup (`returns-read-1795528847773.log`). Focused
Storefront/Returns Go test and vet passed. No production policy changed.

Schema 49 concurrent refund confirmation: two Owner HTTP requests released
together with the same key and payload both returned `200` and identical data.
A later exact replay returned the same result. The ledger retained one 10.00
cash disbursement and two settlement events. `check-db.mjs returns-read` exited
0 (144 PASS entries including parents, 0 FAIL/SKIP;
`returns-read-1795522351399.log`) and confirmed container/network cleanup.
Focused Storefront/Returns Go test and vet passed.

Schema 49 Exchange and Void HTTP success: a verified Owner created, submitted,
approved, confirmed settlement, and completed both adjustment types through
their HTTP routes. Both flows retained rollback checks and returned
`Cache-Control: no-store`. The equal exchange created one replacement without
a refund or stock movement. Void replay preserved reconciliation after an
injected posting failure; a new authorized command completed recovery. The
first exchange replay comparison compared raw JSON bytes despite JSONB key
ordering (`returns-read-1795520941687.log`). The rerun compared all decoded
values and exited 0 (142 PASS entries including parents, 0 FAIL/SKIP;
`returns-read-1795521345022.log`), with container and network cleanup confirmed.
Focused Storefront/Returns Go test and vet passed. Only test coverage changed.

Purchasing documents: schema 43 RED `inventory-read-1795452249425.log`
reproduced a primary-only order create; GREEN `inventory-read-1795452525049.log`
reported 163 PASS, 0 FAIL/SKIP, exit 0. Order create/submit exercised expiry and
cancellation rollback and fresh-authority replay. Receipt post/supplier return
dispatch rolled back on expiry after ledger insertion; successful retry and
replay committed exactly one movement of +1.000/-1.000 respectively. Contract
inventory and independent review passed. Runtime coverage was representative;
all 24 routes, multi-line posting, expiry during COMMIT and browser behavior
were not exercised individually.

Schema 49 Purchasing HTTP denial matrix: all 38 write routes (4 supplier,
24 purchasing document/draft and 10 shelf/replenishment operations) returned
`403 MFA_REQUIRED` with `Cache-Control: no-store` and no data for a primary-only
Owner presenting valid session and CSRF credentials. `check-db.mjs inventory-read`
exited 0 (225 PASS entries including parents, 0 FAIL/SKIP, 107.92s;
`inventory-read-1795499902791.log`). The disposable container and network were
removed after ID/label verification. Focused Storefront/Purchasing Go test and
vet passed. This extends entry denial evidence; positive and late-expiry paths
remain representative rather than exhaustive. Production code was unchanged.

Schema 49 Purchasing tenant boundary: all 38 write routes denied a session
with MFA but no membership in the addressed organization with `404 NOT_FOUND`,
no data, and `Cache-Control: no-store`. The primary-only Owner matrix passed
again. `check-db.mjs inventory-read` exited 0 (267 PASS entries including
parents, 0 FAIL/SKIP; `inventory-read-1795517905354.log`) and removed the
disposable container and network. Focused Storefront/Purchasing Go test and
vet passed. This and the Returns extension changed only test coverage.

Schema 49 Supplier HTTP success: after testing session expiry and cancellation
at the write and audit boundaries, the verified Owner created and updated a
supplier and its product link through all four HTTP routes. Creates returned
201 and updates 200, with `Cache-Control: no-store`. Tenant-scoped readback
confirmed both revisions reached 2, the updated name and exact 4.25 unit cost,
and exactly two audit events for each record type. `check-db.mjs inventory-read`
exited 0 (267 PASS entries including parents, 0 FAIL/SKIP;
`inventory-read-1795518565550.log`), with container and network cleanup
confirmed. Focused Storefront/Purchasing Go tests and vet passed.

Schema 49 Purchase Order HTTP success: after checking rollback on session
expiry at the write and cancellation at audit, the verified Owner created a
draft (`201`, revision 1) and submitted it for approval (`200`, revision 2).
Both routes returned `Cache-Control: no-store`. Exact idempotency-key replay
returned identical data; scoped readback confirmed the same document, item,
status and revision. Session expiry during cached result lookup still returned
no data. `check-db.mjs inventory-read` exited 0 (267 PASS entries including
parents, 0 FAIL/SKIP; `inventory-read-1795519236303.log`), with container and
network cleanup confirmed. Focused Storefront/Purchasing Go tests and vet passed.

Schema 49 Purchasing stock document HTTP success: a verified Owner posted a
receipt and dispatched a supplier return. Both routes returned `200`,
`Cache-Control: no-store`, and revision 4 in the expected final state. Expiry
after the attempted ledger insert left no movement. The next authorized request
committed exactly one movement per document (`+1.000` receipt, `-1.000` return);
exact HTTP replay returned the same data and left the movements unchanged.
`check-db.mjs inventory-read` exited 0 (267 PASS entries including parents,
0 FAIL/SKIP; `inventory-read-1795519790416.log`), with temporary container and
network cleanup confirmed. Focused Storefront/Purchasing Go test and vet passed.

Schema 49 Purchasing upstream HTTP transitions: an MFA-verified Owner
approved and issued the order, submitted and approved the receipt, and
submitted and approved the supplier return through six mounted routes. Each
returned `200` and `Cache-Control: no-store`; scoped readback matched the
expected document, item, state and next revision. The existing stock posting
rollback and exact replay checks still passed. `check-db.mjs inventory-read`
exited 0 with 574 PASS entries including parents, no FAIL/SKIP, and verified
container/network cleanup (`inventory-read-1795529543675.log`). Focused
Storefront/Purchasing Go test and vet passed. Only tests changed.

Schema 49 Purchasing upstream transition expiry: all six transitions above
paused at the service layer after the document status update and returned no
result when the session expired. HTTP readback preserved the previous state,
item and revision; the authorized HTTP retry with the same key committed the
intended next state. Scoped independent review is recorded in T5.4.
`check-db.mjs inventory-read` exited 0 with 580 PASS entries including parents,
no FAIL/SKIP, and verified container/network cleanup
(`inventory-read-1795529765610.log`). Focused Go test and vet passed.

Schema 49 receipt posting and supplier return dispatch: two new expiry cases
pause after the audit insert and assert no result. Readback preserves the
approved document, item identity and revision; there is no stock movement or
change to the warehouse balance, document event count, audit count or exact
replay-key count. The authorized same-key HTTP retry and byte-identical replay
leave one movement of +1.000 or -1.000 and one new row of each counted type.
`check-db.mjs inventory-read` exited 0 with 582 PASS entries including parents,
no FAIL/SKIP, and verified cleanup (`inventory-read-1795530767703.log`).
Storefront vet and formatting passed. The expiry hook is service-level; parent
order quantities and expiry during COMMIT are not directly asserted here.

Receipt parent follow-up: both expiry points (after the first stock movement
and after the audit insert) preserved the parent order's `ORDERED` status,
revision, `0.000` accepted quantity and zero receipt-specific events. The
same-key HTTP retry and replay left the parent `RECEIVED` with one additional
revision, `1.000` accepted and one receipt-specific event. The schema-49
`check-db.mjs inventory-read` run exited 0 with 582 PASS entries including
parents, no FAIL/SKIP and verified cleanup (`inventory-read-1795531028458.log`).
Storefront vet passed. This does not exercise expiry during COMMIT.

Receipt posting and supplier return dispatch replay follow-up: expiry after
the saved result lookup returned no data for either command. The subsequent
authorized HTTP replay matched the original bytes. The movement, balance,
document revision, event, audit, replay-key and receipt-parent assertions
still matched a single successful write. `check-db.mjs inventory-read`
exited 0 on schema 49 with 584 PASS entries including parents, no FAIL/SKIP,
and verified container/network cleanup (`inventory-read-1795531281909.log`).
Storefront vet passed. The expiry interruption was at the service layer.

HTTP follow-up: the actual receipt-post and supplier-return-dispatch replay
routes reached the saved-result lookup, then the session expired. Both
returned `401 UNAUTHENTICATED` and `Cache-Control: no-store` without data.
The authorized replay still matched the original bytes, and the stock,
document, audit, replay and receipt-parent readbacks still showed one
successful write. Schema-49 `check-db.mjs inventory-read` exited 0 with
591 PASS entries including parents, no FAIL/SKIP and verified cleanup
(`inventory-read-1795535785629.log`). This does not exercise COMMIT expiry.

HTTP write follow-up: receipt posting and supplier return dispatch also
returned `401 UNAUTHENTICATED` with `no-store` and no data when the session
expired after the audit insert, before COMMIT. Both preserved the approved
document and revision, stock, audit, replay and receipt-parent state. The
same-key retry and replay still produced one durable write. Schema-49
`check-db.mjs inventory-read` exited 0 with 593 PASS entries including
parents and no FAIL/SKIP; all four HTTP expiry cases and cleanup passed
(`inventory-read-1795536028373.log`). No production code changed.
OpenAPI now documents the two measured expiry outcomes on receipt posting
and supplier return dispatch. The description assigns `no-store` to the
Purchasing handler without claiming it for early middleware denials.
`node scripts/check-contracts.mjs` passed (18 modules, 116 documented routes).

Shelf and replenishment: schema 43 RED `inventory-read-1795452718310.log`
reproduced a primary-only shelf write. GREEN `inventory-read-1795454841720.log`:
164 PASS, 0 FAIL/SKIP, exit 0. Expiry after the first stock movement left the
warehouse at 3.000; the successful retry and its replay left it at 2.000.
Expiry during replay returned no data. Independent review found no actionable
issues in the supplied delta. Runtime checks were representative; not all ten
routes, concurrent completion, or expiry during COMMIT were exercised.

Isolated schema43 `inventory-read-1795449379519.log`: 109 PASS, no FAIL/SKIP,
exit 0. Verified all three HTTP MFA denials with no-store, nonmember and
foreign-branch denial, and no data on expiry/cancellation after projection.
Go tests/vet, contract inventory, formatting, diff and independent review passed.

Inventory count item update authority (High, bounded acceptance, 2026-11-23):

- [x] Require live MFA for count updates and exact replay while preserving
      assignee, branch, revision, and exact quantity rules.
- [x] Verify interrupted writes and replay on the isolated runtime; obtain
      independent review. Reconcile uncertain commits by the original key.

Schema43 isolated `inventory-read-1795447897071.log`: 84 PASS, no FAIL/SKIP,
exit 0. Primary-only HTTP denial, nonmember denial, stale revision conflict,
expiry/cancellation after item update, exact `6.000` at revision 2, byte-stable
replay and one durable result/audit passed. Go tests, vet, contracts and
formatting passed. Independent reviewer PASS. Next: document transitions.

Inventory document transition authority (High, bounded acceptance, 2026-11-23):

- [x] Require live MFA for transition commands and their scoped replays.
- [x] Preserve state, revision, branch, quantity and stock movement rules;
      verify interrupted posting/transfer rollback and obtain review.

Depends on accepted document creation, count updates and ledger triggers.
Recover by reconciling the original command key; never reverse ledger rows
to compensate for an uncertain commit. Purchasing remains a separate caller.

Schema43 isolated `inventory-read-1795448339696.log`: 100 PASS, no FAIL/SKIP,
exit 0. Covered all 14 HTTP MFA denials, nonmember and replay checks, and
stock-ledger rollback on expiry/cancellation during count posting and
cross-branch dispatch/receipt. Quantities and audit counts remained exact.
Go tests/vet, contracts, formatting, diff and independent review passed.
Next: Inventory Quality mutations.

Inventory Quality batch and recall authority (High, bounded acceptance, 2026-11-23):

- [x] Require live MFA for batch creation/update and recall creation, including replay.
- [x] Verify rollback on interrupted writes, current scope and exact replay; obtain review.

Keep immutable lot identity and revision rules. Reconcile uncertain commits
by original key. Write-off mutations follow separately.

Isolated schema43 `inventory-read-1795448544666.log`: 104 PASS, no FAIL/SKIP,
exit 0. Three HTTP MFA denials, nonmember checks, expiry/cancellation after
each mutation, byte-identical replay, exact revisions and audit counts passed.
Go tests/vet, contract inventory, formatting and independent review passed.

Inventory Quality write-off authority (High, bounded acceptance, 2026-11-23):

- [x] Require live MFA for request, approve, reject, post and exact replay.
- [x] Prove ledger, document and audit rollback on interrupted posting; verify
      permission and replay in the isolated runtime and obtain review.

Preserve branch permissions, revisions and exact quantities. Reconcile an
uncertain commit by its original key before retrying.

Isolated schema43 `inventory-read-1795449156444.log`: 105 PASS, no FAIL/SKIP,
exit 0. Verified all four HTTP denials, nonmember access denial, expiry and
cancellation rollback, byte-identical replay, one `-1.000` movement and a
`3.000` balance. Five saved results and audit events; no repeat effects.
Go tests/vet, contracts, formatting, diff check and independent review passed.

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
- [x] 2026-11-24 baseline for the implemented slice: HEAD `12ca95a` on
      `feature/fix-system-` with local changes, required and highest migration
      version 45, and 18 route modules / 116 entries per T5.1. T5.2 records
      fresh and synthetic retained-data runs on PostgreSQL 17.6. The checked
      runner uses a uniquely labelled internal network and tmpfs database,
      publishes no host port, attaches no retained volume, and checks IDs and
      labels before removing the resources. See T2.3 for dirty-state recovery
      and T5.3 for the remaining live browser target limitation.
- [ ] Confirm selected slice baseline, live dependencies, explicit disposable DB
      target ownership/recovery and safe test environment for each subsequent
      slice before implementation.

Files: source evidence E01-E17 (read only); future scoped compatibility/runbook
notes if required. Dependencies: T0.1; selected B01/T1.1/T2.1 decisions.
Acceptance: reproducible source and runtime target evidence for the selected
slice, no mixed user changes or assumed disposable retained data.
Status: Verified baseline for the implemented slice; later slices and live
provider/browser acceptance still require their applicable target evidence.

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

- [/] Native modifiers: [D03 wire proposal](design.md#native-menu-modifier-wire-proposal-t12)
      records Owner and customer projections, revision consistency, replay,
      retained setup compatibility and customer reconfirmation cases. No route,
      migration or runtime behavior changed. Quota and bulk import policy remain
      separate B14 and B16 decisions.
- [/] [Shared revision cutover](design.md#shared-revision-cutover-prerequisites):
      traced retained/organization setup, catalog maintenance and import,
      and variant-wide recall paths that can invalidate a native quote.
      Added writer coordination, coherent read and payment admission cases.
      Native activation still requires implementation and independent evidence.
- [/] Added Go selection validation for groups loaded for one menu item.
      It rejects duplicate groups/options, choices from the wrong group,
      unavailable options, and choices outside required/optional bounds.
      A required group without enough sellable options blocks selection.
      The focused test first failed to compile without the validator, then
      `go test ./internal/modules/restaurant -count=1` passed. No service calls
      it yet; item/tenant resolution, pricing, revision checks and payment
      integration still need their own evidence.
- [/] Owner modifier service read reuses live Owner MFA and rechecks it
      immediately before returning scoped groups. On isolated schema 47,
      an assured Owner read an empty registered item; an unknown item and
      missing, primary-only, mismatched and foreign sessions returned no
      data. `check-db.mjs green` passed 47 entries including parents, no
      FAIL/SKIP, exit 0 and verified cleanup (`green-1795492521839.log`).
      First run expected the wrong foreign-account denial category and
      cleaned up (`green-1795492459001.log`). The full run already in flight
      predates this service change. No route or revision was exposed;
      independent review of this authority boundary remains open.
- [x] Populated Owner read on isolated schema 47 returned both saleable
      and disabled options with exact `12.35` and `0.00` prices. A second
      read waited on a verified PostgreSQL lock until its session expired,
      then returned an invalid-session error with no modifier data.
      `check-availability.mjs modifiers` exited 0 and verified container
      and network cleanup (`modifiers-1795492686918.log`).
- [/] Owner edit domain logic applies only explicitly submitted groups/options
      to the scoped current item, preserves omitted choices, and normalizes
      exact two-decimal prices without rounding. Unknown or wrong-parent IDs,
      duplicate edits and invalid bounds return no candidate state. New choices
      stay distinct until the future transaction assigns durable IDs. The focused
      test failed to compile without the helper; the restaurant package passed
      after implementation. No database write or endpoint uses it yet.
- [/] Internal Owner modifier command now uses the edit helper, live MFA and
      the existing organization lock to commit choices, before/after revision
      and audit together. Migration 49 grants column-limited writes and keeps
      tenant policies in force. Isolated schema-49 tests proved one save and
      audit, exact replay, changed-payload and stale-revision rejection
      (`modifiers-1795493489441.log`, exit 0, cleanup verified). A subsequent
      isolated schema-49 run proved that audit failure rolled back choices and
      revision and allowed a retry with the same key. Two writes at one expected
      revision produced one commit and one conflict, with one revision/audit
      added. Replaying the first write after later commits returned its original
      result. `modifiers-1795493688538.log`: exit 0, cleanup verified. Other
      revision participants and independent review remain required before an
      HTTP route can be exposed.
- [/] Organization Setup now appends before/after menu history under the
      existing organization lock in the same transaction as its menu change
      and audit. Setup replay retains its own command key and adds no revision;
      existing modifiers stay intact. On schema 49, the regression first
      observed revision 3 and no menu history after the price edit
      (`modifiers-1795493797650.log`). With the change, it observed revision 4
      with the changed price and rejected a modifier write based on revision 3
      (`modifiers-1795493910182.log`, exit 0, cleanup verified). Focused Go
      checks passed for restaurant, storefront and transport.
- [/] Retained branch setup records changes to the registered menu under
      its existing Owner MFA transaction and organization lock. A branch-only
      save leaves the shared revision unchanged; a registered item's price
      edit advances it once and preserves modifiers and legacy replay.
      The regression first observed revision 4 instead of 5
      (`modifiers-1795494035420.log`), then passed on isolated schema 49
      (`modifiers-1795494099331.log`, exit 0, cleanup verified). Focused Go
      checks passed for restaurant, storefront and transport.
- [/] Catalog variant saves now share the setup revision allocator. A price
      edit for a registered menu variant records the old and new price in the
      same transaction as the catalog audit. Cost-only and out-of-menu edits
      do not increment the revision. The schema-49 regression first observed
      revision 5 with no variant history (`modifiers-1795494203982.log`), then
      passed with revision 6. An injected audit failure rolled back the price
      and revision (`modifiers-1795494313520.log`, exit 0, cleanup verified).
      Focused Go checks passed for catalog, restaurant, storefront and transport.
      Cross-writer acceptance and independent review remain open.
- [/] Catalog product and taxonomy edits now append menu history under the
      existing organization lock and in the same transaction as the audit.
      Renaming a menu product, registered category and referenced unit advanced
      the shared revision from 6 to 9; a description-only product update and an
      unrelated unit rename left it unchanged. Isolated schema-49 regression:
      revision 6 before the fix (`modifiers-1795494429701.log`), PASS after
      (`modifiers-1795494508985.log`, exit 0, cleanup verified). Focused Go checks
      passed for catalog, restaurant, storefront and transport.
- [/] Existing Catalog Import now records one before/after menu revision
      for an UPDATE batch that changes the registered menu. It reads affected
      products under the existing organization lock and import job lock.
      Preview and completed replay add no revision. An injected completion
      audit failure left revision 9 and allowed the same import job to retry.
      The successful batch advanced to revision 10 and recorded both prices.
      Isolated schema-49 regression: revision 9 before the fix
      (`modifiers-1795494622585.log`), PASS after
      (`modifiers-1795494696689.log`, exit 0, cleanup verified). Focused Go checks
      passed for catalog, restaurant, storefront and transport. This uses the
      existing catalog import; B16 remains open for native menu import.
- [/] Inventory Recall now records the first variant-wide recall of a
      registered menu variant in the same revision transaction as its immutable
      recall, audit and command result. A lot-only recall, an exact replay,
      and a later recall of the already recalled variant add no menu revision.
      An injected audit failure rolled back the recall and allowed retry with
      the same key. Isolated schema-49 regression: revision 10 before the fix
      (`modifiers-1795494892358.log`); PASS with revision 11 and the recall
      transition recorded (`modifiers-1795494961356.log`, exit 0, cleanup
      verified). Focused Go checks passed for inventory, restaurant, storefront
      and transport. Payment admission and cross-writer acceptance remain open.
- [/] Isolated schema-49 concurrency checks observed both lock waits:
      a modifier edit held the organization lock while blocked on modifier
      options, and the retained setup or import writer waited behind it.
      Each pair committed in sequence, kept the new modifier and price, and
      added exactly two revisions. Replays added none and returned the original
      modifier result. `modifiers-1795495088070.log`: exit 0, cleanup verified.
      The inverse order also passed: with setup or import holding the
      organization lock first, the stale modifier edit and its retry both
      returned conflict without a result or changes to modifier groups.
      Each writer committed exactly one revision and preserved its new price.
      `modifiers-1795495210548.log`: exit 0, cleanup verified.
- [/] While the first restaurant waited on its organization lock, a second
      restaurant with a different assured Owner committed under the same
      request key. The two writes advanced their own revisions to 18 and 1.
      Scoped runtime queries returned only their own history, and foreign item
      reads and edits returned no payload. A first fixture reused one account
      and waited on the existing MFA account lock (`modifiers-1795495324039.log`);
      the distinct-Owner fixture passed on isolated schema 49
      (`modifiers-1795495418203.log`, exit 0, cleanup verified).
      Stale payment admission still needs coverage.
- [/] Internal Owner read now returns the scoped modifier projection and shared
      revision under the same organization lock, with live MFA rechecked before
      returning. On isolated schema 49 it returned the committed revision and
      choices after each of the four cross-writer sequences; an expired session
      after a verified lock wait returned neither revision nor choices.
      `modifiers-1795495573960.log`: exit 0, cleanup verified. Focused Go checks
      passed for restaurant, storefront and transport. The retained payment
      path uses an existing order snapshot; native confirmation revalidation
      still needs its own checkout admission path and acceptance coverage.

- [/] The native quote pricing component resolves selected choices inside the
      caller's scoped menu transaction and returns stable group/option IDs,
      labels, exact extra prices, and their sum in minor units. The domain test
      verifies exact addition and stable ordering; isolated schema 49 verified
      the stored 12.35 extra and denial of a disabled option
      (`modifiers-1795495726725.log`, exit 0, cleanup verified). Focused Go
      checks passed for restaurant, storefront and transport.
- [/] Internal native menu quote now reads scoped item eligibility, choices
      and revision within the caller's consistent transaction. It calculates
      line totals and subtotal from server prices, preserving separate lines
      when the same item has different selections. The focused Go tests
      verified line totals of 124.70 and 50.25, subtotal 174.95, the returned
      revision, and rejection of fractional count quantities. Storefront,
      restaurant and transport Go tests passed. This quote path still needs
      isolated PostgreSQL verification, confirmation binding and checkout
      admission. Retained quote and payment routes are unchanged.
- [/] Native menu confirmation now binds the restaurant and priced line
      projection. Revalidation recomputes it within the caller's locked
      checkout transaction. Go tests show that an unrelated revision can
      preserve confirmation, but a changed quantity, base or option price,
      category, unit, or sale eligibility returns a quote conflict and no
      priced result. Focused storefront, restaurant and transport tests
      passed. On isolated schema 49, the runtime role priced two selections
      of one item at 194.70 and 85.25 (subtotal 279.95) and accepted the same
      confirmation while unchanged. Within savepoints under the organization
      lock, a category rename, a unit rename, disabling a selected option, and
      recording a variant-wide recall each returned a quote conflict with no
      priced result. `modifiers-1795496141334.log`: exit 0, cleanup verified.
      This verifies repricing against PostgreSQL.
- [/] Native checkout quote now binds the menu confirmation, fulfillment
      mode, configured flat delivery fee and final total. With menu subtotal
      279.95 and delivery fee 15.25, schema-49 acceptance verified total
      295.20 and accepted the unchanged confirmation. A fee change, mode
      change or stale menu returned a quote conflict without a payable total.
      Focused Go checks passed; `modifiers-1795496316630.log`: exit 0, cleanup
      verified. Cart authority, delivery area validation and actual payment
      admission remain open, along with the B14 decisions.
- [/] VLP-015 delivery-area predicate: internal Go validation compares
      the geographic distance between confirmed points against the restaurant's
      radius in meters. Focused tests cover in/out near the threshold, missing
      and invalid points, missing radius, and crossing the antimeridian.
      Storefront, Restaurant and Transport package tests passed locally.
      Restaurant radius settings, delivery-point confirmation, checkout
      enforcement and end-to-end acceptance are still open. No live checkout
      or public API uses this predicate yet.
- [/] Internal prepayment check now combines stored mode availability,
      delivery-area validation and locked quote revalidation. On schema 49,
      an open Delivery request inside the radius kept its confirmed 295.20
      total. Missing location, out-of-area delivery, stale confirmation and a
      mode pause each returned an error with no quote. Go package tests passed;
      `modifiers-1795497043967.log`: 29 PASS entries including parents, no
      FAIL/SKIP, exit 0, cleanup verified. Cart authority, the source of
      confirmed delivery inputs, persisted intents and payment effects remain
      open. No API exposes this check yet.
- [x] Single-restaurant pricing boundary: an empty cart and a cart with a
      valid local line followed by a real second-restaurant variant returned
      no items, subtotal or confirmation. Revalidation returned ErrQuote with
      no payable result in both cases. Isolated PostgreSQL schema 49:
      `modifiers-1795497163145.log`, 30 PASS entries including parents, no
      FAIL/SKIP, exit 0 and verified cleanup. This does not establish saved-cart
      ownership, expiry or payment-intent behavior.

- [/] Native order availability: [D02](design.md#native-order-availability-contract-t12-proposal)
      records the Owner settings contract and public admission predicate for
      VLP-007/VLP-032. It separates weekly hours and pause from editable setup,
      preserves legacy fulfillment semantics, and defines checks for races,
      replay and paid or unknown obligations. The Owner API, schema and web
      client now have focused evidence under T3.1/T4.1/T5.2/T5.3. Public
      admission is still open. Changes to unpaid payment attempts depend on B03.
- [/] Native admission can now read stored service-mode flags and hours in a
      caller-scoped transaction under the restaurant lock. The caller must
      establish selling eligibility and sample server time after taking the
      lock. On isolated PostgreSQL schema 49, no saved schedule denied new
      orders; a Pickup pause left Takeaway open; a false selling-eligibility
      input, disabled mode and the exact closing time were denied. Go package tests
      passed. `modifiers-1795496721575.log`: exit 0, temporary resources removed.
      On schema 49, the actual Owner pause write and a scoped admission check
      were tested in both lock orders. PostgreSQL reported the competing
      transaction waiting; admission first saw open settings, and pause first
      committed before admission returned PAUSED. `green-1795496914759.log`:
      50 PASS entries including parents, no FAIL/SKIP, exit 0 and verified
      cleanup. The internal checkout validator also rejected paused Pickup with
      `ErrClosed` and no quote, rejected reuse of a Pickup confirmation for
      Takeaway with `ErrQuote`, and accepted a matching Takeaway confirmation
      for `279.95` with a `0.00` delivery fee. The schema-49 `check-availability.mjs
      modifiers` run (`modifiers-1795528259283.log`) exited 0 with 33 PASS
      entries including parents, no FAIL/SKIP, populated downgrade/reapply,
      and verified container/network cleanup. This check does not create an
      order or payment and does not exercise public HTTP or a browser.
      The public caller, committed order/replay behavior and independent
      review remain open. No payment or retained route behavior changed.
- [/] Internal checkout admission now denies `DINE_IN` until it can validate
      a scoped private table session. With the mode on, hours open and a
      matching price, the isolated regression first returned a quote
      (`modifiers-1795535402526.log`); it now returns not found with no quote.
      The first attempt used a disabled fixture and did not reproduce the
      issue (`modifiers-1795535334814.log`). `check-availability.mjs modifiers`
      on schema 49 exited 0 with 33 PASS entries including parents, no FAIL/SKIP,
      and verified cleanup (`modifiers-1795535462541.log`). Tests retained the
      Pickup, Takeaway and Delivery checks. Storefront/Restaurant Go tests and
      Storefront vet passed. No route, migration or session implementation was
      added; independent review remains open.
- [/] Native table QR: [D02](design.md#native-table-qr-and-private-session-boundary-t12-proposal)
      records the existing native setup and legacy checkout callers, separates
      public table identification from private session authority, and proposes
      private proof transport, scoped persistence, and lifecycle denials.
      T1.3 review, reload/lifetime/table-change policy, and the versioned
      producer/consumer remain open; saved-cart behavior depends on B14.
- [/] [D02 v1 wire draft](design.md#proposed-v1-paths-and-payloads)
      specifies resolve, explicit Dine-in start and end payloads and denials.
      It separates a lost start response from order/payment recovery and
      specifies how end and order admission interact. Review and session
      lifecycle decisions are required before exposing these paths.
      The existing contract checker passed (18 modules, 116 routes), which
      verifies the retained inventory only; the new paths are design-only.
- [/] [D02 persistence draft](design.md#proposed-persistence-and-transaction-checks)
      traces the native table's composite organization key and the existing
      storefront organization write lock. Requires a post-lock wall-clock
      expiry check and serial end/admission without touching committed work.
      No schema or runtime behavior was changed; add contention tests when
      the session lifecycle and authority are accepted.
- [/] Internal native QR lookup resolves the issued QR only for an active
      native table in the addressed restaurant with QR enabled. Its JSON
      projection contains only the table code and name. On isolated schema 49,
      repeated scans resolved the same table; missing/wrong QR, a different
      organization ID, inactive table and disabled QR returned no context.
      `green-1795497827423.log`: 51 PASS entries including parents, no FAIL/SKIP,
      exit 0, cleanup verified. No route or private customer session was added.
- [/] A normal organization setup edit with QR still enabled now preserves
      the QR of an existing active table. Explicit generation still issues a
      QR, and the explicit branch path is unchanged. The isolated RED run
      (`green-1795497994479.log`) reproduced QR reissue on a rename; GREEN
      (`green-1795498052864.log`, exit 0) verified that the original QR still
      resolves to the same table with the new name and no token is reissued.
      Both runs cleaned up their resources. Go package tests and OpenAPI
      inventory passed. Independent review, browser acceptance and the
      policy for disabling and re-enabling QR remain open.
- [/] The setup web client now sends `qr_enabled` for organization edits and
      retains `generate_qr` for explicit branch setup. The failing client test
      reproduced `generate_qr: true` on a branchless edit; the client and
      mounted setup tests now pass for both paths (95/95). Web typecheck
      and focused ESLint passed. Chromium on the current static build with
      intercepted APIs verified edits at 390 and 1280 CSS pixels: keyboard
      submit sent the existing table code and `qr_enabled` without a generation
      or branch flag, then reached Payments without displaying a new secret.
      The table field stayed in the viewport with a longer name. The focused
      Playwright run passed 6/6 including the four Pickup viewports. This is
      browser behavior with synthetic responses, separate from the Go and
      PostgreSQL evidence above. A follow-up Chromium run at 360 CSS pixels
      used the current web build, real Go API, a TOTP-verified fixture Owner
      and disposable schema-49 PostgreSQL. The form renamed a branchless
      table, the API returned 200 with no issued QR, and PostgreSQL retained
      the same table ID and QR hash. The first run reached a later setup
      step; the successful run returned to the table form before editing.
      `check-qr-browser.mjs 360` exited 0; both runs removed their isolated
      container and network. Independent review remains open.
- [x] QR regression evidence: an ordinary enabled save adding T2 returned
      only T2's QR, and the original T1 QR and new T2 QR both resolved to
      their own tables. Explicit rotation of T1 retained its table ID,
      issued a new QR and caused the previous QR to return not found.
      `check-db.mjs green` passed on disposable schema 49 and removed its
      container and internal network (`green-1795498847287.log`).
      This test-only follow-up leaves disable/re-enable policy and independent
      review open; no public QR route or private table session was added.
- [x] Native QR tenant isolation follow-up: two synthetic restaurants both
      had an active `T1` and issued distinct QR values. Each scoped runtime
      transaction resolved its own QR and returned no context for the other
      QR, including when the caller passed the other restaurant ID.
      Schema-49 `check-db.mjs green` exited 0 with 61 PASS entries including
      parents, no FAIL/SKIP, and verified tmpfs/network cleanup
      (`green-1795534562389.log`). This verifies the internal lookup, not
      public HTTP admission or private session behavior.
- [x] Retained Guest Tracking contract: OpenAPI now records exact order and
      storefront proof binding, a proof sent in the JSON body only, and
      `Cache-Control: no-store` for success and denial. The contract checker
      ties the route to the write-only proof schema, redacted success shape
      and standard 404 envelope. `npm run contracts:check` passed (18 modules,
      116 routes); 56 storefront API, tracking and storefront web tests passed.
      T1.3 records the isolated HTTP producer evidence. No runtime endpoint,
      native table session or guest-claim behavior changed.
- [x] TOTP replacement contract checkpoint: the two `/api/v1/auth/mfa/recovery`
      operations are wired by the identity Go router and consumed by
      `mfa-api.ts` and `/security`. Start returns the pending setup data;
      confirmation returns ten unique recovery codes once and revokes prior
      sessions. The contract checker now asserts both operations' cookie/CSRF
      boundary, request fields, proof formats, response references and error
      envelopes. `npm run contracts:check` (18 modules / 116 web routes),
      the identity Go package tests (no database DSN) and 19 focused web tests
      passed. Existing isolated HTTP/replay evidence is recorded under T1.3.
      No new endpoint or manual recovery policy was introduced.
- [ ] Inventory affected producers/consumers and define approved request/response/error/event projections, pagination and idempotency. Extend existing contracts or introduce compatible restaurant-native contracts only after ownership is settled.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: backend-engineer. Dependencies: T1.1; affected policy inputs.
Design: [D01](design.md#d01), [D05](design.md#d05), [D14](design.md#d14).
Future files: packages/contracts/openapi.yaml; packages/contracts/routes.json; apps/api/internal/transport; apps/web/src/lib.
Acceptance: Every changed route has a producer, consumer and contract test; no guessed public endpoint or destructive compatibility removal. Partner APIs cannot create orders.

<a id="t1-3"></a>

### T1.3 Define customer, Owner, Admin and guest authority

- [/] [D05 authority matrix](design.md#authority-matrix-for-the-native-restaurant-flow-t13)
      records required actor and resource checks, the QR/order-proof boundary,
      and denial criteria for claims, transfer, revocation and sensitive
      actions. Runtime coverage, independent review and policy inputs remain open.
- [ ] Specify single active Owner, platform Admin capabilities, customer/guest proof, required MFA/reauth/recovery, context revocation and legacy branch isolation. No new staff/co-owner module.
- [x] Platform Admin lifecycle on schema 49: `check-mfa.mjs admin-lifecycle`
      exited 0 with seven selected subtests and their parent passing, no
      failures or skips (`admin-lifecycle-1795513914737.log`). Synthetic
      grant/revoke and replay, eligibility, immutable audit, rollback on
      audit failure, concurrent duplicate grant, and concurrent MFA revocation
      passed. The runner confirmed removal of the disposable container and
      internal network. This refreshes selected lifecycle evidence; it does not
      provision a real Admin or verify the complete Admin capability matrix.
- [/] Design and verify five-minute sensitive authority using actual primary proof
      and current TOTP for the same account and session. The Google callback
      currently issues a local session without reading the provider's
      authentication time; local session creation and token issuance cannot
      establish Google freshness. Use a verified `auth_time` claim where
      available, fail closed on missing/stale proof for sensitive actions, and
      preserve standard sign-in. Do not infer freshness for retained sessions.
      Verify local parser and policy tests before any live provider acceptance.
- [x] Extract optional Google authentication time only after existing ID token
      checks. Preserve older timestamps as-is and treat absent, malformed,
      future, post-issuance and out-of-range data as no freshness evidence.
      Signed token tests failed before extraction and on the independent review
      finding for maximum `int64`. Both now pass with
      `go test ./internal/modules/identity -count=1` and
      `go vet ./internal/modules/identity`. Scoped independent re-review found
      no remaining issues. No live provider or database acceptance is implied.
- [x] Google session persistence (synthetic provider identity, real database):
      `check-mfa.mjs recovery` exited 0 (`recovery-1795463689882.log`) on
      isolated PostgreSQL schema 45. The real Google completion service issued
      sessions for the linked fixture account, preserved recent and older
      provider timestamps exactly, and stored NULL when proof was absent.
      The existing recovery HTTP/replay and downgrade checks passed in the
      same run; task-owned resources were removed. Live provider delivery
      remains unverified.
- [x] Persist verified primary proof for newly issued sessions and add the
      transaction-bound five-minute check for that proof and current TOTP.
      Schema 44 leaves retained sessions without proof. RED
      `recent-mfa-1795456369451.log` showed acceptance without primary proof.
      GREEN `recent-mfa-1795456543469.log`: 35 PASS, 0 FAIL/SKIP, exit 0;
      current password plus TOTP, wrong session, absent/stale primary proof,
      ordinary MFA preserved, and expiry before final recheck. Retained fixture
      digest unchanged; downgrade/reapply without proof passed and populated
      downgrade refused with session rows unchanged. Full Go test/vet passed.
      Scoped independent review found no actionable issues.
- [ ] Apply the recent-proof gate to approved sensitive commands as they are
      implemented. Verify Google proof delivery and user recovery behavior in
      the applicable runtime; local tests did not contact Google.
      T5.4 independently reviewed the isolated PostgreSQL checkpoint for
      persisting verified Google primary proof. The follow-up isolated schema-45
      test (`recovery-1795464194834.log`, exit 0) also loads each issued session
      through the identity service and completes a real TOTP challenge.
      Before challenge, all three sessions are denied; after challenge, only
      the recent proof passes the five-minute gate. Older and absent proof are
      denied even with fresh TOTP. A subsequent run
      (`recovery-1795464391526.log`, exit 0) extends all three cases through
      HTTP start and callback, PKCE exchange, signed ID token verification
      and session issuance with an offline provider fixture. Live Google
      callback proof delivery remains open.
      Google authorization now explicitly requests ID-token `auth_time`.
      Google documents a separate Session age claims setting on the OAuth
      project; local tests do not establish its configuration or verify claim
      delivery. The application does not force reauthentication at Google or
      treat token issuance as fresh primary proof.
      VLP-070 names receiving-account changes, ownership transfer and ads
      credit refunds. No corresponding writers were found in the current API.
      Attach the gate to the verified receiving-account workflow, T3.8 owner
      transfer and T6.9 credit-refund commands as those writers are implemented.
      Existing bank-transfer payment settings are booleans, not receiving-account
      records; inventory transfers and food refunds are separate workflows.
- [/] Implement restricted TOTP replacement with a recovery code and fresh
      primary proof. Schema 45 and internal service stage an encrypted replacement
      bound to its initiating session without consuming the code or modifying
      the current factor. Confirmation with the new TOTP atomically consumes the
      code, replaces the factor, creates new verifiers, revokes prior sessions,
      and audits. Current disposable PostgreSQL evidence:
      `recovery-1795457059437.log` (exit 0), including cross-account/session denial,
      stale proof, abandoned staging, concurrent confirmation, replay, audit
      failure rollback, empty downgrade/reapply and populated downgrade refusal
      with exact state preservation. Full Go test and vet passed. Scoped
      independent review of the internal flow excerpts, exact migration, grants
      and current cleanup behavior found no actionable issues. Public HTTP
      and typed client are wired; disposable PostgreSQL
      `recovery-1795457325760.log` (exit 0) covers Origin, CSRF, malformed
      input, successful start/confirmation, no-store and replay denial.
      Full Go test/vet, contract inventory, TypeScript and 17 focused MFA
      tests passed. Scoped independent HTTP/client review found no actionable
      findings. The `/security` screen now stages the replacement, requires
      acknowledgement before discarding newly issued codes, and directs the
      user to sign in again. Lost confirmation leaves no retry action or code
      redisclosure. Current component/API/redirect tests: 31 PASS; typecheck
      and build PASS; scoped UI review found no actionable issues. Chromium
      with intercepted APIs: 4 PASS at 360/390/768/1280px, including keyboard
      activation, focus, Thai text at enlarged size, lost response, password
      sign-in and new session challenge. Physical devices, live Google and
      combined browser-to-database acceptance were not exercised. Manual
      evidence-based recovery remains unresolved.
      Fresh isolated PostgreSQL run `recovery-1795458036065.log` (exit 0) also
      proves recovery through HTTP, actual password sign-in, denial of recent
      MFA before challenge, rejection of the already consumed confirmation
      TOTP step, and acceptance of the next replacement TOTP and recent MFA.
- [/] Reconcile retained private authorization call sites. Removed the two
      unreachable raw storefront payment helpers; the seven retained payment
      review, reconciliation and refund callers still use the typed MFA gate.
      Full Go test/vet and diff checks passed; scoped independent review found
      no actionable findings. Inventory's only remaining raw
      authorization caller is the QuickStock service method; its old HTTP route
      remains retired, and the underlying inventory code is retained.
      A fresh production-source search found no `QuickStock` callers. The
      composed API router test verifies the tenant context route is mounted
      while retired QuickStock, role, member and invitation routes are not
      registered under any method. `go test ./internal/transport -count=1 -v`
      passed; this is route registration evidence, not a test of the dormant
      inventory method or of future sensitive writers.
- [x] Anonymous HTTP boundary: `TestOrganizationRoutesRejectAnonymousRequests`
      walks the composed router and sends a request without a session to
      each mounted organization method/path pair. All 276 returned
      `401 UNAUTHENTICATED` without a `data` field in the current rerun.
      `go test ./internal/transport -count=1 -v` exited 0 without database
      access (`.local/velopos-transport-authority.log`). This covers the outer
      session gate; it does not establish MFA, resource permissions or guest
      order proof.
- [x] Retained guest tracking HTTP boundary: on isolated schema 46, each of
      two synthetic orders returned a redacted projection with its matching
      proof. Missing proof, a different order's proof, and the correct proof
      sent to a second real fixture shop all returned `404 NOT_FOUND` with
      no order data. The source shop's protected business rows were unchanged.
      `check-db.mjs guest-proof` exited 0 with 50 PASS entries including
      parent tests, and its temporary container and network were removed
      (`guest-proof-1795478088036.log`). This verifies retained tracking, not
      native table-session proof or member claims.
- [x] Guest tracking after unpublishing: the public storefront no longer
      resolved, but the exact proof still returned each cancelled fixture
      order with private fields omitted. Missing, wrong-order and wrong-shop
      proof still returned 404. All cases returned `Cache-Control: no-store`
      and left the protected business rows unchanged. The first run confirmed
      the existing live-order guard refused unpublishing; the rerun cancelled
      the two synthetic orders through the existing service before unpublishing.
      Isolated schema 46: 57 PASS entries including parents, exit 0, verified
      fixture cleanup (`guest-proof-1795490451178.log`; first run
      `guest-proof-1795490345643.log`).
- [/] Reconcile current acceptance against D05. These are checkpoints for
      currently implemented paths, not acceptance of the full capability matrix.

| Boundary | Existing evidence | Required evidence still open |
| --- | --- | --- |
| Anonymous organization requests | Composed router: all 276 mounted method/path pairs denied without data. | This covers only requests without a session. |
| Retained Purchasing and Returns | Schema 49 HTTP MFA and tenant denial matrices, populated reads, selected write/replay cases, and denial for all four branch-assigned legacy roles and revoked Owner sessions across 36 Returns and 57 Purchasing routes. Purchasing also covered the branch-filtered order list. T5.3 verified nine retired web bookmarks at four emulated widths without calling the retired workflows; current disposition is in the architecture route inventory. | Remaining positive and mid-request expiry outcomes. Test any active replacement journeys separately; retired bookmark coverage does not verify the retained APIs. |
| Retained guest order proof | Matching proof succeeds on both fixture orders; missing, wrong-order and wrong-shop proof fail, including after unpublishing. | Native private table-session rotation and atomic member claims require their own contracts and runtime checks. |
| Native Restaurant Owner | Setup and ordering availability have scoped Owner, MFA and cross-restaurant checks. The retired membership and role routes are absent. | Transfer must revoke the former Owner's authority while preserving obligations; no inference about retained ownership from route retirement. B10/B12/B13 apply. |
| Platform Admin | Schema 49 verifies the audited grant/revoke command lifecycle on synthetic users. | Operation-specific permissions and target checks must be verified with each implemented Admin workflow. Provisioning does not prove these checks. |
| Fresh proof and recovery | Local five-minute policy and verified-provider-claim fixtures, plus restricted TOTP replacement; see the recorded checkpoints in this task. | Live Google claim delivery, manual B12 evidence policy, and enforcement on the receiving-account, transfer and ads refund writers when implemented. |

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

- [/] Migration 48 adds append-only restaurant menu revisions with before/after
      state, actor and optional exact-retry key and fingerprint. Runtime has
      scoped SELECT/INSERT; cross-restaurant and missing actor context,
      duplicate revision/key, UPDATE and DELETE were denied. Transaction
      rollback, empty downgrade/reapply and populated downgrade refusal passed
      on isolated PostgreSQL (`menu-revisions-1795493210277.log`, exit 0,
      verified cleanup). The preceding red run confirmed the table was absent.
      Go requires clean schema 48. Writer integration and independent review
      remain open.
- [x] On the current Go build, readiness rejected clean schema 47 and accepted
      clean schema 48. Scoped modifier reads and the Owner session-expiry case
      passed on schema 48 (`modifiers-1795493268641.log`, exit 0, verified
      cleanup). This is a focused rerun, separate from the schema-47 aggregate.

- [/] Migration 47 adds modifier groups and options scoped to registered menu
      items and pairs them with clean-schema-47 server readiness. No backfill;
      runtime grants are SELECT only. The Go query loads one item and preserves
      exact two-decimal option prices. `check-availability.mjs modifiers`
      on task-owned PostgreSQL 17.6 passed 46-to-47 upgrade, unchanged
      synthetic profile digest, empty downgrade/reapply, populated downgrade
      refusal, wrong-item and cross-restaurant key denial, price constraints,
      and Go reads as `smartpos_runtime` (`modifiers-1795491995467.log`, exit 0).
      The temporary container and network were removed. Independent review,
      shared menu revision, Owner writes and actual retained-data acceptance
      remain open.
- [x] Schema-47 follow-up: seeded three registered items in two restaurants
      before upgrading from schema 46. Counts and digests for categories,
      units, products, variants and registered items matched after upgrade,
      empty downgrade/reapply and populated downgrade refusal. Go readiness
      as `smartpos_runtime` rejected clean 46 and dirty 47, accepted clean
      47, and the scoped modifier read passed again. The test used synthetic
      data and a simulated dirty marker (`modifiers-1795492161826.log`, exit 0,
      container/network cleanup verified).

- [/] Migration 46 adds `restaurant_availability` without a backfill or changes
      to saved profiles. The runtime has scoped SELECT/INSERT/UPDATE and no
      destructive table privileges. `check-availability.mjs` exited 0 on
      isolated PostgreSQL (`availability-1795466064531.log`): schema 45 to 46,
      retained profile digests, empty downgrade/reapply, cross-organization
      read/update/insert isolation, runtime TRUNCATE denial and populated
      downgrade refusal passed. Container and network cleanup passed. Go
      readiness now requires clean schema 46; independent review, service
      transaction tests and full retained-schema-39 acceptance remain open.
- [ ] Add scoped keys, uniqueness, immutable ledger/event links, RLS/check/index constraints and readiness updates needed by the selected slice. Recheck latest version before allocating; never edit applied 000001-000039.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: database-engineer. Dependencies: T2.1,T1.2; slice policy inputs.
Design: [D01](design.md#d01), [D06](design.md#d06), [D07](design.md#d07), [D08](design.md#d08), [D09](design.md#d09), [D10](design.md#d10), [D13](design.md#d13).
Future files: database/migrations (next unused versions); apps/api/internal/platform/database; tests/integration.
Acceptance: Fresh and retained-schema-39 upgrades pass against confirmed isolated task-owned targets. Verify counts/hashes of preserved data, denial paths, duplicate/replay and race constraints. No assumed disposable primary DB.

<a id="t2-3"></a>

### T2.3 Prove migration rollback refusal and forward recovery

- [x] Synthetic migration 48 recovery rehearsal: golang-migrate v4.18.3
      marked an interrupted upgrade `48|t` and refused retry. The history
      table was absent and baseline and modifier digests were unchanged.
      After confirming the disposable schema was still at 47, the harness
      restored its marker and successfully applied the original migration.
      Empty down/reapply passed. A downgrade with a synthetic history row
      refused at `47|t`; the history and earlier digests survived both the
      refusal and recovery to `48|f`. `check-retained-48.mjs retained-48`
      exited 0 (`retained-48-1795533141444.log`); tmpfs and network cleanup
      were verified. The first run stopped before the injection because its
      source lacked migration 47 (`retained-48-1795533033487.log`) and also
      cleaned up. No tracked migration or operational database changed.

- [x] Schema 49 privilege downgrade and reapply on populated synthetic data
      (`check-availability.mjs modifiers`, `modifiers-1795497295183.log`, exit 0).
      The down SQL revoked runtime modifier writes without removing reads.
      Runtime UPDATE probes were denied for both tables, and the Go readiness
      check rejected the schema-48 marker. Reapplying the original migration
      restored both scoped writes and schema-49 readiness. Row counts and
      digests for groups, options, menu items, revisions and audit events
      matched throughout. 32 PASS entries including parents, no FAIL/SKIP;
      task-owned resources removed. The harness moved the version marker on
      the disposable target; this is not a production downgrade rehearsal.

- [x] Synthetic retained schema 39 through 49: the real golang-migrate
      v4.18.3 runner marked migration 49 dirty after an injected pre-commit
      failure and refused to retry. The two modifier tables kept schema-48
      grants and their rows, revision history and retained fixture digests
      were unchanged. After verifying that state, the harness recovered the
      marker to clean 48 and applied the original migration to clean 49.
      Scoped writes were restored and all compared data stayed intact.
      `check-retained-46.mjs retained-49` exited 0; evidence is in
      `retained-49-1795497428795.log` with cleanup verified. No production or
      retained database was used.

- [x] Populated schema 49 downgrade and reapply through golang-migrate
      v4.18.3: `check-retained-46.mjs retained-49` exited 0
      (`retained-49-1795534326291.log`). `down 1` reached clean 48 and
      revoked modifier INSERT/UPDATE privileges while leaving SELECT in
      place. `up 1` restored the grants and reached clean 49. Modifier,
      revision, and retained business/session/audit fixture digests matched
      before and after both transitions. The task-owned tmpfs container and
      internal network were removed after ID/label verification. This was a
      synthetic rehearsal; the current Go build still requires clean 49.

- [x] Synthetic retained schema 39 through 47: real golang-migrate v4.18.3
      marked interrupted migration 47 dirty and refused retry. Both modifier
      tables were absent after rollback and existing business, session,
      recovery and availability digests matched. On the disposable database,
      after confirming schema 46, marker recovery and original migration
      reapply succeeded. Empty downgrade/reapply worked; a populated
      downgrade refused and preserved the group and existing digests.
      `check-retained-46.mjs retained-47` exited 0 and verified cleanup
      (`retained-47-1795492987121.log`). No actual retained database was used.

- [x] The platform Admin command guide points to the build's required clean
      schema and to the disposable recovery evidence here.
      Migration 43 introduced platform authority; the guide does not authorize
      recovery on an operational database.
- [x] 2026-11-24 schema 45 pre-commit recovery rehearsal: `check-db.mjs
      retained-current` exited 0 (`retained-current-1795459792973.log`). On
      task-owned PostgreSQL seeded from schema 39, the harness marked version
      45 dirty, then injected an error after 45's DDL and before commit. The
      new table was absent, both prior constraints matched, and retained rows
      and session digests were unchanged. After verifying schema 44 structure,
      the harness reset only its simulated marker and reapplied the unchanged
      migration 45. The synthetic schema upgrade and ID/label cleanup passed.
      This exercises PostgreSQL transaction rollback and forward reapply; it
      does not test dirty-marker handling by the official migrator.
- [x] Official migrator checkpoint: `check-db.mjs retained-official` exited 0
      (`retained-official-1795460052773.log`). The golang-migrate v4.18.3 CLI,
      built offline from cached source with the PostgreSQL driver, set schema
      45 dirty after the injected error and refused retry. The pending table
      was absent, both prior constraints matched and the retained digests were
      unchanged. Only then did the harness use `force 44` on its disposable
      database and run the unmodified 45 migration, leaving clean version 45
      with the original fixtures preserved. ID/label cleanup passed. This was
      the upstream CLI, not the Docker image; it was not a live recovery.
- [x] Populated schema 45 downgrade through the same CLI: `check-db.mjs
      retained-official` exited 0 (`retained-official-1795463784694.log`).
      With synthetic recovery audit and rate-limit rows present, `down 1`
      refused and left a dirty target marker at 44, while the actual schema
      stayed at 45. Recovery row digests, retained business/session digests,
      the pending table identity and both constraints matched before and after
      refusal. After those checks, the harness restored the marker to clean 45
      on its disposable target and verified the same state again. Cleanup by
      ID/label passed. No migration file or live database changed.
- [x] Schema 46 pre-commit recovery rehearsal: `check-retained-46.mjs
      retained-46` exited 0 (`retained-46-1795478894665.log`). After an
      injected failure before commit, golang-migrate v4.18.3 marked version
      46 dirty and refused retry. The availability table was absent and
      schema-45 checks plus retained fixture digests matched. The harness
      recovered only the disposable marker, then applied the original
      migration to clean 46 and checked FORCE RLS and the tenant policy.
      Empty downgrade/reapply and populated downgrade refusal also passed.
      The first run stopped before the injection because the isolated
      source lacked version 45 (`retained-46-1795478840066.log`). Both runs
      removed task-owned resources. No operational database was used.
- [x] Documented the operational decision points in the [database recovery
      guide](../../docs/database/overview.md#migration-recovery-for-the-current-velopos-build),
      including the difference between dirty upgrade and downgrade markers,
      catalog/data checks before recovery, and handoff to the release operator.
      This records the procedure; no operational drill or approval is implied.
- [ ] Operational recovery: the authorized database operator owns target
      identity, stopping writers and capturing the migration log, schema
      version, structure and retained-data evidence. The release operator
      resumes writes only after the database operator verifies the recovered
      schema and readiness. If the actual structure does not match the prior
      clean version, stop and obtain a reviewed forward repair; the disposable
      rehearsal does not authorize resetting real migration metadata.
- [ ] Exercise empty-target reapply where supported; refuse populated destructive rollback and document forward recovery for partial/dirty states with named operator ownership.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: database-engineer. Dependencies: T2.2.
Design: [D01](design.md#d01), [D16](design.md#d16).
Future files: database/migrations; owning migration tests; docs/database.
Acceptance: Captured fresh/retained and recovery outputs show no business-data loss. Unavailable database acceptance stays BLOCKED, not substituted by static SQL checks.

<a id="t3-1"></a>

### T3.1 Implement verified setup, menus, modes and table sessions

- [x] Branchless catalog and Owner quote agree on unavailable menu items.
      Inactive products, categories and units, unsupported currency and a
      product recall marked the item not saleable and rejected the quote
      with no items, total or quote ID. The isolated schema-46
      `check-db.mjs green` run exited 0 with 42 PASS entries including
      parents, no FAIL/SKIP and verified temporary resource cleanup
      (`green-1795490666352.log`). No public admission or modifier behavior
      changed.

- [x] Retained storefront pause compatibility: after a synthetic order was
      confirmed paid, the real settings service paused the published fixture.
      A new quote returned `ErrClosed`, while the same paid order stayed in
      the kitchen queue and reached `PREPARING` and `READY`. The test restored
      the storefront setting. `check-db.mjs pos-online` exited 0 on isolated
      PostgreSQL 17.6/schema 46 with 218 PASS entries including parents, no
      FAIL/SKIP and verified cleanup (`pos-online-1795479980098.log`).
      See T1.2 for the isolated internal Pickup/Takeaway checkout validator
      evidence. Public native admission and production provider acceptance
      remain open.

- [/] Native availability domain: the restaurant module validates weekly
      windows and evaluates all four modes using the restaurant time zone,
      selling eligibility, enabled mode and global/per-mode pause. Focused
      tests cover exclusive close, inclusive open, split overnight windows,
      invalid/overlapping schedules, empty schedules and Pickup isolation.
      Added eight UTC instants across spring and autumn offset changes to
      verify that windows follow the restaurant's local clock. Restaurant
      package test and vet passed; the package embeds Go's time-zone data.
      The internal evaluator now uses the stored settings shape for all four
      pauses and the global pause. Focused tests verify that each individual
      pause affects only its mode and that an unapproved restaurant is
      unavailable in every mode. The evaluator has no public caller yet.
      Restaurant/storefront Go package tests and restaurant vet passed. The
      predicate is not wired to HTTP or new order admission yet.
- [/] Owner availability service reads and saves revisioned settings on schema
      46 using the existing organization lock and live Owner MFA checks. The
      settings write and audit share one transaction. The isolated `green` run
      (`green-1795466251050.log`, exit 0) passed initial read, non-Owner denial,
      stale revision conflict and persistence, plus fresh migrations and
      verified fixture cleanup. Restaurant/storefront Go test and vet passed.
      Follow-up isolated `green` run (`green-1795466384798.log`, exit 0): two
      writers with the same revision produced one commit and one conflict,
      with exactly one new audit. A forced audit insert failure preserved the
      saved values, revision and audit count; retry at that revision succeeded.
      Verified fixture cleanup. Owner GET/PUT now use the tenant cookie and
      MFA boundary; PUT requires CSRF and a full replacement. OpenAPI and
      the typed web client match. Isolated schema 46 HTTP checks passed for
      no cookie, non-Owner, missing CSRF, malformed input, stale revision
      and save/read round trip (`green-1795466632473.log`, exit 0). Contract
      check, web typecheck and Go restaurant/transport tests passed. The Owner
      ordering-hours panel has focused browser evidence in T4.1 and T5.3.
      The scoped Owner settings review is recorded in T5.4. Native public
      admission and full T3.1 review remain open.
- [x] Cross-restaurant availability HTTP regression: an MFA-assured Owner
      without membership in the target restaurant received `404 NOT_FOUND`
      without data on GET and PUT, even with valid CSRF and the current revision.
      The target settings and audit count were unchanged. Isolated schema 46
      `check-db.mjs green` exited 0 with 36 PASS entries including parent tests
      (`green-1795478693779.log`); no FAIL/SKIP. Both runs cleaned up their
      task-owned resources. The first run expected 403 instead of the existing
      no-membership 404 (`green-1795478604436.log`); only tests changed.
- [x] On schema 46, saving an all-day schedule with no pauses keeps a native
      draft unpublished and unable to accept orders. The isolated test
      verified directory exclusion, public quote/order denial and zero order
      or payment-attempt rows. See `green-1795468794523.log` and T5.2.
- [x] Trace the accepted setup-only baseline to this task. The organization
      setup API persists Pickup separately from Takeaway and accepts Pickup
      as the sole configured mode. See the Pickup slice above and T5.2's
      schema-45 aggregate run for isolated database evidence. Legacy branch
      setup continues to reject the new field. The setup value does not
      control public admission or prove that a restaurant can sell.
- [ ] Complete the remaining availability and table boundaries. The existing
      storefront `accepting_orders` flag is a global switch, not an opening
      schedule or a per-mode pause. Existing table setup issues table tokens;
      it does not demonstrate isolation between successive private customer
      sessions at the same table. Keep existing paid work and retained
      callers while implementing these boundaries after their contracts and
      compatibility gates are settled.
- [?] Merchant verification and receiving-account activation still depend on
      B10's evidence and review rules, B07 for restricted evidence retention,
      and B02 for the applicable provider/recipient proof. Keep completing
      a draft, Admin approval and permission to sell separate. Apply T1.3's
      recent proof gate to the receiving-account writer when it exists.
- [ ] Build Admin-verifiable setup, identity/site/receiving-account approval, independent restaurant context, four service modes, opening schedules, global/per-mode pause and private persistent table QR sessions. Add modifier-capable menu foundation with T3.7.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: backend-engineer. Dependencies: T1.2,T1.3,T2.2; resolve B02/B10 as applicable.
Design: [D02](design.md#d02), [D03](design.md#d03).
Future files: apps/api/internal/modules/restaurant; apps/api/internal/modules/storefront; apps/api/internal/modules/organization.
Acceptance: Tests reject selling before approval, unsafe account changes and cross-restaurant access. Pause does not stop paid work. Same-table orders remain separate; fresh session cannot see previous private data. Replay/stale revision/concurrent setup pass.

<a id="t3-2"></a>

### T3.2 Implement persistent carts and single-restaurant checkout intents

- [/] B14 saved-cart preparation: [D06](design.md#saved-cart-versioning-and-expiry-b14-proposal)
      distinguishes retained browser carts from native guest/member drafts, and
      proposes conflict, expiry and no-side-effect acceptance cases. The product
      decision on inactivity duration is pending. Quota hold and allocation
      remain separate; no runtime cart behavior has changed.
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

- [/] [D03 modifier ownership and revisions](design.md#modifier-ownership-and-revision-boundary)
      identifies the registered item/group boundary, preserves choices on
      legacy setup saves, and defines shared revision and checkout validation
      obligations for T3.1/T3.7/T3.9. Runtime contracts and implementation
      remain open. B09/B14 still govern benefit and quota reservation policy.
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

- [x] VLP-091 retained paid-order snapshot checkpoint: after a synthetic
      payment, changing the live variant price from 10.00 to 11.00 and
      attempting POS settlement left the stored order total and complete
      item snapshot unchanged. Settlement rejected the price drift without
      releasing the existing hold or creating a cart, checkout, sale or
      sale movement. `check-db.mjs pos-online` on schema 49 exited 0 with
      236 PASS entries including parents, no FAIL/SKIP and verified cleanup
      (`pos-online-1795533884152.log`). Storefront vet passed. This covers
      retained checkout price drift, not native modifier/discount snapshots
      or public native checkout.

- [/] VLP-091 ordering availability: the existing Owner save appends
      before/after ordering settings to the shared menu revision history in
      the same transaction as the settings and audit event. The schema-49
      integration test first found no new revision
      (`green-1795514902493.log`); it then passed with exact snapshots and
      rollback on audit failure (`green-1795514967931.log`, exit 0, isolated
      resources removed). Focused Restaurant/Storefront Go test and vet
      passed. Independent review and restore-as-new-revision remain open.
      Follow-up on schema 49: two writers at the same settings revision
      committed exactly one matching history entry; the stale writer
      conflicted. A save with unchanged values advanced only the settings
      revision and preserved the shared menu revision. `check-db.mjs green`
      exited 0 with 53 PASS entries including parents, no FAIL/SKIP, and
      verified cleanup (`green-1795515079737.log`).
- [/] VLP-091 native setup service modes: profile and services saves append
      the effective before/after modes to the shared menu history in the
      existing setup transaction. An unchanged projection or replay does not
      append history. The fixture's concurrent Pickup save and matching
      replays originally found zero entries (`green-1795515334893.log`);
      the schema-49 rerun found exactly one and exited 0
      (`green-1795515591903.log`), with container and network cleanup
      verified. Focused Restaurant/Storefront Go tests and vet passed.
      Independent review remains open.
      Profile follow-up: a forced audit failure left the prior modes and
      history intact. Retrying with the same key enabled Dine-in, retained
      Pickup when omitted from the request, and added one matching history
      entry. Schema-49 `check-db.mjs green` exited 0 with 55 PASS entries
      including parents, no FAIL/SKIP, and verified container/network cleanup
      (`green-1795515983794.log`).

- [/] VLP-091 ordering availability restore: the internal Owner command
      restores a scoped availability snapshot under live MFA and the shared
      organization lock. It appends a new revision with its source revision
      and records the audit in the same transaction. An exact retry returns
      the original result after authorization; a stale base or changed retry
      conflicts. No public route, migration, or paid-order writer was added.
      Isolated schema 49 `check-db.mjs green` exited 0 with 56 PASS entries
      including parents, 0 FAIL/SKIP, and confirmed container/network cleanup
      (`green-1795517446100.log`). Tests cover persisted before/after, intact
      source, one audit, failed-audit rollback, missing source, replay, and
      denial for non-Owner, foreign Owner and Owner without MFA. The earlier
      runs exposed an audit-count assumption and a fixture without a session
      context (`green-1795516768561.log`, `green-1795517120530.log`).
      Independent review and restoration of other menu data remain open.
      Follow-up expiry tests on schema 49 paused the internal restore after
      the audit insert and, separately, after the saved-result lookup. Both
      returned no settings. The interrupted write left the settings, history
      revision, exact replay key and restore audit unchanged; a valid retry
      and replay still produced one new revision and one audit. The isolated
      `check-db.mjs green` run exited 0 with 58 PASS entries including parents,
      no FAIL/SKIP and verified cleanup (`green-1795533423952.log`). Storefront
      vet passed. The expiry checks did not cover COMMIT, and the independent
      review of this T3.9 command remains open.
      Concurrent same-key follow-up: two restore calls released together
      returned the same settings. Readback verified the expected settings,
      one new history revision and one audit; the source revision remained
      intact. Schema-49 `check-db.mjs green` exited 0 with 59 PASS entries
      including parents, no FAIL/SKIP and verified cleanup
      (`green-1795533551483.log`). Storefront vet passed. This exercise does
      not measure the database lock wait or cover competing distinct keys.
      Distinct-key follow-up: two restores using the same base revision
      produced one success and one conflict without settings. The persisted
      settings matched the winner, with one new revision and audit and no
      history row for the losing key. Schema-49 `check-db.mjs green` exited 0
      with 60 PASS entries including parents, no FAIL/SKIP and verified
      cleanup (`green-1795533676467.log`). Storefront vet passed. The test
      released both calls together; it did not measure database lock waits.
      The local review brief `t39-availability-restore-review-brief.md` in
      `.local/velopos-pickup-20261122` maps the command, its authority and
      persistence dependencies, and matching acceptance evidence. Review of
      the command as a whole is pending authorization; no brief was sent.

- [/] [D03 B16 proposal](design.md#b16-proposal-version-1-template-and-apply-policy)
      defines shared CSV/XLSX rows, parser-based candidate limits, preview
      outcomes and atomic apply with revision/audit/retry acceptance. B16
      approval and the T3.7 modifier contract remain open; no import behavior
      changed.
- [/] [B16 parser and preview boundary](design.md#retained-parser-and-native-preview-boundary)
      identifies which retained format checks can be reused and why catalog
      SKU/job updates cannot identify native menu rows. Stable reference
      mapping for repeat imports must be selected before implementation.
      Existing catalog behavior is unchanged.
- [ ] Reuse safe parsing/preview seams for approved restaurant categories/options/toppings. Add duplicate/error outcomes, price/category/status bulk changes, revision/audit and restore-as-new-revision.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: backend-engineer. Dependencies: T3.1,T3.7,T1.3; resolve B16.
Design: [D03](design.md#d03).
Future files: apps/api/internal/modules/catalog/imports.go; apps/api/internal/modules/restaurant; revision/import tests; future scoped web menu UI.
Acceptance: Tests cover malformed/duplicate/wrong-tenant input, selected transactional error semantics, replay/stale revision and immutable paid snapshots. Pending carts revalidate changed price/options/availability. No new media-management scope.

<a id="t4-1"></a>

### T4.1 Build verified setup and menu management UI

- [/] The Owner ordering-hours panel at `/settings` saves weekly windows,
      time zone, and global or individual pauses for the four service modes.
      A stale revision preserves edits until the Owner explicitly discards
      them and reloads. Copy explains that saving does not change public
      ordering yet. Focused availability, settings and workspace Vitest
      cases passed (19/19), and web typecheck passed. See T5.3 for the
      branchless entry check and remaining browser acceptance.

- [/] Four-mode setup display: an existing organization without a branch can
      save Pickup independently of Takeaway, including Pickup-only setup. The
      form explains that saving does not open ordering. Legacy creation and
      branch setup keep their existing three modes and omit the Pickup field.
      Focused Vitest: 92/92; web typecheck and changed file formatting pass.
      Windows Chrome 157 with intercepted API: 4/4 at 360/390/768/1280px,
      Thai and English, checked keyboard focus, accessible description, no
      horizontal overflow in the service mode group, and draft payloads.
      This browser run does not exercise a live database or real touch device;
      full T4.1 visual, accessibility and workflow acceptance remains open.
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

- [x] Availability settings no longer repopulate a removed tenant query when
      a save finishes after the form unmounts. The regression reproduced the
      old cached revision after unmount and eviction; the fix passed 69 tests
      across the form, settings page, tenant provider and restaurant router.
      Web typecheck, focused ESLint and independent review passed. This is
      component evidence for the delayed save. A separate Chromium test at
      1280 x 900 exercised sign-out and sign-in as the same Owner in the same
      document with intercepted API responses. After the old PUT response
      arrived, the form stayed in its loading state while the fresh GET was
      held, then displayed the fresh result. All nine Availability browser
      cases passed. No live API or database was used for this browser test.
      [T5.3](#t5-3) records the separate repeat against Go and PostgreSQL.

- [x] The Owner settings link now uses the tenant query scope (user,
      organization and branch), so selecting another account in the same
      organization shows `/shop` until that account's storefront data loads.
      The query participates in the existing tenant cache cleanup on logout
      and context selection. The synthetic account-switch regression failed
      before the fix and passed with 57 settings/router tests. Typecheck and
      scoped independent review passed. A follow-up component test held the
      first account's response until the second account loaded. The old
      request was aborted and its late response did not replace the current
      link. Settings and router tests passed 58/58; web typecheck passed.
      A live Chromium follow-up at 1280 x 900 switched between two Owners
      in the same restaurant without reloading the document. The real API
      returned 401 after logout. The disposable fixture then replaced the
      sole active Owner with the second account, which signed in and completed
      TOTP. While the second storefront request was held, the settings link
      showed `/shop`; after release it showed the updated fixture slug. The
      isolated schema-46 run exited 0 and cleaned up its container/network
      (`browser-account-switch-1795477721837.log`). The first run failed
      during fixture setup and cleaned up (`browser-account-switch-1795477569313.log`);
      the intermediate run passed with two concurrent fixture Owners and is
      superseded (`browser-account-switch-1795477639452.log`). The SQL fixture
      change does not verify restaurant transfer or PWA behavior.

- [x] Completed organization without a branch: the mounted router now
      resolves dashboard entry through setup to `/settings` instead of
      looping between `/dashboard` and `/setup`. Incomplete setup stays
      at `/setup`, and retained branch completion still reaches the
      dashboard. Branchless completion still retries with the original
      operation key. Chrome with intercepted API responses passed 8/8;
      the organization/workspace Vitest suite passed 173/173 and web
      typecheck passed.

- [x] Current route checkpoint: `/shop` and its cart/checkout/tracking pages
      remain active for customers; account `/security` and permission-gated
      kitchen, order and payment settings pages remain active for Owners.
      `/shop/:slug/track/:orderId` and `/manage/settings/storefront/payments`
      remain compatibility redirects. Retired employee/role links and removed
      ingredient links do not re-enter a workspace; the retired restaurant
      recipe, forecast and quick-stock APIs are not registered. Keep retained
      inventory, point-of-sale and other Go callers until replacement acceptance.
      This does not introduce a platform Admin workspace.
- [x] Scoped checks: 92 web tests across `restaurant-scope`, `workspace-paths`
      and `inventory-hooks` passed, covering direct-link denial and a scope
      change during inventory cache refresh. Go tests for `restaurant`,
      `organization` and `transport` passed without DB DSNs; the contract
      checker reported 18 modules and 116 web routes. This does not accept
      navigation or cache invalidation for planned T4/T6 surfaces.
- [x] Classify the current Customer/Owner/Admin route surface in
      [the architecture route inventory](../../docs/architecture/routes.md#current-velopos-route-disposition).
      Compared mounted React pages, composed Go registration and the
      documented inventory. Fresh verification: 86 web cases across
      `restaurant-scope`, `workspace-paths` and `ProtectedRoute`;
      `TestTenantRouterDoesNotExposeRetiredAuthorityRoutes`; contract
      inventory (18 modules, 116 unique documented entries); all exit 0.
      No routes or retained callers changed. Classify new T4/T6 surfaces
      when their contracts and implementations exist.
- [x] Legacy Owner payment bookmark regression: the mounted React router
      allows an Owner with `storefront.manage` to replace the legacy URL with
      `/settings/payments`, preserving query and fragment. An Owner without
      that permission reaches `/403` without visiting the canonical page or
      requesting sandbox status. With intercepted API responses, the two
      new cases and 86 related web cases passed; TypeScript and focused ESLint
      also passed. No runtime code, provider or database was exercised or changed
      outside the app components mounted by the web tests.
- [x] Legacy Owner payment bookmark, Chrome follow-up:
      `legacy-payment-bookmark.spec.ts` passed 8/8 at 360, 390, 768 and
      1280 CSS pixels on a fresh local build with intercepted API responses.
      Authorized Owners reached `/settings/payments` with query and fragment
      preserved; Owners without `storefront.manage` reached `/403` without
      requesting sandbox status. Both states fit each viewport. This is
      emulated viewport evidence for T5.3, without a live API or physical device.
- [x] Legacy customer tracking bookmark: mounted router tests verified that
      a query-only proof shows the incomplete-link state without any fetch.
      A fragment proof survived the redirect and went only in the JSON body
      of one credentialless tracking POST. A tracking 404 did not trigger a
      payment request. The two web suites passed 67/67; web typecheck, focused
      ESLint and contract inventory (18 modules, 116 routes) passed. This is
      component coverage with intercepted API responses; see T1.3 for the
      existing isolated proof enforcement evidence.
- [x] Legacy customer tracking bookmark, Chrome follow-up:
      `legacy-tracking-bookmark.spec.ts` passed 6/6 at 360, 390 and 1280
      CSS pixels on the current local build with intercepted API responses.
      Query-only proof showed the incomplete-link state without an order
      API call. Fragment proof went only in the tracking POST body, without
      cookies, and a 404 did not trigger a payment request. Both states fit
      their viewport. The initial run exposed the separate auth bootstrap
      request and the static harness's missing referrer policy. The rerun
      modelled the anonymous auth response and used Caddy's configured
      `no-referrer` header; no API request carried the fixture proof in its
      Referer. This does not verify the live gateway or a real mobile device.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: frontend-engineer. Dependencies: T1.2; affected T4/T6 surfaces.
Design: [D01](design.md#d01), [D05](design.md#d05).
Future files: packages/contracts/routes.json; apps/web/src/app; apps/api/internal/transport; route tests.
Acceptance: Inventory, Go/OpenAPI and React consumers have no unexplained mismatch. Direct-link denial and context-change cache tests pass. Removal requires replacement acceptance, not a renamed navigation label.

<a id="t5-1"></a>

### T5.1 Run focused unit, contract and build checks

- [x] Current worktree web and script checks after the Purchases replay
      coverage update: `node node_modules/vitest/vitest.mjs run --root apps/web
      --maxWorkers=4` exited 0 with 928 tests in 99 files
      (`t51-web-1795531501927.log`). The jsdom navigation diagnostic did
      not fail the run. `node scripts/check-contracts.mjs` exited 0 with 18
      modules and 116 unique documented routes. `node --test
      scripts/log-format.test.mjs scripts/dev-stack.test.mjs` exited 0 with
      17 PASS and no failures or skips, using workspace-local TEMP/TMP.
      This covers local web and script checks; database and browser evidence
      remain separate.
      Follow-up on the same implementation: offline `go test -count=1 ./...`
      from `apps/api`, root `npm run build` and `npm run lint` all exited 0.
      Build reported a chunk-size warning; lint reported 0 errors and 12
      warnings.

- [x] After the Purchasing transition and Returns rollback test updates,
      offline `go test -count=1 ./...` and `go vet ./...` from `apps/api`
      exited 0 with integration DSNs unset. `node scripts/check-contracts.mjs`
      exited 0 with 18 modules and 116 unique documented routes. Web
      `tsc -b --pretty false` also exited 0. See T1.3 and T5.4 for the
      separate isolated and independent review evidence.

- [x] After adding the internal native Pickup/Takeaway checkout regression
      and the retained Returns Cashier matrix, Go formatting on the touched
      test files, offline `go test -count=1 ./...` and `go vet ./...` from
      `apps/api`, and `git diff --check` passed. The contract inventory passed
      for 18 modules and 116 documented routes. The offline Go run did not
      use a database; see T1.2/T1.3 for the isolated PostgreSQL evidence.

- [x] After adding the internal ordering availability restore, `go test`
      (with `-count=1`) and `go vet` passed for Restaurant, Storefront and
      Transport with the single-store DSN unset. `node scripts/check-contracts.mjs`
      passed 18 modules and 116 routes. Isolated DB evidence is under T3.9.

- [x] Schema-49 checkpoint after the native table QR regression:
      offline `go test ./... -count=1` and `go vet ./...` exited 0 in
      `apps/api` with integration DSNs unset for the test run.
      `node scripts/check-contracts.mjs` passed 18 modules / 116 routes.
      The separate isolated QR run is recorded under T1.2.
      The web suite first exited 1 (917 passed, 11 failed, including
      timeouts and missing UI elements). A rerun with `--maxWorkers=4`
      and unchanged timeout and assertions exited 0: 928/928 in 99 files
      (`schema49-web-workers4-1795499088854.log`). The initial failures did
      not reproduce on that run; the default-worker result remains recorded.

- [x] After adding the T5.2 Availability RLS regression, offline
      `go test ./internal/modules/storefront ./internal/modules/restaurant
      ./internal/transport -count=1` and `go vet` on the same packages
      exited 0 with the single-store DSN unset. `node
      scripts/check-contracts.mjs` passed 18 modules / 116 routes. The
      separate PostgreSQL run is recorded under T5.2.

- [x] After the T4.4 late-response regression, root `npm test` exited 0
      with workspace-local `TEMP` and `TMP`: 923 web tests in 99 files,
      18 contract modules / 116 routes, 10 log-format tests and 7 dev-stack
      tests. Web typecheck and focused ESLint for `SettingsPage.test.tsx`
      exited 0. `npm run build` exited 0 with a chunk-size warning. These
      checks do not cover a live account switch.

- [x] Follow-up on current schema-46 source: offline `go test ./... -count=1`
      and `go vet ./...` passed in `apps/api` with no database DSNs. Root
      `npm test` exited 0 (`schema46-root-test-1795469068278.log`): 921 web
      tests in 99 files, 18 contract modules / 116 routes, 10 log-format
      tests and 7 dev-stack tests. `npm run build` exited 0 with the chunk
      size warning. Live acceptance is tracked separately.

- [x] Current schema-46 availability checkpoint: `go test -count=1` and
      `go vet` passed for `./internal/modules/restaurant`,
      `./internal/modules/storefront` and `./internal/transport` with
      database/browser integration disabled. `npm test --workspace
      @smartpos/web` passed 920 tests in 99 files. `npm run contracts:check`
      passed 18 modules / 116 routes. `npm run build` passed with a chunk
      size warning; `npm run lint` exited 0 with 12 warnings and no errors.
      This checkpoint covers the current implemented source; browser and
      isolated database outcomes are tracked separately.

- [x] 2026-11-24 local checkpoint for current schema-45 source: offline
      `go test ./... -count=1` and `go vet ./...` in `apps/api` passed. The
      Go run leaves database DSNs unset. Root `npm test` passed with
      process-local `TEMP` and `TMP` pointed at `.local`: 916 web tests in
      98 files, 18 contract modules / 116 routes, 10 log tests and 7 dev-stack
      tests. The first run exited 1 because the dev-watch fixture could not
      write to the default Windows temp directory. `npm run build` passed
      (includes TypeScript; chunk-size warning); `npm run lint` passed with
      0 errors and 12 warnings. This checkpoint covers implemented source only.
- [ ] Inspect actual scripts/effects, then run focused Go/React tests and npm run contracts:check; expand to affected typecheck/lint/build checks. Inspect current target selection before running any integration script.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: test-engineer. Dependencies: Selected implementation slice and integrations complete.
Design: [D01](design.md#d01), [D16](design.md#d16).
Future files: Existing owning Go/React tests; scripts/check-contracts.mjs; package.json.
Acceptance: Fresh exact commands/exit codes/case counts match changed inputs. Root npm test is a composite web/contracts/log/dev-stack suite, not DB/browser/provider acceptance. Failures are not dismissed as historical without evidence.

<a id="t5-2"></a>

### T5.2 Run isolated database and retained-data acceptance

- [x] Schema-49 Returns HTTP completion: an approved menu-only return
      denied session expiry after the completion audit insert and after the
      saved-result lookup with `401 UNAUTHENTICATED`, `Cache-Control: no-store`
      and no data. The return, linked refunds, completion audit and exact
      replay record were unchanged immediately after each denial. A same-key
      retry completed the return; authorized replay returned identical data
      without changing those records. `check-db.mjs returns-read` exited 0
      with 341 PASS entries including parents, 0 FAIL/SKIP and verified
      container/network cleanup (`returns-read-1795536922925.log`).

- [x] Schema-49 Returns HTTP refund confirmation: expiry after the cash
      disbursement insert and after saved-result lookup returned
      `401 UNAUTHENTICATED`, `Cache-Control: no-store` and no data. Before any
      retry, exact readbacks preserved the refund, disbursements, settlement
      events and the confirmation idempotency record in both cases. Concurrent
      same-key retries returned the same result; authorized replay matched it
      byte for byte. The ledger recorded one 10.00 disbursement and two events.
      `check-db.mjs returns-read` exited 0 with 339 PASS entries including
      parents, 0 FAIL/SKIP and verified container/network cleanup
      (`returns-read-1795536674126.log`). Only tests changed.

- [x] Current schema-49 aggregate Storefront run: `check-db.mjs full`
      exited 0 with 2,371 PASS entries including parents, no FAIL/SKIP, and
      553.92s for `TestSingleStoreIsolatedDatabase` (`full-1795534656896.log`).
      Includes the earlier Purchasing and Returns matrices, two-restaurant
      QR lookup, availability restore expiry and both concurrent restore cases,
      and retained paid-order snapshot checks after a price change. It applied
      all 49 migrations and verified empty Pickup down/reapply, populated
      downgrade refusal with forward recovery, and cleanup of the task-owned
      tmpfs container and internal network. Synthetic database evidence only;
      this does not accept native public Dine-in, retained data, live provider
      behavior or final cutover.

- [x] Earlier schema-49 aggregate Storefront run: `check-db.mjs full`
      exited 0 with 2,366 PASS entries including parents, no FAIL/SKIP, and
      548.79s for `TestSingleStoreIsolatedDatabase` (`full-1795531614977.log`).
      This includes the Returns MFA matrix and both Purchasing expiry-after-
      replay cases. All 49 migrations and the empty Pickup down/reapply ran
      on the disposable PostgreSQL target. The populated downgrade was
      refused with data preserved; forward recovery passed. Task-owned
      tmpfs container and internal network cleanup were verified. The run
      used synthetic fixtures and does not establish retained-data, browser,
      provider or release acceptance.

- [x] Schema-49 Purchasing after logout: all 19 read and 38 write routes,
      an explicitly branch-filtered order list, and a previously successful
      order-create replay returned `401 UNAUTHENTICATED` without data.
      Document, operation and audit counts stayed unchanged. The isolated
      `check-db.mjs inventory-read` run exited 0 with 568 PASS entries including
      parents, no FAIL/SKIP, and verified container/network cleanup
      (`inventory-read-1795529287708.log`). Focused Storefront/Purchasing Go
      test and vet passed; only tests changed.

- [x] Schema-49 Purchasing legacy-role matrix: each of four MFA-verified,
      branch-assigned legacy roles received `403 FORBIDDEN`, no data and
      `Cache-Control: no-store` on 19 read and 38 write routes plus a
      branch-filtered order list (232 role/request pairs). The matrix includes
      the detail path for a populated order. `check-db.mjs inventory-read`
      exited 0 with 547 PASS entries including parents, no FAIL/SKIP, and
      verified container/network cleanup (`inventory-read-1795529037525.log`).
      Focused Storefront/Purchasing Go test and vet passed; only tests changed.

- [x] Schema-49 aggregate Storefront rerun through the Returns Cashier
      matrix: `check-db.mjs full` exited 0 with 1,982 PASS entries including
      parents, no FAIL/SKIP, and 538.98s for `TestSingleStoreIsolatedDatabase`
      (`full-1795528597361.log`). All 49 migrations and the empty Pickup
      down/reapply ran on the disposable target. The populated downgrade
      refused with the fixture preserved; container/network cleanup passed.
      The later Returns and Purchasing multi-role test edits are outside this
      compiled snapshot and have separate focused checks.

- [x] Schema-49 aggregate Storefront run: `check-db.mjs full` applied all 49
      migrations to a disposable PostgreSQL 17.6 tmpfs container on an internal
      network. `TestSingleStoreIsolatedDatabase` and its subtests recorded
      1,717 PASS entries including parents, no FAIL/SKIP, 541.10s, exit 0
      (`full-1795499217852.log`). Empty Pickup down/reapply passed; populated
      rollback refused and preserved the column and fixture row. Cleanup of
      the container and network passed ID/label verification. This run uses
      synthetic fixtures; browser and retained-data evidence are separate.

- [x] Schema-49 standalone payment rate-limit smoke:
      `check-db.mjs rate-limits` exited 0 on a separate disposable PostgreSQL
      17.6 tmpfs database (`rate-limits-1795499431356.log`). The actual
      checkout, recover and status routes each passed their database-backed
      rate-limit middleware and rejected an invalid body before provider
      dispatch. Four PASS entries including the parent; no failures or
      skips. The container and network were removed after ID/label checks.
      This checks scope wiring, not the rate-limit exhaustion threshold.

- [x] Schema-47 aggregate run: `check-db.mjs full` applied all 47 migrations
      on the isolated PostgreSQL 17.6 tmpfs database and exited 0 with 1,707
      PASS entries including parent tests, 0 FAIL/SKIP (536.41s;
      `full-1795492229835.log`). Empty Pickup downgrade/reapply and populated
      downgrade refusal passed; temporary container/network cleanup was verified.
      This binary predates the Owner modifier read and edit changes; their
      separately scoped checks are recorded under T1.2.

- [x] Fresh schema-46 aggregate run, 2026-11-24: `check-db.mjs full`
      exited 0 (`full-1795490780631.log`). PostgreSQL 17.6 applied all 46
      migrations; 1,707 PASS entries including parent tests, 0 FAIL/SKIP,
      536.85s. Empty Pickup downgrade/reapply passed. The populated downgrade
      refused and preserved the column and fixture data; forward recovery
      passed. Verified removal of the task-owned tmpfs container and internal
      network. This run used synthetic fixtures; acceptance on real retained
      data remains open.

- [/] The tracked `verify:single-store` runner's Go subprocess now allows
      14 minutes for Go tests and 15 minutes at the subprocess boundary
      (the suite can use up to 13 minutes). The old 120-second limit was
      shorter than the separate schema-46 aggregate run (536.02s).
      `node --check scripts/check-single-store.mjs` and the six output
      verifier tests passed. The tracked runner's live execution remains
      unverified in Studio-Acceptance: the local cache lacks both
      `postgres:17-alpine` and `migrate/migrate:v4.18.3`.

- [x] The branchless Go integration suite now repeats the schema-46
      Availability RLS checks under `smartpos_runtime` with two synthetic
      organizations. Five subtests passed, including cross-organization
      denial and matching-context writes; both fixtures were checked after
      rollback. `check-db.mjs green` exited 0 with 42 PASS entries including
      parents, no FAIL/SKIP entries, and verified tmpfs container/network
      cleanup (`green-1795479643509.log`). Independent test review reported no
      actionable findings. This checks runtime isolation and does not by itself
      prove FORCE RLS for the table owner.

- [x] Schema-46 availability RLS with `smartpos_runtime` (no `SUPERUSER`
      or `BYPASSRLS`): absent and foreign organization context saw no row;
      matching context could read, insert and update; a foreign update
      affected zero rows, a foreign insert was denied and DELETE was not
      granted. Probe transactions preserved the fixture digest.
      `check-retained-46.mjs retained-46` exited 0 and removed its temporary
      container/network (`retained-46-1795479222647.log`). The initial run
      stopped on `psql` command tags in the result parser and cleaned up
      (`retained-46-1795479153789.log`). No migrations or live data changed.

- [x] Schema-46 aggregate Storefront run: `check-db.mjs full` exited 0
      (`full-1795468848093.log`). All 46 migrations applied to PostgreSQL 17.6;
      1,693 PASS entries including parent tests, 0 FAIL/SKIP, 536.02s. Empty
      Pickup downgrade/reapply, populated downgrade refusal and ID/label
      checked fixture cleanup passed. This covers the implemented Storefront
      suite on synthetic data. Real retained-data acceptance remains open.

- [x] Fresh schema 46: `check-db.mjs green` exited 0
      (`green-1795468794523.log`). The branchless Storefront test passed
      `availability_settings/open_hours_do_not_publish_draft` plus the
      concurrent-write, audit rollback and expiry checks. Empty Pickup
      downgrade/reapply and populated downgrade refusal passed. The runner
      removed the task-owned container and network after ID/label checks.

- [x] Synthetic retained schema 39 through 46: `check-retained-46.mjs
      retained-46` exited 0 (`retained-46-1795467377868.log`). Verified
      digests for 10 business/audit tables, retained sessions and staged
      recovery records. Using golang-migrate v4.18.3, empty availability
      downgraded and reapplied; populated availability refused downgrade
      and kept its row. Verified the schema and digests before restoring
      the disposable dirty marker to clean 46. Removed only the task-owned
      tmpfs database and internal network after label/ID checks. No real
      retained records were read; full T5.2 acceptance remains open.

- [x] 2026-11-24 synthetic retained-data checkpoint: `node
      .local/velopos-pickup-20261122/check-db.mjs retained-current` exited 0
      (`retained-current-1795458682585.log`). Seeded schema 39 with the
      historical synthetic Storefront fixture and one synthetic session, then
      applied current migrations 40-45 in order. Row counts and content digests
      matched for ten business/audit tables and the old session columns. No
      Pickup flags, MFA proof, fresh primary proof or recovery state appeared.
      Populated Pickup downgrade refused and preserved the row; labelled
      temporary resources were removed. The first run correctly stopped before
      migration because the historical fixture created no session. This is
      synthetic upgrade evidence; no real retained records were read or changed.
- [x] 2026-11-24 aggregate Storefront checkpoint: `check-db.mjs full` on
      PostgreSQL 17.6/schema 45 exited 1 (`full-1795458355430.log`). The shared
      Inventory settings fixture added a third store/membership before the two
      directory/membership tests; the suite later reached its 480s deadline and
      remaining cases stopped on the expired context. Cleanup by ID/label passed.
      The fixture now runs after the shared Storefront cases; the aggregate test
      and runner budgets increased without changing any individual check.
      `check-db.mjs fixture-order` exited 0 (`fixture-order-1795458974239.log`):
      127 PASS entries, 0 FAIL/SKIP, 102.60s; both cardinality checks and the
      Inventory checks passed. Package Go test and diff check passed. Aggregate
      rerun (`full-1795458937573.log`) exited 0: 1,688 PASS entries including
      parent tests, 0 FAIL/SKIP, 535.10s. All 45 migrations applied to isolated
      tmpfs PostgreSQL; empty Pickup downgrade/reapply, populated downgrade
      refusal, and ID/label-checked cleanup passed. This proves the combined
      Storefront suite for implemented code, not all migration acceptance.
- [ ] Confirm task-owned disposable target and inspect fixture/startup/cleanup effects first. Run fresh/retained migration, tenant/RLS, constraints, replay, concurrency, transaction rollback and forward recovery cases.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: test-engineer. Dependencies: T2.2,T2.3; affected payment/queue/ledger implementation.
Design: [D01](design.md#d01), [D06](design.md#d06), [D07](design.md#d07), [D08](design.md#d08), [D10](design.md#d10), [D13](design.md#d13).
Future files: tests/integration; owning Go integration/schema tests.
Acceptance: Current outputs prove no duplicate financial/quota/points/queue effect and preserved legacy records. No primary/retained database or volume is reset. Missing target/authorization is BLOCKED.

<a id="t5-3"></a>

### T5.3 Run browser, language and accessibility acceptance

- [/] Current-build Chrome rerun: the four-suite run recorded 25 PASS and
      11 FAIL (`t53-browser-1795532269094.log`). All failures were in
      `owner-only.spec.ts`. The static runner rejected `/` before React loaded;
      correcting only the runner recovered all four retired-bookmark cases at
      360, 390, 768 and 1280 CSS pixels (`t53-bookmarks-1795532493176.log`,
      4 PASS, exit 0). The Owner fixture now supplies completed setup and
      exercises the current dashboard, menu, help/account menu and public
      directory. The final four-suite run passed all 36 cases, exit 0
      (`t53-final-1795532780195.log`). These runs used intercepted APIs;
      no physical-device or live API result is implied.

- [x] Retired Purchasing and Returns bookmarks: the current production web
      build rendered the Thai not-found page at nine bookmarks in headless
      Chrome at 360, 390, 768 and 1280 CSS pixels. Each kept its URL,
      exposed a workspace link and fit without horizontal page overflow.
      No request reached a retired workflow API path. The focused
      `owner-only.spec.ts` run passed 4/4 with intercepted APIs. The first
      run used the retired `/manage/dashboard` as its setup page; the rerun
      used the current landing route. This verifies browser route disposition;
      retained API acceptance is separate, and no physical device was tested.

- [x] Late Availability save with real Go and PostgreSQL: Chromium at
      1280 x 900 signed out while the relay held the successful PUT response
      after revision 1 committed. The same document signed in again, proved
      TOTP, and showed loading instead of old form data while the successful
      fresh GET was held. It showed the saved Pickup pause after the GET was
      released. Exactly one PUT ran and revision stayed 1.
      `check-recovery-browser.mjs 1280 late-hours` exited 0 with a freshly
      built Go server, schema 46 and the existing rebuilt web bundle
      (`browser-late-hours-1795491171650.log`). The task-owned container and
      network were removed after ID/label checks. This checks same-account
      session turnover; it does not establish physical-device or screen-reader
      behavior, a cross-restaurant write, or native ordering admission.

- [x] Ordering-hours keyboard regression: deleting a window with Enter now
      focuses Add window, so Enter again can add a replacement and continue
      editing. The 1280px case failed on focus before the fix; after rebuilding,
      all eight `restaurant-availability.spec.ts` cases passed with intercepted
      APIs (`availability-keyboard-1795479420800.log`). The keyboard change ran
      at 360/390/768/1280px, including Thai and English at enlarged text size.
      Focused Vitest passed 16/16; focused ESLint and build exited 0 (build
      emitted a chunk-size warning). Physical device and screen reader
      acceptance remain open.

- [x] Owner ordering-hours panel: `restaurant-availability.spec.ts` passed
      7/7 with Windows Chrome and intercepted API responses. Checked save
      and keyboard toggle at 360/390/768/1280px, Thai and English (125%
      root text size at 390px), save payload and viewport fit. A completed
      organization without a branch reached the panel; incomplete setup
      redirected to `/setup`. A 409 preserved typed hours and pause edits
      until explicit reload, then showed the latest settings. A
      `403 MFA_REQUIRED` exposed account security in a separate tab,
      kept the edits and sent no retry until the Owner submitted again.
      This does not verify real MFA or a live database,
      a physical touch device or a screen reader.

- [x] Ordering-hours recovery across tabs: rebuilt the web app and ran the
      eight availability cases using `check-owner-ui.mjs` with the availability
      spec filter (exit 0; `availability-popup-1795469025762.log`). At 360px
      the Owner opened `/security` in a new tab, submitted a synthetic TOTP
      challenge, closed that tab and returned to the unchanged settings form.
      The form made no automatic PUT; an explicit retry saved the same edits.
      The APIs were intercepted. The first run used an older web build and
      failed the MFA link and completed branchless redirect expectations.
- [x] Live Owner ordering-hours recovery: `check-recovery-browser.mjs 360
      owner-hours` exited 0 (`browser-owner-hours-1795476846939.log`). Chromium
      with touch emulation used the built `/settings` and `/security` pages,
      real Go API and schema-46 PostgreSQL. The fixture cleared only the
      current session's MFA proof after the form loaded. The first save returned
      `403 MFA_REQUIRED` and left no availability row. TOTP in the new tab
      restored session proof. The original form kept its edits and sent no
      automatic save; one explicit retry persisted revision 1 with Pickup paused.
      The run used a synthetic restaurant with a retained-style branch and
      seeded setup records. Docker published no ports and cleanup passed after
      ID/label checks. Native public admission remains unverified.
- [x] Desktop follow-up: `check-recovery-browser.mjs 1280 owner-hours`
      exited 0 (`browser-owner-hours-desktop-1795477356434.log`). Chromium
      at 1280 x 900 used the rebuilt web app, Go API and isolated schema-46
      PostgreSQL. It verified the same MFA denial, preserved edits, popup
      recovery and one explicit save to revision 1. Task-owned Docker
      container and network cleanup passed. This covers the interaction;
      visual and assistive technology acceptance remain open.

- [x] 2026-11-24 identity/Owner browser checkpoint: the local
      `check-owner-ui.mjs` runner served the current web build on loopback and
      ran `mfa-settings.spec.ts` and `owner-mfa-creation.spec.ts` (exit 0,
      28 passed in 39.7s; `mfa-browser-current-1795459208661.log`). Chromium
      156.0.8078.4 on Windows at 360/390/768/1280px covered MFA setup and
      replacement, lost confirmation, password-to-challenge navigation,
      Thai/English text, focus, and Owner setup retry with the same key. Narrow
      cases cover enlarged text and touch emulation. APIs were intercepted;
      no live browser-to-database, physical-device or screen-reader acceptance.
- [x] Focused recovery form semantics: Chromium verified accessible
      descriptions for the recovery-code field and setup key. Keyboard
      submission of a malformed code kept focus and the entered value and
      dispatched no recovery request; valid input dispatched exactly one.
      `check-owner-ui.mjs --grep 'Authenticator replacement'` passed 4 cases on
      360/390/768/1280px (`mfa-browser-semantics-1795459678641.log`).
- [x] Legacy Owner payment bookmark: eight Windows Chromium cases passed at
      360/390/768/1280px with touch emulation at mobile widths. Authorized
      Owners reached the visible sandbox heading and retained query/fragment;
      denied Owners reached the visible 403 page without a sandbox request.
      Both states fit the viewport. The loopback runner served the built app
      with intercepted API responses and no provider or database access.
- [x] Live browser-to-database recovery checkpoint: `check-recovery-browser.mjs`
      exited 0 (`browser-recovery-ui-1795469825350.log`). Windows Chromium at
      360px with touch emulation drove the built `/security` form against the
      real Go API and schema-46 PostgreSQL. Verified same-origin login and
      enrollment, missing-CSRF rejection, replacement, focus and acknowledgement
      of new recovery codes, revoked session, denied confirmation replay and
      password sign-in with MFA still required. No API response was mocked.
      The relay accepted only named Auth methods/paths on Windows loopback;
      Docker published no ports. Fixture and network cleanup passed after
      ID/label checks. Live provider, physical-device and wider viewport
      acceptance remain separate. The account and database were synthetic.
- [x] Desktop browser recovery follow-up: `check-recovery-browser.mjs 1280`
      exited 0 (`browser-recovery-desktop-1795469943440.log`). The real
      schema-46 API revoked both the recovery session and a separate existing
      browser session. After password sign-in, the TOTP used to confirm
      replacement returned `INVALID_MFA_PROOF`. A fresh TOTP from the new
      authenticator passed via `/security`, and the API reported the current
      session as MFA verified. ID/label-checked fixture cleanup passed.
- [x] Schema-49 browser recovery at 390 CSS pixels with touch emulation:
      `check-recovery-browser.mjs 390` exited 0 against the current web build,
      rebuilt Go API and disposable PostgreSQL
      (`browser-recovery-schema49-390-1795514383111.log`). Chromium verified
      TOTP replacement, revocation of both existing sessions, rejection of
      confirmation and TOTP replay, and a successful fresh challenge with the
      replacement factor. The runner removed the container and internal network
      after ID/label checks. The test used synthetic accounts and does not cover
      manual recovery without codes or a physical device.
- [x] Historical transport investigation: the Windows Chromium runner
      cannot reach services on the isolated WSL Docker network through port
      publication. A disposable HTTP-only preflight on `--internal` returned
      no published loopback port, then removed its resources by ID/label. WSL
      had no installed Chromium or Node executable. HTTP-to-PostgreSQL and
      browser-to-intercepted-API evidence remain separate.
      A follow-up read-only inventory of the Studio-Acceptance Docker cache
      found PostgreSQL and the isolated Go/Git tool images, with no local
      browser runner image available for an offline retry.
      A follow-up transport probe passed (`browser-stdio-1795469576546.log`):
      Windows Chromium received a unique marker from a Go HTTP fixture in a
      task-owned Docker container. A Windows loopback listener relayed only
      one fixed GET to that container over Docker exec; an unmapped path
      returned 404. Docker published no port, and the runner removed its
      container and internal network after ID/label verification. No database
      or application was started in that probe. The live checkpoint above
      subsequently verified the relay with Origin, cookies, CSRF and POST.
- [ ] Exercise primary/negative/recovery journeys at 360px, 390px, 1280px and representative tablet with zoom, long Thai/English content, keyboard/focus, screen-reader semantics and contrast. Check PWA/cache/push where in slice.
- [ ] Add/run the focused positive, negative, replay/concurrency and failure-path
      tests applicable to this scope; preserve current safety/compatibility checks.

Owner: test-engineer. Dependencies: Affected T4/T6 UIs and local backend ready.
Design: [D04](design.md#d04), [D05](design.md#d05), [D16](design.md#d16).
Future files: tests/e2e; playwright.config.ts; affected component tests.
Acceptance: Record screenshots/flows, viewport and emulated versus real-device source. No clipping/overlap/overflow or missing essential text. No WCAG/mobile readiness claim where rendering/device behavior remains unverified.

<a id="t5-4"></a>

### T5.4 Obtain independent security and correctness review

- [x] Scoped receipt posting and supplier return dispatch MFA review: no
      actionable findings in the supplied transaction and rollback evidence.
      Main's isolated schema-49 run `inventory-read-1795530767703.log`
      exited 0 with 582 PASS entries including parents, no FAIL/SKIP and
      verified cleanup. The reviewer did not run tests. The receipt parent's
      status, revision, accepted quantity and received event were added to
      the follow-up rollback and retry checks. The reviewer accepted the
      follow-up with no actionable findings against
      `inventory-read-1795531028458.log` (582 PASS, no FAIL/SKIP, cleanup
      verified). The reviewer also found no actionable issues in the two
      service-layer expiry-after-replay-lookup cases and matching HTTP replay
      assertions (`inventory-read-1795531281909.log`, 584 PASS, no FAIL/SKIP,
      cleanup verified). HTTP handling of mid-request expiry and expiry during
      COMMIT remain untested in these cases.

- [x] Scoped Purchasing HTTP expiry follow-up: the same authorized reviewer
      examined the four receipt-post and supplier-return-dispatch cases and
      matching OpenAPI wording, with no actionable findings. Main's schema-49
      `check-db.mjs inventory-read` run exited 0 with 593 PASS entries including
      parents, no FAIL/SKIP and verified cleanup (`inventory-read-1795536028373.log`).
      The SQL trace proves the requests reached the handler; expiry after audit
      or replay lookup returned `401 UNAUTHENTICATED`, `no-store` and no data.
      Readbacks verify rollback, same-key retry and byte-identical replay without
      duplicate effects. The reviewer did not run tests. Early middleware
      denials, expiry during COMMIT and other Purchasing routes were outside
      this review.

- [x] Scoped Returns HTTP completion MFA review: the authorized reviewer
      found no actionable findings in the tests and the matching isolated
      evidence (`returns-read-1795536922925.log`). The reviewer did not run
      tests. This covers the menu-only fixture, four observed record groups
      and two interruption points; it does not cover physical COMMIT or
      other Returns operations.

- [x] Scoped Returns HTTP refund confirmation MFA review: the reviewer found
      that checking ledger counts only after retry could miss a partial write.
      The tests now compare the four record groups immediately around each
      `401`, before any retry. The reviewer inspected the change and matching
      schema-49 evidence (`returns-read-1795536674126.log`, 339 PASS including
      parents, 0 FAIL/SKIP) and closed the finding without running tests.
      This review excludes shift and audit effects, other routes and expiry
      during physical COMMIT.

- [x] Scoped Purchasing transition MFA review: the authorized reviewer
      examined the supplied code and matching isolated database evidence
      for order approval/issue, receipt submit/approval and supplier return
      submit/approval. No actionable findings. The original schema-49
      run (`inventory-read-1795529765610.log`, exit 0) recorded 580 PASS
      entries including parents, no FAIL/SKIP and verified cleanup. All six
      cases withheld the result on service-layer expiry after the status
      update, preserved state, item and revision on HTTP readback, and
      committed the same-key authorized HTTP retry. The reviewer did not run
      tools. This evidence does not directly count rolled-back audit or
      replay records or cover expiry during replay, audit or COMMIT. Posting
      and dispatch are outside this review.

- [x] Scoped Returns refund/logout ordering review: the authorized reviewer
      examined the supplied transaction, cancellation and replay excerpts and
      matching isolated PostgreSQL results without running tools. PostgreSQL
      showed logout waiting in the three tested paths. The reviewer identified
      missing direct readback of the canceled refund's revision and replay key.
      The amended test verifies unchanged status, revision, disbursement and
      settlement-event counts, and no row for the exact confirmation key.
      `check-db.mjs returns-read` exited 0 with 332 PASS entries including
      parents, no FAIL/SKIP, and verified cleanup (`returns-read-1795530327707.log`).
      The reviewer accepted the amended evidence with no actionable findings.
      This does not verify cancellation or expiry during COMMIT, or other
      Returns routes.

- [x] Scoped Owner ordering-hours API authority and atomicity review:
      the authorized reviewer inspected the supplied GET/PUT, authorization,
      SQL, audit and matching test evidence without running tools. No
      actionable defect was found. Added the requested primary-only Owner
      denial checks: valid cookie, and valid CSRF on PUT, still return
      `403 MFA_REQUIRED` without data. Isolated schema-46 run
      `green-1795468358496.log` exited 0 and verified cleanup, concurrent
      revision conflict and audit rollback. Follow-up regression
      `green-1795468472799.log` (exit 0, isolated schema 46) paused the
      write at audit insertion until the database clock reached the
      MFA-verified session's expiry. The final check denied the request
      without returning settings and rolled back the settings, revision
      and audit. The task-owned database and network were removed.
      Public admission remains unverified.
- [x] Scoped Owner ordering-hours MFA recovery UI review: the authorized
      reviewer inspected the supplied source and matching Main evidence
      without running tools or tests and found no actionable findings.
      Only `MFA_REQUIRED` shows the separate account-security link; edits
      remain available for an explicit retry. Focused Vitest passed 14/14,
      web typecheck passed, and the matching Chrome suite with intercepted
      responses passed 8/8. Actual second-tab MFA and retry against a
      live session remain unverified. The review does not cover the whole
      availability service, migration or public admission.
- [x] Scoped T1.3 Google primary-proof persistence review: the authorized
      reviewer inspected the relevant source and matching Main test evidence
      without running tools or tests and found no actionable findings.
      Isolated PostgreSQL run `recovery-1795463689882.log` (exit 0) verifies
      recent, older and absent proof with a synthetic identity after token
      verification. This does not verify live Google callback `auth_time`
      delivery or a subsequent recent-MFA challenge for that session.
- [x] Follow-up review of the Google session TOTP and five-minute gate
      regression in `mfa_recovery_integration_test.go`: the reviewer inspected
      the test delta and matching Main evidence without running tools or tests
      and found no actionable findings. `recovery-1795464194834.log` (exit 0)
      covers recent, stale and absent primary proof before and after TOTP on
      isolated schema 45. The fixture uses wall-clock TOTP and starts after
      provider token verification; live callback proof remains unverified.
- [x] Follow-up review of the synthetic HTTP Google callback fixture found
      no actionable findings. The local handler verifies the signed token
      and issues the session used by the three TOTP cases. Main's isolated
      schema-45 run `recovery-1795464391526.log` exited 0 and verified cleanup;
      the reviewer inspected supplied evidence and did not run tools.
      This does not establish live Google claim availability, browser cookie
      behavior or invalid callback state rejection.
- [x] Google authorization-request change: the focused URL test failed for
      the missing `claims` parameter before the change and passed afterward.
      Identity Go test/vet and isolated schema-45 callback/MFA/recovery
      (`recovery-1795465032141.log`, exit 0 with cleanup) passed. Scoped
      independent review found no actionable issues and ran no tools.
      Live configuration and proof delivery still require verification.
- [ ] Provide only authorized relevant evidence and inspect findings against actual source/preconditions. Required domains include auth/tenant scope/secrets, financial integrity, callbacks, idempotency, wallet/points/quota concurrency and migration/release safety.
- [ ] Inspect matching current test evidence and request focused regressions from
      the implementation owner when needed; keep this review read-only.

Owner: code-reviewer/security-auditor. Dependencies: T5.1,T5.2,T5.3 as applicable; explicit reviewer dispatch authorization.
Design: [D05](design.md#d05), [D06](design.md#d06), [D07](design.md#d07), [D08](design.md#d08), [D09](design.md#d09), [D10](design.md#d10), [D13](design.md#d13), [D16](design.md#d16).
Future files: Scoped redacted diff; affected contracts/source; matching current checks.
Acceptance: Separate authorized reviewer independently inspects relevant evidence. No unresolved blocking findings; fixes receive matching regression/review. Main self-review is not independent review. No dispatch is authorized by this task plan.

<a id="t5-5"></a>

### T5.5 Decide accepted scope and compatibility cutover

- [/] Full-baseline scope reconciliation: the approved register and
      `requirements.md` contain the same 92 unique VLP IDs. The current
      requirement annotations list 49 PARTIAL, 35 MISSING, 6 CONFLICTING and
      2 IMPLEMENTED. Both IMPLEMENTED labels describe static exclusions
      (VLP-023 LINE and VLP-075 referral rewards). These counts describe the
      register, not verified release acceptance. Keep the full baseline open;
      localized Purchasing/Returns compatibility evidence does not authorize
      a reduced release or removal of retained routes or data.

- [x] Baseline trace check: all 92 scope numbers, A/B/C/D selections, and
      approved statements in `requirements.md` match the approved register.
      Every requirement links to both design and task ownership; all 206
      trace links resolve to a unique anchor. The register SHA-256 still
      matches the value in `requirements.md`. This verifies scope and
      traceability only; it does not establish acceptance of a requirement.

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
