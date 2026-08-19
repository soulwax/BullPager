# THE QUARANTINE — HUMAN AGILE GUIDE

> Status: operational notes for humans
>
> Product authority: `MASTERPLAN.md`
>
> Unity migration authority: `../UNITY_PLAN.md`
>
> Repository rules: `GROUND_RULES.md`
>
> Companion plan audit: `../UNITY_PLAN.md`, repository audit 2026-08-16
>
> Guide revision: 2026-08-17

This guide explains how humans can move the project forward in short, reviewable
increments without creating another plan. It owns no product requirements and
no migration decisions. If it disagrees with either authority above, those plans
win and this guide must be corrected.

Use this as a lightweight Scrumban handbook: ordered product and migration
packets provide the backlog; humans pull the smallest ready item, keep work in
progress low, integrate continuously, and review real playable results.

This guide is deliberately more detailed than a ceremony checklist. It tells a
small team how to turn the Unity plan into daily decisions, how to react when
the work reveals something new, and what evidence is sufficient to move a card.
It does not assign calendar dates or promise milestone scope. Humans forecast
from observed flow and change the route when evidence changes, while the
product destination and Unity architecture remain governed by their plans.

### How to use this guide

- New team members should read sections 1–6, then the section matching their
  role and current packet.
- Packet owners use sections 6–9 as their working loop.
- Reviewers use sections 10, 17, and 18 before accepting evidence.
- Product and technical owners use sections 3, 5, 13, 20, and 21 during
  replenishment and milestone decisions.
- Everyone may copy the records in section 14 and the health check in section
  22. Completed records belong
  with the owning plan packet, evidence index, issue, or ADR—not in this guide.

Find the answer quickly:

| I need to… | Go to |
|---|---|
| Start the project for the first time | Section 21, then 23.12 |
| Know what to work on next | Sections 5 and 23.3 |
| Start or finish today's session | Sections 23.5 and 23.10 |
| Plan around 30 minutes, two hours, or a full day | Section 23.4 |
| Split a packet that is growing | Section 7 |
| Follow the runbook for code/content/save/UI/audio/art | Section 23.6 |
| Ask for or conduct a human review | Sections 10, 17, and 23.7 |
| Record evidence or change packet state | Sections 23.8 and 23.9 |
| Handle a bug, blocker, broken build, or confusing failure | Sections 11, 12, and 23.11 |
| Prepare a milestone or release decision | Sections 16 and 20 |
| Copy a one-page checklist | Section 23.14 |
| Build optional interactive tooling | Collapsed machine contract below |

The guide should remain stable. Improve a policy only after a retrospective
identifies a repeated problem; do not append a new rule for every unusual day.

### Human-only quick start

You do not need an agent, parser, project-management service, or custom tool to
use this plan. A text editor, Git, the pinned Unity editor, a shell, and another
human for required experience reviews are sufficient. Automation can shorten
repeated checks later, but it never owns a decision or approval.

If you are opening this guide to work now:

1. Open `../UNITY_PLAN.md` and find the compact migration ledger in section 15.
2. Find the first `OPEN` packet whose `Depends on` packets are all `CLOSED`.
3. For the current audited plan, that is `WARD-00`.
4. Read that packet, guide sections 1–6, and delivery section 15.3.
5. Copy the packet kickoff canvas from section 14 into your working issue/note.
6. Fill every field. If a required decision is missing, record the blocker and
   decision owner; do not begin implementation.
7. Change the packet and ledger to `ACTIVE` only when one owner can start now.
8. Perform the smallest observable step, record exact evidence, and stop at the
   packet boundary.

If you are unsure what to do at any moment, use this decision path:

```text
Is main/build broken or player data/rights at risk?
  yes -> use section 11 and restore safety first
  no  -> Is something waiting for your review?
           yes -> review it before starting work
           no  -> Is your active packet unfinished?
                    yes -> do its next smallest observable step
                    no  -> pull the first Ready packet from the Unity ledger
```

For a complete manual walkthrough, including solo work, meetings, file edits,
evidence, and end-of-day handoff, go directly to section 23.

For an optional local board and safe plan editor, run:

```sh
python3 tmp/human_agile_app.py
```

It uses only the Python standard library, opens in the browser, and is described
in section 23.15. The manual workflow remains fully supported.

<details>
<summary>Machine-readable interaction contract (optional for humans)</summary>

### Machine-readable interaction contract

The block below is the stable parser entry point. It uses strict JSON rather
than YAML so a Python tool can load it with the standard library. The JSON is an
interaction index, not a duplicate authority: packet state, owner, dependencies,
outcome, files, checks, evidence, and remainder are read from each packet body
in `../UNITY_PLAN.md`. The index adds stable navigation, grouping, gate, form,
and user-action metadata for an interactive view.

A parser must:

1. Extract the bytes between `HUMAN_AGILE_PLAN_V1_BEGIN` and
   `HUMAN_AGILE_PLAN_V1_END`.
2. Extract the single fenced `json` payload inside those markers.
3. Decode with `json.loads` and require the declared schema/version.
4. Parse Unity packet fields from `../UNITY_PLAN.md` using the field names in
   `packet_field_order`; do not infer live state from this guide.
5. Join packets by exact `WARD-##` ID and calculate readiness from current packet
   state plus closed dependencies.
6. Treat `external_dependencies` and conditional dependencies as human-owned
   gates that cannot be auto-closed.
7. Render prose from the referenced guide section when a user asks for help,
   rationale, examples, or a working procedure.
8. Reject unknown schema versions, duplicate IDs, missing packet references, or
   illegal state transitions instead of repairing them silently.

The markers, schema name, IDs, field names, and enum values are compatibility
surface. Change them only with a schema-version increment and parser fixture.

