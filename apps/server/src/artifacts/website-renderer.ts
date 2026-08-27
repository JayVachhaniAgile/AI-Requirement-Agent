/**
 * Render a WebsitePlan into a clickable, self-contained, real-looking product
 * web app. Produces a marketing landing page, a sign-in screen, and an app
 * shell with a sidebar + top bar and a hash router. Every screen in the plan
 * becomes a purpose-built page composed from real UI components (KPI cards,
 * charts, tables, card grids, forms, kanban, calendar, chat, timeline,
 * documents, maps, scorecards). No external dependencies; every LLM-derived
 * string is HTML-escaped.
 */
import type { WebsitePlan } from './website-plan';

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function planJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function methodColor(method: string): string {
  const map: Record<string, string> = {
    GET: '#10b981',
    POST: '#3b82f6',
    PUT: '#f59e0b',
    PATCH: '#8b5cf6',
    DELETE: '#ef4444',
  };
  return map[method] ?? '#64748b';
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || 'U';
}

function shortTitle(title: string): string {
  const t = title.replace(/^[A-Z]+[-\d]*\s*/i, '').trim();
  return t || title;
}

function iconFor(title: string): string {
  const t = title.toLowerCase();
  if (/overview|dashboard/.test(t)) return '📊';
  if (/list|listing|table|browse|search|grid/.test(t)) return '📋';
  if (/detail|profile|overview/.test(t)) return '📄';
  if (/chat|assistant|ask|conversation/.test(t)) return '💬';
  if (/score|scorecard|rank|rating/.test(t)) return '🎯';
  if (/research|data|insight|analytics|report/.test(t)) return '🔬';
  if (/map|geo|location/.test(t)) return '🗺️';
  if (/form|create|edit|new|onboard|settings/.test(t)) return '✍️';
  if (/kanban|board|pipeline/.test(t)) return '📌';
  if (/calendar|schedule|booking|reminder/.test(t)) return '📅';
  if (/document|file|pdf/.test(t)) return '🗂️';
  return '✨';
}

function pageHead(title: string, subtitle: string, actions: string): string {
  const sub = subtitle ? `<p class="page-sub">${escapeHtml(subtitle)}</p>` : '';
  const act = actions ? `<div class="head-actions">${actions}</div>` : '';
  return `<div class="page-head"><div><h1>${escapeHtml(title)}</h1>${sub}</div>${act}</div>`;
}

function feedItem(who: string, what: string, when: string): string {
  return `<div class="feed-item"><span class="feed-avatar">${escapeHtml(initials(who))}</span><div class="feed-body"><strong>${escapeHtml(who)}</strong> ${escapeHtml(what)}</div><span class="feed-time">${escapeHtml(when)}</span></div>`;
}

function activityFeed(plan: WebsitePlan, n: number): string {
  const names = ['Alex', 'Priya', 'Sam', 'Riley', 'Maya'];
  const verbs = ['updated', 'shipped', 'reviewed', 'created', 'closed'];
  const mins = [2, 14, 27, 41, 58];
  return plan.features.slice(0, n).map((f, i) => feedItem(
    names[i % names.length],
    `${verbs[i % verbs.length]} “${escapeHtml(shortTitle(f.title))}”`,
    `${mins[i % mins.length]} min ago`,
  )).join('');
}

function panel(title: string, hint: string, body: string): string {
  const hintHtml = hint ? `<span class="panel-hint">${escapeHtml(hint)}</span>` : '';
  return `<div class="panel"><div class="panel-head"><h3>${escapeHtml(title)}</h3>${hintHtml}</div>${body}</div>`;
}

/* ------------------------- Server-rendered static pages ------------------------- */

function dashboardPage(plan: WebsitePlan): string {
  const kpis = [
    `<div class="kpi"><div class="kpi-top"><span class="kpi-icon">🧩</span><span class="kpi-delta up">+12%</span></div><div class="kpi-value">${plan.features.length}</div><div class="kpi-label">Active modules</div></div>`,
    `<div class="kpi"><div class="kpi-top"><span class="kpi-icon">🖥️</span><span class="kpi-delta up">+3</span></div><div class="kpi-value">${plan.screens.length}</div><div class="kpi-label">Designed screens</div></div>`,
    `<div class="kpi"><div class="kpi-top"><span class="kpi-icon">🔌</span><span class="kpi-delta up">+8%</span></div><div class="kpi-value">${plan.endpoints.length}</div><div class="kpi-label">API endpoints</div></div>`,
    `<div class="kpi"><div class="kpi-top"><span class="kpi-icon">👥</span><span class="kpi-delta down">+2</span></div><div class="kpi-value">${plan.audiences.length}</div><div class="kpi-label">User personas</div></div>`,
  ].join('');

  const bars = plan.features.slice(0, 6).map((f, i) => {
    const w = 35 + ((i * 13) % 60);
    return `<div class="chart-row"><span class="chart-label">${escapeHtml(shortTitle(f.title))}</span><div class="chart-track"><div class="chart-bar" style="width:${w}%"></div></div><span class="chart-val">${w}%</span></div>`;
  }).join('');

  const rows = plan.features.slice(0, 8).map((f, i) => {
    const colors = ['green', 'blue', 'amber', 'violet', 'pink'];
    const statuses = ['Active', 'Completed', 'In review', 'Planned', 'Planned'];
    return `<tr><td><span class="avatar" style="background:${plan.primaryColor}1a;color:${plan.primaryColor}">${escapeHtml(initials(shortTitle(f.title)))}</span></td><td class="cell-title">${escapeHtml(shortTitle(f.title))}</td><td class="cell-muted">${escapeHtml(f.summary)}</td><td><span class="pill ${colors[i % 5]}">${statuses[i % 5]}</span></td><td><span class="score-badge" style="color:${plan.primaryColor};background:${plan.primaryColor}18">${80 + (i * 2) % 18}</span></td><td><span class="more">⋯</span></td></tr>`;
  }).join('');

  return `
    ${pageHead('Dashboard', `Welcome back — here is what is moving across ${escapeHtml(plan.projectName)}.`, '<button class="btn btn-ghost">Export</button><button class="btn btn-primary">+ New module</button>')}
    <div class="kpi-grid">${kpis}</div>
    <div class="dash-grid">
      ${panel('Module health', 'Last 30 days', `<div class="chart-block">${bars}</div>`)}
      ${panel('Recent activity', 'Live', `<div class="feed-list">${activityFeed(plan, 4)}</div>`)}
    </div>
    ${panel('Modules', 'Everything in this product', `<div class="table-wrap"><table><thead><tr><th></th><th>Module</th><th>Summary</th><th>Status</th><th>AI Score</th><th></th></tr></thead><tbody>${rows}</tbody></table><tfoot><tr><td colspan="6" class="table-foot">Showing ${Math.min(8, plan.features.length)} of ${plan.features.length} modules</td></tr></tfoot></div>`)}`;
}

function featuresPage(plan: WebsitePlan): string {
  const cards = plan.features.map((f) => `<div class="feature-card"><div class="feature-icon">${f.icon}</div><div class="feature-body"><h3>${escapeHtml(shortTitle(f.title))}</h3><p>${escapeHtml(f.summary)}</p></div><span class="link-arrow">→</span></div>`).join('');
  return `${pageHead('Features & modules', 'Everything this product covers across screens.', '')}<div class="feature-grid">${cards || '<div class="empty">No features captured</div>'}</div>`;
}

function usersPage(plan: WebsitePlan): string {
  const roles = ['Administrator', 'Editor', 'Viewer', 'Owner'];
  const rows = plan.audiences.map((a, i) => `<tr><td><span class="avatar" style="background:${plan.primaryColor}1a;color:${plan.primaryColor}">${escapeHtml(initials(a.name))}</span></td><td class="cell-title">${escapeHtml(a.name)}</td><td class="cell-muted">${escapeHtml(a.blurb)}</td><td><span class="pill ${['green', 'blue', 'amber', 'violet'][i % 4]}">${roles[i % 4]}</span></td><td><span class="more">⋯</span></td></tr>`).join('');
  return `${pageHead('Users & teams', 'Every persona and role in the product.', '<button class="btn btn-primary">+ Invite</button>')}
    ${panel('Team members', `${plan.audiences.length} people`, `<div class="table-wrap"><table><thead><tr><th></th><th>Name</th><th>Role / persona</th><th>Access</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`)}`;
}

function apiPage(plan: WebsitePlan): string {
  const slug = plan.projectName.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  const cards = plan.endpoints.map((e) => `<div class="api-card"><span class="method" style="background:${methodColor(e.method)}1a;color:${methodColor(e.method)}">${escapeHtml(e.method)}</span><div class="api-body"><code class="api-path">${escapeHtml(e.path)}</code><p class="cell-muted">${escapeHtml(e.summary)}</p></div></div>`).join('');
  return `${pageHead('API reference', 'Every endpoint this product exposes.', '<button class="btn btn-ghost">Export OAS</button>')}
    <div class="api-grid">${cards || '<div class="empty">No endpoints captured</div>'}</div>
    ${panel('Example request', '', `<pre><code>GET /v1/${escapeHtml(slug)}/items\\n  -H "Authorization: Bearer &lt;token&gt;"</code></pre>`)}`;
}

