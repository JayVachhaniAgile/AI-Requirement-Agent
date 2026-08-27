import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Document, Project } from '../database/entities';
import { renderMarkdown } from './markdown-renderer';
import { planFromPrompt } from './website-plan';
import { renderWebsite } from './website-renderer';

/** Artifact types that can be rendered as standalone HTML pages. */
export const ARTIFACT_DOCUMENT_TYPES = ['BUILD_PROMPT_DOCUMENT'] as const;

export interface ArtifactSummary {
  id: string;
  projectId: string;
  projectName: string;
  documentType: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
  /** Same document rendered as a clickable static website (concept preview). */
  websiteUrl: string;
}

@Injectable()
export class ArtifactsService {
  constructor(
    @InjectRepository(Document) private readonly docRepo: Repository<Document>,
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
  ) {}

  /**
   * List all generated artifacts (documents of artifact types) across
   * projects, newest first. Each artifact exposes an htmlUrl that loads the
   * standalone rendered HTML page.
   */
  async listArtifacts(): Promise<ArtifactSummary[]> {
    const docs = await this.docRepo.find({
      where: { documentType: ARTIFACT_DOCUMENT_TYPES[0] },
      order: { updatedAt: 'DESC' },
    });
    if (docs.length === 0) return [];

    const projectIds = [...new Set(docs.map((d) => d.projectId))];
    const projects = await this.projectRepo
      .createQueryBuilder('p')
      .select(['p.id', 'p.name'])
      .where('p.id IN (:...ids)', { ids: projectIds })
      .getMany();
    const projectMap = new Map(projects.map((p) => [p.id, p.name]));

    return docs.map((doc) => ({
      id: doc.id,
      projectId: doc.projectId,
      projectName: projectMap.get(doc.projectId) ?? 'Unknown project',
      documentType: doc.documentType,
      title: this.artifactTitle(doc),
      status: doc.status,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      // Cache-buster: regeneration changes updatedAt, so the browser always
      // fetches fresh HTML instead of a stale cached artifact page.
      htmlUrl: `/api/artifacts/${doc.id}/html?v=${doc.updatedAt.getTime()}`,
      websiteUrl: `/api/artifacts/${doc.id}/html?mode=website&v=${doc.updatedAt.getTime()}`,
    }));
  }

  /**
   * Render a standalone, self-contained HTML page for an artifact document.
   * The markdown is converted to safe HTML server-side and embedded in a
   * printable page with no external dependencies.
   */
  async renderArtifactHtml(artifactId: string, mode: 'document' | 'website' = 'document'): Promise<string> {
    const doc = await this.docRepo.findOne({ where: { id: artifactId } });
    if (!doc) throw new NotFoundException(`Artifact ${artifactId} not found`);
    if (!doc.markdownContent) {
      throw new NotFoundException(`Artifact ${artifactId} has no content`);
    }

    const project = await this.projectRepo.findOne({ where: { id: doc.projectId } });
    const projectName = project?.name ?? 'Crystallize';

    // Website mode: derive a clickable static concept-preview site from the
    // build prompt (project name, features, audiences, stack, security).
    if (mode === 'website') {
      const plan = planFromPrompt(projectName, doc.markdownContent);
      return renderWebsite(plan);
    }

    const body = renderMarkdown(doc.markdownContent, { externalLinksNewTab: true });
    const title = this.artifactTitle(doc);

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — ${escapeHtml(projectName)}</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      line-height: 1.65;
      color: #1f2937;
      background: #f8fafc;
    }
    header {
      background: #0f172a;
      color: #e2e8f0;
      padding: 28px 40px;
    }
    header h1 { margin: 0; font-size: 22px; letter-spacing: 0.02em; }
    header p { margin: 6px 0 0; font-size: 13px; color: #94a3b8; }
    main {
      max-width: 960px;
      margin: 0 auto;
      padding: 40px 40px 80px;
      background: #ffffff;
      min-height: 70vh;
    }
    h1, h2, h3, h4, h5, h6 { line-height: 1.3; margin: 1.6em 0 0.6em; }
    h1 { font-size: 26px; } h2 { font-size: 21px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
    h3 { font-size: 17px; } h4 { font-size: 15px; }
    p { margin: 0.7em 0; }
    a { color: #2563eb; }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.9em;
      background: #f1f5f9;
      padding: 0.15em 0.35em;
      border-radius: 4px;
    }
    pre {
      background: #0f172a;
      color: #e2e8f0;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 1em 0;
    }
    pre code { background: transparent; color: inherit; padding: 0; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 14px; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
    th { background: #f8fafc; font-weight: 600; }
    blockquote {
      margin: 1em 0;
      padding: 4px 16px;
      border-left: 4px solid #cbd5e1;
      color: #475569;
      background: #f8fafc;
    }
    hr { border: 0; border-top: 1px solid #e5e7eb; margin: 2em 0; }
    ul, ol { padding-left: 1.6em; }
    img { max-width: 100%; height: auto; }
    @media print {
      header { background: #fff; color: #000; border-bottom: 1px solid #ccc; }
      body { background: #fff; }
    }
    @media (prefers-color-scheme: dark) {
      body { background: #0f172a; color: #e2e8f0; }
      main { background: #111827; }
      h2 { border-bottom-color: #1f2937; }
      th, td { border-color: #1f2937; }
      th { background: #1f2937; }
      blockquote { background: #1e293b; border-left-color: #475569; color: #cbd5e1; }
      code { background: #1e293b; }
      a { color: #60a5fa; }
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(projectName)} · Generated by Crystallize</p>
  </header>
  <main>
    ${body}
  </main>
</body>
</html>`;
  }

  private artifactTitle(doc: Document): string {
    if (doc.documentType === 'BUILD_PROMPT_DOCUMENT') {
      return 'Development Build Prompt';
    }
    return doc.documentType.replace(/_/g, ' ').toLowerCase();
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
