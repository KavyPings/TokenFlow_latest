# Enterprise Rollout README

## Goal
This guide explains how a company can use TokenFlow to prevent a Google-style "agent overreach" incident, and how to evolve from human review to an orchestration supervisor agent.

## Why This Helps Against the Google-Style Incident
In that incident pattern, AI agents got too much authority and crossed trust boundaries.

TokenFlow reduces that risk using:
- Capability-scoped, short-lived tokens per action
- Central policy checks before every action
- Isolation of credentials behind a broker/vault path
- Intercept, pause, revoke, and kill-switch controls
- Immutable audit logs for incident response and compliance

## Mapping Incident Risk to TokenFlow Controls
- Risk: Agent can access broad resources
  - Control: Single-action capability tokens + policy scope validation
- Risk: Credential leakage from runtime
  - Control: Vault/broker mediation; no raw secrets to agents
- Risk: Silent abuse by chained actions
  - Control: Token chain visibility + audit events per step
- Risk: No rapid containment path
  - Control: Intercept queue + kill switch + token revocation

## Enterprise Rollout Plan (30-60-90)

### Phase 1 (0-30 days): Shadow Deployment
- Integrate 1-2 non-critical workflows.
- Set gate mode to shadow for observation.
- Define allowed service/resource/action scopes.
- Run baseline attacks in Testbench to verify detection.
- KPI targets:
  - 100% workflow actions evaluated by policy engine
  - 0 direct credential exposure in agent runtime
  - Full audit event coverage for all executed steps

### Phase 2 (31-60 days): Controlled Enforcement
- Move selected workflows to enforce mode.
- Keep high-risk actions in pause-and-review.
- Add runbooks for resume/revoke actions.
- Establish daily monitor review and weekly governance review.
- KPI targets:
  - Intercept precision trending upward (fewer false positives)
  - Mean time to containment less than 5 minutes
  - Zero uncontrolled credentialed actions

### Phase 3 (61-90 days): Scale + Governance
- Expand to additional workflows and business units.
- Standardize policy templates per workflow class.
- Enable score-based release gates (workflow and dataset).
- Produce monthly audit packet from logs and score snapshots.
- KPI targets:
  - Stable enforcement with minimal manual overrides
  - Predictable risk score bands for production release

## How Teams Use This Day-to-Day
- Security Team:
  - Monitor flagged runs and containment actions
  - Tune policy rules and escalation thresholds
- Platform Team:
  - Maintain workflow templates and token enforcement integration
  - Operate release controls tied to workflow score
- Responsible AI / Compliance:
  - Track fairness datasets and mitigation posture
  - Review dataset score trends and gate decisions

## Can We Replace Human Intervention with an Orchestration Supervisor Agent?
Yes, partially. This is feasible and recommended as a tiered model, not full removal of human control.

### Recommended Decision Ladder
- Low risk: Auto-allow
  - Example: known-safe action in approved scope
- Medium risk: Auto-pause + auto-remediate attempt
  - Example: unusual sequence or high anomaly score
- High risk: Auto-kill + token revoke + incident ticket
  - Example: policy breach involving sensitive resources
- Critical business impact: Human approval still required
  - Example: production writes affecting money movement, legal records, or customer identity data

### Why Keep Human-in-the-Loop for Critical Cases
- Reduces automation bias and catastrophic false positives
- Preserves accountability for high-impact decisions
- Satisfies many audit and regulatory expectations

## Practical Architecture for an Orchestration Supervisor Agent

### Inputs to the supervisor
- Policy decision stream (allow/deny reasons)
- Token chain transitions (mint/active/flagged/burned/revoked)
- Testbench health status and invariant failures
- Fairness execution gate state
- Recent workflow anomaly features (rate, sequence drift, retry bursts)

### Supervisor outputs
- Decision: allow, pause, kill
- Action bundle: revoke tokens, quarantine workflow, notify teams
- Evidence record: standardized rationale payload for audit

### Guardrails
- Supervisor cannot mint broader privileges than policy allows
- Supervisor actions are fully audited and replayable
- Failsafe default on uncertainty: pause (not allow)

## Suggested Implementation Steps in This Repo
1. Add a supervisor service:
   - server/src/services/orchestrationSupervisor.js
2. Add a deterministic risk scoring module:
   - server/src/engine/supervisorRiskModel.js
3. Hook into workflow execution checkpoints:
   - server/src/engine/workflowRunner.js
   - server/src/engine/tokenEngine.js
4. Emit supervisor decision events over WebSocket for monitor visibility:
   - server/src/websocket/wsServer.js
5. Add policy config for thresholds and escalation modes:
   - server/src/engine/workflowSchema.js or a dedicated config file
6. Add tests:
   - unit tests for risk score and decision ladder
   - integration tests for pause/kill/revoke sequences

## Rollout Safety Defaults
- Start with deterministic rules; add ML/anomaly scoring only as a secondary signal.
- Keep supervisor in observe mode first, then enforce by risk tier.
- Require dual control (human + supervisor) for critical production actions.

## Success Criteria
- No raw credential leakage path to agents
- Every action scoped and policy-evaluated
- Containment action under a defined SLO
- Full audit explainability for every block, pause, and allow decision
