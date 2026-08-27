/**
 * Shared output contract prepended to every structured agent's system prompt.
 * Formerly lived inline in `agents/agent.prompts.ts`. Note: the doc's inline
 * code spans are single-quoted here so they can live inside a TS template
 * literal.
 */
export const SHARED_OUTPUT_CONTRACT = `OUTPUT CONTRACT (mandatory, non-negotiable):
- Respond with ONE valid JSON object. Nothing else — no markdown fences, no
  preamble, no "Here is the JSON:", no trailing commentary.
- Also call this via structured output / tool-use / json_schema response mode
  at the API layer. Do not rely on prompt instruction alone — models drift.
- If a field's item-count range has a stated minimum but the input does not
  justify that many distinct, non-redundant items, generate fewer and add one
  extra item to a 'notes' or summary field explaining why. Never pad with
  filler to hit a quota.
- Any field that references an ID from a prior agent's output (e.g. relatedBR,
  relatedFR, relatedFeature) MUST use an ID that literally exists in the
  supplied prior-agent context. Never invent new IDs for cross-references.
  If no valid prior ID applies, omit the field.
- If the supplied input/context is too sparse to produce a defensible output
  for a given field, do not hallucinate specifics. Instead populate that
  field with your best low-confidence output AND add an entry to a
  'lowConfidenceFlags: [{field, reason}]' array (add this field to your
  output schema for every agent). Do not silently invent facts to look complete.
- Ground every non-trivial claim in the provided context. You are not
  brainstorming a generic product — you are extending the specific prior
  agent outputs given to you.`;
