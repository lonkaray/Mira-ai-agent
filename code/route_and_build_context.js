// Mira · Route & Build Context
// 1) Rules decide which agent runs.  2) Builds the facts for that agent only.
const o = $('Orchestrator').first().json.output;
const question = $('Clean Input').first().json.question;

// Agents that exist so far. Add each new one here as you build it.
const AGENTS_BUILT = { plan: 'planner', risk: 'risk', status: 'status', milestone: 'milestone', stakeholder_update: 'stakeholder' };

// What a request about some OTHER project must include before Mira can answer it
const REQUIRED = {
  plan: ['scope', 'goals', 'deliverables', 'timeline', 'team_size'],
  risk: ['scope', 'goals', 'timeline', 'technology', 'constraints'],
  status: ['task_data'],
  milestone: ['timeline', 'task_data'],
  stakeholder_update: ['task_data'],
  other: [],
};
const provided = o.provided_fields ?? [];
const missing = (REQUIRED[o.intent] ?? []).filter(f => !provided.includes(f));

// ── 1. Route ──
const route = (o.input_source === 'files' && AGENTS_BUILT[o.intent]) ? AGENTS_BUILT[o.intent] : 'clarifier';

// ── Shared settings (documented assumptions) ──
const AS_OF = '2026-04-27';          // project "today": the files have no current date, and the real date is after the project ends
const PROJECT_START = '2026-03-30';  // Monday of week 1: not in the files; chosen so Sprints 1-3 fall inside Phases 1-3
const DUE_SOON_DAYS = 7;             // open task due within 7 days = at risk

// ── Shared helpers ──
const DAY = 86400000;
const day = s => new Date(s + 'T00:00:00Z');
const iso = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const asOf = day(AS_OF);
const daysTo = d => Math.round((day(d) - asOf) / DAY);
const plural = n => `${n} day${n === 1 ? '' : 's'}`;
const sprintNo = t => parseInt(String(t.sprint).replace(/\D/g, ''), 10);
// Keep one row per ID, even if a file was read more than once
const unique = (nodeName, idField) => [...new Map($(nodeName).all().map(item => [item.json[idField], item.json])).values()];
// Why an open task needs attention (empty string if it doesn't)
const riskReason = t => {
  if (t.status === 'Done') return '';
  const d = daysTo(t.due_date);
  if (t.status === 'Blocked') return 'blocked';
  if (d < 0) return `${plural(-d)} overdue, still ${t.status}`;
  if (d <= DUE_SOON_DAYS) return `due in ${plural(d)}, still ${t.status}`;
  return '';
};

// ── 2. Facts for the chosen agent ──
const description = $('Read Description').first().json.data;
let context;

