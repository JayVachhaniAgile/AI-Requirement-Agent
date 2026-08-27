import test from 'node:test';
import assert from 'node:assert/strict';
import { planFromPrompt, parseContextBullets } from './website-plan';
import { renderWebsite } from './website-renderer';

const SAMPLE_PROMPT = `## Role
You are a senior full-stack engineering team tasked with building **TaskFlow**.

## Product Brief

**Idea:** A task management app for small teams with projects, tasks, recurring schedules, notifications, file uploads, and role-based permissions.

**Audience / personas:**

- \`PER-001\` **Project Manager**: Coordinates sprints and tracks progress across teams.
- \`PER-002\` **Developer**: Manages daily tasks and code review workflows.

**Functional requirements (source of truth):**

- \`FR-001\`: The system shall allow users to create and assign tasks.
- \`FR-002\`: The system shall support recurring task schedules.
- \`FR-003\`: The system shall send email and push notifications for due reminders.

## Technology Stack

**Recommended technologies:**

- \`TECH-001\` React + TypeScript
- \`TECH-002\` Node.js + NestJS
- \`TECH-003\` PostgreSQL

## User Interface

**Screens to build:**

- \`SCREEN-001\` Login Screen: Email + password sign in.
- \`SCREEN-002\` Dashboard: KPI cards and recent activity.
- \`SCREEN-003\` Task List: Sortable table with filters.

## API Specification

**Endpoints & contracts:**

- \`API-001\` GET /api/v1/tasks — list tasks with filters
- \`API-002\` POST /api/v1/tasks — create a task

## Data Model

**Entities / tables:**

- \`TBL-001\` Users: Account identity, preferences and access roles.
- \`TBL-002\` Tasks: Work item with status, assignee and due date.

## Security

- \`SEC-AUTH\` JWT-based authentication with refresh tokens
- \`SEC-API\` Rate limiting on all API endpoints
`;

test('parseContextBullets attaches heading + label to every bullet', () => {
  const bullets = parseContextBullets(SAMPLE_PROMPT);
  const frs = bullets.filter((b) => b.label.toLowerCase().includes('functional'));
  assert.equal(frs.length, 3);
  assert.equal(frs[0].heading, 'Product Brief');
  assert.match(frs[0].bullet, /FR-001/);
});

test('planFromPrompt parses features with clean human title', () => {
  const plan = planFromPrompt('TaskFlow', SAMPLE_PROMPT);
  assert.equal(plan.features.length, 3);
  // No raw ID in the headline — the clean prose title is shown instead.
  assert.match(plan.features[0].title, /create and assign tasks/i);
  assert.match(plan.features[0].summary, /create and assign tasks/i);
  assert.match(plan.features[0].icon, /\p{Emoji}/u);
});

test('planFromPrompt parses audiences with clean names', () => {
  const plan = planFromPrompt('TaskFlow', SAMPLE_PROMPT);
  assert.equal(plan.audiences.length, 2);
  assert.equal(plan.audiences[0].name, 'Project Manager');
  assert.match(plan.audiences[0].blurb, /Coordinates sprints/);
});

test('planFromPrompt extracts techs', () => {
  const plan = planFromPrompt('TaskFlow', SAMPLE_PROMPT);
  assert.deepEqual(plan.techs, ['React + TypeScript', 'Node.js + NestJS', 'PostgreSQL']);
});

test('planFromPrompt extracts screens', () => {
  const plan = planFromPrompt('TaskFlow', SAMPLE_PROMPT);
  assert.ok(plan.screens.length >= 1);
  assert.match(plan.screens[0].title, /Login Screen|Screen/i);
  assert.ok(plan.screens[0].id.length > 0);
});

test('planFromPrompt extracts API endpoints', () => {
  const plan = planFromPrompt('TaskFlow', SAMPLE_PROMPT);
  assert.ok(plan.endpoints.length >= 1);
  assert.equal(plan.endpoints[0].method, 'GET');
  assert.match(plan.endpoints[0].path, /^\//);
});

test('planFromPrompt extracts security highlights', () => {
  const plan = planFromPrompt('TaskFlow', SAMPLE_PROMPT);
  assert.equal(plan.securityHighlights.length, 2);
  assert.match(plan.securityHighlights[0], /JWT/);
});

test('planFromPrompt uses sensible defaults for sparse prompts', () => {
  const plan = planFromPrompt('Mini App', '# Heading\n\nNo structure here.');
  assert.ok(plan.features.length >= 3, 'default features generated');
  assert.ok(plan.audiences.length >= 1, 'default audience generated');
  assert.ok(plan.techs.length >= 1, 'default techs generated');
  assert.ok(plan.securityHighlights.length >= 1, 'default security highlights generated');
  assert.match(plan.tagline, /mini app/i);
});

test('planFromPrompt picks a palette for the project', () => {
  const a = planFromPrompt('Alpha', SAMPLE_PROMPT);
  const b = planFromPrompt('Beta', SAMPLE_PROMPT);
  assert.match(a.primaryColor, /^#[0-9a-f]{6}$/);
  // Different project names can collide on a 6-colour palette; that's fine
  // as long as both are valid hex.
  assert.match(b.primaryColor, /^#[0-9a-f]{6}$/);
});

test('renderWebsite produces a clickable multi-page app', () => {
  const plan = planFromPrompt('TaskFlow', SAMPLE_PROMPT);
  const html = renderWebsite(plan);
  // Landing + app shell + login all present
  assert.match(html, /href="#\/app"/);
  assert.match(html, /href="#\/login"/);
  // Hash router wired up
  assert.match(html, /window\.addEventListener\('hashchange'/);
  assert.match(html, /id="pages-data"/);
  // App pages embedded as data
  assert.match(html, /Dashboard/);
  assert.match(html, /api\/reference|API reference/);
});

test('renderWebsite escapes XSS payloads', () => {
  const plan = planFromPrompt('Bad Project', `# Hello

**Idea:** <img src=x onerror=alert(1)>

**Functional requirements (source of truth):**

- \`FR-001\`: <script>alert(1)</script> runs nothing`);
  const html = renderWebsite(plan);
  // The page contains its own inline router <script>, so assert the *payload*
  // never survives as executable markup.
  assert.equal(html.includes('<script>alert(1)</script>'), false);
  assert.equal(html.includes('<img src=x onerror='), false);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; runs nothing/);
});

test('renderWebsite embeds no external resources', () => {
  const plan = planFromPrompt('TaskFlow', SAMPLE_PROMPT);
  const html = renderWebsite(plan);
  // Self-contained: no remote script, no remote stylesheet, no remote font
  assert.equal(/<link\s+rel="stylesheet"\s+href="https?:/i.test(html), false);
  assert.equal(/<script\s+src="https?:/i.test(html), false);
});