<!-- HUMAN_AGILE_PLAN_V1_BEGIN -->
```json
{
  "schema": "the-quarantine-human-agile-plan",
  "schema_version": 1,
  "document_id": "HAP",
  "title": "The Quarantine Human Agile Guide",
  "authorities": {
    "product": "MASTERPLAN.md",
    "migration": "../UNITY_PLAN.md",
    "repository": "GROUND_RULES.md",
    "human_guide": "HUMAN_AGILE_GUIDE.md"
  },
  "authority_rule": "The authority files own requirements and live packet data; this manifest owns interactive navigation only.",
  "packet_source": {
    "path": "../UNITY_PLAN.md",
    "heading_pattern": "^### (WARD-[0-9]{2}) — (.+)$",
    "packet_field_order": [
      "ID",
      "State",
      "Owner",
      "Depends on",
      "Outcome",
      "Inputs",
      "Files",
      "Do not touch",
      "Steps",
      "Checks",
      "Evidence",
      "Remainder"
    ],
    "ledger_section": "15",
    "live_fields": [
      "State",
      "Owner",
      "Evidence",
      "Remainder"
    ]
  },
  "guide_source": {
    "path": "HUMAN_AGILE_GUIDE.md",
    "top_heading_pattern": "^## ([0-9]+)\\. (.+)$",
    "subheading_pattern": "^### ([0-9]+(?:\\.[0-9]+)?)? ?(.+)$",
    "content_rule": "A section contains bytes after its heading through the byte before the next heading of equal or higher level.",
    "sections": [
      {"id": "1", "label": "Working agreement", "kind": "policy"},
      {"id": "2", "label": "Sources and repositories", "kind": "authority"},
      {"id": "3", "label": "Recommended method", "kind": "workflow"},
      {"id": "4", "label": "Human roles", "kind": "roles"},
      {"id": "5", "label": "Choosing the next item", "kind": "prioritization"},
      {"id": "6", "label": "Definition of Ready", "kind": "gate"},
      {"id": "7", "label": "Vertical splitting", "kind": "procedure"},
      {"id": "8", "label": "Daily implementation loop", "kind": "procedure"},
      {"id": "9", "label": "Definition of Done", "kind": "gate"},
      {"id": "10", "label": "Review and demonstration", "kind": "review"},
      {"id": "11", "label": "Bugs and production incidents", "kind": "incident"},
      {"id": "12", "label": "Decisions and blockers", "kind": "decision"},
      {"id": "13", "label": "Sustainable planning and metrics", "kind": "metrics"},
      {"id": "14", "label": "Meetings and templates", "kind": "forms"},
      {"id": "15", "label": "Detailed implementation delivery plan", "kind": "implementation"},
      {"id": "16", "label": "Milestone playbooks", "kind": "milestones"},
      {"id": "17", "label": "Human review operations", "kind": "review"},
      {"id": "18", "label": "Quality and evidence strategy", "kind": "evidence"},
      {"id": "19", "label": "Dependency change and recovery control", "kind": "change_control"},
      {"id": "20", "label": "Release and transition governance", "kind": "release"},
      {"id": "21", "label": "Suggested first working session", "kind": "startup"},
      {"id": "22", "label": "Weekly health check", "kind": "health"},
      {"id": "23", "label": "Human-only field manual", "kind": "manual"}
    ]
  },
  "states": [
    "OPEN",
    "ACTIVE",
    "PARTIAL",
    "BLOCKED",
    "CLOSED",
    "DROPPED"
  ],
  "state_transitions": {
    "OPEN": ["ACTIVE", "BLOCKED", "DROPPED"],
    "ACTIVE": ["PARTIAL", "BLOCKED", "CLOSED", "DROPPED"],
    "PARTIAL": ["ACTIVE", "BLOCKED", "DROPPED"],
    "BLOCKED": ["ACTIVE", "DROPPED"],
    "CLOSED": ["ACTIVE"],
    "DROPPED": []
  },
  "board": {
    "columns": [
      {"id": "ready", "label": "Ready", "source_states": ["OPEN"], "predicate": "all_dependencies_closed_and_definition_of_ready"},
      {"id": "doing", "label": "Doing", "source_states": ["ACTIVE"], "predicate": "implementation_in_progress"},
      {"id": "review", "label": "Review", "source_states": ["ACTIVE"], "predicate": "implementation_complete_review_pending"},
      {"id": "partial", "label": "Partial", "source_states": ["PARTIAL"], "predicate": "tested_subset_and_exact_remainder"},
      {"id": "blocked", "label": "Blocked", "source_states": ["BLOCKED"], "predicate": "named_missing_input_or_decision"},
      {"id": "done", "label": "Done", "source_states": ["CLOSED"], "predicate": "all_checks_and_human_gates_pass"},
      {"id": "removed", "label": "Removed", "source_states": ["DROPPED"], "predicate": "human_scope_decision_recorded"}
    ],
    "wip_limits": {
      "implementation_packets": 2,
      "packets_per_owner": 1,
      "human_review_queue": 1,
      "expedite_items": 1
    },
    "default_pull_order": [
      "restore_s0_s1_or_main",
      "finish_review_or_partial",
      "resolve_earliest_dependency_blocker",
      "pull_first_ready_migration_packet",
      "prepare_next_without_activation"
    ]
  },
  "interaction_state": {
    "persistence": "Client session or an explicitly authorized operational record; never write inferred values into this guide.",
    "external_gate_states": ["UNKNOWN", "PENDING", "SATISFIED", "WAIVED", "REJECTED"],
    "human_gate_states": ["PENDING", "APPROVED", "REJECTED"],
    "check_states": ["NOT_RUN", "PASS", "FAIL", "NOT_APPLICABLE"],
    "write_mode": "proposed_patch_then_explicit_confirmation",
    "computed_fields": {
      "packet_dependencies_closed": "every depends_on packet has live State CLOSED",
      "external_dependencies_satisfied": "every external dependency is SATISFIED or has a recorded human WAIVED decision",
      "conditional_dependencies_satisfied": "at least one item in every any_of group is satisfied",
      "definition_of_ready_passed": "every applicable checklist item in guide section 6 is true",
      "ready": "live State is OPEN and packet_dependencies_closed and external_dependencies_satisfied and conditional_dependencies_satisfied and definition_of_ready_passed",
      "closable": "live State is ACTIVE and all required checks PASS or NOT_APPLICABLE and all human gates APPROVED and Remainder is none"
    }
  },
  "roles": [
    {"id": "product_owner", "label": "Product owner", "guide_section": "4"},
    {"id": "unity_technical_owner", "label": "Unity technical owner", "guide_section": "4"},
    {"id": "content_owner", "label": "Content owner", "guide_section": "4"},
    {"id": "packet_owner", "label": "Packet owner", "guide_section": "4"},
    {"id": "human_experience_reviewer", "label": "Human experience reviewer", "guide_section": "4"},
    {"id": "release_owner", "label": "Release owner", "guide_section": "4"}
  ],
  "milestones": [
    {"id": "U0", "label": "Scaffold", "deliveries": ["D0", "D1"], "guide_section": "16", "hard_gate": "clean_clone_batch_build_and_tests"},
    {"id": "U1", "label": "Shared truth", "deliveries": ["D2", "D3"], "guide_section": "16", "hard_gate": "no_duplicate_story_or_house_authority"},
    {"id": "U2", "label": "Greybox house", "deliveries": ["D4", "D5"], "guide_section": "16", "hard_gate": "ground_upper_cellar_threshold_routes"},
    {"id": "U3", "label": "Day 1 slice", "deliveries": ["D6", "D7"], "guide_section": "16", "hard_gate": "human_play_visual_audio_accessibility_approval"},
    {"id": "U4", "label": "Act I", "deliveries": ["D8"], "guide_section": "16", "hard_gate": "human_pacing_and_no_idle_wait"},
    {"id": "U5", "label": "Full campaign", "deliveries": ["D8"], "guide_section": "16", "hard_gate": "semantic_routes_and_human_playthroughs"},
    {"id": "U6", "label": "Production house", "deliveries": ["D9"], "guide_section": "16", "hard_gate": "room_batch_human_approvals"},
    {"id": "U7", "label": "Release candidate", "deliveries": ["D10"], "guide_section": "16", "hard_gate": "product_masterplan_release_gate"}
  ],
  "deliveries": [
    {"id": "D0", "label": "Transition charter", "section": "15.3", "packets": ["WARD-00"], "exit": "reviewed_transition_charter"},
    {"id": "D1", "label": "Reproducible Unity foundation", "section": "15.4", "packets": ["WARD-01", "WARD-05"], "exit": "u0_hard_gate"},
    {"id": "D2", "label": "Deterministic content boundary", "section": "15.5", "packets": ["WARD-02", "WARD-03"], "exit": "deterministic_import_without_duplicate_authority"},
    {"id": "D3", "label": "Migration truth and domain core", "section": "15.6", "packets": ["WARD-04", "WARD-10", "WARD-11", "WARD-12", "WARD-13"], "exit": "deterministic_unity_free_game_session"},
    {"id": "D4", "label": "Save safety and greybox embodiment", "section": "15.7", "packets": ["WARD-14", "WARD-20"], "exit": "recoverable_save_and_complete_bound_greybox"},
    {"id": "D5", "label": "Movement interaction and acoustics", "section": "15.8", "packets": ["WARD-21", "WARD-22", "WARD-23"], "exit": "u2_routes_and_human_gates"},
    {"id": "D6", "label": "Persistent UI and accessible Day 1", "section": "15.9", "packets": ["WARD-30", "WARD-31", "WARD-32", "WARD-33"], "exit": "keyboard_text_complete_day1_route"},
    {"id": "D7", "label": "Day 1 vertical slice", "section": "15.10", "packets": ["WARD-40"], "exit": "u3_hard_gate_and_dart_freeze_decision"},
    {"id": "D8", "label": "Campaign and endings", "section": "15.11", "packets": ["WARD-60", "WARD-61"], "exit": "u5_campaign_and_three_derived_endings"},
    {"id": "D9", "label": "Production house rooms lighting and voice", "section": "15.12", "packets": ["WARD-50", "WARD-51", "WARD-52", "WARD-62"], "exit": "u6_human_approved_production_assets"},
    {"id": "D10", "label": "Release candidate", "section": "15.13", "packets": ["WARD-70"], "exit": "human_release_and_retirement_decisions"}
  ],
  "packets": [
    {"id": "WARD-00", "milestone": "U0", "delivery": "D0", "depends_on": [], "external_dependencies": [], "human_gates": ["transition_charter_review"], "split": "forbidden"},
    {"id": "WARD-01", "milestone": "U0", "delivery": "D1", "depends_on": ["WARD-00"], "external_dependencies": ["approved_unity_6_3_lts_patch", "windows_build_environment"], "human_gates": ["clean_environment_reproduction"], "split": "optional"},
    {"id": "WARD-02", "milestone": "U1", "delivery": "D2", "depends_on": ["WARD-01"], "external_dependencies": [], "human_gates": [], "split": "optional_by_transaction_safe_catalogue_boundary"},
    {"id": "WARD-03", "milestone": "U1", "delivery": "D2", "depends_on": ["WARD-02"], "external_dependencies": [], "human_gates": ["content_identity_sample_review"], "split": "optional_by_catalogue_with_global_validation_intact"},
    {"id": "WARD-04", "milestone": "U1", "delivery": "D3", "depends_on": ["WARD-01"], "external_dependencies": ["human_resolution_of_decision_rows"], "human_gates": ["migration_map_decisions"], "split": "optional_by_rule_family"},
    {"id": "WARD-05", "milestone": "U0", "delivery": "D1", "depends_on": ["WARD-01"], "external_dependencies": [], "human_gates": ["minimal_code_review"], "split": "optional"},
    {"id": "WARD-10", "milestone": "U1", "delivery": "D3", "depends_on": ["WARD-03", "WARD-04", "WARD-05"], "external_dependencies": ["accepted_pacing_policy"], "human_gates": ["product_rule_decisions", "minimal_code_review"], "split": "recommended_by_rule_cluster"},
    {"id": "WARD-11", "milestone": "U1", "delivery": "D3", "depends_on": ["WARD-03", "WARD-04", "WARD-05"], "external_dependencies": [], "human_gates": ["journal_semantics_review", "minimal_code_review"], "split": "recommended_by_journal_behavior"},
    {"id": "WARD-12", "milestone": "U1", "delivery": "D3", "depends_on": ["WARD-03", "WARD-05", "WARD-10", "WARD-11"], "external_dependencies": ["STORY-01_closed", "STORY-02_closed"], "human_gates": ["content_effect_and_callback_review", "minimal_code_review"], "split": "recommended_by_event_behavior"},
    {"id": "WARD-13", "milestone": "U1", "delivery": "D3", "depends_on": ["WARD-10", "WARD-11", "WARD-12"], "external_dependencies": [], "human_gates": ["state_ownership_review", "minimal_code_review"], "split": "optional_by_command_path"},
    {"id": "WARD-14", "milestone": "U2", "delivery": "D4", "depends_on": ["WARD-13"], "external_dependencies": ["cross_engine_save_decision"], "human_gates": ["save_compatibility_review"], "split": "only_when_intermediate_state_is_non_destructive"},
    {"id": "WARD-20", "milestone": "U2", "delivery": "D4", "depends_on": ["WARD-03", "WARD-13"], "external_dependencies": [], "human_gates": ["domestic_scale_and_topology_approval"], "split": "recommended_by_floor_with_parent_gate_retained"},
    {"id": "WARD-21", "milestone": "U2", "delivery": "D5", "depends_on": ["WARD-20"], "external_dependencies": [], "human_gates": ["motion_and_reduced_motion_approval"], "split": "recommended_by_route_increment"},
    {"id": "WARD-22", "milestone": "U2", "delivery": "D5", "depends_on": ["WARD-21"], "external_dependencies": [], "human_gates": ["interaction_feedback_approval"], "split": "recommended_by_target_and_failure_path"},
    {"id": "WARD-23", "milestone": "U2", "delivery": "D5", "depends_on": ["WARD-20", "WARD-22"], "external_dependencies": [], "human_gates": ["speaker_and_headphone_audio_approval"], "split": "recommended_by_audio_path"},
    {"id": "WARD-30", "milestone": "U3", "delivery": "D6", "depends_on": ["WARD-13", "WARD-21"], "external_dependencies": [], "human_gates": ["persistent_ui_approval"], "split": "recommended_by_modal_or_settings_path"},
    {"id": "WARD-31", "milestone": "U3", "delivery": "D6", "depends_on": ["WARD-12", "WARD-23", "WARD-30"], "external_dependencies": [], "human_gates": ["dialogue_caption_and_fallback_approval"], "split": "recommended_by_conversation_path"},
    {"id": "WARD-32", "milestone": "U3", "delivery": "D6", "depends_on": ["WARD-11", "WARD-30"], "external_dependencies": [], "human_gates": ["journal_ui_approval"], "split": "recommended_by_journal_action"},
    {"id": "WARD-33", "milestone": "U3", "delivery": "D6", "depends_on": ["WARD-22", "WARD-23", "WARD-30", "WARD-31", "WARD-32"], "external_dependencies": ["real_human_usability_reviewer"], "human_gates": ["keyboard_accessibility_route_approval"], "split": "optional_by_accessibility_mode_with_integrated_gate_retained"},
    {"id": "WARD-40", "milestone": "U3", "delivery": "D7", "depends_on": ["WARD-14", "WARD-20", "WARD-21", "WARD-22", "WARD-23", "WARD-31", "WARD-32", "WARD-33"], "external_dependencies": ["LOOP-01_acceptance", "day1_canonical_content"], "human_gates": ["complete_play", "visual", "audio", "accessibility", "dart_feature_freeze_decision"], "split": "only_by_integrated_day1_beat_with_parent_gate_retained"},
    {"id": "WARD-50", "milestone": "U6", "delivery": "D9", "depends_on": ["WARD-40"], "external_dependencies": ["rights_cleared_human_house_source"], "human_gates": ["house_scale_visual_and_route_approval"], "split": "optional_by_validated_import_boundary"},
    {"id": "WARD-51", "milestone": "U6", "delivery": "D9", "depends_on": ["WARD-50"], "external_dependencies": [], "human_gates": ["material_lighting_profile_approval"], "split": "recommended_by_baseline_then_treatment"},
    {"id": "WARD-52", "milestone": "U6", "delivery": "D9", "depends_on": ["WARD-51"], "external_dependencies": ["canonical_consequences_for_affected_rooms"], "human_gates": ["per_room_pair_visual_audio_approval"], "split": "required_WARD-52A_WARD-52B_WARD-52C"},
    {"id": "WARD-60", "milestone": "U4-U5", "delivery": "D8", "depends_on": ["WARD-40"], "external_dependencies": ["STORY-03_batches_closed"], "human_gates": ["per_act_pacing_and_restraint_approval"], "split": "required_WARD-60A_WARD-60B_WARD-60C"},
    {"id": "WARD-61", "milestone": "U5", "delivery": "D8", "depends_on": ["WARD-60"], "external_dependencies": ["END-01_acceptance"], "human_gates": ["three_ending_campaign_and_visual_review"], "split": "optional_by_ending_with_combined_gate_retained"},
    {"id": "WARD-62", "milestone": "U5-U6", "delivery": "D9", "depends_on": ["WARD-60"], "external_dependencies": ["human_story_lock"], "human_gates": ["voice_performance_mix_and_provenance_approval"], "split": "only_by_complete_atomic_voice_batch"},
    {"id": "WARD-70", "milestone": "U7", "delivery": "D10", "depends_on": ["WARD-52", "WARD-61"], "conditional_dependencies": [{"any_of": ["WARD-62", "human_text_first_ship_decision"]}], "external_dependencies": ["declared_target_hardware", "product_release_criteria"], "human_gates": ["visual", "audio", "accessibility", "complete_playthrough", "release_decision", "dart_retirement_decision"], "split": "recommended_by_verification_lane_with_single_candidate_gate"}
  ],
  "child_packets": [
    {"id": "WARD-52A", "parent": "WARD-52", "label": "Kitchen and cellar", "depends_on": ["WARD-51"]},
    {"id": "WARD-52B", "parent": "WARD-52", "label": "Bedroom and landing", "depends_on": ["WARD-51"]},
    {"id": "WARD-52C", "parent": "WARD-52", "label": "Bathroom and spare room", "depends_on": ["WARD-51"]},
    {"id": "WARD-60A", "parent": "WARD-60", "label": "Days 2 through 7", "depends_on": ["WARD-40"]},
    {"id": "WARD-60B", "parent": "WARD-60", "label": "Days 8 through 14", "depends_on": ["WARD-60A"]},
    {"id": "WARD-60C", "parent": "WARD-60", "label": "Days 15 through 20", "depends_on": ["WARD-60B"]}
  ],
  "forms": [
    {"id": "packet_kickoff", "section": "14", "required_fields": ["packet", "owner", "reviewer", "observable_outcome", "production_path", "dependencies_verified", "intended_files", "highest_risk", "first_check", "packaged_scenario", "stop_condition"]},
    {"id": "daily_update", "section": "14", "required_fields": ["packet_state", "finished", "next_observable_step", "blocker_decision", "review_needed"]},
    {"id": "review_request", "section": "14", "required_fields": ["packet", "outcome", "build_commit", "production_scenario", "checks", "artifacts", "known_limits", "human_questions"]},
    {"id": "decision_request", "section": "14", "required_fields": ["decision_id", "packet", "owner", "needed_by", "question", "facts", "options", "recommendation", "decision", "record_path"]},
    {"id": "human_gate", "section": "14", "required_fields": ["review_id", "packet", "reviewer", "build_commit_content", "environment", "scenario", "modes", "observations", "decision", "corrections", "retest_scope"]},
    {"id": "blocker", "section": "12", "required_fields": ["packet", "missing_decision_input", "unsafe_reason", "attempts", "decision_owner", "needed_by", "safe_parallel_work"]},
    {"id": "incident", "section": "11", "required_fields": ["id", "severity", "build_commit", "environment", "player_impact", "reproduction", "expected", "actual", "evidence", "owning_packet"]},
    {"id": "handoff", "section": "8", "required_fields": ["packet", "delivered_outcome", "files_changed", "behavior_path", "ids_schema", "verification", "artifacts", "human_review", "known_limits", "remaining_work"]}
  ],
  "interactive_actions": [
    {"id": "show_next_ready", "requires": ["parsed_live_packets"], "result": "first_open_packet_with_all_packet_and_external_dependencies_closed"},
    {"id": "claim_packet", "requires": ["definition_of_ready", "owner", "reviewer", "wip_capacity"], "transition": "OPEN_to_ACTIVE", "writes": ["packet.State", "packet.Owner", "ledger"]},
    {"id": "request_review", "requires": ["production_path_evidence", "review_request_form"], "result": "board_review_view_without_state_change"},
    {"id": "record_partial", "requires": ["tested_subset", "exact_remainder"], "transition": "ACTIVE_to_PARTIAL", "writes": ["packet.State", "packet.Evidence", "packet.Remainder", "ledger"]},
    {"id": "record_blocker", "requires": ["blocker_form"], "transition": "ACTIVE_or_OPEN_to_BLOCKED", "writes": ["packet.State", "packet.Remainder", "ledger"]},
    {"id": "close_packet", "requires": ["checks_pass", "required_human_gates_approved", "remainder_none"], "transition": "ACTIVE_to_CLOSED", "writes": ["packet.State", "packet.Evidence", "packet.Remainder", "ledger"]},
    {"id": "reopen_regression", "requires": ["regression_evidence"], "transition": "CLOSED_to_ACTIVE", "writes": ["packet.State", "packet.Owner", "packet.Evidence", "ledger"]},
    {"id": "render_delivery", "requires": ["delivery_id"], "result": "packet_graph_plus_referenced_implementation_section"},
    {"id": "render_human_gate_queue", "requires": ["parsed_live_packets"], "result": "active_packets_with_pending_required_human_gates"},
    {"id": "weekly_health_check", "requires": [], "result": "interactive_form_from_section_22"},
    {"id": "render_human_manual", "requires": [], "result": "guide_section_23"}
  ],
  "validation_rules": [
    "packet_ids_unique",
    "child_packet_ids_unique",
    "all_packet_dependencies_exist",
    "all_delivery_packet_references_exist",
    "all_packet_delivery_references_exist",
    "all_packet_milestone_references_exist",
    "live_packet_body_and_ledger_match",
    "at_most_two_active_implementation_packets",
    "at_most_one_active_packet_per_owner",
    "closed_packet_has_evidence_and_no_remainder",
    "partial_packet_has_exact_remainder",
    "blocked_packet_has_decision_owner",
    "required_split_exists_before_parent_activation",
    "required_human_gates_are_never_auto_approved"
  ]
}
```
<!-- HUMAN_AGILE_PLAN_V1_END -->

#### Parser behavior and safe writes

Read-only interaction—filtering, dependency graphs, readiness, form rendering,
aging, and evidence views—may be computed directly. A parser must not write to
the plan merely because a user opened, selected, or previewed a packet.

For an authorized state-changing action, the tool should produce a proposed
patch or require explicit confirmation before updating the packet body and
compact ledger together. It must preserve unrelated changes, retain human gate
records, and never auto-approve a decision, visible result, audio result,
accessibility result, release, Dart freeze, or Dart retirement.

Recommended Python in-memory model:

```text
GuideManifest
  schema/version
  authorities
  board/state_transitions
  roles[]
  milestones[]
  deliveries[]
  packet_index[]
  child_packets[]
  forms[]
  actions[]

LivePlan
  packets_by_id: WARD ID -> parsed Unity packet fields
  ledger_by_id: WARD ID -> parsed ledger row
  computed_ready_ids[]
  validation_errors[]
```

Interactive clients should display authority and evidence beside every action.
If live parsing fails, show the validation error and fall back to a read-only
document viewer; never guess state or offer a mutating action.

#### Unity packet parsing grammar

The Unity packet format is intentionally regular enough for a line-oriented
parser:

```text
packet_heading := "### " packet_id " — " title
packet_id      := "WARD-" two_digits
scalar_field   := field_name ":" value_continuation
steps_field    := "Steps:" blank_line ordered_markdown_list
packet_end     := next packet_heading | next level-two heading | end_of_file
```

Parsing rules:

- Begin a packet only on `packet_source.heading_pattern`.
- Recognize only the exact names in `packet_field_order` at column zero.
- A scalar value includes continuation lines until the next recognized field;
  preserve Markdown/code text and collapse whitespace only for display.
- `Steps` contains the ordered list after `Steps:` through the line before
  `Checks:`. Preserve item numbers and continuation lines.
- Extract packet dependency IDs from the `Depends on` value with
  `WARD-[0-9]{2}`; preserve all remaining text as unresolved external or
  conditional authority and reconcile it against this manifest.
- Interpret `none` case-insensitively only for fields that explicitly allow it;
  an empty field is missing data, not `none`.
- Parse the compact ledger independently and compare state, owner, milestone,
  and evidence with the packet body/index. A mismatch is a validation error.
- Use source byte offsets or line numbers for proposed patches. Reparse and
  revalidate after every patch before offering another state-changing action.

The guide itself uses level-two numbered headings as stable top-level sections.
The `guide_source.content_rule` lets a client render every section without a
full Markdown abstract syntax tree. A Markdown library may improve presentation,
but it must not change workflow semantics extracted from the JSON manifest.

Minimal standard-library loader:

````python
import json
import re
from pathlib import Path


def load_human_agile_manifest(path):
    text = Path(path).read_text(encoding="utf-8")
    pattern = (
        r"<!-- HUMAN_AGILE_PLAN_V1_BEGIN -->\s*"
        r"```json\s*(.*?)\s*```\s*"
        r"<!-- HUMAN_AGILE_PLAN_V1_END -->"
    )
    match = re.search(pattern, text, re.DOTALL)
    if match is None:
        raise ValueError("human agile manifest not found")
    manifest = json.loads(match.group(1))
    if manifest.get("schema") != "the-quarantine-human-agile-plan":
        raise ValueError("unsupported human agile schema")
    if manifest.get("schema_version") != 1:
        raise ValueError("unsupported human agile schema version")
    return manifest
````

The loader intentionally performs no writes and accepts no alternate marker or
schema spelling. A real client should run every `validation_rules` entry before
enabling the actions in `interactive_actions`.

</details>

---

## 1. The working agreement

1. Build the game vertically, not one discipline at a time.
2. Keep one obvious owner for every active packet.
3. Prefer a playable, imperfect slice over several disconnected complete
   subsystems.