if (route === 'planner') {
  const phases = $('Read Timeline').all().map(item => item.json);
  const timeline = phases.map(p =>
    `Phase ${p.phase}: ${p.phase_name} | weeks ${p.start_week}-${p.end_week}\n` +
    `  Activities: ${p.key_activities}\n` +
    `  Milestones/deliverables: ${p.milestones_deliverables}`
  ).join('\n');
  context = `PROJECT DESCRIPTION:\n${description}\n\nTIMELINE (${phases.length} phases):\n${timeline}`;

} else if (route === 'risk') {
  const risks = unique('Read Risks', 'risk_id');
  const register = risks.map(x =>
    `[${x.risk_id}] ${x.category} | Risk: ${x.risk_challenge} | Impact: ${x.impact} | Mitigation: ${x.mitigation_strategy}`
  ).join('\n');
  const topN = o.top_n > 0 ? Math.min(o.top_n, risks.length) : 0;
  context = [
    `PROJECT DESCRIPTION:\n${description}`,
    `RISK REGISTER (${risks.length} risks):\n${register}`,
    'NOTE: The risk register has no likelihood or severity scores.',
    topN ? `TOP ${topN} REQUESTED: choose exactly ${topN} risks.` : 'FULL ASSESSMENT REQUESTED: include every risk in the register.',
  ].join('\n\n');

} else if (route === 'status') {
  const all = unique('Read Tasks', 'task_id');

  // Which sprint? A named sprint, else "current/this sprint", else the whole project
  const sprints = [...new Set(all.map(sprintNo))].sort((a, b) => a - b);
  const lastDue = n => all.filter(t => sprintNo(t) === n).map(t => t.due_date).sort().at(-1);
  const currentSprint = sprints.find(n => day(lastDue(n)) >= asOf) ?? sprints.at(-1);
  const asksCurrent = /\b(current|this) sprint\b/i.test(question);
  const sprint = o.sprint > 0 ? o.sprint : (asksCurrent ? currentSprint : 0);
  const tasks = sprint ? all.filter(t => sprintNo(t) === sprint) : all;

  // Counts: done in code, never by the LLM
  const count = s => tasks.filter(t => t.status === s).length;
  const attention = tasks.filter(t => riskReason(t)).map(t => `[${t.task_id}] ${t.task_name}: ${riskReason(t)}`);

  // Health rule: Red if overdue more than 7 days or a blocked task is due within 14 days;
  // Amber if anything is overdue or blocked; Green otherwise.
  const overdue = tasks.filter(t => t.status !== 'Done' && daysTo(t.due_date) < 0);
  const blocked = tasks.filter(t => t.status === 'Blocked');
  const red = overdue.some(t => daysTo(t.due_date) < -7) || blocked.some(t => daysTo(t.due_date) <= 14);
  const health = red ? 'Red' : (overdue.length || blocked.length ? 'Amber' : 'Green');
  const reason = [
    overdue.length ? `${overdue.length} overdue (${overdue.map(t => t.task_id).join(', ')})` : '',
    blocked.length ? `${blocked.length} blocked (${blocked.map(t => t.task_id).join(', ')})` : '',
  ].filter(Boolean).join('; ') || 'no overdue or blocked tasks';

  const line = t => `[${t.task_id}] ${t.task_name} | owner ${t.assignee} | ${t.priority} priority | ${t.sprint} | due ${t.due_date}`;
  const group = s => tasks.filter(t => t.status === s).map(line).join('\n') || 'None';

  // Upcoming milestones: timeline weeks turned into dates, phase-end deliverables due in the next 14 days
  const WINDOW = 14;
  const windowEnd = addDays(asOf, WINDOW);
  const start = day(PROJECT_START);
  const phases = $('Read Timeline').all().map(item => item.json).map(p => ({
    ...p,
    start_date: iso(addDays(start, (Number(p.start_week) - 1) * 7)),
    end_date: iso(addDays(start, Number(p.end_week) * 7 - 1)),
  }));
  const currentPhase = phases.find(p => day(p.start_date) <= asOf && day(p.end_date) >= asOf);
  const upcoming = phases.filter(p => day(p.end_date) >= asOf && day(p.end_date) <= windowEnd);
  const nextPhase = phases.find(p => day(p.start_date) > asOf);

  context = [
    `AS OF: ${AS_OF} (project "today"). Current sprint: Sprint ${currentSprint}.`,
    `SCOPE: ${sprint ? `Sprint ${sprint} only` : 'Whole project, all sprints'}`,
    sprint && !tasks.length ? `NOTE: Sprint ${sprint} does not exist on the task board.` : '',
    `COUNTS BY STATUS: Done ${count('Done')}, In Progress ${count('In Progress')}, Blocked ${count('Blocked')}, To Do ${count('To Do')}, Total ${tasks.length}`,
    `HEALTH: ${health} (${reason})`,
    `DONE:\n${group('Done')}`,
    `IN PROGRESS:\n${group('In Progress')}`,
    `BLOCKED:\n${group('Blocked')}`,
    `TO DO:\n${group('To Do')}`,
    `NEEDS ATTENTION:\n${attention.join('\n') || 'None'}`,
    `CURRENT PHASE: ${currentPhase ? `Phase ${currentPhase.phase} ${currentPhase.phase_name} (${currentPhase.start_date} to ${currentPhase.end_date})` : 'None'}`,
    `UPCOMING MILESTONES (next ${WINDOW} days, ${AS_OF} to ${iso(windowEnd)}):\n${upcoming.map(p =>
      `Phase ${p.phase} ${p.phase_name}, due ${p.end_date}: ${p.milestones_deliverables}`).join('\n') || 'None in the next ' + WINDOW + ' days'}`,
    nextPhase ? `NEXT PHASE: Phase ${nextPhase.phase} ${nextPhase.phase_name} starts ${nextPhase.start_date}` : '',
    `ASSUMPTIONS: Week 1 starts ${PROJECT_START} (not stated in the files).`,
  ].filter(Boolean).join('\n\n');

} else if (route === 'milestone') {
  const WINDOW = o.window_days > 0 ? o.window_days : 14;   // "upcoming" = next 14 days unless the user names a window
  const windowEnd = addDays(asOf, WINDOW);
  const inWindow = s => day(s) >= asOf && day(s) <= windowEnd;
  const start = day(PROJECT_START);

  // Turn timeline weeks into dates
  const phases = $('Read Timeline').all().map(item => item.json).map(p => ({
    ...p,
    start_date: iso(addDays(start, (Number(p.start_week) - 1) * 7)),
    end_date: iso(addDays(start, Number(p.end_week) * 7 - 1)),
  }));
  const current = phases.find(p => day(p.start_date) <= asOf && day(p.end_date) >= asOf);
  const milestonesDue = phases.filter(p => inWindow(p.end_date));
  const phasesStarting = phases.filter(p => day(p.start_date) > asOf && day(p.start_date) <= windowEnd);

  const tasks = unique('Read Tasks', 'task_id');
  const atRisk = tasks.filter(t => riskReason(t));
  const dueInWindow = tasks.filter(t => t.status !== 'Done' && inWindow(t.due_date));

  context = [
    `AS OF: ${AS_OF} (project "today"). WINDOW: next ${WINDOW} days, ${AS_OF} to ${iso(windowEnd)}.`,
    current ? `CURRENT PHASE: Phase ${current.phase} ${current.phase_name} (${current.start_date} to ${current.end_date})` : '',
    `MILESTONES DUE IN WINDOW (phase-end deliverables):\n${milestonesDue.map(p =>
      `Phase ${p.phase} ${p.phase_name}, due ${p.end_date}: ${p.milestones_deliverables}`).join('\n') || 'None in this window'}`,
    `PHASES STARTING IN WINDOW:\n${phasesStarting.map(p => `Phase ${p.phase} ${p.phase_name} starts ${p.start_date}`).join('\n') || 'None'}`,
    `BLOCKED OR AT-RISK TASKS:\n${atRisk.map(t =>
      `[${t.task_id}] ${t.task_name} | ${t.status} | owner ${t.assignee} | due ${t.due_date} | reason: ${riskReason(t)}\n  Task details: ${t.description}`).join('\n') || 'None'}`,
    `OPEN TASKS DUE IN WINDOW:\n${dueInWindow.map(t => `[${t.task_id}] ${t.task_name} | ${t.status} | owner ${t.assignee} | due ${t.due_date}`).join('\n') || 'None'}`,
    `ASSUMPTIONS: Week 1 starts ${PROJECT_START} (not stated in the files). At risk means blocked, overdue, or open and due within ${DUE_SOON_DAYS} days.`,
  ].filter(Boolean).join('\n\n');

} else if (route === 'stakeholder') {
  const all = unique('Read Tasks', 'task_id');

  // Which sprint? The named sprint, else the current sprint
  const sprints = [...new Set(all.map(sprintNo))].sort((a, b) => a - b);
  const lastDue = n => all.filter(t => sprintNo(t) === n).map(t => t.due_date).sort().at(-1);
  const currentSprint = sprints.find(n => day(lastDue(n)) >= asOf) ?? sprints.at(-1);
  const sprint = o.sprint > 0 ? o.sprint : currentSprint;
  const tasks = all.filter(t => sprintNo(t) === sprint);   // ONLY this sprint: other sprints never reach the agent
  const count = s => tasks.filter(t => t.status === s).length;
  const audience = o.audience || 'leadership';

  context = [
    `SPRINT: Sprint ${sprint}${o.sprint > 0 ? '' : ' (current sprint)'}. AUDIENCE: ${audience}. AS OF: ${AS_OF}.`,
    !tasks.length ? `NOTE: Sprint ${sprint} does not exist on the task board.` : '',
    `SPRINT ${sprint} COUNTS: Done ${count('Done')}, In Progress ${count('In Progress')}, Blocked ${count('Blocked')}, To Do ${count('To Do')}, Total ${tasks.length}`,
    `SPRINT ${sprint} TASKS:\n${tasks.map(t =>
      `[${t.task_id}] ${t.task_name} | ${t.status} | owner ${t.assignee} | due ${t.due_date}${riskReason(t) ? ' | attention: ' + riskReason(t) : ''}\n  Task details: ${t.description}`).join('\n')}`,
    `PROJECT CONTEXT (for the opening line only):\n${description}`,
  ].filter(Boolean).join('\n\n');

} else {
  const notBuiltYet = o.input_source === 'files';
  const noTaskData = ['status', 'stakeholder_update'].includes(o.intent) && o.input_source !== 'files';
  context = [
    `REQUESTED: ${o.intent}`,
    `INPUT GIVEN: ${o.inline_text ? '"' + o.inline_text + '"' : 'no project content'}`,
    notBuiltYet
      ? 'PROBLEM: Mira cannot answer this type of request yet.'
      : `MISSING INFORMATION: ${missing.length ? missing.join(', ') : 'what the user wants Mira to do'}`,
    noTaskData ? 'NO TASK DATA WAS PROVIDED.' : '',
    'MIRA CAN DO: project plans, risk assessments, status reports, milestone and deadline checks, and stakeholder updates for the ABCDE Ltd. AI Adoption Project.',
  ].filter(Boolean).join('\n');
}

// Curly braces confuse n8n's LLM prompt templates, so remove any
const prompt = `USER REQUEST:\n${question}\n\nFACTS:\n${context}`.replace(/[{}]/g, '');

return [{ json: { route, intent: o.intent, input_source: o.input_source, missing: route === 'clarifier' ? missing : [], prompt } }];