import { test } from 'node:test';
import assert from 'node:assert/strict';
import { definePrompt } from './template.types';
import {
  buildAgentMessages,
  buildDocumentMessages,
  buildMessages,
  composeParts,
} from './prompt-builder.service';
import { getTemplate } from './template-registry';
import type { AgentContextLike } from './template-registry';

const CTX: AgentContextLike = {
  projectId: 'project-1',
  projectName: 'Task Tracker',
  idea: 'A simple task management app.',
  answeredQuestions: [{ question: 'Publish platform?', answer: 'Web' }],
  domain: 'productivity',
};

test('interpolates string variables into parts', () => {
  const out = composeParts('Hello {{name}}, project {{project}}', {
    name: 'World',
    project: 'Tracker',
  });
  assert.equal(out, 'Hello World, project Tracker');
});

test('missing variables render empty string', () => {
  assert.equal(composeParts('Name: {{name}}', {}), 'Name: ');
});

test('array variables are serialized as Q/A lines', () => {
  const out = composeParts('Questions:\n{{questions}}', {
    questions: [
      { question: 'Q1', answer: 'A1' },
      { question: 'Q2', answer: 'A2' },
    ],
  });
  assert.ok(out.includes('Q: Q1\nA: A1'));
  assert.ok(out.includes('Q: Q2\nA: A2'));
});

test('block references resolve from the shared blocks registry', () => {
  const out = composeParts('@block:shared.output-contract\n\n{{projectName}}', {
    projectName: 'P',
  });
  assert.ok(out.includes('OUTPUT CONTRACT'), 'block content must be injected');
  assert.ok(out.includes('\nP'), 'variables still interpolate after a block');
});

test('composes multi-part system prompts joined by blank lines', () => {
  const template = definePrompt({
    key: 'test:multi',
    kind: 'agent',
    system: ['Part one', 'Part two'],
    user: 'User {{name}}',
  });
  const messages = buildMessages(template, { name: 'x' });
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[0].content, 'Part one\n\nPart two');
  assert.equal(messages[1].role, 'user');
  assert.equal(messages[1].content, 'User x');
});

test('few-shot examples are inserted between system and final user message', () => {
  const template = definePrompt({
    key: 'test:fewshot',
    kind: 'agent',
    system: 'System instructions',
    user: 'Final user',
    fewShot: [{ user: 'Sample Q', assistant: 'Sample A' }],
  });
  const messages = buildMessages(template, {});
  assert.equal(messages.length, 4);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  assert.equal(messages[1].content, 'Sample Q');
  assert.equal(messages[2].role, 'assistant');
  assert.equal(messages[2].content, 'Sample A');
  assert.equal(messages[3].role, 'user');
  assert.equal(messages[3].content, 'Final user');
});

test('discovery template produces the expected system + user messages', () => {
  const messages = buildAgentMessages('discovery', CTX);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.ok(messages[0].content.includes('OUTPUT CONTRACT'));
  assert.ok(messages[0].content.includes('\n\nYou are an expert Discovery Agent'));
  assert.ok(messages[0].content.includes('reserve blockingQuestions for genuine\nshow-stoppers only.'));

  assert.equal(messages[1].role, 'user');
  const user = messages[1].content;
  assert.ok(user.includes('Project: Task Tracker'));
  assert.ok(user.includes('A simple task management app.'));
  assert.ok(user.includes('Domain: productivity'));
  assert.ok(user.includes('Answered Questions:\nQ: Publish platform?\nA: Web'));
});

test('discovery user message omits Domain/Answer sections when absent', () => {
  const ctx: AgentContextLike = {
    projectId: 'p',
    projectName: 'Plain',
    idea: 'Idea',
    answeredQuestions: [],
    domain: undefined,
  };
  const messages = buildAgentMessages('discovery', ctx);
  const user = messages[1].content;
  assert.ok(user.includes('Project: Plain'));
  assert.ok(user.includes('Software Idea:\nIdea'));
  assert.ok(!user.includes('Domain:'));
  assert.ok(!user.includes('Answered Questions:'));
  assert.ok(user.endsWith('\n\n'), 'preserves the original trailing blank-line behavior');
});

test('FRD document template composes enterprise block + renders knowledge items', () => {
  const messages = buildDocumentMessages('frd', {
    projectId: 'p',
    projectName: 'Acme',
    idea: 'Build a portal',
    knowledgeItems: [
      { type: 'FUNCTIONAL_REQUIREMENT', externalId: 'FR-001', title: 'Login', description: 'Users can log in' },
    ],
  });
  assert.equal(messages.length, 2);
  assert.ok(messages[0].content.includes('enterprise software delivery team'));
  assert.ok(messages[0].content.includes('Functional Requirements Document'));
  assert.ok(messages[1].content.includes('Project: Acme'));
  assert.ok(messages[1].content.includes('Knowledge Items:'));
  assert.ok(messages[1].content.includes('[FUNCTIONAL_REQUIREMENT] FR-001 Login: Users can log in'));
});

test('template registry exposes a known template', () => {
  const t = getTemplate('agent:discovery');
  assert.equal(t.key, 'agent:discovery');
  assert.equal(t.kind, 'agent');
});