4. Integrate early. A detached class, prefab, model, or dialogue file is not an
   increment.
5. Keep decisions visible and evidence factual.
6. Treat human visual, audio, accessibility, and play judgment as work—not a
   ceremonial approval at the end.
7. Use minimalistic human-like code: direct names, narrow ownership, no
   speculative framework, and no abstraction without a current need.
8. Stop starting and start finishing. When an item is blocked, resolve or split
   it before opening more work.
9. Do not measure progress by file count, test count, code volume, model count,
   or percentages.
10. Every week should end with a more truthful playable build or a resolved
    high-risk decision.

The shortest useful question is:

> What can a player do in the packaged build at the end of this increment that
> they could not do at the start?

If the answer is “nothing,” the work may still be necessary, but it must name the
risk or dependency it retired.

---

## 2. Sources and repositories

The workspace contains three histories:

| Repository | Path | Owns |
|---|---|---|
| Game | repository root | Dart reference, shared content/assets, Unity project, migration plan |
| Documentation | `tmp/` | product masterplan, this guide, durable operational records |
| Pixeldart | `external/pixeldart/` | renderer submodule; reference only during Unity transition unless explicitly tasked |

Always inspect both relevant worktrees:

```sh
git status --short
git -C tmp status --short
git -C external/pixeldart status --short
```

Do not combine a game/Unity change, documentation decision, and Pixeldart change
in one commit. A packet may need coordinated commits, but each repository keeps a
coherent history and explicit dependency.

Before planning work, read only:

- `MASTERPLAN.md` sections 0, 1, 9, 10, and the relevant product packet;
- `../UNITY_PLAN.md` sections 0–6 and the relevant `WARD-*` packet;
- `GROUND_RULES.md`; and
- files named by the packet.

Do not read every historical document in `tmp/`. Many predate the reconciled
plans and can contain stale implementation assumptions.

---

## 3. Recommended method: one-week Scrumban

Use one-week planning horizons with continuous integration. Do not force the
project into fixed sprint scope when content, art, and engine risks are still
being discovered.

### Board columns

| Column | Plan state | Meaning |
|---|---|---|
| Ready | `OPEN` with dependencies closed | Small enough, inputs known, acceptance test named. |
| Doing | `ACTIVE` | One owner is implementing it now. |
| Review | `ACTIVE` | Implementation is complete; automated/human evidence is being reviewed. |
| Partial | `PARTIAL` | A tested useful subset landed; exact remainder is visible. |
| Blocked | `BLOCKED` | Decision/input/authority is named; no hidden work continues. |
| Done | `CLOSED` | Production-path checks and required human review passed. |
| Removed | `DROPPED` | Human decision records why it left scope. |

The plan file keeps the official state. The physical/digital board is a view,
not a second authority. Update both in the same working session.

### Work-in-progress limits

For a small team:

- Maximum two implementation packets `ACTIVE` across the whole project.
- Maximum one active packet per person.
- Maximum one visible packet waiting for human review.
- Expedite only a broken main build, data loss, rights violation, or work that
  blocks every ready packet.

If the limit is full, help finish, review, test, simplify, document a decision,
or unblock. Do not pull another packet.

### Cadence

| Moment | Timebox | Purpose |
|---|---:|---|
| Weekly replenishment | 30–45 min | Review goals, close stale state, split the next ready work, confirm owners/reviewers. |
| Daily check | 5–10 min async or live | State facts: finished, next, blocker, review needed. No status theater. |
| Midweek integration | 30 min | Run the current packaged path and address integration drift early. |
| Review/demo | 30–60 min | Demonstrate production behavior, inspect evidence, accept/reject human gates. |
| Retrospective | 20–30 min | Choose one process improvement and assign it. |

Cancel a ceremony when it has no decision or inspection to perform. Keep the
cadence; discard the theater.

### Explicit pull policies

A card moves only when the destination policy is true:

| Move | Required policy |
|---|---|
| Backlog -> Ready | Dependencies closed, Definition of Ready passes, owner capacity likely, reviewer available. |
| Ready -> Doing | Owner claims the packet in the authority plan before editing and baseline is known. |
| Doing -> Review | Observable outcome works in production composition, owner self-review is complete, evidence is attached. |
| Review -> Done | Required automated checks pass, human gates are decided, packet and ledger agree. |
| Doing/Review -> Partial | A useful tested subset is safe to integrate and exact remainder is named. |
| Any active state -> Blocked | Named missing input or decision prevents safe progress after narrowing was attempted. |
| Done -> Doing | A regression reproduces against the accepted behavior and the packet is formally reopened. |

Never move a card merely because a meeting started, a branch was merged, or an
owner needs a clean board. State describes reality.

### Planning horizons

Use three horizons, each with a different level of commitment:

| Horizon | Typical contents | Commitment |
|---|---|---|
| Now | One or two active packets and their reviews. | Owned, bounded, actively protected. |
| Next | The next dependency-ready packets. | Refined enough to expose decisions and reviewers; order may change with evidence. |
| Later | Gated milestone packets and candidate defects. | Outcome and dependencies only; do not detail speculative implementation. |

Only “Now” consumes team capacity. “Next” is kept small—usually two to four
packets—so refinement does not outrun learning. “Later” is not pre-assigned.

### Classes of service

Most work uses the normal ordered pull policy. Three exceptions exist:

| Class | When allowed | Treatment |
|---|---|---|
| Expedite | S0/S1 incident, broken main, legal/rights stop, or one blocker stopping all ready work. | One at a time; pauses normal pull; review cause afterward. |
| Fixed-date | External submission, license expiry, booked specialist review, or platform requirement with a real date. | Record date and cost of delay; reduce scope before increasing WIP. |
| Discovery | A bounded spike needed to make the next packet Ready. | Half-day target, explicit question, disposable output, no hidden production framework. |

“Someone asked urgently” and “this looks quick” are not classes of service.

### Flow health triggers

These are conversation triggers, not performance targets:

- An active packet with no integrated evidence after two working days gets a
  same-day split/assist review.
- A review waiting more than one working day becomes the team's first pull.
- A blocker without a decision owner and needed-by point is malformed and must
  be rewritten immediately.
- A packet reopened twice receives a root-cause review before another local fix.
- Two consecutive weeks without a packaged behavior or retired high risk cause
  replenishment to stop new starts and restore the delivery path.
- A change growing beyond its named files or adding a second authoritative
  owner returns to refinement before more code is added.

Triggers prompt inspection. A complex packet may legitimately take longer when
the owner can show a small integrated path and a credible finish condition.

---

## 4. Human roles

One person may wear several hats, but name the active hat so decision authority
is clear.

### Product owner

- Protects the red thread and ordered outcomes.
- Resolves scope, story meaning, platform, and release questions.
- Accepts or rejects product behavior, not implementation style alone.
- Records decisions in the product masterplan.

### Unity technical owner

- Protects assembly, state-ownership, content-import, save, and build boundaries.
- Selects and pins the Unity editor patch/packages.
- Reviews minimalistic code and prevents framework growth.
- Owns architecture decisions and the packaged build path.

### Content owner

- Protects screenplay/corpus and stable IDs.
- Reviews story event, choice, callback, residue, and text-lock changes.
- Prevents Unity-generated assets from becoming canon.

### Packet owner

- Owns one active packet from ready check through evidence and handoff.
- Coordinates narrow changes across disciplines without expanding scope.
- Keeps the branch/build green and asks early when authority is missing.

### Human experience reviewer

- Reviews visible, audio, accessibility, motion, pacing, or complete-play
  evidence as applicable.
- Uses a real packaged build and named hardware.
- Writes specific approval/rejection notes.
- Is never replaced by self-approval or automated screenshot comparison.

### Release owner

- Owns build identity, evidence index, rights/provenance, known issues, and final
  go/no-go coordination.
- Cannot replace the required specialist/human reviews with one signature.

### Decision and review map

“Owner” means the final decision owner, not the only contributor.

| Question or evidence | Decision owner | Required consultation |
|---|---|---|
| Product meaning, red thread, scope, Dart freeze/retirement | Product owner | Content and Unity technical owners |
| Unity version, packages, assemblies, state boundaries, build path | Unity technical owner | Packet owner; product owner if scope changes |
| Canonical prose, event IDs, callbacks, text lock | Content owner | Product owner and affected implementer |
| Visual scale, hierarchy, readability, restraint | Human experience reviewer | Product and Unity technical owners |
| Motion, controls, remapping, accessibility route | Human experience reviewer | A player using the relevant access need when available |
| Voice performance and mix | Content/product reviewer plus audio reviewer | Accessibility reviewer for caption fallback |
| Release, rights completeness, known issues | Release owner recommends; product owner decides | All owners with an open gate |

The packet owner may reject their own work and may approve purely mechanical
checks, but cannot satisfy a required human experience gate alone. Name the
reviewer during refinement, not when the build is waiting.

### Contributor handoffs

Keep ownership even when another specialist contributes. A useful handoff says:

```text
Packet and owner:
Contribution requested:
Exact input/version:
Allowed files or asset boundary:
Output contract:
Acceptance evidence:
Needed by:
Return contact:
```

The packet owner validates and integrates returned work. A modeller, writer,
audio designer, or tester does not inherit responsibility for unrelated packet
acceptance merely because their file changed.

---

## 5. Choosing the next item

Pull work in this order:

1. Broken main build, corrupt shared content, data loss, or rights issue.
2. The first `OPEN` migration packet whose dependencies are `CLOSED`.
3. A blocker preventing that packet.
4. A small defect found in the currently accepted vertical slice.
5. Evidence/review needed to close existing work.

Do not prioritize by excitement, visual impressiveness, or who is currently
free. Renderer effects, full art passes, voice batches, and campaign expansion
remain behind their gates even when someone could start them today.

Use this value test when two ready items compete:

```text
priority = player-loop value + risk retired + dependency unblocked
           - integration uncertainty - review debt
```

Do not turn that expression into a numeric scoring system. It is a discussion
prompt. The ordered plans break ties.

### Unity migration pull map

The migration plan already supplies the dependency order. Humans should see it
as a sequence of risk reductions, not as eight mini-waterfalls:

| Milestone | Packets | Human question answered before advancing |
|---|---|---|
| U0 Scaffold | `WARD-00`, `WARD-01`, `WARD-05` | Can this team reproduce, understand, and safely extend the pinned project? |
| U1 Shared truth | `WARD-02`–`WARD-04`, `WARD-10`–`WARD-13` | Is Unity consuming the same accepted content and deterministic rules without duplicate authority? |
| U2 Greybox house | `WARD-14`, `WARD-20`–`WARD-23` | Can a human inhabit the canonical house, act, hear consequences, and recover state? |
| U3 Day 1 | `WARD-30`–`WARD-33`, `WARD-40` | Is the complete red thread understandable, accessible, and paced in a packaged build? |
| U4–U5 Campaign | split children of `WARD-60`, then `WARD-61` | Does accepted Day 1 structure sustain escalation, callbacks, and derived endings? |
| U6 Production | `WARD-50`–`WARD-52`, optionally `WARD-62` | Can validated human art/audio replace proxies without changing gameplay truth? |
| U7 Release | `WARD-70` | Is the exact candidate supportable, legal, recoverable, accessible, and worth retiring Dart for? |

Some packets within a milestone can proceed independently when their declared
dependencies permit it. Keep the global WIP limit anyway. For example,
`WARD-04` can refine fixtures while `WARD-02` is active, but starting both is
useful only if each has an owner, distinct files, and a near-term integration
point. `WARD-52` and `WARD-60` must be split before activation exactly as the
Unity plan requires.

### Replenishment decision sequence

At replenishment, walk this sequence and stop as soon as capacity is filled:

1. Restore main/build health and resolve S0/S1 incidents.
2. Finish reviews and partial packets that can close with less than a day of
   focused work.
3. Resolve a blocker on the earliest dependency path.
4. Pull the first ready Unity packet from the compact migration ledger.
5. Pull one independent packet only if WIP remains and its integration/reviewer
   path is clear.
6. Prepare—but do not activate—the next likely packet.

If the next ordered packet is not Ready, the week's outcome can be a resolved
decision or a closed spike. Do not disguise missing authority as implementation.

### Capacity and unplanned work

Plan at most about four-fifths of known human availability. The remainder
absorbs review, integration, illness, build failures, and small discoveries.
This is a capacity guardrail, not a utilization target. Never fill “spare” time
by opening gated work. Use it to shorten feedback, pair, simplify, improve one
fixture, or prepare the next review environment.

When unplanned work arrives, explicitly choose one:

- expedite it and pause an active packet;
- attach it to the owning active packet because it blocks that outcome;
- record it as a candidate for future replenishment; or
- decline it because impact does not justify lifecycle cost.

Do not silently absorb it. Silent work destroys forecasts and hides product
tradeoffs.

---

## 6. Definition of Ready

A packet is ready only when all boxes are true:

- [ ] Its ID and state exist in the correct plan and ledger.
- [ ] Every dependency is `CLOSED` or explicitly waived by a human decision.
- [ ] One observable outcome is written in player or architecture terms.
- [ ] Inputs and expected write scope are exact.
- [ ] Stable IDs/schema changes are known or explicitly absent.
- [ ] The production integration point is identified.
- [ ] Focused automated checks are named.
- [ ] Packaged-build evidence is named where relevant.
- [ ] A real human reviewer is scheduled for visible/audio/usability work.
- [ ] Required assets, rights, editor version, and hardware are available.
- [ ] The item is small enough for one owner to finish in roughly one to three
      working days.
- [ ] Stop conditions and the likely highest risk are understood.

If one box is false, refine, split, or block the packet. Do not begin and hope
the missing decision appears later.

### Twenty-minute refinement pass

Refine only the next likely packet. The owner, technical owner, and relevant
reviewer answer these in order:

1. Read the packet outcome aloud. What will be observable when it closes?
2. Trace one production path: input -> authoritative owner -> state/event ->
   presentation or artifact.
3. Name the riskiest assumption and the cheapest evidence that can disprove it.
4. Confirm dependencies from repository truth, not memory.
5. List the smallest intended write set and likely shared seams.
6. Name positive, negative, recovery, and packaged checks that apply.
7. Name the reviewer, environment, and evidence before implementation begins.
8. Split if the owner cannot describe an integrated result achievable in one to
   three working days.

End with one of four results: `Ready`, `split into named children`, `BLOCKED`
with owner, or `DROPPED` by product decision. “Needs more thought” is not a
result.

### Risk statement

Add one temporary working statement to the card or issue:

```text
We believe <implementation or content choice>
will produce <observable outcome>.
The main risk is <specific failure or unknown>.
We will know by <test, build scenario, or human observation>.
Stop or split when <concrete condition>.
```

This statement guides the first evidence. Remove it from durable plan text when
the packet closes unless the result deserves an ADR, risk update, or acceptance
note.

---

## 7. How to split work vertically

Split by observable behavior, not file layer.

Good slice:

```text
Player approaches the closed front door, receives one focus target, opens it
through the production command path, hears the acoustic transition, saves,
reloads, and sees the same accepted state.
```

Weak horizontal slices:

```text
Create all door DTOs.
Create every door prefab.
Write the entire audio abstraction.
Finish all UI mockups.
```

A small vertical slice may include a DTO, one domain rule, one binding, one
minimal prompt, and one PlayMode test. That is acceptable because it proves the
boundary end to end. Keep ownership narrow by choosing one primary directory
and coordinating only the smallest necessary interface changes.

### Splitting checklist

For each child packet, answer:

1. What single behavior becomes observable?
2. What is the one authoritative state owner?
3. What is the production input and output?
4. What can be represented by a labeled proxy?
5. What evidence closes it independently?
6. What deliberately remains for the next child?

Use stable child IDs and dependencies. Do not change the parent to `CLOSED`
until every acceptance condition is represented by closed children.

### Spikes

A spike answers one risky question and should usually fit within half a day.
It produces:

- a short decision;
- measured evidence or a minimal disposable experiment;
- the rejected alternatives;
- impact on packet scope; and
- no production framework unless the implementation packet accepts it.

Timebox the question, not a vague investigation. Delete disposable spike code
or clearly isolate it outside production.