function dataPage(plan: WebsitePlan): string {
  const rows = plan.entities.map((e, i) => `<tr><td class="cell-title">${escapeHtml(e.title)}</td><td class="cell-muted">${escapeHtml(e.summary)}</td><td><span class="pill blue">Table</span></td><td><span class="pill green">Active</span></td></tr>`).join('');
  return `${pageHead('Data model', `Core tables backing ${escapeHtml(plan.projectName)}.`, '<button class="btn btn-ghost">Export</button>')}
    ${panel('Entities', `${plan.entities.length} tables`, `<div class="table-wrap"><table><thead><tr><th>Entity</th><th>Purpose</th><th>Type</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`)}`;
}

function securityPage(plan: WebsitePlan): string {
  const items = plan.securityHighlights.map((s) => `<div class="security-row"><span class="check"><span class="check-icon">✓</span></span><span>${escapeHtml(s)}</span><span class="pill green">Enabled</span></div>`).join('');
  const table = [['Threats rated', 'Low'], ['Data encryption', 'High'], ['Access review', 'Medium']].map((r) => `<tr><td class="cell-title">${r[0]}</td><td><span class="pill ${r[1] === 'Low' ? 'green' : r[1] === 'Medium' ? 'amber' : 'blue'}">${r[1]}</span></td></tr>`).join('');
  return `${pageHead('Security', 'Threat model and access controls.', '<span class="pill green">Secure</span>')}
    <div class="two-col">
      ${panel('Security controls', '', `<div class="security-list">${items}</div>`)}
      ${panel('Risk profile', '', `<div class="table-wrap"><table><thead><tr><th>Control</th><th>Severity</th></tr></thead><tbody>${table}</tbody></table></div>`)}
    </div>`;
}

function settingsPage(_plan: WebsitePlan): string {
  const tiles = [['Account', 'Your profile, email and password'], ['Notifications', 'Channels and preferences'], ['Team', 'Members and roles'], ['Billing', 'Plans and invoices'], ['API keys', 'Manage access tokens'], ['Security', 'Two-step login and sessions']];
  return `${pageHead('Settings', 'Configure your workspace.', '')}
    <div class="settings-grid">${tiles.map((t) => `<div class="setting-card"><div class="setting-icon">⚙️</div><div><strong>${t[0]}</strong><p class="cell-muted">${t[1]}</p></div><span class="link-arrow">→</span></div>`).join('')}</div>`;
}

function screensIndex(plan: WebsitePlan): string {
  const cards = plan.screens.map((s) => `<a class="screen-card" href="#/app/screen/${encodeURIComponent(s.id)}"><div class="screen-icon">${iconFor(s.title + ' ' + s.summary)}</div><div><strong>${escapeHtml(shortTitle(s.title))}</strong><p class="cell-muted">${escapeHtml(s.summary)}</p></div></a>`).join('');
  return `${pageHead('Screens', 'Every screen and workflow in the product.', '')}<div class="screen-grid">${cards || '<div class="empty">No screens captured</div>'}</div>`;
}

/* ----------------------------- Landing + auth pages ----------------------------- */

function landingPage(plan: WebsitePlan): string {
  const nav = `<header class="l-nav"><div class="container nav-inner"><span class="logo"><span class="logo-dot" style="background:${plan.primaryColor}"></span>${escapeHtml(plan.projectName)}</span><nav class="nav-links"><a href="#/app/features">Features</a><a href="#/app/screens">Product</a><a href="#/app/users">Customers</a><a class="btn btn-ghost" href="#/login">Sign in</a><a class="btn btn-primary" href="#/app">Open app</a></nav></div></header>`;

  const hero = `<section class="l-hero"><div class="container">
      <div class="hero-badge">✦ Concept preview <span class="dot">·</span> ${plan.features.length} features <span class="dot">·</span> ${plan.screens.length} screens</div>
      <h1 class="l-hero-title">${escapeHtml(plan.tagline)}</h1>
      <p class="hero-sub">${escapeHtml(plan.heroSubtitle || plan.description)}</p>
      <div class="hero-actions"><a class="btn btn-primary btn-lg" href="#/app">Get started <span class="arrow">→</span></a><a class="btn btn-ghost btn-lg" href="#/app/features">See all features</a></div>
      <p class="hero-trust">${plan.audiences.slice(0, 3).map((a) => escapeHtml(a.name)).join(' · ') || 'Trusted by teams'}</p>
    </div></section>`;

  const preview = `<section class="l-section"><div class="container"><div class="l-label">The product at a glance</div>
      <div class="mini-app">
        <div class="mini-top"><span class="mini-dot red"></span><span class="mini-dot yellow"></span><span class="mini-dot green"></span><span class="mini-addr">${escapeHtml(plan.projectName.toLowerCase().replace(/[^a-z0-9]+/gi, '-'))}.app</span></div>
        <div class="mini-body">
          <div class="mini-side">${plan.screens.slice(0, 5).map((s, i) => `<div class="mini-nav ${i === 0 ? 'active' : ''}">${iconFor(s.title + ' ' + s.summary)} ${escapeHtml(shortTitle(s.title))}</div>`).join('')}</div>
          <div class="mini-main">
            <div class="mini-kpis">${[72, 48, 91, 34].map((w) => `<div class="mkpi"><div class="mk-bar" style="width:${w}%"></div></div>`).join('')}</div>
            <div class="mini-chart"><div class="mini-chart-bars">${[45, 70, 58, 84, 62, 92, 76].map((h) => `<div class="mcb" style="height:${h}%"></div>`).join('')}</div></div>
            <div class="mini-table">${plan.features.slice(0, 3).map((f) => `<div class="mt-row"><span class="mt-dot" style="background:${plan.accentColor}"></span><span class="mt-text">${escapeHtml(shortTitle(f.title))}</span><span class="pill green">Active</span></div>`).join('')}</div>
          </div>
        </div>
      </div>
    </div></section>`;

  const features = `<section class="l-section"><div class="container"><div class="l-label">Everything you need</div>
      <h2 class="l-title">Built for ${escapeHtml(plan.projectName)}</h2>
      <div class="bento">${plan.features.slice(0, 6).map((f, i) => `<div class="bento-cell ${i === 0 ? 'span2' : ''}"><div class="bento-icon">${f.icon}</div><h3>${escapeHtml(shortTitle(f.title))}</h3><p>${escapeHtml(f.summary)}</p></div>`).join('')}</div>
    </div></section>`;

  const screens = `<section class="l-section alt"><div class="container"><div class="l-label">Every screen</div>
      <h2 class="l-title">A workflow for every job</h2>
      <div class="chip-strip">${plan.screens.slice(0, 8).map((s) => `<a class="chip" href="#/app/screen/${encodeURIComponent(s.id)}">${iconFor(s.title + ' ' + s.summary)} ${escapeHtml(shortTitle(s.title))}</a>`).join('')}</div>
    </div></section>`;

  const stats = `<section class="l-section"><div class="container"><div class="stat-grid">
      <div class="stat"><div class="stat-num">${plan.features.length}+</div><div class="stat-label">Features</div></div>
      <div class="stat"><div class="stat-num">${plan.screens.length}</div><div class="stat-label">Screens</div></div>
      <div class="stat"><div class="stat-num">${plan.endpoints.length}</div><div class="stat-label">Endpoints</div></div>
      <div class="stat"><div class="stat-num">${plan.techs.length}</div><div class="stat-label">Techs</div></div>
    </div></div></section>`;

  const testimonials = `<section class="l-section alt"><div class="container"><div class="l-label">Customers</div>
      <h2 class="l-title">Loved by the people who use it</h2>
      <div class="t-grid">${plan.audiences.slice(0, 3).map((a, i) => `<div class="t-card"><div class="stars">★★★★★</div><p>${escapeHtml(a.blurb)}</p><div class="t-author"><span class="t-avatar">${escapeHtml(initials(a.name))}</span><span><strong>${escapeHtml(a.name)}</strong><br /><em class="muted">${['Early adopter', 'Power user', 'Team lead'][i]}</em></span></div></div>`).join('')}</div>
    </div></section>`;

  const cta = `<section class="l-cta"><div class="container"><h2>Ready to build ${escapeHtml(plan.projectName)}?</h2><a class="btn btn-primary btn-lg" href="#/app">Open the app →</a></div></section>`;

  return `${nav}${hero}${preview}${features}${screens}${stats}${testimonials}${cta}
    <footer class="l-footer"><div class="container"><p>${escapeHtml(plan.projectName)} — concept preview · Generated by Crystallize</p></div></footer>`;
}

function loginPage(plan: WebsitePlan): string {
  return `<div class="auth-wrap"><div class="auth-card">
    <span class="logo"><span class="logo-dot" style="background:${plan.primaryColor}"></span>${escapeHtml(plan.projectName)}</span>
    <h1>Welcome back</h1>
    <p class="page-sub">Sign in to your workspace. This is a static preview.</p>
    <div class="form-field"><label>Email</label><input class="input" type="email" placeholder="you@company.com" /></div>
    <div class="form-field"><label>Password</label><input class="input" type="password" placeholder="Enter your password" /></div>
    <div class="form-row"><label class="check"><input type="checkbox" checked /><span>Remember me</span></label><a href="#/app">Forgot password?</a></div>
    <button class="btn btn-primary btn-block">Sign in</button>
    <p class="auth-foot">No account? <a href="#/app">Continue as guest</a></p>
  </div></div>`;
}

