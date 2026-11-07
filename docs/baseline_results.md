# Mira · Test results (T1–T12)

Mira was tested twice against the 12 baseline inputs from the brief:

| Run | Date | Prompt version | What it tested | Langfuse tag |
|---|---|---|---|---|
| **v1 baseline** | 2026-10-29 | `v1` | The first complete build: six agents, routing, grounding, Langfuse tracing | `baseline-run` |
| **v2 regression** | 2026-11-05/06 | `v2` | The same 12 inputs after two changes: upcoming milestones added to the status report, and every non-Clarifier answer saved to Google Drive as a document | `regression-v2` |

Both runs used `gpt-4o-mini`, the live project files from Google Drive, and the as-of date 2026-04-27. Each answer was judged against the brief's *Expected Output* criteria and scored in a Langfuse annotation queue (`test_pass`, `pm_usefulness`). Full per-test metrics are in [`Mira_Test_Log_v2.xlsx`](Mira_Test_Log_v2.xlsx).

## Summary

| Metric | v1 baseline | v2 regression |
|---|---|---|
| Tests passed | **12 / 12** | **12 / 12** |
| Requests routed to the intended agent | 12 / 12 | 12 / 12 |
| Correct refusals on vague input (T2, T4, T6, T9) | 4 / 4 | 4 / 4 |
| Counts and task IDs matching the source files | 100% | 100% |
| Status reports that include upcoming milestones (T5, T10) | 0 / 2 | **2 / 2** |
| Tests with a quality defect remaining | 10 | **6** |
| Average PM usefulness (human score, 1–5) | 4.5 | — |
| Average latency per request | 10.6 s | 10.2 s |
| Average cost per request | $0.00046 | $0.00050 |
| Projected monthly cost (10 PMs × 8 requests/day × 21 days) | $0.78 | $0.83 |

v2 cost is averaged over the 10 tests whose token counts were exported; T11 and T12 were exported without token data. Latency is measured from receiving the question to building the trace, so it excludes the 2–4 seconds spent creating the Google Doc in v2. Costs use estimated token counts (characters ÷ 4): the order of magnitude is reliable, exact cents are not. The v2 run was scored for pass/fail; PM usefulness was scored for the v1 baseline.

## Results by test (v2)

| Test | Input | Agent | v1 | v2 | What the v2 answer contained |
|---|---|---|---|---|---|
| T1 | Generate a project plan for the AI Adoption Project at ABCDE Ltd. Use the provided project description. | Planner | Pass | Pass | All 8 phases with correct weeks; 14 milestones with due weeks; goals copied exactly (15% fewer delivery delays, 10% lower costs); start date, budget, owners and team size raised as open questions. Saved to Drive |
| T2 | Generate a project plan for: "We want to build a chatbot." | Clarifier | Pass | Pass | Flagged insufficient detail; asked for scope, goals, deliverables, timeline and team size; no plan. Answered in chat |
| T3 | Generate a risk assessment for the AI Adoption Project at ABCDE Ltd. | Risk Assessor | Pass | Pass | All 10 risks (R01–R10) copied word for word from the CSV; three risks to act on first, with reasons; caveat that the register has no severity scores |
| T4 | Generate a risk assessment for: "New project starting soon." | Clarifier | Pass | Pass | Asked for scope, goals, timeline, technology and constraints; no risks listed |
| T5 | Generate a weekly status report using the sample task board for Sprint 3. | Status Reporter | Pass | Pass | Sprint 3 only (T007, T008, T009, T025); Done 0, In Progress 2, Blocked 0, To Do 2; health Green. **New:** upcoming milestone "Final list of prioritized use cases with success criteria" due 2026-05-10; Phase 4 starts 2026-05-11 |
| T6 | Generate a weekly status report for: "Things are going fine." | Clarifier | Pass | Pass | "No task data is available for this request."; no tasks or percentages |
| T7 | What are the top 3 risks for the ABCDE Ltd project? | Risk Assessor | Pass | Pass | Exactly 3 real risks (R02, R04, R01) with category, impact, mitigation and reason; R04's category copied correctly; no-severity caveat |
| T8 | Which tasks are blocked or at risk of missing their deadline? | Milestone Tracker | Pass | Pass | T024 listed first as blocked, with the action "confirm the security team's availability"; T006 6 days overdue; T007 and T025 due in 1 day; T008 due in 5 days |
| T9 | Generate a project plan for a 2-week project with no other details. | Clarifier | Pass | Pass | Asked for scope, goals, deliverables and team size; acknowledged the 2-week duration and asked for a more detailed timeline; no plan |
| T10 | Summarize current project status: tasks done, in progress, to do, blocked? | Status Reporter | Pass | Pass | Done 5, In Progress 3, Blocked 1, To Do 16, Total 25 (matches the CSV); health Amber. **New:** upcoming milestones section |
| T11 | What milestones are coming up in the next 2 weeks based on the timeline? | Milestone Tracker | Pass | Pass | Current phase Phase 3 (2026-04-27 to 2026-05-10); milestone due 2026-05-10; Phase 4 starts 2026-05-11; open tasks due in the window |
| T12 | Generate a stakeholder update email summarizing Sprint 2 progress. | Stakeholder Update | Pass | Pass | Subject line; T004 and T005 completed; T006 in progress and 6 days overdue; no Sprint 3+ tasks |