### Useful splitting patterns for this migration

Choose the pattern that preserves a complete feedback loop:

- **One representative entity:** one portal, one room transition, one journal
  entry, then generalize only after the path is accepted.
- **Happy path then safety path:** get one valid command integrated, then add
  rejection, recovery, corruption, or fallback as an independently closable
  child when the first child is still safe and truthful.
- **One route/state pair:** normal front-door state plus its consequence, rather
  than every portal or every consequence.
- **One content batch:** one schema/catalogue with global ID validation, then the
  next catalogue; keep the transaction boundary intact.
- **One accessibility mode across one journey:** keyboard-only Day 1 or large UI
  across the threshold sequence, rather than one setting across disconnected
  screens.
- **One room pair or act:** use the explicit `WARD-52` and `WARD-60` boundaries.
- **Decision before implementation:** separate a save compatibility, package,
  rendering, or voice-lock decision when alternatives change the write set.

Do not split transactionality, exactly-once delivery, or save compatibility so
that an intermediate child can corrupt accepted player state. Some safety
properties must close with the happy path.

### Concrete packet examples

For `WARD-20`, a useful first integrated child could generate the ground-floor
proxy and validate its stable room/portal bindings in a development build. It
must leave upper/cellar route work explicit and cannot close the parent or claim
the complete house.

For `WARD-22`, “door interaction” is still too broad if it means all doors and
feedback. A better child proves one closed front door through collider hit,
focus eligibility, typed command, accepted state, presentation update, and
save/reload. A second child covers rejection/occlusion and the remaining target
kinds using the established path.

For `WARD-40`, do not split by UI/audio/code discipline. Split by Day 1 beats only
when each child runs in the packaged composition and the final integration
packet still owns end-to-end timing, reload, and human review.

For `WARD-60`, create stable children for Days 2–7, 8–14, and 15–20 before work.
Within an act, pull the smallest playable day/consequence pair, but retain the
act-level exactly-once and pacing gate.

### When a packet grows during implementation

Stop at the next compiling, non-destructive point and classify the discovery:

1. Required for the promised outcome and small: keep it, update expected files.
2. Required but independently valuable: split a child and make dependencies
   explicit.
3. Unrelated defect: record it against its owning packet and continue current
   scope unless severity demands expedite.
4. Product/architecture choice: block and send the decision to its owner.
5. Speculative convenience: decline it.

Never keep an undisclosed “while here” list on the branch.

---

## 8. Daily implementation loop

### Before coding

1. Check all three repository statuses.
2. Pull/update without overwriting unrelated local work.
3. Confirm packet state, owner, dependencies, and reviewer.
4. Run the narrow existing baseline check.
5. Read the production caller and existing tests.
6. Restate the behavior path in one line.

### While coding

1. Add or tighten the smallest meaningful test/fixture.
2. Implement the direct path.
3. Integrate it through the real composition root.
4. Run focused checks frequently.
5. Keep changes scoped; record outside findings instead of folding them in.
6. Ask as soon as story, visual, rights, save, or architecture authority is
   missing.

### Before review

1. Read the diff as a reviewer.
2. Remove scaffolding, unused public API, noisy logs, broad comments, and
   speculative abstractions.
3. Verify no generated or unrelated mass diff appeared.
4. Run the packet checks and applicable shared checks.
5. Produce packaged/capture/audio evidence where required.
6. Update packet and ledger accurately.

### After review

- `APPROVED`: close the packet, integrate, and make the next dependency ready.
- `REJECTED`: set `PARTIAL`, write exact corrections, and retain evidence.
- New unrelated finding: create a candidate backlog entry; do not reopen scope.
- Regression: reopen the owning closed packet with the new evidence.

### Small-batch integration policy

Integrate a coherent slice whenever it is safe, reviewed to its risk, and keeps
main green. Do not wait for a week-end merge. A packet may use several coherent
commits, but every commit should state one behavior or enabling boundary and
avoid unrelated formatting/generated churn.

Before integrating:

1. Rebase or merge current main according to team convention.
2. Re-run the narrow checks affected by integration.
3. Inspect repository status in game, docs, and Pixeldart.
4. Confirm generated Unity metadata/output is intentional and reproducible.
5. Keep coordinated cross-repository commits separate and record their order.
6. Verify the plan state does not claim more than the integrated commit proves.

If main breaks, stop the line. The author and first available teammate restore
it by fixing forward or reverting the coherent change, then record the cause if
the build allowed a preventable escape.

### Pairing and swarming

Pair when a packet crosses an unfamiliar boundary, carries save/content risk,
or has been active for two days without integrated evidence. The packet owner
still types/coordinates and remains accountable; the second person challenges
assumptions and shortens feedback.

Swarm when an S0/S1 incident, review bottleneck, or single blocker prevents all
ready work. A swarm has one coordinator and divides diagnosis, reproduction,
fix, and verification—not multiple competing fixes. Disband as soon as normal
flow is restored.

### Verification ladder during development

Use the cheapest meaningful check first, then climb only as risk requires:

```text
pure rule/fixture -> importer or EditMode -> PlayMode composition
                  -> Windows development build -> human experience gate
```

Run the lower rung frequently. Run the packaged rung before review for player-
facing, persistence, input, audio, graphics, or platform behavior. A mock can
locate a defect but cannot replace the first production seam above it.

### End-of-day continuity

An unfinished owner leaves the next person—or their future self—a truthful
record:

```text
Packet/state and branch/commit:
Last passing command:
Current behavior path:
Next smallest action:
Failure/reproduction if any:
Uncommitted files and why:
Decision/review waiting:
```

Do not mark `PARTIAL` merely because the workday ended. Use `ACTIVE` when one
owner will resume and the branch is understandable; use `PARTIAL` only when a
tested useful subset is deliberately integrated with a named remainder.

---

## 9. Definition of Done

Done means all applicable conditions pass:

### Behavior

- [ ] The promised behavior works through production input and composition.
- [ ] Rejected/invalid paths fail clearly and safely.
- [ ] Save/reload and exactly-once behavior are covered where state changes.
- [ ] Stable IDs and schema compatibility are preserved or migrated.

### Code and assets

- [ ] Code follows the Unity plan's minimalistic human-like rule.
- [ ] One obvious state owner exists; no duplicate mutable truth was added.
- [ ] No speculative framework, placeholder API, hidden lookup, or global state
      remains.
- [ ] Tests cover behavior rather than private implementation.
- [ ] Generated outputs are reproducible and owned.
- [ ] Assets have rights/provenance and correct proxy/accepted status.

### Evidence

- [ ] Focused checks pass with exact commands recorded.
- [ ] Applicable shared/build checks pass.
- [ ] Packaged runtime was used where the packet requires it.
- [ ] Visible/audio/accessibility/pacing changes have a named real-human result.
- [ ] Failure artifacts and replay steps exist when anything remains partial.

### Hygiene

- [ ] Packet body and compact ledger agree.
- [ ] Documentation records decisions, not a progress diary.
- [ ] Unrelated work was preserved.
- [ ] Temporary processes, files, captures, and branches are handled explicitly.
- [ ] `Remainder` is `none` before `CLOSED`.

“Code complete,” “works in Editor,” “the author says it looks good,” and “most tests
pass” are not Done.

---

## 10. Review and demonstration

Review the behavior before reviewing every implementation detail:

1. State the packet outcome and build identity.
2. Run the shortest production scenario live.
3. Show negative/failure behavior.
4. Show save/reload if stateful.
5. Inspect captures/audio/hardware evidence when applicable.
6. Review the diff for ownership and minimal code.
7. Decide `APPROVED`, `REJECTED`, or “technical checks pass; human gate pending.”

Keep review notes concrete:

```text
Good: Door state, collider, prompt, and low-pass agree after reload.
Reject: At 1920x1080 the prompt overlaps captions at 150% UI scale.
Required: Move prompt into its reserved lane and recapture default/large UI.
Not in scope: Final door material and handle model.
```

Avoid “looks good,” “polish later,” and requests unrelated to the packet.

### Visual review

Use the exact human-eyes record in the masterplan/Unity plan. Review ordinary
play distance, not only Scene view or free camera. Compare high/safe,
default/accessibility, light/dark, and before/after states required by the
packet. A reviewer can reject mood even when pixel metrics pass.

### Playtest review

Observe without coaching. Record:

- where the player stops or becomes lost;
- what they believe their current goal is;
- what action they expected;
- whether they understand the consequence;
- time spent per beat/day;
- accessibility or discomfort issues; and
- their interpretation of people and events, without correcting it.

Fix comprehension of actions and consequences. Do not force one interpretation
of the central horror.

### Review depth by change

| Change | Minimum review |
|---|---|
| Pure Domain rule | Focused fixture, deterministic repeat, minimal-code review. |
| Content sync/import | Valid/invalid/idempotent runs, stable ID/hash/GUID inspection, failure atomicity. |
| Save/persistence | Round trip, compatibility rejection, corruption/recovery, packaged filesystem path. |
| Scene binding/interaction | EditMode validation, production-input PlayMode route, negative occlusion/state case, reload. |
| UI/accessibility | Semantic/view-model checks, keyboard route, scale/contrast modes, named human review. |
| Audio | Graph/routing checks, missing-audio fallback, packaged hardware run, headphone and speaker review. |
| Visual/art/lighting | Asset/provenance validation, route checks, profile/state captures, ordinary-play human review. |
| Campaign/endings | Semantic routes, exactly-once/save checks, timed uncoached human play. |
| Release/build | Clean checkout, full matrix, rights index, recovery, performance evidence, human go/no-go. |

Apply the stricter row when a change spans several categories.

### Evidence freshness and identity

Evidence is reviewable only when it identifies the commit/build, Unity patch,
content index, scenario/seed, environment, and applicable settings. After a
behavior-affecting change, recapture the affected evidence; do not reuse a green
screenshot or log from an earlier build. Pure documentation corrections may
reference existing evidence when they do not reinterpret its result.

The reviewer should be able to reproduce the shortest scenario without private
instructions from the author. If not, the packet remains in Review while the
record is corrected.

### Handling rejection

A rejection is useful delivery information, not a failed ceremony:

1. Reviewer states the observed behavior and environment.
2. Reviewer links the violated acceptance condition.
3. Owner sets `PARTIAL` when an accepted subset is integrated, otherwise keeps
   `ACTIVE`.
4. Owner turns each required correction into a small observable check.
5. Reviewer and owner agree which artifacts must be repeated.
6. Unrelated preferences return to backlog refinement.

Do not erase rejected evidence; keep it with the replacement so the decision is
auditable and regressions are easier to recognize.

---

## 11. Bugs and production incidents

### Severity

| Severity | Meaning | Response |
|---|---|---|
| S0 | Data loss, rights/security issue, or unrecoverable save corruption. | Stop normal work; owner and recovery plan immediately. |
| S1 | Main/build broken, required route blocked, boot failure, or campaign cannot continue. | Expedite within WIP; fix or revert before feature work. |
| S2 | Feature incorrect with a safe workaround; visible/audio/accessibility regression. | Add to owning packet or next ready defect slot. |
| S3 | Minor polish or developer-only inconvenience. | Record only if evidence and player impact justify it. |

Bug record:

```text
ID:
Build/commit:
Environment:
Player impact:
Reproduction:
Expected:
Actual:
Evidence:
Owning packet/system:
Severity:
```

Fix the cause in its owning system. Do not add a second state flag, fallback
manager, or scene-specific special case merely to make the symptom disappear.

---

## 12. Decisions and blockers

A blocker must say:

```text
Blocked packet:
Missing decision/input:
Why work cannot safely continue:
Checks/alternatives already tried:
Decision owner:
Needed by:
Safe work that can continue elsewhere:
```

Decisions that affect product intent go in `MASTERPLAN.md`. Unity architecture
decisions go in `unity/Docs/Decisions/` after the project exists. Temporary
working notes do not become authority.

Use an ADR only when at least one is true:

- the choice changes an assembly or state boundary;
- it introduces/removes a package;
- it changes persistence/content compatibility;
- it has a costly reversal;
- two plausible approaches have materially different tradeoffs.

Do not write an ADR for routine class names or obvious implementation details.

---

## 13. Sustainable planning and metrics

Track only signals that help decisions:

- Age of each `ACTIVE`, `PARTIAL`, and `BLOCKED` packet.
- Time from `ACTIVE` to production-path review.
- Number of reopened packets and why.
- Main/build health.
- Human-review queue age.
- Day/act playtest duration and repeated confusion points.
- Escaped save, route, rights, accessibility, or state-ownership defects.

Use consistent definitions:

- **Cycle time:** first move to `ACTIVE` until `CLOSED`, excluding time after a
  deliberate `DROPPED` decision. Show blocked time separately.
- **Active age:** elapsed working days since the current activation without a
  close. Reopening starts a new age and retains the prior cycle history.
- **Review age:** time since evidence was ready for its named reviewer.
- **Blocked age:** time since the blocker was recorded with a decision owner.
- **Throughput:** packets closed in a rolling four-week window, labeled by
  packet class; never compare people using it.
- **Reopen rate:** closed packets reopened in the same window with categorized
  cause: missing acceptance, integration drift, regression, or changed product
  decision.
- **Flow efficiency:** optionally compare hands-on time with total cycle time to
  locate queues; do not ask people to account for every hour.

Review a simple aging table weekly:

| Packet | State | Age | Last integrated evidence | Waiting for | Next action |
|---|---|---:|---|---|---|
| `WARD-##` | `ACTIVE` | working days | build/commit or none | person/decision/none | one observable action |

The useful conversation is why work waits and how to finish it. Do not create a
dashboard unless the manual table has repeatedly informed decisions.

Do not use story points, velocity, lines of code, commits, screenshots, assets,
or test totals as productivity targets. They encourage the wrong game.

At retrospective, choose one improvement only. Examples:

- split packets earlier;
- schedule the human reviewer before work starts;
- reduce import/build feedback time;
- add one production fixture for a repeated regression;
- remove a confusing duplicate owner; or
- improve one error message that repeatedly blocks diagnosis.

Assign an owner and review its effect next week. A list of ten unowned process
ideas is not an improvement.

### Forecasting without false precision

Forecast only when a product or coordination decision needs it. Use the team's
recent cycle-time range for similarly sized closed packets and current
dependency/blocker facts. State a range and assumptions:

```text
Forecasted gate:
Likely range:
Based on:
Assumes:
Largest uncertainty:
Next evidence that may change the range:
```

For an external fixed date, hold date and quality constant, then vary scope by
removing later optional work or shipping text-first as already allowed. Never
compress human review, recovery, rights, or accessibility gates to protect a
forecast.

### Retrospective experiment

Phrase the single improvement as a falsifiable experiment:

```text
Problem observed:
Change for one week:
Owner:
Signal to inspect:
Keep/revise/revert decision date:
```

Examples include booking reviewers at refinement, pairing on save changes, or
running one packaged smoke at midweek. If it does not help, revert the process;
agility includes removing ceremony.

---

## 14. Meetings and templates

### Weekly replenishment agenda

```text
1. Is main/build healthy?
2. Which packets changed state, and does evidence support it?
3. What is blocked or aging?
4. What is the first dependency-ready packet?
5. Is it small and Ready? If not, split/refine now.
6. Who owns it, and who reviews the human gate?
7. What packaged behavior should exist by next review?
8. What will we deliberately not start?
```

### Daily update

```text
Packet/state:
Finished since last update:
Next observable step:
Blocker/decision:
Review needed:
```

### Review request

```text
Packet:
Outcome:
Build/commit:
Production scenario:
Checks:
Artifacts:
Known limits:
Human questions:
```

### Retrospective

```text
Helped:
Hurt:
One change for next week:
Owner:
How we will know it helped:
```

### Packet kickoff canvas

```text
Packet/owner/reviewer:
Observable outcome:
Production path:
Dependencies verified:
Intended files/repositories:
Stable IDs/schema impact:
Highest risk:
First disconfirming check:
Negative/recovery path:
Packaged scenario:
Human gate/environment:
Stop/split condition:
Deliberately excluded:
```

### Decision request

