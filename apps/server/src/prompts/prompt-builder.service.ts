/**
 * Prompt Builder Service — assembles LLMMessage[] from declarative templates.
 *
 * Pure service with no Nest DI dependencies (except import of LLMMessage type).
 * Templates are loaded statically from the template registry; blocks from the
 * blocks registry. This keeps the builder dependency-free and unit-testable.
 */
import type { LLMMessage } from '../llm/llm.service';
import {
  type PromptTemplate,
  type PromptPart,
  type PromptVars,
  type FewShotExample,
} from './template.types';
import { getBlock } from './blocks/index';
import { getTemplate } from './template-registry';

/**
 * Render a single prompt part: resolve @block: references, interpolate
 * {{variable}} placeholders, and call render functions.
 */
export function renderPart(part: PromptPart, vars: PromptVars): string {
  if (typeof part === 'function') {
    return part(vars);
  }
  const resolved = resolveBlocks(part);
  return interpolate(resolved, vars);
}

/**
 * Assemble a prompt part array (or single part) into a final string.
 * Arrays are joined with '\n\n' to match existing prompt conventions.
 */
export function composeParts(
  parts: PromptPart | readonly PromptPart[],
  vars: PromptVars,
): string {
  if (typeof parts === 'function' || typeof parts === 'string') {
    return renderPart(parts, vars);
  }
  return (parts as readonly PromptPart[]).map((p) => renderPart(p, vars)).join('\n\n');
}

/**
 * Build LLMMessage[] for a given template and variables.
 * Inserts few-shot examples between system and user (when present).
 */
export function buildMessages(
  template: PromptTemplate,
  vars: PromptVars,
): LLMMessage[] {
  const systemContent = composeParts(template.system, vars);
  const messages: LLMMessage[] = [{ role: 'system', content: systemContent }];

  for (const example of template.fewShot ?? []) {
    messages.push({
      role: 'user',
      content: interpolate(resolveBlocks(example.user), vars),
    });
    messages.push({
      role: 'assistant',
      content: interpolate(resolveBlocks(example.assistant), vars),
    });
  }

  if (template.user) {
    messages.push({
      role: 'user',
      content: composeParts(template.user, vars),
    });
  }

  return messages;
}

/**
 * High-level: build messages for an agent by its agentKey + AgentContext.
 * Resolves vars via the template's resolveVars, defaulting to the context
 * itself if none is defined.
 */
export function buildAgentMessages(agentKey: string, ctx: object): LLMMessage[] {
  const key = `agent:${agentKey}`;
  const template = getTemplate(key);
  const vars = template.resolveVars ? template.resolveVars(ctx as PromptVars) : (ctx as PromptVars);
  return buildMessages(template, vars);
}

/**
 * High-level: build messages for a document generator by its docType.
 */
export function buildDocumentMessages(docType: string, input: object): LLMMessage[] {
  const key = `document:${docType}`;
  const template = getTemplate(key);
  const resolved = template.resolveVars ? template.resolveVars(input as PromptVars) : (input as PromptVars);
  return buildMessages(template, resolved);
}

/**
 * Preview: render messages without any LLM call, for prompt testing / UI.
 */
export function previewMessages(
  promptKey: string,
  vars: PromptVars = {},
): { system: string; user: string; fewShot: Array<{ role: string; content: string }> } {
  const template = getTemplate(promptKey);
  const resolved = template.resolveVars ? template.resolveVars(vars) : vars;
  const messages = buildMessages(template, resolved);
  const system = messages.find((m) => m.role === 'system')?.content ?? '';
  const userMessages = messages.filter((m) => m.role === 'user');
  const fewShot = messages
    .filter((m) => m.role !== 'system' && m !== userMessages[userMessages.length - 1])
    .map((m) => ({ role: m.role, content: m.content }));
  return {
    system,
    user: userMessages[userMessages.length - 1]?.content ?? '',
    fewShot,
  };
}

// --- internal helpers ---

function resolveBlocks(text: string): string {
  return text.replace(/@block:([a-zA-Z0-9._-]+)/g, (_match, name) => {
    return getBlock(name);
  });
}

function interpolate(text: string, vars: PromptVars): string {
  return text.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (match, key) => {
    const value = vars[key];
    if (value === undefined || value === null) return '';
    if (Array.isArray(value)) {
      if (value.length === 0) return '';
      return value
        .map((item) =>
          typeof item === 'object' && item !== null
            ? formatItem(item, key)
            : String(item),
        )
        .join('\n');
    }
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  });
}

function formatItem(item: unknown, fieldHint: string): string {
  if (typeof item === 'string') return item;
  if (typeof item === 'object' && item !== null) {
    const obj = item as Record<string, unknown>;
    if ('title' in obj && 'description' in obj) {
      return `- ${obj.externalId ? `${obj.externalId} ` : ''}${obj.title}: ${obj.description}`;
    }
    if ('question' in obj) {
      const q = obj as { question: string; answer?: string; context?: string };
      let s = `Q: ${q.question}`;
      if (q.answer) s += `\nA: ${q.answer}`;
      if (q.context) s += `\nContext: ${q.context}`;
      return s;
    }
  }
  return JSON.stringify(item, null, 2);
}
