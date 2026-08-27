/**
 * Shared mappings that keep the DAG execution path in lock-step with the
 * pipeline status model (single source of truth: `@workspace/pipeline-config`).
 */
export {
  DAG_NODE_TO_STAGE,
  projectStatusForNode,
  stageForNode,
  stageToProjectStatus,
} from '@workspace/pipeline-config';