```text
Decision ID/title:
Owning packet:
Decision owner:
Needed by:
Question in one sentence:
Facts and evidence:
Option A / consequence:
Option B / consequence:
Recommendation and why:
Reversal cost:
Work safe to continue meanwhile:
Decision and date:
Where recorded:
```

### Human gate record

```text
Review ID and packet:
Reviewer and role:
Build/commit/content index:
Date, hardware, display/audio/input:
Scenario and duration:
Profiles/accessibility modes exercised:
Observed strengths:
Observed failures with evidence:
Decision: APPROVED | REJECTED | PENDING
Required corrections:
Explicitly out of scope:
Retest scope:
```

### Partial handoff

```text
Packet:
Accepted subset now integrated:
Evidence for subset:
Exact remainder:
Why splitting now is safe/useful:
New child IDs/dependencies if applicable:
Owner and next action:
Risks not retired:
```

### Incident closeout

```text
Incident/severity:
Player or production impact:
Detection and recovery timeline:
Technical cause:
Process escape point:
Fix/revert evidence:
One prevention or detection improvement:
Owner and review date:
Affected packet reopened:
```

---

## 15. Detailed implementation delivery plan

This section translates the ordered Unity packets into a practical delivery
sequence. It does not replace the packet bodies in `../UNITY_PLAN.md`. The Unity
plan still owns exact scope, files, dependencies, and acceptance. When a packet
changes there, reconcile this section during the same planning session.

The sequence is intentionally pull-based. “Delivery lane” means a coherent
dependency path, not a permanent team or parallel work mandate. Start only the
first Ready item that fits the WIP limit.

### 15.1 Delivery topology

```text
Transition and safety
  WARD-00 -> WARD-01 -> WARD-05
               |       |
Shared truth   +-> WARD-02 -> WARD-03 -+
               +-> WARD-04 ------------+-> WARD-10 --+
                                      +-> WARD-11 --+-> WARD-12 -> WARD-13 -> WARD-14

Embodied house                     WARD-03 + WARD-13 -> WARD-20 -> WARD-21 -> WARD-22
                                                       |                 |
                                                       +----------------> WARD-23

Player-facing shell                         WARD-13 + WARD-21 -> WARD-30
                                  WARD-12 + WARD-23 + WARD-30 -> WARD-31
                                           WARD-11 + WARD-30 -> WARD-32
                               WARD-22/23/30/31/32 -> WARD-33

Vertical slice       WARD-14/20/21/22/23/31/32/33 -> WARD-40

Campaign             WARD-40 -> WARD-60 act children -> WARD-61
Production house     WARD-40 -> WARD-50 -> WARD-51 -> WARD-52 room-pair children
Voice                WARD-60 + story lock -> WARD-62

Release              WARD-52 + WARD-61 + WARD-62 or text-first decision -> WARD-70
```

Use this topology only as a navigation aid. The dependency fields in the Unity
plan are authoritative. `WARD-10` and `WARD-11`, for example, can be independently
Ready after their shared prerequisites close, but the WIP limit may still make
sequential pull the better choice.

### 15.2 Universal implementation cycle

Apply this cycle to every packet and child packet:

1. **Claim:** verify dependencies and baseline, assign owner/reviewer, set the
   authority packet `ACTIVE`, and record the intended write set.
2. **Expose risk:** write the first failing fixture, validation case, or shortest
   reproducible packaged scenario for the packet's highest risk.
3. **Build one path:** implement one direct input-to-outcome flow through the
   real owner and production composition.
4. **Make failure safe:** cover invalid input, rejection, interrupted work,
   reload, or fallback appropriate to the boundary.
5. **Broaden deliberately:** add the remaining declared entities/states only
   after the representative path is integrated.
6. **Simplify:** remove scaffolding, duplicate state, unused API, accidental
   allocations, hand-edited generated data, and temporary diagnostics.
7. **Prove:** run focused checks, shared checks, packaged scenarios, and human
   gates required by the packet.
8. **Integrate:** commit only the coherent packet files, confirm main health,
   update evidence and ledger, then close/partial/block truthfully.

Do not start the next numbered step when the current step revealed an authority
conflict, unsafe partial state, or a need to expand beyond the packet boundary.

### 15.3 Delivery 0 — Transition charter (`WARD-00`)

Objective: remove the human decisions that would otherwise force the Unity
implementation to guess.

Implementation slices:

1. **Authority and roles:** name the product, Unity technical, content,
   experience-review, and release decision owners. Confirm which plan owns each
   kind of change.
2. **Platform and editor policy:** confirm Windows x64 first; define how the
   current supported Unity 6.3 LTS patch is selected, installed, and upgraded.
3. **Engine coexistence:** define which fixes may still enter Dart, the U3
   feature-freeze gate, and the later retirement decision.
4. **Persistence choice:** inspect whether public/browser saves exist and record
   import-required, import-not-required, or an explicitly bounded investigation.
5. **Review:** link the charter to both plans and have every named decision owner
   approve the part they own.

Integration checkpoint:

- One reviewed charter exists at the temporary authorized path.
- No code, story, asset, or package changed.
- Every later packet can quote a decision instead of inferring one.

Exit criteria: `WARD-00` is `CLOSED`, the compact ledger agrees, and `WARD-01` has
an owner plus an available Windows build environment.

### 15.4 Delivery 1 — Reproducible Unity foundation (`WARD-01`, `WARD-05`)

Objective: create the smallest pinned Unity project that future work can trust
and mechanically prevent the most damaging architectural drift.

`WARD-01` implementation slices:

1. Create the empty URP project under `unity/` using the chartered patch.
2. Configure text serialization, visible meta files, project identity, Windows
   target, and only the authorized packages.
3. Create the Domain, Content, Runtime, Presentation, Editor, and test assembly
   boundaries from the Unity plan without placeholder frameworks.
4. Add one Unity-free Domain value/rule and test that proves the test runner and
   dependency boundary are real.
5. Add batch entry points for EditMode tests and a Windows development build.
6. Reproduce restore, compile, test, and build from a clean checkout or clean
   worktree using the recorded editor path.
7. Replace Unity plan command placeholders with exact verified commands.

`WARD-05` implementation slices:

1. Add narrow formatting rules without reformatting vendor/generated content.
2. Enforce assembly direction through `.asmdef` references first.
3. Add validation for forbidden Domain Unity references, duplicate composition
   roots, `Resources/`, and generated files outside owned directories.
4. Prove each validator with one intentionally invalid test fixture and a useful
   error message.
5. Review the scaffold for direct names, narrow APIs, and unnecessary manager,
   factory, interface, or singleton scaffolding.

Integration checkpoints:

- After `WARD-01`: clean checkout compiles, EditMode test passes, and Windows
  development build launches.
- After `WARD-05`: every declared invalid fixture fails for the intended reason;
  removing the invalid fixture returns the project to green.

Human gates: a second human reproduces the commands and the Unity technical
owner approves package/assembly boundaries. Default-scene visuals are not a
visual gate.

Exit criteria: U0 hard gate passes and new contributors have one documented,
tested path into the project.

### 15.5 Delivery 2 — Deterministic content boundary (`WARD-02`, `WARD-03`)

Objective: make Unity a deterministic consumer of canonical shared content,
never a second authoring source.

`WARD-02` implementation slices:

1. Inventory the exact allowed source roots, file types, schema versions, and
   owned Unity raw destinations.
2. Implement read and validation without writes; errors include stable ID and
   source path where known.
3. Stage normalized output and a schema-versioned content hash index in a
   temporary owned location.
4. Compare staged/current trees, atomically replace only after full validation,
   and remove only stale outputs owned by the synchronizer.
5. Run twice and prove byte/semantic idempotence.
6. Remove or corrupt one required reference and prove the last valid mirror is
   unchanged.

`WARD-03` implementation slices:

1. Import one smallest catalogue into validation DTOs, then generated typed
   assets, with stable source ID/hash and a readable report row.
2. Prove unchanged IDs retain GUIDs across reimport and source movement.
3. Add duplicate-ID, unsupported-schema, and broken-cross-reference rejection.
4. Expand catalogue by catalogue: story/dialogue, house/placement,
   material/sound, preserving one transaction and global-reference validation.
5. Regenerate from a clean project and compare the complete import report.

Integration checkpoints:

- Source edits flow through one command into deterministic raw content.
- Typed assets are fully disposable/reproducible and never hand-authored.
- A failed sync/import leaves the last valid consumer state intact.

Human gates: content owner samples report mappings and resolves any ambiguous or
duplicate canonical identity. No visual approval is needed.

Exit criteria: `WARD-02` and `WARD-03` close with reproducible hashes and no
duplicate story/house authority in Unity.

### 15.6 Delivery 3 — Migration truth and domain core (`WARD-04`, `WARD-10`–`WARD-13`)

Objective: port accepted behavior, not Dart structure or known defects, into one
Unity-free deterministic session.

`WARD-04` migration-map sequence:

1. Inventory production callers and focused tests for time/resources, journal,
   visitors/story, saves, and endings.
2. Classify each rule `adopt`, `replace`, `retire`, or `decision`, citing product
   authority or observed production behavior.
3. Resolve every `decision` needed by the first domain packet.
4. Define plain JSON commands, ordered events, normalized state digests, and
   deterministic seeds/clocks.
5. Export the smallest Dart reference fixtures for resource spend, sleep/day,
   journal drift, event delivery, save digest, and ending facts.
6. Make the empty Unity runner discover every fixture and report unsupported
   behavior honestly until its owning packet lands.

`WARD-10` recommended children:

- Clock boundaries and explicit elapsed-time input.
- Resource spend/earn with typed rejection and no negative state.
- Sleep as the only normal day transition, including reset ordering.
- Weather/difficulty via deterministic random source.
- Stable serialized snapshot and ordered events.

`WARD-11` recommended children:

- Entry/revision identity, write, certainty, and source metadata.
- Compare result taxonomy: mismatch, contradiction, unverifiable.
- Correction, corroboration, protection/lock, and immutable history.
- Deterministic sleep-triggered drift with protected-entry exclusion.
- Sparse save representation and stable digest.

`WARD-12` recommended children:

- Catalogue-wide event-kind/effect-key validation.
- Deterministic event eligibility and time-window selection.
- One Day 1 visitor choice through flags, residue, quote, and callback state.
- Silence/walk-away and rejected/expired choice behavior.
- Delivered-event and active-encounter persistence proving exactly once.
- Full 21-day schema sweep without requiring presentation implementation.

`WARD-13` recommended children:

- Define typed player commands and accepted/rejected results.
- Compose time/resources/journal/narrative behind one `GameSession` owner.
- Define same-tick event ordering and immutable public snapshot.
- Prevent subsystem mutation outside session methods.
- Run a multi-day command fixture twice and compare exact digest/event order.

Integration checkpoints:

- Each domain child passes both native focused tests and its accepted reference
  fixtures before the next subsystem uses it.
- `GameSession` is the only mutable run-state owner; no Unity type enters Domain.
- An unsupported or retired Dart behavior is visible in the migration map, not
  silently copied or omitted.

Human gates: product/content owners decide stale pacing, story semantics, and
all migration-map `decision` rows. The technical owner reviews state ownership
and public API size.

Exit criteria: a deterministic Unity-free session can replay representative
multi-day commands and emit the same accepted state/events twice.

### 15.7 Delivery 4 — Save safety and greybox embodiment (`WARD-14`, `WARD-20`)

Objective: persist complete session truth safely and bind it to a replaceable,
canonically scaled domestic greybox.

`WARD-14` implementation slices:

1. Define save envelope fields: save schema, product/build, content compatibility,
   session state, settings/player metadata, and checksum/version information.
2. Serialize/deserialize a minimal session and compare deterministic digest.
3. Implement temp write, flush/close, atomic replace, and bounded backup policy.
4. Test malformed JSON, unsupported schema/content, interrupted write, corrupt
   primary, valid backup, and no-save first boot.
5. Save immediately before an event boundary, reload, and prove exactly-once
   delivery.
6. Implement or explicitly omit Dart-save import according to `WARD-00`.
7. Run the real packaged filesystem path, not only an in-memory adapter.

`WARD-20` implementation slices:

1. Generate one labeled ground-floor proxy from canonical data at identity root.
2. Bind stable room and portal IDs independently from display/hierarchy names.
3. Add room-volume, portal, focus, emitter, and scale validation.
4. Bind immutable session snapshots to one proxy door/shutter/mantle state.
5. Expand generation to upper floor and cellar, including stairs/openings.
6. Replace one proxy visual with another and prove bindings, collision truth,
   save IDs, and route markers remain unchanged.
7. Capture the packaged greybox at ordinary player height for scale review.

Integration checkpoints:

- Saves survive real process restart and recover a corrupt primary from backup.
- Every required house ID binds exactly once and every authored opening/route is
  represented by labeled proxy geometry.
- Scene hierarchy remains an adapter; Domain/save IDs remain authoritative.

Human gates: product/technical owners approve save compatibility behavior; the
experience reviewer approves perceived domestic scale and topology before human
house production begins.

Exit criteria: a packaged build boots the complete greybox from canonical data,
shows saved portal state, and safely restores after corruption scenarios.

### 15.8 Delivery 5 — Movement, interaction, and acoustics (`WARD-21`–`WARD-23`)

Objective: let the player inhabit, manipulate, and hear the canonical greybox
through production controls.

`WARD-21` recommended route increments:

1. Look/move and stable room-volume transition on the ground floor.
2. Capsule collision, wall slide, doorway crossing, and tunneling rejection.
3. Stairs plus upper-floor route; then cellar route.
4. Crouch/run and the declared fixed movement policy.
5. Save/reload on stairs and immediately after portal/room transition.
6. Supported frame-rate and reduced-motion human checks in Windows build.

`WARD-22` recommended interaction increments:

1. One front-door collider hit -> stable focus target -> typed command -> domain
   result -> one presentation update.
2. Negative distance, cone, room, wall, and occlusion cases.
3. Press, hold, cancel, and non-hold accessibility behavior without duplicates.
4. Remaining door, shutter, mantle, inspection, and journal-desk target types.
5. One direct-manipulation proof and save/reload for every proof state.

`WARD-23` recommended audio increments:

1. Stable listener/emitter room binding and one room ambience.
2. Portal graph path for one localized cue in open and closed states.
3. Smooth gain/low-pass/reverb transition across doorway and door animation.
4. AudioMixer master/effects/ambience/voice controls, mono, and night settings.
5. Threshold voice-present, voice-missing, and voice-disabled caption/text path.
6. Speaker/headphone packaged review with captures/logged state.

Integration checkpoint: one Windows route goes ground -> upper -> cellar ->
threshold, manipulates a portal, hears the causal change, saves, reloads, and
returns to the same authoritative state.

Human gates: motion comfort/reduced motion, interaction legibility/feel, and
speaker/headphone acoustic causality each receive named approval.

Exit criteria: U2 route checks pass with no hierarchy lookup, duplicate command,
invisible required action, or save-state disagreement.

### 15.9 Delivery 6 — Persistent UI and accessible Day 1 (`WARD-30`–`WARD-33`)

Objective: expose the accepted session through one persistent, keyboard-usable,
text-complete interface.

`WARD-30` implementation slices:

1. Persistent UI root with one panel stack and explicit modal ledger.
2. Pause/resume, semantic close/back, cursor, movement, and input-map ownership.
3. Settings model with defaults, version migration, persistence, and reset.
4. HUD/focus prompt and focus-loss recovery.
5. Keyboard navigation, remap/conflict handling, credits, and packaged captures.

`WARD-31` implementation slices:

1. Render one authored Day 1 line from a session event with speaker/source.
2. Present options and route one choice exactly once; add silence/walk-away.
3. Add instant/readable/slow pacing and skip that preserves semantics.
4. Add speech, non-speech, and direction captions.
5. Prove audio present, missing, disabled, interrupted, and reload paths.

`WARD-32` implementation slices:

1. Read-only entry ledger and revision/source/certainty presentation.
2. Keyboard entry creation through a typed session command.
3. Uncertainty, cite, compare, correct, and lock actions.
4. Distinct mismatch/contradiction/unverifiable wording.
5. Save/reload with accessible revision history and protected state.

`WARD-33` integrated audit:

1. Inventory every required Day 1 action and target against input bindings.
2. Complete keyboard-only production route without debug navigation.
3. Exercise remap, conflict, reset, persistence, close/back, and focus loss.
4. Exercise UI scale, contrast, captions, brightness, reduced motion/effects,
   safe/high profiles, mono/night audio, and non-hold interaction.
5. Fix issues in their owning packet/system, rerun only affected focused checks,
   then rerun the entire route.
6. Conduct an uncoached human usability review.

Integration checkpoint: from boot, a keyboard-only player can configure the
game, complete threshold dialogue and journal work, pause/resume, and retain
settings/session state after process restart.

Exit criteria: `WARD-30`–`WARD-33` close with semantic automation, packaged route
evidence, and named human UI/accessibility approval.

### 15.10 Delivery 7 — Day 1 vertical-slice gate (`WARD-40`)

Objective: prove that the accumulated components make the intended game loop,
not merely compatible subsystems.

Implementation sequence:

1. Create one deterministic semantic scenario for wake -> preparation ->
   threshold -> choice -> journal -> consequence -> sleep -> reload.
2. Create one production-input Windows smoke using the same canonical content.
3. Remove all idle waiting and debug-only transitions from the route.
4. Save/reload before and after the threshold choice and sleep boundary; prove
   no duplicate event and the visible physical consequence persists.
5. Time an uncoached run against the product's 8–15 minute Day 1 target and
   record where comprehension or pacing fails.
6. Capture normal/accessibility, safe/high, light/dark, and required consequence
   states with exact build/content identity.
7. Record load/frame evidence without prematurely optimizing proxies.
8. Run product, visual, audio, accessibility, and complete-play reviews.
9. Route defects to owning packets, rebuild, and repeat affected plus end-to-end
   evidence.
10. After approval, record the human Dart feature-freeze decision.

Do not implement Days 2–21 or begin production-house expansion to make the demo
appear complete. `WARD-40` owns integration and evidence; subsystem defects remain
owned by their original directories/packets.

Exit criteria: U3 hard gate passes in one identified Windows build and the first
act/campaign packet is not activated until its canonical content dependency is
Ready.

### 15.11 Delivery 8 — Campaign expansion and endings (`WARD-60`, `WARD-61`)

Objective: scale the accepted loop across the campaign without losing pacing,
causal callbacks, save safety, or ending derivation.

Required `WARD-60` children:

| Child | Content | Integrated proof | Human gate |
|---|---|---|---|
| `WARD-60A` | Days 2–7 | First journal anomaly, declared callbacks, per-day consequence, act save/reload. | Act I pacing and no-idle-wait review. |
| `WARD-60B` | Days 8–14 | Mid-campaign escalation, persistent house states, exactly-once act fixture. | Restraint, comprehension, and fatigue review. |
| `WARD-60C` | Days 15–20 | Late callbacks/residues and ending facts accumulated without selection UI. | Late-act pacing and clue-preservation review. |

For each act child:

1. Validate the full canonical batch before enabling any day.
2. Pull one day or coupled callback/consequence pair at a time.
3. Add one embodied beat and one visible/audible consequence actually required
   by that day; retain proxies for gated art.
4. Trace every effect key to a consumer and reject orphaned effects.
5. Add a save-before-event, reload, continue fixture for the act.
6. Run prior accepted days as a regression subset after every integrated batch.
7. Conduct a timed uncoached play sample before closing the act child.

`WARD-61` implementation sequence:

1. Define inspectable eligibility facts for compliance, synchronisation, and
   player-initiated rupture.
2. Test the resolver with minimal qualifying, conflicting, and boundary saves.
3. Bind compliance and synchronisation without an ending selector.
4. Bind rupture only to the declared Day 21/front-door/player action.
5. Add photosensitivity-safe and reduced rupture presentation.
6. Select two or three authored run-specific residues from saved facts.
7. Run each ending from a representative real campaign save, then reload.
8. Conduct human campaign/visual review for all three paths.

Exit criteria: U5 passes semantic campaign automation and human playthroughs;
all endings are derived from saved play and the full game remains voice-off
complete.

### 15.12 Delivery 9 — Production house, rooms, lighting, and voice (`WARD-50`–`WARD-52`, `WARD-62`)

Objective: replace validated proxies with rights-cleared human production craft
without altering topology, state truth, accessibility, or save compatibility.

`WARD-50` house replacement sequence:

1. Approve source ownership/license, source/interchange hashes, exporter/importer
   versions, units, axes, transforms, material slots, and anchor contract.
2. Import at identity root without gameplay scripts, authoritative colliders,
   lights, or cameras from the source model.
3. Map visual rooms/portals/windows/focus/emitter anchors through stable IDs.
4. Run all greybox route, binding, interaction, acoustic, and save fixtures with
   the human visual disabled, then enabled.
5. Compare perceived scale and required captures across profiles.
6. Reject the replacement atomically if any route, identity, rights, or scale
   gate fails.

`WARD-51` hero-route sequence:

1. Audit texture/material import semantics and physical scale.
2. Establish daylight and bounded warm practicals with post disabled.
3. Add indirect grounding, probes, and necessary bounded realtime shadows.
4. Calibrate darkest normal navigation and every required clue/action.
5. Add only restrained accepted post treatment.
6. Measure frame behavior and capture high/safe/accessibility states.

Required `WARD-52` children:

- `WARD-52A`: kitchen/cellar.
- `WARD-52B`: bedroom/landing.
- `WARD-52C`: bathroom/spare-room.

Each room-pair child performs asset intake, normal/consequence/late-state
authoring, route/focus/save/acoustic regression, profile/performance capture, and
separate human approval. Never activate two pairs merely to keep artists busy
when integration or review WIP is full.

`WARD-62` voice sequence, only after human story lock:

1. Hash locked text and record cast, pronunciation, direction, rights, and
   intended line keys.
2. Generate/record a representative audition set outside production imports.
3. Human-review performance, intelligibility, tone, and caption agreement.
4. Render a complete batch to staging and validate hashes, loudness, clipping,
   keys, duration, and provenance.
5. Promote the complete accepted batch atomically.
6. Run voice-on, voice-missing, and voice-off campaign sweeps.

Exit criteria: U6 room batches are individually accepted, all source/provenance
is indexed, saves and routes remain compatible, and text/captions still carry
the complete game without voice.

### 15.13 Delivery 10 — Release candidate (`WARD-70`)

Objective: stabilize, measure, audit, and decide one exact shippable build.

Implementation sequence:

1. Freeze Unity patch, package lock, content index, candidate branch/commit, and
   build settings. Assign a unique candidate ID.
2. Produce clean high/safe Windows builds and a manifest from a clean checkout.
3. Run all Domain, Content, Runtime, Presentation, campaign, and build checks.
4. Profile representative traversal, portal/light/dialogue transitions, cold and
   warm boot, first use, save/load, and 100 repeated state transitions.
5. Test window/fullscreen/resolution, focus loss, audio/input device changes,
   pause/resume, and supported hardware profiles.
6. Test corrupt/missing/incompatible saves and recovery with retained artifacts.
7. Audit licenses, receipts/ownership, source hashes, attribution, developer UI,
   debug content, and evidence completeness.
8. Complete full keyboard/accessibility, visual, audio, and campaign human gates
   on the exact candidate.
9. Classify every finding must-fix, known issue, defer, or not-a-defect.
10. Reopen owning packets for must-fix work and mint a new candidate after any
    behavior-affecting change.
11. Product/release owners record go/no-go and the separate Dart-retirement
    decision.

Optimize only measured bottlenecks. Addressables, pooling, jobs, custom render
features, and caching remain forbidden unless current profiling and an approved
decision prove the need.

Exit criteria: every product release gate passes for the exact indexed build,
known issues are accepted and published honestly, recovery is demonstrated, and
the human release decision is recorded.

### 15.14 First executable backlog

At the repository state audited by the Unity plan, the first backlog should be:

| Order | Item | Required preparation | Close evidence |
|---:|---|---|---|
| 1 | `WARD-00` transition charter | Decision owners available. | Reviewed charter and plan links. |
| 2 | `WARD-01` pinned scaffold | Chartered patch and Windows builder. | Clean EditMode test and development build. |
| 3 | `WARD-05` guardrails | Scaffold assemblies exist. | Invalid fixtures rejected; build green. |
| 4 | `WARD-04` migration map foundation | Dart production callers/tests identified. | Classified first rule set and fixture discovery. |
| 5 | `WARD-02` content sync | Scaffold command path and canonical input inventory. | Idempotence plus non-destructive failure. |
| 6 | `WARD-03` typed import | Valid synchronized raw content. | Stable GUID/hash report and negative schemas. |

This order puts safety and behavioral truth early. `WARD-02` and `WARD-04` may
swap or overlap after `WARD-01` if owners, write sets, and integration capacity
are genuinely independent. Do not activate the whole table.

For the next replenishment, refine only `WARD-00` and prepare `WARD-01`. Everything
else stays at outcome/dependency detail until evidence from the scaffold changes
what is known.

---

## 16. Milestone playbooks

Milestones are evidence gates, not scheduled phases. Work may overlap only when
packet dependencies and WIP policies allow it.

### U0 — Make change safe

Primary risks are an ambiguous transition, unreproducible editor setup, and
premature architecture. Close the charter first, scaffold the smallest pinned
project, and install boundary checks before domain expansion.

Human emphasis:

- Decide save compatibility, Dart freeze/retirement, roles, and Unity patch.
- Have a second human reproduce the clean checkout commands.
- Review scaffold code as the standard future contributors will copy.
- Leave art, gameplay frameworks, and convenience packages out.

Exit conversation: “Could a new contributor build and test this exact project
without oral history, and do its boundaries point toward the product plan?”

### U1 — Prove shared truth

Primary risks are duplicated canon, unstable IDs, and blindly ported defects.
Create deterministic sync/import, classify Dart behavior, then port pure rules
behind cross-engine fixtures.

Human emphasis:

- Content owner inspects import reports and every unresolved migration-map row.
- Technical owner tests invalid input and atomic failure, not only valid data.
- Product owner resolves stale pacing or behavior rather than copying it.
- Keep Unity scenes and presentation out of the domain proof.

Exit conversation: “Can we explain where every accepted rule and content value
comes from, reproduce its digest, and reject invalid authority safely?”

### U2 — Prove embodiment and recovery

Primary risks are wrong domestic scale, scene objects becoming truth, unpleasant
motion, fake interaction, weak acoustic causality, and fragile saves. Use labeled
proxies and real production inputs.

Human emphasis:

- Walk ground, upper, cellar, and threshold routes at ordinary play speed.
- Review scale before commissioning or accepting production architecture.
- Exercise wall occlusion, rejected interaction, stairs, focus loss, and reload.
- Listen on speakers and headphones with door state changes and missing voice.
- Keep gameplay collision/bindings separable from future visual replacement.

Exit conversation: “Does the house feel inhabitable and causally coherent, and
can the player safely leave and resume without Unity hierarchy becoming canon?”

### U3 — Prove the red thread

Primary risk is a collection of systems that does not make one understandable
game day. Integrate the complete Day 1 path in a Windows build and time it
without coaching.

Human emphasis:

- Schedule product, visual, audio, and accessibility reviewers before `WARD-40`.
- Play wake through reload with production input and no debug intervention.
- Verify keyboard-only, remapping, large UI, captions, reduced modes, safe/high,
  and missing/disabled voice.
- Record confusion and idle waiting separately from defects.
- Make the Dart feature-freeze decision only after the gate passes.

Exit conversation: “Can a player complete and understand the 8–15 minute loop,
experience a physical consequence, and resume it accessibly?”

### U4–U5 — Prove campaign structure

Primary risks are content breadth hiding broken callbacks, repetitive pacing,
or endings selected by a final menu rather than accumulated play. Pull one
playable day/consequence at a time within required act children.

Human emphasis:

- Keep per-act exactly-once and save/reload fixtures green as days are added.
- Run periodic uncoached sessions; do not postpone pacing review to Day 21.
- Sample returning players' interpretation without revealing hidden causes.
- Trace every choice effect to a later consumer and every ending to saved facts.
- Preserve a full voice-off path; voice remains separately gated.

Exit conversation: “Does escalation remain restrained and meaningful across
real sessions, with callbacks and endings visibly earned by the run?”

### U6 — Replace proxies without replacing truth

Primary risks are art-driven topology drift, unclear rights, performance debt,
and visual effects masking construction. Accept assets in room-sized batches.

Human emphasis:

- Validate sources, units, hashes, anchors, licenses, and import presets first.
- Compare proxy and human house routes/bindings/saves before visual approval.
- Approve each `WARD-52` room pair independently across story states and profiles.
- Establish clean lighting/material baseline before restrained post treatment.
- Promote voice only as a complete, hash-locked, reviewed batch.

Exit conversation: “Did production craft deepen the same playable house without
changing its identity, access, clues, recovery, or performance beyond evidence?”

### U7 — Stabilize one candidate

Primary risks are late feature growth, unmeasured performance, incomplete
recovery/accessibility, and evidence from the wrong build. Freeze candidate
identity and route every finding to its owning system.

Human emphasis:

- No casual Unity/package upgrades or new features.
- Test minimum/reference hardware, device/focus changes, long traversal, save
  corruption, and repeated state transitions.
- Reconcile rights/provenance, licenses, known issues, and artifact index.
- Repeat complete human play, visual, audio, and accessibility gates on the
  exact release candidate.
- Record explicit release and Dart-retirement decisions.

Exit conversation: “Can we identify, reproduce, support, recover, and legally
ship this exact build with known limitations honestly stated?”

---

## 17. Human review operations

### Scheduling

At refinement, book a review window sized to the evidence:

- 15–20 minutes for a focused scale, interaction, or UI correction;
- 30–60 minutes for a Day 1 or room-pair gate;
- the actual expected play duration plus debrief for act/campaign review; and
- a separate focused accessibility session when one reviewer cannot credibly
  cover all modes or lived needs.

Prepare the build, save, route, hardware, and capture labels before the reviewer
arrives. The packet owner observes and records but does not coach unless safety
or a broken setup makes the result invalid.

### Reviewer briefing

Tell the reviewer:

1. the player-visible outcome and what is deliberately proxy;
2. the build identity and start state;
3. tasks to attempt, not the exact controls or intended emotional reading;
4. modes/hardware that must be exercised;
5. which decisions they own; and
6. how to report a blocking setup failure.

Do not tell them where to look, what they should feel, or which ending/choice is
“correct.” That converts observation into confirmation.

### Observation notes

Separate facts, interpretation, and action:

```text
Observed: player opened pause twice while trying to reach journal.
Player said: “I expected J to close it too.”
Interpretation: close/back behavior may be inconsistent.
Decision: REJECT keyboard route pending semantic Back fix.
Evidence: timestamp/capture/log.
```

One observation can become a defect, a product question, or no action. The
decision owner chooses after the session; do not redesign live around one
participant.

### Accessibility review is continuous

Accessibility is part of every affected packet, with `WARD-33` providing the
integrated Day 1 proof and `WARD-70` repeating release coverage. At minimum:

- every action remains reachable with the declared device route;
- focus order, close/back, remapping, conflict, reset, and persistence behave;
- UI scaling and captions do not obscure prompts, choices, or evidence;
- reduced motion/effects and safe graphics preserve required clues;
- hold alternatives do not change gameplay semantics; and
- audio information has equivalent captions/text where required.

Automation may verify semantics and layouts; only human use can accept comfort,
legibility, discoverability, and workload.

---

## 18. Quality and evidence strategy

### Start from failure modes

For each packet, select checks from the failures that would hurt the player or
migration most:

| Failure mode | Earliest useful evidence |
|---|---|
| Wrong or duplicate rule | Domain fixture and ordered event/state digest. |
| Broken stable ID/reference | Import/schema validation with exact source path. |
| Partial destructive import | Negative fixture proving old valid output survives. |
| Scene/domain disagreement | Binding validation plus production PlayMode route. |
| Duplicate event after reload | Save-before-boundary and reload scenario. |
| Input/modal deadlock | Keyboard production-input route and focus-loss recovery. |
| Missing audio hides information | Voice-missing/disabled run with captions. |
| Visual state hides clue/action | Profile/accessibility captures plus human route. |
| Performance treatment causes stutter | Packaged transition trace on named hardware. |
| Asset cannot legally ship | Provenance record before production-scene acceptance. |

