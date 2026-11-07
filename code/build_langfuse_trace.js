// Mira · Build Langfuse Trace (OpenTelemetry format)
// One trace per request: a root span plus one span per LLM call.
const PROMPT_VERSION = 'v1';   // change to v2, v3... whenever you edit any prompt
const MODEL = 'gpt-4o-mini';

const clean = $('Clean Input').first().json;
const orch = $('Orchestrator').first().json.output;
const r = $('Route & Build Context').first().json;
const answer = String($input.first().json.text ?? '');

// ── helpers ──
const hex = n => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const nanos = ms => String(ms) + '000000';
const tokens = s => Math.ceil(String(s ?? '').length / 4);   // estimate: ~4 characters per token
const str = (key, v) => ({ key, value: { stringValue: typeof v === 'string' ? v : JSON.stringify(v) } });
const list = (key, arr) => ({ key, value: { arrayValue: { values: arr.map(x => ({ stringValue: String(x) })) } } });

const endMs = Date.now();
const startMs = Date.parse(clean.started_at) || endMs;
const traceId = hex(32), rootId = hex(16);
const tags = [r.route, PROMPT_VERSION, 'baseline-run'];

// Trace-level attributes go on every span so filters work
const common = [
  str('langfuse.trace.name', 'mira-request'),
  list('langfuse.trace.tags', tags),
  str('langfuse.trace.metadata.route', r.route),
  str('langfuse.trace.metadata.intent', r.intent),
  str('langfuse.trace.metadata.input_source', r.input_source),
  str('langfuse.trace.metadata.prompt_version', PROMPT_VERSION),
];

const span = (id, parent, name, attrs) => ({
  traceId, spanId: id, ...(parent ? { parentSpanId: parent } : {}),
  name, kind: 1, startTimeUnixNano: nanos(startMs), endTimeUnixNano: nanos(endMs),
  attributes: [...common, ...attrs], status: { code: 1 },
});

const generation = (name, input, output, inTok, outTok) => span(hex(16), rootId, name, [
  str('langfuse.observation.type', 'generation'),
  str('langfuse.observation.model.name', MODEL),
  str('langfuse.observation.input', input),
  str('langfuse.observation.output', output),
  str('langfuse.observation.usage_details', { input: inTok, output: outTok }),
]);

const spans = [
  span(rootId, null, 'mira-request', [
    str('langfuse.observation.type', 'agent'),
    str('langfuse.observation.input', clean.question),
    str('langfuse.observation.output', answer),
    str('langfuse.trace.input', clean.question),
    str('langfuse.trace.output', answer),
  ]),
  generation('orchestrator', clean.question, orch, 700 + tokens(clean.question), tokens(JSON.stringify(orch))),
  generation(`${r.route}-agent`, r.prompt, answer, 450 + tokens(r.prompt), tokens(answer)),
];

const otel = { resourceSpans: [{
  resource: { attributes: [str('service.name', 'mira-n8n')] },
  scopeSpans: [{ scope: { name: 'mira-n8n' }, spans }],
}] };

return [{ json: { otel, answer, route: r.route } }];