The v2 run used the wording in `eval_mira_inputs.txt`, which differs slightly from the brief's table for some tests. Routing and results were the same under both wordings.

## What changed between v1 and v2

| Change | Tests affected | Effect |
|---|---|---|
| Status facts now include the current phase, milestones due in the next 14 days and the next phase; the Status Reporter prompt adds an *Upcoming milestones* section | T5, T10 | Closes a gap in a core requirement: the brief's status report must show upcoming milestones |
| Every non-Clarifier answer is saved as a formatted Google Doc; the chat confirms the save with document, PDF, Word and folder links | T1, T3, T5, T7, T8, T10, T11, T12 | Reports can be downloaded and shared; Clarifier questions stay in the chat |
| T9 now acknowledges the duration given instead of asking for a timeline from scratch | T9 | Run-to-run improvement, no prompt change |
| T11 now states the current phase | T11 | Run-to-run improvement, no prompt change |
| R04's category was copied correctly | T7 | The v1 category drift did not recur |

No test regressed: every answer still matched the source files, and all four vague requests were still refused.

## Defects remaining (planned for v3)

| Test | Defect | Planned fix |
|---|---|---|
| T3 | One priority reason does not name which stated goal it threatens | Require each reason to name a goal (15% delays, 10% costs, responsiveness) |
| T5, T10 | The *Current phase* line is omitted from the milestones section | Make it the required first line of the section |
| T7 | Ranking order differs from T3 for the same three risks | Rank by task-board evidence computed in code; render risk fields from the CSV |
| T10 | Full report returned for a question that asked only for counts | Reword the counts-only rule with an example |
| T11 | Does not link the open tasks (T007, T008) to the milestone they feed | Ask the agent to explain the milestone's dependencies |
| T12 | Evaluative wording not supported by the facts ("significant progress") | Describe progress only with the counts and task names given |

## Notes

- The brief's summary says the task board has 3 Done tasks. The CSV has 5 (T001–T005). Mira reports what the data says.
- A first attempt at the v2 run executed on the previously published workflow, because the updated version had not been published. Those 11 traces are tagged `v1` and match the baseline results, which confirms that runs are consistent. They are excluded from the v2 figures.
- The weekly workflow's request ("Generate a weekly status report for the current sprint.") was also run during v2. It was scoped to Sprint 3, reported counts 0/2/0/2 and health Green, and included the upcoming milestones.
