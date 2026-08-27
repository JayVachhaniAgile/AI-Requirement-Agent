import { definePrompt } from '../../template.types';
import {
  SOW_CHUNK_PROMPT,
  SOW_MERGE_PROMPT,
  SOW_DOCUMENT_PROMPT,
} from '../../../agents/document.prompts';

/** Chunk pass: one feature chunk (reproduces the original SOW chunk user prompt). */
function renderChunkUser(vars: Record<string, unknown>): string {
  const projectName = String(vars.projectName ?? '');
  const idea = String(vars.idea ?? '');
  const modules = String(vars.sowModules ?? '');
  const features = String(vars.sowFeatures ?? '');
  const assumptions = String(vars.sowAssumptions ?? '');
  const requiredSourceIds = String(vars.sowRequiredSourceIds ?? '');
  return `Project: ${projectName}\n\nOriginal Idea:\n${idea}\n\nModules:\n${modules}\n\nFeatures:\n${features}\n\nDiscovery Assumptions & Confirmed Facts:\n${assumptions}\n\nRequired Source IDs:\n${requiredSourceIds}\n\n${SOW_CHUNK_PROMPT}`;
}

/** Merge pass: assemble chunk outputs (reproduces the original SOW merge prompt). */
function renderMergeUser(vars: Record<string, unknown>): string {
  const projectName = String(vars.projectName ?? '');
  const idea = String(vars.idea ?? '');
  const requiredSourceIds = String(vars.sowRequiredSourceIds ?? '');
  const modules = String(vars.sowModules ?? '');
  const assumptions = String(vars.sowAssumptions ?? '');
  const draftEntries = String(vars.sowDraftEntries ?? '');
  return `Project: ${projectName}\n\nOriginal Idea:\n${idea}\n\nRequired Source IDs:\n${requiredSourceIds}\n\nModules:\n${modules}\n\nDiscovery Assumptions & Confirmed Facts:\n${assumptions}\n\nDraft Feature Entries:\n${draftEntries}\n\n${SOW_MERGE_PROMPT}`;
}

/** Single-pass SOW generation (no chunking). */
function renderSowUser(vars: Record<string, unknown>): string {
  const projectName = String(vars.projectName ?? '');
  const idea = String(vars.idea ?? '');
  const modules = String(vars.sowModules ?? '');
  const features = String(vars.sowFeatures ?? '');
  const assumptions = String(vars.sowAssumptions ?? '');
  const requiredSourceIds = String(vars.sowRequiredSourceIds ?? '');
  return `Project: ${projectName}\n\nOriginal Idea:\n${idea}\n\nModules:\n${modules}\n\nFeatures:\n${features}\n\nDiscovery Assumptions & Confirmed Facts:\n${assumptions}\n\nRequired Source IDs:\n${requiredSourceIds}\n\n${SOW_DOCUMENT_PROMPT}`;
}

export const sowChunkTemplate = definePrompt({
  key: 'document:sow-chunk',
  kind: 'document',
  description: 'SOW document generator — feature chunk pass.',
  system: ['@block:enterprise.global', SOW_CHUNK_PROMPT],
  user: renderChunkUser,
  variables: {
    projectName: { type: 'string', required: true },
    idea: { type: 'string', required: true },
    sowModules: { type: 'string' },
    sowFeatures: { type: 'string' },
    sowAssumptions: { type: 'string' },
    sowRequiredSourceIds: { type: 'string' },
  },
  version: { major: 1, minor: 1 },
  resolveVars: (input) => input,
});

export const sowMergeTemplate = definePrompt({
  key: 'document:sow-merge',
  kind: 'document',
  description: 'SOW document generator — merge pass.',
  system: ['@block:enterprise.global', SOW_MERGE_PROMPT],
  user: renderMergeUser,
  variables: {
    projectName: { type: 'string', required: true },
    idea: { type: 'string', required: true },
    sowModules: { type: 'string' },
    sowAssumptions: { type: 'string' },
    sowDraftEntries: { type: 'string' },
    sowRequiredSourceIds: { type: 'string' },
  },
  version: { major: 1, minor: 1 },
  resolveVars: (input) => input,
});

/** Full SOW template used when the feature list fits within a single LLM call. */
export const sowTemplate = definePrompt({
  key: 'document:sow',
  kind: 'document',
  description: 'SOW document generator — single pass (no chunking).',
  system: ['@block:enterprise.global', SOW_DOCUMENT_PROMPT],
  user: renderSowUser,
  variables: {
    projectName: { type: 'string', required: true },
    idea: { type: 'string', required: true },
    sowModules: { type: 'string' },
    sowFeatures: { type: 'string' },
    sowAssumptions: { type: 'string' },
    sowRequiredSourceIds: { type: 'string' },
  },
  version: { major: 1, minor: 0 },
  resolveVars: (input) => input,
});