Do not maximize test count. Choose the smallest set that detects the credible
failure at the lowest stable layer, plus the production-path proof required to
show wiring is real.

### Test data and fixtures

Fixtures are reviewed product examples, not implementation snapshots. Keep them
plain, stable-ID based, deterministic, minimal, and understandable by a human.
When a fixture changes, state whether the product rule changed, the fixture was
wrong, or serialization alone changed. Never update expected output blindly to
make a failure green.

Keep a failing fixture when it represents an accepted regression. Remove
temporary diagnostic fixtures before handoff or promote them with a clear name
and ownership.

### Build evidence bundle

A player-facing review bundle should contain only what the reviewer needs:

```text
evidence/<packet>/<build-id>/
  manifest.json       build, commit, Unity patch, content hash, hardware intent
  README.txt          shortest run/replay instructions
  results/            machine-readable check summaries
  captures/           labeled required states only
  logs/               bounded relevant logs
  saves/              start/recovery fixtures when needed
  human-review.txt    decision record or PENDING marker
```

The exact repository location is defined by the Unity project/tooling once it
exists. Do not create this structure by hand for every packet or commit large
redundant builds. The principle is one indexed, reproducible evidence identity.

### Evidence debt

Evidence debt exists when behavior is integrated but a required check or human
gate is missing. Make it visible as `ACTIVE` Review or `PARTIAL`; never close it
with a promise. Review debt has priority over new starts. If the original build
cannot be reproduced, discard stale evidence and review a current build.

---

## 19. Dependency, change, and recovery control

### Dependency changes

When work discovers a new dependency:

1. Prove why the outcome cannot close without it.
2. Determine whether it is an input, a decision, or another behavior packet.
3. Add it to the owning authority plan with a stable ID when durable.
4. Re-evaluate Ready state and downstream order.
5. Notify affected owners; do not let branches encode a hidden order.

Prefer resolving the smallest missing contract. Do not inflate one dependency
into a platform rewrite.

### Cross-repository changes

The game, docs, and Pixeldart histories remain coherent and separate. When one
packet genuinely spans repositories, record the integration order, for example:

```text
1. docs decision <commit>
2. Unity/game implementation <commit>
3. renderer dependency <commit> only if explicitly authorized
4. game gitlink update <commit>
```

Do not use a docs commit to claim code behavior or a generated build commit to
hide source drift. Preserve unrelated dirty work in every repository.

### Rollback and fix-forward

Choose the fastest safe restoration:

- Revert when a coherent recent change breaks main and no accepted data depends
  on it.
- Fix forward when reverting would damage compatible saves/content or the cause
  is isolated and the correction can be proven immediately.
- Disable only through an existing safe feature/configuration boundary; do not
  add a permanent flag during an incident without later ownership review.
- Preserve failing saves, logs, manifests, and reproduction before repair.

After restoration, reopen the owning packet, run the escaped production path,
and add only the smallest prevention/detection improvement justified by cause.

### Scope change

Only the appropriate product authority may add, remove, or reinterpret an
outcome. When scope changes, state what evidence is invalidated, which packet
dependencies move, and whether integrated work remains useful. Sunk effort is
not a reason to retain work that no longer serves the game.

---

## 20. Release and transition governance

### Milestone gate meeting

Hold a gate only when evidence is ready. In 30–60 minutes:

1. Identify exact build/content/commit.
2. Demonstrate the milestone's player or architecture outcome.
3. Review open partials, blockers, risks, and human decisions.
4. Check the Unity plan's hard gate and product acceptance.
5. Decide `PASS`, `REJECT`, or `CONDITIONAL` only when the condition is an
   explicit bounded human decision—not missing mandatory evidence.
6. Record newly ready packets and what remains deliberately gated.

The meeting does not close each packet again; it confirms the combined system.

### Dart freeze and retirement

After U3 approval, the human owner records the Dart feature-freeze scope:

- permitted emergency fixes;
- shared-content compatibility obligations;
- how reference fixtures remain runnable;
- who may approve an exception; and
- how divergence is detected.

Dart retirement remains a later human decision after U5, save/recovery proof,
and the Unity plan's transition conditions. Do not delete reference code or
evidence merely because Unity appears feature complete.

### Release candidate findings

Every candidate finding is classified:

- **must fix:** violates release acceptance, data safety, rights, required
  accessibility, or supported route;
- **known issue:** bounded impact, honest workaround, product owner accepts;
- **defer:** useful improvement outside release acceptance; or
- **not a defect:** intended behavior supported by authority/evidence.

Must-fix work reopens its owning packet and produces a new candidate identity.
Do not patch the release branch without updating source, tests, and evidence.

---

## 21. Suggested first working session

Do not start Unity implementation before this short human session:

1. Read the product red thread aloud and confirm it still describes the game.
2. Assign the product, Unity technical, content, and experience-review hats.
3. Review `WARD-00` and fill its missing human decisions.
4. Confirm the Unity 6.3 LTS patch-selection process and available Windows build
   environment.
5. Decide whether public Dart saves require cross-engine import.
6. Confirm when Dart feature freeze occurs and what emergency fixes remain
   allowed afterward.
7. Make `WARD-00` Ready, assign one owner, and schedule its review.
8. Leave every later packet `OPEN`.

The outcome is not code. It is a small, unambiguous transition charter that lets
the first implementation packet begin without guessing.

---

## 22. Weekly health check

At the end of each week, answer yes or no:

- Did a packaged player behavior improve or a major risk close?
- Is WIP within the limit?
- Does every active/partial/blocked item have one owner and exact next action?
- Are product and Unity plan states truthful?
- Did humans review every visible/audio/usability change that claims acceptance?
- Is the code becoming simpler or at least not more abstract?
- Are shared content and stable IDs still authoritative?
- Can a clean environment reproduce the current evidence?
- Is the next ready packet obvious?
- Did we avoid starting gated art, voice, effects, or campaign work early?

If three or more answers are “no,” do not increase capacity or start more work.
Use the next replenishment session to reduce WIP, repair the build/board, and
restore one clear path to Done.

---

## 23. Human-only field manual

This is the practical, no-agent operating manual. It assumes ordinary human
work: people read the packet, make the change, run the commands, play the build,
review one another's evidence, and update the plan. Use the more detailed policy
sections only when this short route points to them.

### 23.1 Choose your working mode

#### Solo implementer

One person may hold product, technical, content, packet, and release roles, but
should state which hat they are wearing when making a decision. Solo work still
obeys one active packet and the same evidence gates.

A solo implementer cannot independently close a required experience gate. Keep
the packet in `ACTIVE` Review or `PARTIAL`, preserve the exact build and review
instructions, and invite another human for the bounded review. That reviewer
does not need to understand the code; they need the named build, scenario,
hardware/mode, and decision question.

Recommended solo rhythm:

```text
Monday or first session: replenish one packet and book required review
Each work session: baseline -> one behavior -> focused check -> integrate
Midpoint: run the packaged path before adding breadth
Review session: observe another person without coaching
End of week: close honestly, or leave one exact next action
```

#### Two-person team

Use one packet owner and one reviewer. Swap roles between packets when useful,
but never edit the same authoritative files concurrently without agreeing on a
boundary.

Recommended split:

- Person A owns implementation and evidence preparation.
- Person B checks the risk statement early, reviews the production path, and
  performs or coordinates the human gate.
- Both join only for a risky decision, integration conflict, or review failure.

One active implementation packet is usually faster than two because review and
integration never queue. Open a second only when files, dependencies, and review
paths are genuinely independent.

#### Three-to-five-person team

Keep the global two-packet implementation limit. Assign one owner per packet and
one named reviewer per human gate. Other people help close, test, prepare
fixtures, or refine the next packet; they do not create extra active work to
stay busy.

Use a visible board with the columns from section 3. The board can be paper,
sticky notes, a shared document, or an issue tracker. The Unity plan remains the
official state if the board differs.

### 23.2 Set up the manual workspace once

Before the first Unity packet:

1. Confirm each repository opens and its remote/history is understood.
2. Confirm the required Dart and Node versions for reference-side checks.
3. Complete `WARD-00` before installing or selecting Unity for production work.
4. After `WARD-01`, record the exact Unity executable/patch and tested commands in
   the Unity plan placeholders. Never rely on “open it normally.”
5. Create one shared location for packet issues/notes and one for generated
   evidence, following the repository rules and later Unity tooling decision.
6. Agree how a second human receives a build: local machine, shared drive, or a
   named downloadable artifact. Do not make ad hoc copies with unknown identity.
7. Put the weekly review window on the calendar before visible work starts.

Keep this small physical or digital reference beside the workstation:

```text
Product truth:      tmp/MASTERPLAN.md
Unity migration:   UNITY_PLAN.md
Human workflow:    tmp/HUMAN_AGILE_GUIDE.md
Repository rules:  tmp/GROUND_RULES.md
Current packet:    WARD-__
Owner:             __________
Reviewer:          __________
Last green build:  __________
Next action:       __________
```

### 23.3 Find and claim work manually

Do this without a parser:

1. Open `UNITY_PLAN.md` section 15.
2. Ignore `CLOSED` and `DROPPED` rows.
3. Resolve `ACTIVE`, `PARTIAL`, `BLOCKED`, and Review work before considering a
   new `OPEN` row.
4. For the first remaining `OPEN` row, open its packet body in section 7.
5. Check every `WARD-*` ID in `Depends on`; each must be `CLOSED` in both its body
   and ledger.
6. Check named product decisions, story packets, assets, rights, hardware, and
   human reviewers. These are dependencies even when they are not `WARD-*` IDs.
7. Complete the Definition of Ready in section 6.
8. Copy the packet kickoff canvas and fill it in.
9. Change `State: OPEN` to `State: ACTIVE` and `Owner: unassigned` to the human's
   agreed name in the packet body.
10. Make the same state/owner change in the compact ledger.
11. Review the diff to ensure only intended plan lines changed.
12. Begin the first disconfirming check, not general implementation.

If another owner is already named, stop and contact them. Do not assume an old
date or quiet branch means the packet is abandoned.

### 23.4 Plan a useful work session

#### If you have 30 minutes

Choose one:

- reproduce the current baseline;
- resolve one named decision;
- write one failing fixture or exact reproduction;
- review one small diff;
- run one required human scenario;
- reduce a blocker to one answerable question; or
- update stale packet/ledger evidence.

Do not start a new subsystem, scene conversion, package, or art batch.

#### If you have two hours

Aim for one thin behavior path:

1. Ten minutes: status, packet, baseline, risk.
2. Twenty minutes: failing test/fixture or reproduction.
3. Sixty minutes: direct implementation through production composition.
4. Twenty minutes: focused verification and simplification.
5. Ten minutes: evidence, state, and next action.

If implementation exceeds the window, leave it compiling with the last passing
command and exact next step. Do not hide the unfinished edge.

#### If you have a full day

Use two or three implementation blocks separated by verification:

```text
Block 1: representative happy path
Check 1: focused test and production seam
Block 2: rejection/recovery/fallback
Check 2: focused plus affected shared checks
Block 3: breadth only if first two are integrated
Final: packaged path, diff cleanup, evidence, review request
```

Stop adding behavior early enough to build and inspect it. A day ending with an
unverified large diff is not more productive than a smaller closed slice.

### 23.5 Start-of-session checklist

Copy or print this:

- [ ] I know the current packet ID, outcome, owner, reviewer, and state.
- [ ] Its dependency state still matches the Unity plan.
- [ ] I inspected all three repository statuses and recognized every dirty file.
- [ ] I read the current production caller, input data, and focused tests.
- [ ] I know the last green command/build identity.
- [ ] I can state today's one observable result in a sentence.
- [ ] I know the highest risk and first check that could disprove my approach.
- [ ] I know which files I intend to touch and which the packet forbids.
- [ ] Required hardware, assets, saves, fixtures, and review time are available.
- [ ] I know the stop/split condition.

If the first four boxes cannot be checked, spend the session restoring truth
rather than coding from assumption.

### 23.6 Implementation runbooks by work type

#### Pure Domain C# (`WARD-10`–`WARD-13`, ending resolver parts)

Start with:

- one accepted product rule and its migration-map row;
- one plain-data fixture with command, expected result/events, and digest; and
- no `UnityEngine`, scene, prefab, input, UI, or filesystem dependency.

Work in this order:

1. Represent valid state with the smallest concrete type.
2. Implement one command/rule with typed accepted or rejected result.
3. Make event order explicit.
4. Run the fixture twice with the same seed/clock.
5. Add boundary and invalid cases.
6. Integrate through `GameSession` only when the subsystem rule is stable.

Stop when you are tempted to add a service locator, generic repository, event
bus, base class, or public extension point with no current second use.

Evidence: focused EditMode result, fixture name/digest, deterministic repeat,
and a short state-ownership review note.

#### Content synchronization/import (`WARD-02`, `WARD-03`)

Start with a tiny valid fixture and one deliberately invalid copy. Keep a backup
of the last valid generated output only through the designed transaction, not a
manual safety folder.

Work in this order:

1. Read and validate everything before writing.
2. Stage output in the owned temporary boundary.
3. Compare and replace atomically.
4. Run twice and confirm no second-run diff.
5. Break one ID/reference/schema and confirm the previous valid output survives.
6. Inspect source ID -> Unity GUID/hash report manually.

Stop on an ambiguous canonical ID, output outside the owned directory, or a need
to edit generated assets by hand.

Evidence: valid run, second identical run, invalid run, unchanged valid output,
and sampled report rows.

#### Saves and recovery (`WARD-14`)

Use disposable test profiles/directories and label every save with schema,
content, and build identity. Never test corruption against the only useful save.

Minimum manual matrix:

| Case | Expected human-visible result |
|---|---|
| No save | Clean first boot; no scary false error. |
| Valid current save | Exact session/settings restored. |
| Corrupt primary + valid backup | Recovery succeeds and tells the truth. |
| Corrupt primary + corrupt/missing backup | Safe refusal/new-game route; no boot crash. |
| Unsupported schema/content | Clear incompatibility with no partial load. |
| Save before event, then reload | Event occurs exactly once. |
| Interrupted/failed write | Previous valid save remains usable. |

Evidence: save files/fixtures, before/after digests, packaged logs, and recovery
steps another human can repeat.

#### Scene, house, movement, and interaction (`WARD-20`–`WARD-22`)

Keep four layers visibly separate:

```text
canonical IDs/data -> gameplay bindings/collision -> visual proxy/model -> presentation feedback
```

Work on one route or target at a time. Use stable IDs on identity roots; do not
derive truth from object names. Test from ordinary player height with production
input, then inspect Scene view only to diagnose.

For every new route/target, check:

- approach and leave from both intended directions;
- room/portal transition and occlusion;
- accepted and rejected action;
- repeated press/hold/cancel without duplicate command;
- save/reload immediately before and after the state change;
- normal and reduced-motion/non-hold behavior where applicable; and
- replacement visual disabled/enabled without changing truth.

Evidence: route name, start save/position, production build, marker/assertion
result, normal capture, failure capture when relevant, and human scale/feel note.

#### UI, dialogue, journal, and accessibility (`WARD-30`–`WARD-33`)

Begin keyboard-only. A mouse may be added/tested, but keyboard focus and
semantic close/back should never become a cleanup task.

For each screen or flow:

1. Enter it through production play.
2. Identify current focus visibly and semantically.
3. Complete every action without a pointer.
4. Cancel/back one level predictably.
5. Lose and regain application focus.
6. Change UI scale/contrast/captions/reduced modes while open if supported.
7. Save settings, restart, and confirm them.
8. Exercise missing/disabled audio and long/localized-shaped text.

Do not store narrative branch truth in UI state or mutate journal state outside
typed session commands.

Evidence: keyboard route, focus order, settings before/after restart, required
captures, and uncoached human usability record.

#### Audio (`WARD-23`, room audio, voice)