export function renderWebsite(plan: WebsitePlan): string {
  const pages: Record<string, string> = {
    dashboard: dashboardPage(plan),
    features: featuresPage(plan),
    screens: screensIndex(plan),
    users: usersPage(plan),
    api: apiPage(plan),
    data: dataPage(plan),
    security: securityPage(plan),
    settings: settingsPage(plan),
  };

  const landing = landingPage(plan);
  const login = loginPage(plan);

  const STYLE = `/* ---------- tokens ---------- */
  :root {
    --primary: ${plan.primaryColor};
    --accent: ${plan.accentColor};
    --bg: #f5f6fa; --surface: #ffffff; --surface2: #eef1f6;
    --text: #0f172a; --muted: #64748b; --border: #e4e7ee;
    --radius: 14px; --shadow: 0 1px 2px rgba(15,23,42,.05), 0 8px 24px -12px rgba(15,23,42,.12);
    --side: #0f172a; --side-text: #94a3b8;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0d1424; --surface: #131c2f; --surface2: #1a2540; --text: #e5e7eb; --muted: #94a3b8; --border: #22304d; }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; -webkit-font-smoothing: antialiased; }
  a { color: var(--primary); text-decoration: none; }
  .container { max-width: 1100px; margin: 0 auto; padding: 0 24px; }
  .muted { color: var(--muted); font-style: normal; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 999px; }

  /* buttons + inputs */
  .btn { display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px; border-radius: 10px; font-size: 13.5px; font-weight: 600; border: 1px solid transparent; cursor: pointer; transition: transform .1s, box-shadow .1s, background .1s; }
  .btn-primary { background: var(--primary); color: #fff; box-shadow: 0 8px 18px -8px color-mix(in srgb, var(--primary) 70%, transparent); }
  .btn-primary:hover { transform: translateY(-1px); }
  .btn-ghost { background: var(--surface); color: var(--text); border-color: var(--border); }
  .btn-ghost:hover { background: var(--surface2); }
  .btn-lg { padding: 12px 22px; font-size: 15px; }
  .btn-block { width: 100%; justify-content: center; }
  .btn .arrow { opacity: .7; }
  .input { width: 100%; padding: 9px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 13.5px; outline: none; transition: border-color .12s, box-shadow .12s; }
  .input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent); }
  select.input { appearance: auto; }
  .form-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
  .form-field label, .form-field > span.lbl { font-size: 12.5px; font-weight: 600; color: var(--muted); }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 20px; }
  @media (max-width: 700px) { .form-grid { grid-template-columns: 1fr; } }

  /* layout */
  .app-shell { display: flex; min-height: 100vh; }
  .sidebar { width: 240px; flex-shrink: 0; background: var(--side); color: var(--side-text); padding: 16px 12px; display: flex; flex-direction: column; gap: 4px; position: sticky; top: 0; height: 100vh; overflow-y: auto; }
  .side-logo { display: flex; align-items: center; gap: 9px; color: #f1f5f9; font-weight: 800; padding: 6px 8px 18px; font-size: 15px; }
  .nav-group { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: #475569; padding: 14px 8px 6px; }
  .nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 9px; color: var(--side-text); font-size: 13.5px; font-weight: 500; cursor: pointer; transition: background .1s, color .1s; }
  .nav-item:hover { background: rgba(255,255,255,.06); color: #f1f5f9; }
  .nav-item.active { background: rgba(255,255,255,.1); color: #fff; }
  .nav-sub { display: inline-flex; gap: 8px; align-items: center; padding: 7px 10px 7px 26px; border-radius: 9px; color: var(--side-text); font-size: 13px; cursor: pointer; }
  .nav-sub:hover { color: #e2e8f0; }
  .nav-sub.active { color: #fff; }
  .sidebar-foot { margin-top: auto; border-top: 1px solid rgba(255,255,255,.08); padding-top: 10px; }

  .app-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .topbar { height: 62px; display: flex; align-items: center; gap: 14px; padding: 0 22px; background: var(--surface); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 20; }
  .topbar-search { flex: 1; max-width: 420px; position: relative; }
  .topbar-search .input { padding-left: 34px; }
  .topbar-actions { display: flex; align-items: center; gap: 10px; margin-left: auto; }
  .icon-btn { width: 38px; height: 38px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); display: grid; place-items: center; cursor: pointer; position: relative; }
  .notif-dot { position: absolute; top: 8px; right: 9px; width: 7px; height: 7px; border-radius: 999px; background: var(--accent); }
  .topbar-user { display: flex; align-items: center; gap: 9px; padding: 5px 8px; border-radius: 10px; border: 1px solid var(--border); cursor: pointer; font-size: 13px; font-weight: 600; }
  .crumb { font-size: 13px; color: var(--muted); }

  .content { padding: 24px 26px 48px; flex: 1; }
  .page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
  .page-head h1 { font-size: 24px; font-weight: 800; letter-spacing: -.02em; }
  .page-sub { color: var(--muted); font-size: 14px; margin-top: 4px; max-width: 640px; }
  .head-actions { display: flex; gap: 8px; }

  /* KPI row */
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; margin-bottom: 20px; }
  .kpi { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow); }
  .kpi-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .kpi-icon { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; background: color-mix(in srgb, var(--primary) 12%, transparent); font-size: 16px; }
  .kpi-delta { font-size: 12px; font-weight: 700; padding: 3px 8px; border-radius: 999px; }
  .kpi-delta.up { color: #059669; background: #ecfdf5; }
  .kpi-delta.down { color: #d97706; background: #fffbeb; }
  .kpi-value { font-size: 26px; font-weight: 800; letter-spacing: -.02em; }
  .kpi-label { font-size: 12.5px; color: var(--muted); margin-top: 2px; }

  /* panels + grid */
  .panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); margin-bottom: 18px; overflow: hidden; }
  .panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 15px 18px; }
  .panel-head h3 { font-size: 15px; font-weight: 700; }
  .panel-hint { font-size: 12px; color: var(--muted); }
  .panel-body { padding: 0 18px 18px; }
  .dash-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; }
  @media (max-width: 900px) { .dash-grid { grid-template-columns: 1fr; } }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  @media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }

  /* charts */
  .chart-block { padding: 10px 18px 18px; display: flex; flex-direction: column; gap: 12px; }
  .chart-row { display: flex; align-items: center; gap: 12px; }
  .chart-label { width: 130px; font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chart-track { flex: 1; height: 8px; border-radius: 999px; background: var(--surface2); overflow: hidden; }
  .chart-bar { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--primary), var(--accent)); }
  .chart-val { font-size: 12px; color: var(--muted); width: 34px; text-align: right; }

  /* tables */
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  thead th { text-align: left; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); padding: 12px 18px; border-bottom: 1px solid var(--border); background: var(--surface); }
  tbody td { padding: 13px 18px; border-bottom: 1px solid var(--border); font-size: 13.5px; vertical-align: middle; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover { background: color-mix(in srgb, var(--primary) 4%, transparent); }
  .cell-title { font-weight: 600; }
  .cell-muted { color: var(--muted); font-size: 13px; }
  .table-foot { padding: 12px 18px; color: var(--muted); font-size: 12.5px; border-top: 1px solid var(--border); }

  /* badges / pills / avatars */
  .pill { display: inline-flex; align-items: center; font-size: 11.5px; font-weight: 700; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
  .pill.green { color: #047857; background: #d1fae5; } .pill.blue { color: #1d4ed8; background: #dbeafe; }
  .pill.amber { color: #b45309; background: #fef3c7; } .pill.violet { color: #6d28d9; background: #ede9fe; }
  .pill.pink { color: #be185d; background: #fce7f3; }
  .avatar { display: inline-grid; place-items: center; width: 32px; height: 32px; border-radius: 999px; font-size: 11.5px; font-weight: 700; flex-shrink: 0; }
  .score-badge { display: inline-grid; place-items: center; min-width: 36px; height: 26px; padding: 0 8px; border-radius: 8px; font-weight: 800; font-size: 13px; }
  .more { color: var(--muted); cursor: pointer; }

  /* feed */
  .feed-list { padding: 6px 18px 16px; display: flex; flex-direction: column; }
  .feed-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); }
  .feed-item:last-child { border-bottom: none; }
  .feed-avatar { width: 30px; height: 30px; border-radius: 8px; background: color-mix(in srgb, var(--primary) 12%, transparent); color: var(--primary); display: grid; place-items: center; font-size: 11px; font-weight: 700; }
  .feed-body { flex: 1; font-size: 13px; }
  .feed-body strong { font-weight: 600; }
  .feed-time { font-size: 11.5px; color: var(--muted); white-space: nowrap; }

  /* card grids */
  .feature-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
  .feature-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; box-shadow: var(--shadow); display: flex; gap: 14px; align-items: flex-start; }
  .feature-icon { font-size: 22px; width: 44px; height: 44px; border-radius: 11px; display: grid; place-items: center; background: color-mix(in srgb, var(--primary) 10%, transparent); }
  .feature-body h3 { font-size: 14.5px; font-weight: 700; margin-bottom: 4px; }
  .feature-body p { font-size: 13px; color: var(--muted); }
  .link-arrow { margin-left: auto; color: var(--muted); }

  .screen-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
  .screen-card { display: flex; gap: 12px; align-items: flex-start; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; box-shadow: var(--shadow); color: var(--text); transition: transform .1s, border-color .1s; }
  .screen-card:hover { transform: translateY(-2px); border-color: var(--primary); }
  .screen-card strong { font-size: 14px; display: block; margin-bottom: 4px; }
  .screen-icon { font-size: 20px; }

  .api-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; margin-bottom: 18px; }
  .api-card { display: flex; gap: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; box-shadow: var(--shadow); }
  .method { height: 24px; padding: 0 8px; display: inline-flex; align-items: center; border-radius: 6px; font-size: 11px; font-weight: 800; }
  .api-path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
  .api-body p { font-size: 12.5px; margin-top: 3px; }

  .entity-list { display: flex; flex-direction: column; }
  .entity-row { display: flex; gap: 12px; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--border); }
  .entity-row:last-child { border-bottom: none; }
  .entity-icon { width: 38px; height: 38px; border-radius: 9px; display: grid; place-items: center; background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .entity-row strong { font-size: 14px; }
  .entity-row .cell-muted { margin-top: 2px; }

  .security-list { padding: 6px 18px 14px; display: flex; flex-direction: column; }
  .security-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13.5px; }
  .security-row:last-child { border-bottom: none; }
  .security-row .pill { margin-left: auto; }
  .check { width: 20px; height: 20px; border-radius: 6px; background: color-mix(in srgb, var(--primary) 14%, transparent); display: grid; place-items: center; color: var(--primary); font-size: 12px; }
  .check-icon { font-weight: 800; }

  .settings-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
  .setting-card { display: flex; gap: 12px; align-items: center; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow); cursor: pointer; }
  .setting-card:hover { border-color: var(--primary); }
  .setting-icon { width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center; background: var(--surface2); font-size: 18px; }
  .setting-card strong { font-size: 14px; }
  .setting-card .cell-muted { font-size: 12.5px; }

  .empty { text-align: center; color: var(--muted); padding: 40px; }

  /* inline app widgets (built by the client-side router) */
  .filter-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
  .search { flex: 1; max-width: 320px; position: relative; }
  .search input { padding-left: 34px; }
  .filter-select { width: 150px; }

  .tabbar { display: flex; gap: 4px; border-bottom: 1px solid var(--border); padding: 0 14px; margin-bottom: 16px; }
  .tab { padding: 10px 14px; font-size: 13.5px; font-weight: 600; color: var(--muted); cursor: pointer; border-bottom: 2px solid transparent; }
  .tab.active { color: var(--primary); border-bottom-color: var(--primary); }
  .tab-pane { display: none; }
  .tab-pane.active { display: block; }

  .meta-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; margin-bottom: 18px; }
  .meta-item { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; }
  .meta-item .lbl { font-size: 11.5px; color: var(--muted); font-weight: 600; text-transform: uppercase; }
  .meta-item .val { font-size: 14.5px; font-weight: 700; margin-top: 3px; }

  /* kanban */
  .board { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
  .board-col { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; }
  .board-col-head { font-weight: 700; font-size: 13.5px; margin-bottom: 10px; display: flex; justify-content: space-between; }
  .board-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px; margin-bottom: 10px; box-shadow: var(--shadow); }
  .board-card h4 { font-size: 13px; margin-bottom: 4px; }
  .board-card p { font-size: 12px; color: var(--muted); }
  .board-card .row2 { display: flex; justify-content: space-between; margin-top: 8px; align-items: center; }

  /* calendar */
  .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
  .cal-day { min-height: 80px; border: 1px solid var(--border); border-radius: 10px; padding: 6px; background: var(--surface); font-size: 12px; }
  .cal-day.dull { opacity: .5; }
  .cal-day b { font-size: 12px; }
  .cal-event { margin-top: 4px; padding: 2px 6px; border-radius: 6px; font-size: 10.5px; background: color-mix(in srgb, var(--primary) 14%, transparent); color: var(--primary); }

  /* chat workspace */
  .chat-workspace { display: grid; grid-template-columns: 250px 1fr; min-height: 460px; }
  @media (max-width: 800px) { .chat-workspace { grid-template-columns: 1fr; } }
  .chat-side { border-right: 1px solid var(--border); padding: 14px; background: var(--surface); }
  .conv-item { display: flex; gap: 10px; align-items: center; padding: 9px; border-radius: 10px; cursor: pointer; }
  .conv-item.active, .conv-item:hover { background: color-mix(in srgb, var(--primary) 8%, transparent); }
  .conv-item .name { font-weight: 600; font-size: 13px; }
  .conv-item .msg { font-size: 12px; color: var(--muted); }
  .chat-main { display: flex; flex-direction: column; }
  .chat-thread { flex: 1; padding: 18px; display: flex; flex-direction: column; gap: 12px; min-height: 320px; max-height: 440px; overflow-y: auto; }
  .bubble { max-width: 78%; padding: 10px 13px; border-radius: 12px; font-size: 13.5px; line-height: 1.45; }
  .bubble.ai { background: var(--surface2); border: 1px solid var(--border); align-self: flex-start; }
  .bubble.user { background: var(--primary); color: #fff; align-self: flex-end; }
  .chat-composer { display: flex; gap: 10px; padding: 14px; border-top: 1px solid var(--border); }

  /* timeline */
  .timeline { padding: 6px 18px 14px; display: flex; flex-direction: column; }
  .tl-item { display: flex; gap: 12px; padding: 8px 0; position: relative; }
  .tl-dot { width: 10px; height: 10px; border-radius: 999px; background: var(--primary); margin-top: 5px; flex-shrink: 0; }
  .tl-item:not(:last-child) .tl-dot::after { content: ""; position: absolute; left: 4px; top: 18px; bottom: -8px; width: 2px; background: var(--border); }

  /* docs */
  .doc-row { display: flex; gap: 10px; align-items: center; padding: 11px 0; border-bottom: 1px solid var(--border); }
  .doc-row:last-child { border-bottom: none; }
  .doc-icon { width: 34px; height: 34px; border-radius: 8px; display: grid; place-items: center; background: var(--surface2); }
  .doc-row .name { font-size: 13.5px; font-weight: 600; }

  /* map */
  .map-panel { height: 260px; border-radius: 12px; background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 8%, var(--surface)), var(--surface)); border: 1px solid var(--border); position: relative; overflow: hidden; }
  .map-grid { position: absolute; inset: 0; background-image: linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px); background-size: 40px 40px; opacity: .5; }
  .map-pin { position: absolute; transform: translate(-50%, -50%); text-align: center; width: 60px; }
  .pin-dot { width: 14px; height: 14px; border-radius: 999px; display: block; margin: 0 auto 3px; border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,.2); }
  .map-pin em { font-style: normal; font-size: 11px; font-weight: 600; background: var(--surface); padding: 2px 6px; border-radius: 6px; border: 1px solid var(--border); }
  .map-legend { position: absolute; bottom: 10px; left: 12px; display: flex; gap: 12px; font-size: 11px; color: var(--muted); background: var(--surface); border: 1px solid var(--border); padding: 6px 10px; border-radius: 8px; }

  /* scorecard */
  .score-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; padding: 0 18px 18px; }
  .score-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px; display: flex; gap: 12px; align-items: center; }
  .score-ring { width: 56px; height: 56px; border-radius: 999px; display: grid; place-items: center; color: #fff; font-size: 18px; font-weight: 800; }
  .score-body h4 { font-size: 13px; }
  .score-body p { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .verdict { display: flex; gap: 12px; align-items: flex-start; margin: 0 18px 18px; padding: 14px; border-radius: 12px; background: color-mix(in srgb, var(--primary) 8%, transparent); border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent); }

  /* pagination */
  .pagination { display: flex; gap: 6px; padding: 14px 18px; align-items: center; }
  .page-btn { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; border: 1px solid var(--border); background: var(--surface); font-size: 12.5px; cursor: pointer; }
  .page-btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }

  /* landing */
  .l-nav { position: sticky; top: 0; z-index: 40; background: color-mix(in srgb, var(--bg) 85%, transparent); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); }
  .nav-inner { display: flex; align-items: center; justify-content: space-between; height: 62px; }
  .logo { display: inline-flex; align-items: center; gap: 9px; font-weight: 800; font-size: 16px; letter-spacing: -.01em; }
  .logo-dot { width: 12px; height: 12px; border-radius: 4px; display: inline-block; }
  .nav-links { display: flex; gap: 20px; align-items: center; font-size: 14px; font-weight: 500; }
  .nav-links a:not(.btn) { color: var(--muted); }
  .nav-links a:not(.btn):hover { color: var(--text); }
  .l-hero { padding: 84px 0; text-align: center; background: radial-gradient(900px 380px at 50% -10%, color-mix(in srgb, var(--primary) 18%, transparent), transparent 60%); }
  .hero-badge { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 600; color: var(--primary); background: color-mix(in srgb, var(--primary) 10%, transparent); padding: 6px 14px; border-radius: 999px; margin-bottom: 18px; }
  .hero-badge .dot { opacity: .5; }
  .l-hero-title { font-size: clamp(34px, 6vw, 58px); letter-spacing: -.03em; font-weight: 800; line-height: 1.05; max-width: 760px; margin: 0 auto; }
  .hero-sub { max-width: 620px; margin: 16px auto 24px; color: var(--muted); font-size: 17px; }
  .hero-actions { display: flex; gap: 12px; justify-content: center; }
  .hero-trust { margin-top: 18px; color: var(--muted); font-size: 13px; }
  .l-section { padding: 64px 0; }
  .l-section.alt { background: var(--surface); border-block: 1px solid var(--border); }
  .l-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--primary); margin-bottom: 8px; }
  .l-title { font-size: clamp(26px, 4vw, 34px); font-weight: 800; letter-spacing: -.02em; margin-bottom: 26px; }

  .mini-app { border: 1px solid var(--border); border-radius: 16px; overflow: hidden; background: var(--surface); box-shadow: 0 30px 70px -40px rgba(15,23,42,.4); text-align: left; }
  .mini-top { display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: var(--surface2); border-bottom: 1px solid var(--border); }
  .mini-dot { width: 11px; height: 11px; border-radius: 999px; }
  .mini-dot.red { background: #f87171; } .mini-dot.yellow { background: #fbbf24; } .mini-dot.green { background: #34d399; }
  .mini-addr { margin-left: 10px; font-size: 12px; color: var(--muted); background: var(--surface); border: 1px solid var(--border); padding: 3px 14px; border-radius: 999px; }
  .mini-body { display: flex; min-height: 340px; }
  .mini-side { width: 210px; border-right: 1px solid var(--border); padding: 14px 10px; background: var(--surface); display: flex; flex-direction: column; gap: 4px; }
  .mini-nav { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; font-size: 13px; color: var(--muted); }
  .mini-nav.active { background: color-mix(in srgb, var(--primary) 10%, transparent); color: var(--primary); font-weight: 600; }
  .mini-main { flex: 1; padding: 18px; display: flex; flex-direction: column; gap: 14px; background: var(--bg); }
  .mini-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .mk-p { height: 52px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); padding: 8px; display: flex; align-items: flex-end; }
  .mk-bar { height: 10px; border-radius: 6px; background: linear-gradient(90deg, var(--primary), var(--accent)); }
  .mini-chart { height: 120px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); padding: 12px; }
  .mini-chart-bars { display: flex; align-items: flex-end; gap: 8px; height: 100%; }
  .mcb { flex: 1; border-radius: 5px 5px 0 0; background: linear-gradient(180deg, var(--primary), var(--accent)); }
  .mini-table { display: flex; flex-direction: column; gap: 8px; }
  .mini-row { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); }
  .mt-dot { width: 9px; height: 9px; border-radius: 999px; }
  .mt-text { flex: 1; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .bento { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  @media (max-width: 900px) { .bento { grid-template-columns: 1fr; } }
  .bento-cell { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 22px; }
  .bento-cell.span2 { grid-column: span 2; }
  @media (max-width: 900px) { .bento-cell.span2 { grid-column: auto; } }
  .bento-icon { font-size: 24px; margin-bottom: 10px; }
  .bento-cell h3 { font-size: 15.5px; margin-bottom: 5px; }
  .bento-cell p { font-size: 13.5px; color: var(--muted); }
  .chip-strip { display: flex; flex-wrap: wrap; gap: 10px; }
  .chip { display: inline-flex; align-items: center; gap: 7px; padding: 10px 16px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); font-size: 13.5px; font-weight: 600; color: var(--text); }
  .chip:hover { border-color: var(--primary); }
  .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; text-align: center; }
  @media (max-width: 800px) { .stat-grid { grid-template-columns: repeat(2, 1fr); } }
  .stat-num { font-size: 40px; font-weight: 800; letter-spacing: -.03em; background: linear-gradient(120deg, var(--primary), var(--accent)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .stat-label { font-size: 14px; color: var(--muted); margin-top: 4px; }
  .t-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  @media (max-width: 900px) { .t-grid { grid-template-columns: 1fr; } }
  .t-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 22px; display: flex; flex-direction: column; gap: 10px; }
  .stars { color: #f59e0b; letter-spacing: 2px; }
  .t-card p { font-size: 13.5px; color: var(--text); }
  .t-author { display: flex; align-items: center; gap: 10px; margin-top: auto; }
  .t-avatar { width: 34px; height: 34px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); display: grid; place-items: center; font-weight: 800; font-size: 12px; }
  .t-author strong { font-size: 13.5px; }
  .l-cta { padding: 70px 0; text-align: center; background: radial-gradient(600px 260px at 50% 0%, color-mix(in srgb, var(--primary) 16%, transparent), transparent 65%); }
  .l-cta h2 { font-size: clamp(28px, 4vw, 40px); font-weight: 800; letter-spacing: -.02em; margin-bottom: 20px; }
  .l-footer { border-top: 1px solid var(--border); padding: 30px 0; font-size: 13px; color: var(--muted); }

  /* auth */
  .auth-wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: radial-gradient(700px 340px at 50% 0%, color-mix(in srgb, var(--primary) 14%, transparent), transparent 60%); }
  .auth-card { width: 100%; max-width: 380px; background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 30px; box-shadow: 0 24px 60px -30px rgba(15,23,42,.4); }
  .auth-card h1 { font-size: 24px; margin: 18px 0 4px; }
  .auth-card .form-field { margin-top: 14px; }
  .form-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; margin: 12px 0 16px; }
  .check { display: inline-flex; align-items: center; gap: 7px; color: var(--muted); font-size: 13px; }
  .auth-foot { font-size: 13px; color: var(--muted); text-align: center; margin-top: 16px; }

  @media print { .sidebar, .topbar { display: none; } }
`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(plan.projectName)} — Concept Preview</title>
<style>
${STYLE}
</style>
</head>
<body>
  <div id="root"></div>

  <script id="pages-data" type="application/json">${planJson({
    projectName: plan.projectName,
    pages,
    screens: plan.screens,
    primaryColor: plan.primaryColor,
    accentColor: plan.accentColor,
    landing,
    login,
    features: plan.features,
    audiences: plan.audiences,
    endpoints: plan.endpoints,
    entities: plan.entities,
    techs: plan.techs,
    securityHighlights: plan.securityHighlights,
  } as Record<string, unknown>)}</script>
  <script>
    (function () {
      var DATA = JSON.parse(document.getElementById('pages-data').textContent);
      var PAGES = DATA.pages;
      var SCREENS = DATA.screens || [];
      var PRIMARY = DATA.primaryColor;
      var ACCENT = DATA.accentColor;
      var FEATURES = DATA.features || [];
      var AUDIENCES = DATA.audiences || [];
      var ENTITIES = DATA.entities || [];
      var ENDPOINTS = DATA.endpoints || [];
      var TECHS = DATA.techs || [];
      var SECURITY = DATA.securityHighlights || [];

      function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }
      function shortTitle(t) { return String(t || '').replace(/^[A-Z]+[-\d]*\s*/i, '').trim() || t || ''; }
      function initials(n) { var p = String(n || '').trim().split(/\s+/); return ((p[0] && p[0][0] || '') + (p[1] && p[1][0] || '')).toUpperCase() || 'U'; }
      function scoreOf(i) { return Math.min(94, Math.max(58, 64 + ((i * 37) % 30))); }
      function statusOf(i) { var b = ['Active', 'In review', 'Completed', 'Planned', 'Blocked']; return b[i % b.length]; }
      function pillFor(st) { return st === 'Active' ? 'green' : st === 'Completed' ? 'blue' : st === 'In review' ? 'amber' : st === 'Planned' ? 'violet' : 'pink'; }

      // ---- Project-derived data (with sensible fallbacks) ----
      var PROPS = FEATURES.map(function (f, i) {
        return {
          name: shortTitle(f.title),
          sub: (AUDIENCES[i % Math.max(AUDIENCES.length, 1)] || { name: 'Workspace' }).name,
          type: 'Module',
          status: statusOf(i),
          score: scoreOf(i + 3),
          readiness: (64 + ((i * 5) % 30)) + '%',
          coverage: (60 + ((i * 6) % 35)) + '%',
          confidence: (70 + ((i * 4) % 25)) + '%',
          owner: ['Alex Chen', 'Priya Rao', 'Sam Ortiz', 'Riley Fox', 'Maya Iyer'][i % 5],
        };
      });
      var SCORE_DIMS = FEATURES.slice(0, 6).map(function (f, i) {
        return { key: shortTitle(f.title), v: scoreOf(i + 5), w: 'AI-assessed quality for this module' };
      });
      if (!SCORE_DIMS.length) {
        SCORE_DIMS = [
          { key: 'Usability', v: 89, w: 'Intuitive flows and clear navigation' },
          { key: 'Reliability', v: 91, w: 'Consistent behavior across modules' },
          { key: 'Performance', v: 82, w: 'Fast loads and efficient queries' },
          { key: 'Scalability', v: 78, w: 'Designed for more users and data' },
          { key: 'Security', v: 88, w: 'AuthN/Z and input validation' },
        ];
      }
      var DOCS = ENTITIES.map(function (e, i) {
        return { n: shortTitle(e.title) || e.title, t: 'Spec · ' + (i + 1), s: i % 2 ? 'Reviewed' : 'Active' };
      });
      if (!DOCS.length) {
        DOCS = [
          { n: 'Requirements Specification', t: 'Markdown · 24 pages', s: 'Active' },
          { n: 'API Contract', t: 'OpenAPI · 42 endpoints', s: 'Reviewed' },
          { n: 'Data Model & Schema', t: 'Spec · 18 entities', s: 'Active' },
        ];
      }
      var ACTIVITY = FEATURES.map(function (f, i) {
        return { who: ['Alex', 'Priya', 'Sam', 'Riley'][i % 4], what: 'updated ' + shortTitle(f.title), when: (i + 1) + 'h ago' };
      });
      if (!ACTIVITY.length) {
        ACTIVITY = [
          { who: 'Alex', what: 'refreshed module health scores', when: '12m ago' },
          { who: 'Priya', what: 'published a new API contract', when: '41m ago' },
        ];
      }

      /* ------------------------- app shell ------------------------- */

      function sidebarHtml() {
        var out = '<div class="side-logo"><span class="logo-dot" style="background:' + PRIMARY + '"></span>' + esc(DATA.projectName) + '</div>';
        out += '<div class="nav-group">Overview</div>';
        out += '<a class="nav-item" href="#/app" data-nav="dashboard">📊 Dashboard</a>';
        out += '<a class="nav-item" href="#/app/features" data-nav="features">✨ Features</a>';
        out += '<a class="nav-item" href="#/app/screens" data-nav="screens">🖥️ Screens</a>';
        if (SCREENS.length) {
          out += '<div class="nav-group">Workspaces</div>';
          var shown = Math.min(SCREENS.length, 8);
          for (var i = 0; i < shown; i++) {
            var s = SCREENS[i];
            out += '<a class="nav-sub" href="#/app/screen/' + encodeURIComponent(s.id) + '" data-nav="screen-' + s.id + '">' + iconOf(s.title + ' ' + s.summary) + ' ' + esc(shortTitle(s.title)) + '</a>';
          }
          if (SCREENS.length > shown) out += '<a class="nav-sub" href="#/app/screens">+ ' + (SCREENS.length - shown) + ' more</a>';
        }
        out += '<div class="nav-group">System</div>';
        out += '<a class="nav-item" href="#/app/users" data-nav="users">👥 Users</a>';
        out += '<a class="nav-item" href="#/app/api" data-nav="api">🔌 API reference</a>';
        out += '<a class="nav-item" href="#/app/data" data-nav="data">🗃️ Data model</a>';
        out += '<a class="nav-item" href="#/app/security" data-nav="security">🛡️ Security</a>';
        out += '<a class="nav-item" href="#/app/settings" data-nav="settings">⚙️ Settings</a>';
        out += '</div><div class="sidebar-foot"><a class="nav-item" href="#/login">↩ Sign out</a></div>';
        return out;
      }

      function iconOf(title) {
        var t = String(title || '').toLowerCase();
        if (/chat|assistant|ask|conversation/.test(t)) return '💬';
        if (/score|rank|rating/.test(t)) return '🎯';
        if (/map|geo|location/.test(t)) return '🗺️';
        if (/form|create|edit|new|onboard/.test(t)) return '✍️';
        if (/kanban|board|pipeline/.test(t)) return '📌';
        if (/calendar|schedule|booking/.test(t)) return '📅';
        if (/research|data|insight|report/.test(t)) return '🔬';
        if (/detail|profile/.test(t)) return '📄';
        if (/list|table|browse|search/.test(t)) return '📋';
        if (/document|file/.test(t)) return '🗂️';
        return '✨';
      }

      function shell(content, crumb) {
        var crumbHtml = crumb ? '<span class="crumb">' + crumb + '</span>' : '';
        return '<div class="app-shell"><aside class="sidebar">' + sidebarHtml() + '</aside><div class="app-main">' +
          '<header class="topbar">' + crumbHtml +
            '<div class="topbar-search"><input class="input" id="global-search" placeholder="Search ' + esc(DATA.projectName) + '…" /></div>' +
            '<div class="topbar-actions"><button class="icon-btn" id="notif-btn">🔔<span class="notif-dot"></span></button>' +
            '<div class="topbar-user"><span class="avatar" style="background:' + PRIMARY + ';color:#fff">' + initials(DATA.projectName) + '</span><span>' + esc(DATA.projectName) + '</span></div>' +
          '</div></header><main id="page" class="content">' + content + '</main></div></div>';
      }

      /* ------------------------- widget toolkit ------------------------- */

      function kpiRow(items) {
        var defaults = [
          ['Total modules', String(PROPS.length), '+12%', '🧩'],
          ['Avg AI score', String(Math.round(PROPS.reduce(function (a, p) { return a + p.score; }, 0) / Math.max(PROPS.length, 1))), '+4%', '🎯'],
          ['Screens', String(SCREENS.length), '+3', '🖥️'],
          ['Endpoints', String(ENDPOINTS.length), '+8%', '🔌'],
        ];
        var list = items || defaults;
        return '<div class="kpi-grid">' + list.map(function (k) {
          return '<div class="kpi"><div class="kpi-top"><span class="kpi-icon">' + k[3] + '</span><span class="kpi-delta up">' + esc(k[2]) + '</span></div><div class="kpi-value">' + esc(k[1]) + '</div><div class="kpi-label">' + esc(k[0]) + '</div></div>';
        }).join('') + '</div>';
      }

      function chartsRow() {
        var bars = PROPS.slice(0, 6).map(function (p, i) {
          var w = 35 + ((i * 13) % 60);
          return '<div class="chart-row"><span class="chart-label">' + esc(p.name) + '</span><div class="chart-track"><div class="chart-bar" style="width:' + w + '%"></div></div><span class="chart-val">' + w + '%</span></div>';
        }).join('');
        var donut = '<div class="score-ring" style="background:conic-gradient(' + PRIMARY + ' 0 74%, var(--border) 74% 100%);width:84px;height:84px;font-size:22px">74</div>';
        return '<div class="dash-grid">' +
          '<div class="panel"><div class="panel-head"><h3>Progress</h3><span class="panel-hint">Module health</span></div><div class="chart-block">' + bars + '</div></div>' +
          '<div class="panel"><div class="panel-head"><h3>Coverage</h3><span class="panel-hint">AI confidence</span></div><div class="panel-body" style="display:flex;align-items:center;gap:18px;padding:18px">' + donut + '<div><p style="font-size:13px;color:var(--muted)">Avg confidence across all modules is strong, with the majority above the 70 threshold.</p></div></div></div>' +
          '</div>';
      }

      function dataTable() {
        var rows = PROPS.map(function (p, i) {
          var color = p.score >= 85 ? '#10b981' : p.score >= 75 ? '#3b82f6' : p.score >= 65 ? '#f59e0b' : '#ef4444';
          return '<tr data-search="' + esc(p.name + ' ' + p.sub + ' ' + p.type + ' ' + p.owner) + '">' +
            '<td><span class="avatar" style="background:' + PRIMARY + '1a;color:' + PRIMARY + '">' + esc(initials(p.name)) + '</span></td>' +
            '<td class="cell-title">' + esc(p.name) + '<div class="cell-muted">' + esc(p.sub) + '</div></td>' +
            '<td><span class="score-badge" style="color:' + color + ';background:' + color + '18">' + p.score + '</span></td>' +
            '<td class="cell-muted">' + esc(p.readiness) + '</td>' +
            '<td class="cell-muted">' + esc(p.coverage) + '</td>' +
            '<td class="cell-muted">' + esc(p.owner) + '</td>' +
            '<td><span class="pill ' + pillFor(p.status) + '">' + esc(p.status) + '</span></td>' +
            '<td><span class="more">⋯</span></td></tr>';
        }).join('');
        return '<div class="panel"><div class="panel-head"><h3>' + esc('Modules') + '</h3><span class="panel-hint">' + PROPS.length + ' rows · live filter</span></div>' +
          '<div class="filter-row" style="padding:0 18px"><div class="search"><input class="input" id="prop-search" placeholder="Search rows…" /></div><select class="input filter-select"><option>All statuses</option><option>Active</option><option>In review</option><option>Completed</option></select><button class="btn btn-ghost">Export</button></div>' +
          '<div class="table-wrap"><table><thead><tr><th></th><th>Module</th><th>AI Score</th><th>Readiness</th><th>Coverage</th><th>Owner</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
          '<div class="pagination"><button class="page-btn active">1</button><button class="page-btn">2</button><button class="page-btn">3</button><span style="margin-left:auto;color:var(--muted);font-size:12.5px">Page 1 of 3</span></div></div>';
      }

      function formPanel() {
        return '<div class="panel"><div class="panel-head"><h3>New record</h3><span class="panel-hint">All fields are required</span></div><div class="panel-body">' +
          '<div class="form-grid">' +
            '<div class="form-field"><label>Name</label><input class="input" id="f-name" placeholder="Enter a name" /></div>' +
            '<div class="form-field"><label>Status</label><select class="input"><option>Active</option><option>In review</option><option>Planned</option></select></div>' +
            '<div class="form-field"><label>Owner</label><select class="input"><option>Alex Chen</option><option>Priya Rao</option><option>Sam Ortiz</option></select></div>' +
            '<div class="form-field"><label>Priority</label><select class="input"><option>High</option><option>Medium</option><option>Low</option></select></div>' +
            '<div class="form-field" style="grid-column:1 / -1"><label>Description</label><textarea class="input" rows="4" placeholder="Describe the record in detail…"></textarea></div>' +
            '<div class="form-field"><label>Due date</label><input class="input" type="date" /></div>' +
            '<div class="form-field"><label>Notify team</label><label class="check" style="margin-top:8px"><input type="checkbox" checked /><span>Send a notification on create</span></label></div>' +
          '</div>' +
          '<div class="form-actions" style="display:flex;gap:10px;justify-content:flex-end;margin-top:6px"><button class="btn btn-ghost">Cancel</button><button class="btn btn-primary" id="form-save">Save record</button></div>' +
          '<div id="form-ok" style="display:none;margin-top:12px;padding:12px;border-radius:10px;background:#ecfdf5;color:#047857;font-size:13.5px;border:1px solid #a7f3d0">✓ Saved! This demo captured your inputs locally.</div>' +
        '</div></div>';
      }

      function chatPanel(title) {
        return '<div class="panel"><div class="panel-head"><h3>💬 ' + esc(title || 'AI Assistant') + '</h3><span class="panel-hint">Ask about this module</span></div>' +
          '<div class="chat-thread" id="chat-thread" style="min-height:220px">' +
            '<div class="bubble ai">Hello! Ask me anything about this module — I can summarize requirements, flag gaps, or suggest next steps.</div>' +
            '<div class="bubble ai">For example, try asking about the highest-scoring modules or what needs attention.</div>' +
          '</div>' +
          '<div class="chat-composer"><input class="input" id="chat-input" placeholder="Type a message…" /><button class="btn btn-primary" id="chat-send">Send</button></div></div>';
      }

      function chatWorkspace() {
        var convs = (FEATURES.slice(0, 5).length ? FEATURES.slice(0, 5) : [0, 1, 2, 3, 4]).map(function (f, i) {
          var nm = f.title ? shortTitle(f.title) : 'Conversation ' + (i + 1);
          var nm2 = f.summary ? f.summary : 'Recent messages from the team.';
          return '<div class="conv-item ' + (i === 0 ? 'active' : '') + '"><span class="avatar" style="background:' + (i % 2 ? PRIMARY : ACCENT) + ';color:#fff">' + esc(initials(nm)) + '</span><div><div class="name">' + esc(nm) + '</div><div class="msg">' + esc(nm2.slice(0, 40)) + '</div></div></div>';
        }).join('');
        return '<div class="panel"><div class="chat-workspace"><div class="chat-side">' + convs + '</div>' +
          '<div class="chat-main"><div class="chat-thread" id="chat-thread" style="min-height:320px">' +
            '<div class="bubble ai">Welcome! This is a live chat workspace. Type a message and press send — the reply is simulated.</div>' +
            '<div class="bubble user">Show me the top modules</div>' +
            '<div class="bubble ai">Sure — ' + (PROPS[0] ? esc(PROPS[0].name) : 'the leading module') + ' leads with a score of ' + (PROPS[0] ? PROPS[0].score : '—') + '.</div>' +
          '</div><div class="chat-composer"><input class="input" id="chat-input" placeholder="Type a message…" /><button class="btn btn-primary" id="chat-send">Send</button></div></div></div></div>';
      }

      function scorePanel() {
        var cards = SCORE_DIMS.map(function (d) {
          var color = d.v >= 85 ? '#10b981' : d.v >= 75 ? '#3b82f6' : d.v >= 65 ? '#f59e0b' : '#ef4444';
          return '<div class="score-card"><div class="score-ring" style="background:conic-gradient(' + color + ' 0 ' + d.v + '%, var(--border) ' + d.v + '% 100%)">' + d.v + '</div><div class="score-body"><h4>' + esc(d.key) + '</h4><p>' + esc(d.w) + '</p><span class="pill ' + (d.v >= 85 ? 'green' : d.v >= 75 ? 'blue' : d.v >= 65 ? 'amber' : 'pink') + '">' + (d.v >= 85 ? 'High' : d.v >= 75 ? 'Good' : d.v >= 65 ? 'Watch' : 'Risk') + '</span></div></div>';
        }).join('');
        var best = SCORE_DIMS[0] ? SCORE_DIMS[0] : { key: 'Quality', v: 87 };
        return '<div class="panel"><div class="panel-head"><h3>🎯 AI scorecard</h3><span class="panel-hint">Explainable, per dimension</span></div><div class="score-grid">' + cards + '</div>' +
          '<div class="verdict"><span style="font-size:22px">🧠</span><div><strong>Insight:</strong> ' + esc(best.key) + ' scores ' + best.v + '/100 — the strongest signal in this workspace. Lower-scoring areas need deeper specification before build-out.</div></div></div>';
      }

      function rankedTable() {
        var sorted = PROPS.slice().sort(function (a, b) { return b.score - a.score; });
        var rows = sorted.map(function (p) {
          var color = p.score >= 85 ? '#10b981' : p.score >= 75 ? '#3b82f6' : '#f59e0b';
          return '<div class="chart-row" style="padding:9px 18px"><span class="chart-label">' + esc(p.name) + '</span><div class="chart-track"><div class="chart-bar" style="width:' + p.score + '%;background:' + color + '"></div></div><span class="chart-val">' + p.score + '</span></div>';
        }).join('');
        return '<div class="panel"><div class="panel-head"><h3>Ranking</h3><span class="panel-hint">Sorted by AI score</span></div>' + rows + '</div>';
      }

      function kanbanPanel() {
        var cols = [['To do', 0], ['In progress', 1], ['In review', 2], ['Done', 3]];
        return '<div class="board">' + cols.map(function (c) {
          var items = FEATURES.length ? FEATURES : [0, 1, 2, 3];
          var cards = items.filter(function (f, i) { return i % 4 === c[1]; }).map(function (f, i) {
            var nm = f.title ? shortTitle(f.title) : 'Item ' + (i + 1);
            var sm = f.summary ? f.summary : 'Details for this card.';
            return '<div class="board-card"><h4>' + esc(nm) + '</h4><p>' + esc(sm.slice(0, 60)) + '</p><div class="row2"><span class="avatar" style="background:' + (i % 2 ? PRIMARY : ACCENT) + ';color:#fff">' + esc(initials(nm)) + '</span><span class="pill ' + (c[1] === 3 ? 'green' : c[1] === 2 ? 'amber' : 'blue') + '">' + c[0] + '</span></div></div>';
          }).join('') || '<div class="empty">No cards</div>';
          return '<div class="board-col"><div class="board-col-head">' + c[0] + '<span class="pill blue">' + (items.filter(function (f, i) { return i % 4 === c[1]; }).length) + '</span></div>' + cards + '</div>';
        }).join('') + '</div>';
      }

      function calendarPanel() {
        var days = [];
        for (var i = 1; i <= 28; i++) days.push(i);
        var events = [6, 12, 18, 23, 27];
        return '<div class="cal-grid">' + days.map(function (d) {
          var has = events.indexOf(d) >= 0;
          var f = FEATURES[(d - 1) % Math.max(FEATURES.length, 1)];
          var label = f ? shortTitle(f.title).slice(0, 12) : '';
          return '<div class="cal-day' + (d % 7 === 0 ? ' dull' : '') + '"><b>' + d + '</b>' + (has && label ? '<div class="cal-event">' + esc(label) + '</div>' : '') + '</div>';
        }).join('') + '</div>';
      }

      function timelinePanel() {
        var items = ACTIVITY.map(function (a) {
          return '<div class="tl-item"><span class="tl-dot"></span><div><p style="font-size:13.5px"><strong>' + esc(a.who) + '</strong> ' + esc(a.what) + '</p><span class="cell-muted" style="font-size:12px">' + esc(a.when) + '</span></div></div>';
        }).join('');
        return '<div class="panel"><div class="panel-head"><h3>🕐 Timeline</h3><span class="panel-hint">Recent activity</span></div><div class="timeline">' + items + '</div></div>';
      }

      function docsPanel() {
        var rows = DOCS.map(function (d) {
          return '<div class="doc-row"><span class="doc-icon">📄</span><div style="flex:1"><div class="name">' + esc(d.n) + '</div><div class="cell-muted" style="font-size:12px">' + esc(d.t) + '</div></div><span class="pill ' + (d.s === 'Active' ? 'green' : 'blue') + '">' + esc(d.s) + '</span><span class="more">↓</span></div>';
        }).join('');
        return '<div class="panel"><div class="panel-head"><h3>🗂️ Documents</h3><span class="panel-hint">AI extracted</span></div><div style="padding:0 18px 14px">' + rows + '</div></div>';
      }

      function mapPanel() {
        var pins = [[38, 34], [66, 58], [22, 66]].map(function (pos, i) {
          var nm = PROPS[i] ? shortTitle(PROPS[i].name) : 'Area ' + (i + 1);
          var col = i === 1 ? 'var(--accent)' : i === 2 ? '#10b981' : 'var(--primary)';
          return '<div class="map-pin" style="left:' + pos[0] + '%;top:' + pos[1] + '%"><span class="pin-dot" style="background:' + col + '"></span><em>' + esc(nm) + '</em></div>';
        }).join('');
        return '<div class="panel"><div class="panel-head"><h3>🗺️ Map</h3><span class="panel-hint">Geospatial view</span></div><div class="panel-body"><div class="map-panel"><div class="map-grid"></div>' + pins + '<div class="map-legend"><span>● High</span><span>● Medium</span><span>● Low</span></div></div></div></div>';
      }

      function metaGrid() {
        var meta = [['Status', 'Active'], ['Owner', 'Alex Chen'], ['Priority', 'High'], ['Updated', '2h ago'], ['Coverage', '86%'], ['Score', '87']];
        return '<div class="meta-grid">' + meta.map(function (m) {
          return '<div class="meta-item"><div class="lbl">' + m[0] + '</div><div class="val">' + m[1] + '</div></div>';
        }).join('') + '</div>';
      }

      function tabsPanel(tabs) {
        return '<div class="tabbar">' + tabs.map(function (t, i) { return '<div class="tab ' + (i === 0 ? 'active' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</div>'; }).join('') + '</div>' +
          tabs.map(function (t, i) { return '<div class="tab-pane ' + (i === 0 ? 'active' : '') + '" data-pane="' + t[0] + '">' + t[2] + '</div>'; }).join('');
      }

      /* ------------------------- screen composer ------------------------- */

      function buildScreen(s) {
        var w = s.widgets || [];
        var t = (s.title + ' ' + s.summary).toLowerCase();
        var out = '';

        // header
        out += '<div class="page-head"><div><h1>' + esc(shortTitle(s.title)) + '</h1><p class="page-sub">' + esc(s.summary) + '</p></div>' +
          '<div class="head-actions"><button class="btn btn-ghost">Export</button><button class="btn btn-primary">+ New</button></div></div>';

        if (w.indexOf('kanban') >= 0 || /kanban|board|pipeline/.test(t)) {
          out += kpiRow();
          out += '<div class="panel"><div class="panel-head"><h3>📌 Board</h3><span class="panel-hint">Drag to move cards (visual demo)</span></div><div class="panel-body">' + kanbanPanel() + '</div></div>';
          out += timelinePanel();
          return out;
        }
        if (w.indexOf('calendar') >= 0 || /calendar|schedule|booking|reminder/.test(t)) {
          out += kpiRow();
          out += '<div class="panel"><div class="panel-head"><h3>📅 Schedule</h3><span class="panel-hint">Upcoming events</span></div><div class="panel-body">' + calendarPanel() + '</div></div>';
          out += '<div class="dash-grid">' + formPanel() + timelinePanel() + '</div>';
          return out;
        }
        if (w.indexOf('form') >= 0 || /create|edit|new record|onboard|settings/.test(t)) {
          out += '<div class="two-col">' + formPanel() + metaGrid() + '</div>';
          out += timelinePanel();
          return out;
        }
        if (w.indexOf('chat') >= 0 && w.indexOf('table') < 0 && w.indexOf('scores') < 0) {
          out += kpiRow();
          out += chatWorkspace();
          return out;
        }
        if (w.indexOf('map') >= 0) {
          out += metaGrid();
          out += mapPanel();
          out += '<div class="panel"><div class="panel-head"><h3>📁 Overview</h3></div><div class="panel-body">' +
            tabsPanel([
              ['overview', 'Overview', '<p class="cell-muted">' + esc(s.summary) + '</p><div class="kpi-grid" style="margin-top:12px">' + (kpiRow().replace('kpi-grid', 'kpi-grid')) + '</div>'],
              ['docs', 'Documents', docsPanel().replace('<div class="panel">', '<div>')],
              ['timeline', 'Activity', timelinePanel().replace('<div class="panel">', '<div>')],
            ]) + '</div></div>';
          out += chatPanel(s.title);
          return out;
        }
        if (w.indexOf('documents') >= 0 || /document|file/.test(t)) {
          out += '<div class="dash-grid">' + docsPanel() + timelinePanel() + '</div>';
          out += chatPanel(s.title);
          return out;
        }
        if (w.indexOf('table') >= 0 || w.indexOf('filters') >= 0 || /list|table|browse|search/.test(t)) {
          out += kpiRow();
          if (w.indexOf('scores') >= 0 || /score|rank|rating/.test(t)) out += scorePanel();
          out += dataTable();
          out += '<div class="dash-grid">' + chartsRow() + timelinePanel() + '</div>';
          return out;
        }

        if (w.indexOf('scores') >= 0 || /score|rank|rating/.test(t)) {
          out += kpiRow();
          out += scorePanel();
          out += rankedTable();
          return out;
        }
        // default rich overview
        out += kpiRow();
        out += chartsRow();
        out += dataTable();
        out += timelinePanel();
        return out;
      }

      /* ------------------------- interactions ------------------------- */

      function bindInteractions() {
        var box = document.getElementById('prop-search');
        if (box) {
          box.addEventListener('input', function () {
            var q = box.value.toLowerCase();
            document.querySelectorAll('#page tbody tr').forEach(function (tr) {
              tr.style.display = (tr.getAttribute('data-search') || '').toLowerCase().indexOf(q) >= 0 ? '' : 'none';
            });
          });
        }
        // tabs
        document.querySelectorAll('#page .tab').forEach(function (tab) {
          tab.addEventListener('click', function () {
            var key = tab.getAttribute('data-tab');
            document.querySelectorAll('#page .tab').forEach(function (t2) { t2.classList.remove('active'); });
            document.querySelectorAll('#page .tab-pane').forEach(function (p) { p.classList.remove('active'); });
            tab.classList.add('active');
            var pane = document.querySelector('#page .tab-pane[data-pane="' + key + '"]');
            if (pane) pane.classList.add('active');
          });
        });
        // chat
        var chatInput = document.getElementById('chat-input');
        var sendBtn = document.getElementById('chat-send');
        function reply() {
          if (!chatInput || !chatInput.value.trim()) return;
          var thread = document.getElementById('chat-thread');
          if (!thread) return;
          var q = chatInput.value;
          thread.insertAdjacentHTML('beforeend', '<div class="bubble user">' + esc(q) + '</div>');
          chatInput.value = '';
          thread.scrollTop = thread.scrollHeight;
          setTimeout(function () {
            thread.insertAdjacentHTML('beforeend', '<div class="bubble ai">Thanks — I captured that. In the real system this would be answered with your project context.</div>');
            thread.scrollTop = thread.scrollHeight;
          }, 600);
        }
        if (sendBtn) sendBtn.addEventListener('click', reply);
        if (chatInput) chatInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') reply(); });
        // form save
        var save = document.getElementById('form-save');
        if (save) {
          save.addEventListener('click', function () {
            var ok = document.getElementById('form-ok');
            if (ok) ok.style.display = 'block';
          });
        }
        // global search (filters the active table too)
        var gs = document.getElementById('global-search');
        if (gs && box !== gs) {
          gs.addEventListener('input', function () {
            var q = gs.value.toLowerCase();
            document.querySelectorAll('#page tbody tr').forEach(function (tr) {
              tr.style.display = (tr.getAttribute('data-search') || '').toLowerCase().indexOf(q) >= 0 ? '' : 'none';
            });
          });
        }
        // notifications
        var nb = document.getElementById('notif-btn');
        if (nb) nb.addEventListener('click', function () { nb.textContent = nb.textContent.replace('🔔', '🔕'); });
      }

      function highlightNav(active) {
        setTimeout(function () {
          var els = document.querySelectorAll('[data-nav]');
          for (var i = 0; i < els.length; i++) els[i].classList.toggle('active', els[i].getAttribute('data-nav') === active);
        }, 0);
      }

      function render(hash) {
        var h = (hash || '').replace(/^#\\/?/, '');
        var parts = h.split('/').filter(Boolean);
        var root = document.getElementById('root');
        if (!root) return;
        if (parts.length === 0 || (parts[0] === 'app' && !parts[1])) {
          root.innerHTML = DATA.landing;
          if (parts[0] === 'app') {
            root.innerHTML = shell(PAGES.dashboard || '', 'Dashboard');
            highlightNav('dashboard');
          }
          return;
        }
        if (parts[0] === 'login') { root.innerHTML = DATA.login; return; }
        if (parts[0] === 'app') {
          var page = parts[1];
          if (page === 'screen') {
            var id = decodeURIComponent(parts[2] || '');
            var s = null;
            for (var i = 0; i < SCREENS.length; i++) if (SCREENS[i].id === id) s = SCREENS[i];
            if (s) {
              root.innerHTML = shell(buildScreen(s), shortTitle(s.title));
              highlightNav('screen-' + id);
              setTimeout(bindInteractions, 0);
            } else {
              root.innerHTML = shell('<div class="empty"><span style="font-size:30px">🤔</span><p>Screen not found</p></div>', 'Screens');
            }
            return;
          }
          if (PAGES[page]) {
            root.innerHTML = shell(PAGES[page], page === 'dashboard' ? 'Dashboard' : page.replace(/-/g, ' '));
            highlightNav(page);
            setTimeout(bindInteractions, 0);
            return;
          }
          root.innerHTML = shell(PAGES.dashboard || '', 'Dashboard');
          highlightNav('dashboard');
          setTimeout(bindInteractions, 0);
          return;
        }
        root.innerHTML = DATA.landing;
      }

      window.addEventListener('hashchange', function () { render(window.location.hash); });
      render(window.location.hash || '#/');
    })();
  </script>
</body>
</html>`;
}