Test causality before polish. The listener should hear a clear, bounded change
when the player crosses a room or changes a portal, and captions/text must carry
required information without audio.

Manual matrix:

- speakers and headphones;
- voice on, missing, and disabled;
- portal open, closed, and changing;
- listener on both sides of the threshold;
- master/effects/ambience/voice extremes;
- mono and night mode; and
- pause, focus loss, and device recovery.

Record hardware, OS device, mixer settings, room/portal IDs, and build. “Sounds
good on my machine” is not review evidence.

#### Art, materials, and lighting (`WARD-50`–`WARD-52`)

Before Unity work, confirm source ownership/license, editable source, export,
hashes, units, axes, transforms, texture semantics, and stable anchors. Keep the
previous accepted asset available until the candidate passes validation.

Review in this order:

1. Identity, scale, topology, anchors, and route safety.
2. Material import correctness and physical texture scale.
3. Readability with post effects disabled.
4. Normal, consequence, and late-game states required by story.
5. High/safe/accessibility profiles and darkest normal navigation.
6. Performance on named hardware.
7. Mood, restraint, and domestic credibility at ordinary play distance.

Never solve a route/binding failure by moving canonical markers to fit the new
model without an approved source migration.

#### Release candidate (`WARD-70`)

Write the candidate ID on every checklist and artifact. Any behavior-affecting
fix creates a new candidate; do not mix evidence between them.

Use four human lanes, even if people wear multiple hats:

- build/recovery/performance;
- complete gameplay and endings;
- visual/audio/accessibility experience; and
- rights/provenance/package contents.

Each lane returns `PASS`, `FAIL`, or `NOT APPLICABLE` with evidence. The release
owner reconciles them; the product owner makes the go/no-go decision.

### 23.7 Run a human review without specialist tooling

Prepare:

1. One exact build and content identity.
2. A start save or simple route to the behavior.
3. A short task stated without revealing controls or desired emotion.
4. The modes/hardware to exercise.
5. A blank human gate record from section 14.
6. Screen/audio recording only with consent and when useful.

During review:

- let the reviewer drive;
- do not explain a confusing control until the attempt is recorded;
- write observable facts and the reviewer's own words separately;
- note timestamps and settings;
- stop if the build/setup is invalid; and
- ask what they expected after the task, not whether they “liked it.”

After review:

1. Separate setup failures from product observations.
2. Map each required correction to an acceptance condition and owning packet.
3. Record `APPROVED`, `REJECTED`, or `PENDING`—never “basically fine.”
4. State exactly which scenario/artifacts must be repeated.
5. Keep rejected evidence beside the replacement.

### 23.8 Record evidence by hand

An evidence line in a packet should let another human answer: what ran, against
which version, where is the result, and what did it prove?

Good:

```text
2026-__-__ | <commit/build> | Unity <patch> | Windows <version/hardware>
Command/scenario: <exact command or player route>
Result: PASS — <specific acceptance proven>
Content/save/seed/settings: <identity>
Artifacts: <repository-relative paths>
Human review: HR-___ APPROVED by <name>, or not required
```

Bad:

```text
Tested locally.
Looks fine.
All tests pass.
Screenshot attached.
```

Keep paths repository-relative in durable records so they survive moving the
workspace. Never include secrets, private home paths, or a build from an
uncommitted/unknown source without clearly labeling it provisional.

### 23.9 Update packet state manually

#### Close a packet

1. Confirm production behavior and negative/recovery paths.
2. Confirm exact checks and required human gates passed.
3. Put final evidence paths/results under `Evidence`.
4. Set `Remainder: none`.
5. Change packet `State` to `CLOSED` and clear/retain owner according to the
   Unity plan convention; do not invent a new convention in one packet.
6. Make the compact ledger match.
7. Re-read dependent packets; only now may they become Ready.
8. Run plan formatting checks and inspect repository status.

#### Mark Partial

Use `PARTIAL` only when a safe, tested, useful subset is integrated. Name:

- what is accepted;
- exact missing behavior;
- why the subset does not lie or corrupt state;
- evidence for the subset; and
- owner/next action or child dependency.

An unfinished local branch at the end of a day remains `ACTIVE`, not `PARTIAL`.

#### Mark Blocked

Write the full blocker record from section 12. The decision owner and needed-by
point are mandatory. If other safe work exists, name it; do not silently keep
implementing the blocked path.

#### Reopen a closed packet

Attach reproducible regression evidence, change `CLOSED` to `ACTIVE`, assign one
owner, update the ledger, and state which prior acceptance is invalid. Retain
the original close evidence.

### 23.10 End-of-session checklist

- [ ] The project is compiling, or the exact failure/reproduction is recorded.
- [ ] The last passing command and its result are recorded.
- [ ] No unintended generated, formatted, or unrelated files entered the diff.
- [ ] Temporary debug UI/logging/assets/processes are removed or explicitly
      identified.
- [ ] Packet body and compact ledger still agree.
- [ ] Evidence identifies build/commit/content/settings and proves a condition.
- [ ] The next action is one sentence beginning with a verb.
- [ ] Blockers and review requests name the human who must act.
- [ ] Another person could resume without asking what happened.
- [ ] Repository status is understood in game, docs, and Pixeldart.

### 23.11 Troubleshooting decision table

| Situation | First action | Do not do |
|---|---|---|
| Unity project will not open | Confirm chartered patch, package lock, and first actionable editor log error. | Upgrade Unity/packages casually. |
| EditMode passes, Windows build fails | Treat build as broken; isolate first packaged-only error and reopen owning packet. | Close from Editor evidence. |
| Content import changes every run | Stop; compare normalized input/order/hash and fix determinism. | Commit noisy generated churn. |
| Duplicate/missing stable ID | Report exact source path/ID to content owner and block dependent work. | Rename scene objects to hide it. |
| Scene looks right but route fails | Disable visuals, inspect binding/collision/marker layers, rerun proxy route. | Move canonical truth to fit art. |
| Save no longer loads | Preserve failing save/build, test backup/compatibility, reopen save owner. | Delete the save and call it fixed. |
| A human rejects the experience | Record observation, violated criterion, correction, and retest scope. | Argue from screenshots or automated metrics. |
| Packet is growing past three days | Stop at green point and run section 7 split review. | Add another owner to the same unclear scope. |
| Required reviewer is unavailable | Keep Review/Partial, preserve reproducible build, reschedule. | Self-approve or remove the gate. |
| Plans disagree | Stop affected work and ask the owning human authority to reconcile them. | Choose the easier interpretation. |
| Worktree contains unknown changes | Identify owner/purpose and isolate your write set. | Reset, overwrite, or include them. |
| No exact Unity command exists yet | Finish `WARD-01` command recording. | Guess paths in later packets. |

### 23.12 First five human working sessions

This is a suggested starting sequence, not a date commitment.

#### Session 1 — Close the transition questions

- Read the red thread and `WARD-00` aloud.
- Assign hats and reviewers.
- Decide platform/editor policy, engine coexistence, and save import.
- Write/review the transition charter.
- Close `WARD-00` only when every decision owner agrees.

Result: humans can begin Unity without guessing.

#### Session 2 — Create the reproducible shell

- Claim `WARD-01`.
- Create the pinned minimal URP project and assemblies.
- Add one Unity-free Domain test.
- Record exact batch test/build commands.
- Produce and launch the first Windows development build.

Result: one clean path from checkout to running build.

#### Session 3 — Reproduce and guard it

- Have another human follow the recorded clean setup.
- Fix missing assumptions in commands/settings.
- Close `WARD-01` after reproduction.
- Claim `WARD-05`; add assembly/generated-content guards incrementally.

Result: the foundation is understandable and resists common drift.

#### Session 4 — Decide what behavior is real

- Begin `WARD-04` if WIP permits.
- Inventory only the first domain rule family.
- Classify adopt/replace/retire/decision.
- Resolve required human decisions.
- Create the smallest plain JSON reference fixture.

Result: Unity work targets accepted behavior, not memory or class names.

#### Session 5 — Establish deterministic content flow

- Claim `WARD-02` when capacity/dependencies allow.
- Inventory canonical sources and owned destinations.
- Implement validation and staging for the smallest content subset.
- Prove identical second run and non-destructive invalid run.

Result: the first shared truth reaches Unity safely and reproducibly.

At the end of session 5, replenish from actual evidence. Do not pre-commit to a
fixed number of later sessions; build/import feedback will change what should be
split next.

### 23.13 Plain-language glossary

| Term | Meaning here |
|---|---|
| Packet | One bounded unit in the product or Unity plan with outcome and acceptance. |
| Ready | Safe to start now: dependencies, inputs, owner, checks, and reviewer are known. |
| Active | One named person is working on it now. |
| Partial | A safe tested subset is integrated; exact remainder is visible. |
| Blocked | A named missing decision/input prevents safe progress. |
| Closed | Production checks and required human reviews passed; nothing remains. |
| Production path | The real game composition/input/build, not an isolated helper or mock. |
| Stable ID | Durable identity used across content, domain, scene, saves, and tests. |
| Fixture | Small deterministic input and expected output representing accepted behavior. |
| Human gate | A required real-person judgment about experience or product decision. |
| Evidence | Reproducible command/scenario, exact version, result, and artifacts. |
| Greybox/proxy | Deliberately temporary geometry/content that proves behavior without claiming final quality. |
| Canon | The authoritative product/story/content source, never a generated Unity copy. |
| WIP | Work currently started but not closed. Keep it low so feedback finishes. |
| Replenishment | The short meeting/check that chooses the next Ready work. |
| Composition root | The one place production dependencies and owners are assembled. |
| Exactly once | An event/action is not lost or repeated across pause/save/reload. |

### 23.14 One-page human operating card

```text
START
1. Check game/docs/Pixeldart status.
2. Read current packet, dependencies, outcome, and forbidden scope.
3. Confirm owner, reviewer, baseline, intended files, and highest risk.
4. State one observable result for this session.

BUILD
5. Add/reproduce the smallest meaningful failure.
6. Implement one direct production path.
7. Add rejection/recovery/fallback required for safety.
8. Run focused checks; simplify before broadening.

PROVE
9. Run affected shared checks and packaged path.
10. Record exact build/content/settings, result, and artifact paths.
11. Obtain required human review without coaching or self-approval.

FINISH
12. Inspect diff and remove scaffolding/noise/unrelated changes.
13. Update packet body and ledger together.
14. Close, Partial, or Block based on evidence—not optimism.
15. Leave one exact next action and understood repository status.

WHEN UNSURE
- Broken or unsafe -> restore safety.
- Review waiting -> review it.
- Active work -> finish/split it.
- No active work -> first Ready packet.
- Authority conflict -> stop and ask the owning human.
```

### 23.15 Use the self-contained Python app

The repository includes `tmp/human_agile_app.py`. It has no third-party Python
dependencies, package installation, database, account, build step, or network
service. It reads this guide and `../UNITY_PLAN.md` directly.

The proposed small SvelteKit successor is specified in
`SVELTE_PROJECT_MANAGEMENT_PLAN.md`. Its tooling section assigns exact install,
test, atomic-write, accessibility, supply-chain, and optional free CI tools to
implementation packets. Keep Python as the executable reference until that
plan's parity, safe-write, and human cutover gates pass.

#### Start the browser app

From the game repository root:

```sh
python3 tmp/human_agile_app.py
```

Or from `tmp/`:

```sh
python3 human_agile_app.py
```

The default command starts `http://127.0.0.1:8765/` and opens it in the default
browser. Stop it with `Ctrl+C` in the terminal.

If the browser should not open automatically:

```sh
python3 tmp/human_agile_app.py serve --no-browser
```

If port 8765 is occupied:

```sh
python3 tmp/human_agile_app.py serve --port 8877
```

The local page provides:

- board columns derived from live packet state;
- text, milestone, state, and dependency-candidate filters;
- packet outcome, checks, evidence, remainder, dependencies, and human gates;
- the detailed delivery guidance from section 15;
- copyable kickoff, daily, review, decision, gate, blocker, incident, and
  handoff forms;
- plan/ledger validation errors and state counts; and
- synchronized state-change preview and confirmation.

A green-edged `Ready` card means only that all `WARD-*` dependencies are closed.
The human must still verify external/product dependencies, complete section 6,
name the owner/reviewer, and decide that work is actually Ready.

#### Use the command line

Validate the manifest, every packet field, compact ledger, state, owner,
milestone, and WIP constraints:

```sh
python3 tmp/human_agile_app.py validate
```

Show the current dependency-ready candidates:

```sh
python3 tmp/human_agile_app.py list --candidates
```

List one state or inspect a packet with joined implementation guidance:

```sh
python3 tmp/human_agile_app.py list --state ACTIVE
python3 tmp/human_agile_app.py show WARD-00
```

Print a copyable form:

```sh
python3 tmp/human_agile_app.py form packet_kickoff
python3 tmp/human_agile_app.py form human_gate
```

Print the complete machine-readable summary:

```sh
python3 tmp/human_agile_app.py summary
```

#### Preview and apply a state change

Preview claiming the first packet without writing:

```sh
python3 tmp/human_agile_app.py transition WARD-00 ACTIVE \
  --owner "Human Name" \
  --ready
```

The output is a unified diff covering both the packet body and compact ledger.
Inspect it. To apply the exact change, repeat with both explicit write and exact
packet confirmation:

```sh
python3 tmp/human_agile_app.py transition WARD-00 ACTIVE \
  --owner "Human Name" \
  --ready \
  --apply \
  --confirm WARD-00
```

Closing requires evidence and `Remainder: none`:

```sh
python3 tmp/human_agile_app.py transition WARD-00 CLOSED \
  --evidence "Charter review PASS; evidence HR-001" \
  --ledger-evidence "HR-001 PASS" \
  --remainder none
```

That command still previews only. Add `--apply --confirm WARD-00` only after
reviewing the diff.

The application enforces declared state transitions and minimum safety fields:

- activation requires a named owner, closed packet dependencies, and explicit
  `--ready`/checkbox confirmation that external dependencies and section 6 pass;
- Partial requires evidence and an exact remainder;
- Blocked requires blocker detail;
- Closed requires evidence and no remainder;
- Dropped requires the human scope decision;
- packet and ledger update together;
- changes since preview invalidate confirmation; and
- any existing validation error disables state mutation.

The application does not auto-approve external dependencies, Definition of
Ready, human gates, releases, Dart freeze, or Dart retirement.

#### Alternative paths and remote mode

The defaults are resolved relative to the application file, so the command works
from any current directory. To inspect copies or fixtures, place global path
arguments before the subcommand:

```sh
python3 tmp/human_agile_app.py \
  --guide /path/to/HUMAN_AGILE_GUIDE.md \
  --unity /path/to/UNITY_PLAN.md \
  validate
```

The browser server binds to loopback by default. A non-loopback host requires
`--allow-remote` and is forcibly read-only because the app has no authentication:

```sh
python3 tmp/human_agile_app.py serve \
  --host 0.0.0.0 \
  --allow-remote \
  --no-browser
```

Do not expose it beyond a trusted local network. Prefer the normal loopback
mode for all state changes.

#### Run the app tests

From `tmp/`:

```sh
python3 -m unittest discover -s tests -p 'test_human_agile_app.py' -v
```

The tests use temporary plan copies for write operations. They verify the real
manifest/packet/ledger join, readiness, detailed packet guidance, preview-only
behavior, confirmation/hash protection, close requirements, synchronized
writes, and read-only HTTP API.

#### Troubleshoot the app

| Symptom | Action |
|---|---|
| `manifest not found` | Confirm the guide contains the intact versioned JSON markers. |
| `unsupported schema version` | Use an app version updated for that guide schema. |
| packet/ledger disagreement | Correct the authority plan manually, validate, then reload. |
| candidate is not truly Ready | Resolve external dependencies and section 6 manually. |
| transition rejected | Read the stated lifecycle or required-field error; do not bypass it. |
| source changed after preview | Reload and generate a new diff from current plan text. |
| browser shows stale data | Use Reload; the server reparses files on every API request. |
| port already in use | Pass another `--port`. |
| browser cannot copy a form | Select the displayed form text and copy normally. |
| remote page cannot apply | Expected: remote bindings are deliberately read-only. |
