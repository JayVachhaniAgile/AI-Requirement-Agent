import { Controller, Get } from '@nestjs/common';

/**
 * Discovery endpoint for the new architecture surface.
 *
 * Returns the routes exposed by the FoundationModule — useful for the
 * frontend and for smoke-testing the wiring without diving into the
 * individual controllers.
 */
@Controller('foundation')
export class FoundationController {
  @Get()
  overview() {
    const areas = [
      {
        area: 'project',
        routes: [
          'GET    /api/foundation/projects/:projectId/versions',
          'GET    /api/foundation/projects/:projectId/versions/:version',
          'POST   /api/foundation/projects/:projectId/versions',
        ],
      },
      {
        area: 'knowledge',
        routes: [
          'GET    /api/foundation/projects/:projectId/knowledge',
          'GET    /api/foundation/projects/:projectId/knowledge/digest',
        ],
      },
      {
        area: 'context',
        routes: [
          'POST   /api/foundation/context/projects/:projectId/compile',
          'POST   /api/foundation/context/projects/:projectId/invalidate',
        ],
      },
      {
        area: 'artifacts',
        routes: [
          'GET    /api/foundation/projects/:projectId/artifacts',
          'POST   /api/foundation/projects/:projectId/artifacts',
          'POST   /api/foundation/projects/:projectId/dependencies',
          'GET    /api/foundation/projects/:projectId/dependencies',
          'GET    /api/foundation/projects/:projectId/artifacts/plan',
          'GET    /api/foundation/projects/:projectId/artifacts/:artifactId/impact',
          'GET    /api/foundation/artifacts/:artifactId/versions',
          'POST   /api/foundation/artifacts/:artifactId/versions',
        ],
      },
      {
        area: 'skills',
        routes: [
          'GET    /api/foundation/skills',
          'GET    /api/foundation/skills/definitions',
          'POST   /api/foundation/skills/seed',
          'GET    /api/foundation/skills/:key',
          'GET    /api/foundation/skills/:key/version',
          'POST   /api/foundation/skills/:key/enable',
          'POST   /api/foundation/skills/:key/disable',
          'POST   /api/foundation/skills/:key/execute',
        ],
      },
      {
        area: 'orchestration',
        routes: [
          'POST   /api/foundation/orchestration/workflows',
          'POST   /api/foundation/orchestration/workflows/:id/complete',
          'GET    /api/foundation/orchestration/workflows/:projectId',
          'POST   /api/foundation/orchestration/skill-executions',
          'POST   /api/foundation/orchestration/skill-executions/:id/complete',
          'GET    /api/foundation/orchestration/skill-executions/:workflowExecutionId',
        ],
      },
      {
        area: 'quality',
        routes: [
          'GET    /api/foundation/quality/gates',
          'POST   /api/foundation/quality/run/:projectId',
          'GET    /api/foundation/quality/project/:projectId',
        ],
      },
      {
        area: 'models',
        routes: ['POST   /api/foundation/models/route'],
      },
      {
        area: 'observability',
        routes: [
          'POST   /api/foundation/observability/usage',
          'GET    /api/foundation/observability/usage/:projectId/summary',
        ],
      },
      {
        area: 'dependencies',
        routes: [
          'GET    /api/foundation/dependencies/types',
          'POST   /api/foundation/projects/:projectId/dependencies',
          'PATCH  /api/foundation/dependencies/:id',
          'DELETE /api/foundation/dependencies/:id',
          'GET    /api/foundation/artifacts/:artifactId/dependencies',
          'GET    /api/foundation/artifacts/:artifactId/dependents',
          'GET    /api/foundation/artifacts/:artifactId/downstream',
          'GET    /api/foundation/artifacts/:artifactId/upstream',
          'GET    /api/foundation/artifacts/:artifactId/paths',
          'GET    /api/foundation/artifacts/:artifactId/impact',
          'GET    /api/foundation/projects/:projectId/graph',
          'GET    /api/foundation/projects/:projectId/graph/validation',
        ],
      },
      {
        area: 'compiler',
        routes: [
          'GET    /api/foundation/compiler/types',
          'POST   /api/foundation/compiler/projects/:projectId/compile',
          'POST   /api/foundation/compiler/projects/:projectId/dry-run',
        ],
      },
      {
        area: 'quality-engine',
        routes: [
          'GET    /api/foundation/quality/engine/checks',
          'GET    /api/foundation/quality/engine/thresholds',
          'POST   /api/foundation/quality/engine/projects/:projectId/evaluate',
          'POST   /api/foundation/quality/engine/artifacts',
          'GET    /api/foundation/quality/engine/projects/:projectId/checks',
        ],
      },
      {
        area: 'migration',
        routes: [
          'GET    /api/foundation/migration/status',
          'GET    /api/foundation/migration/comparisons',
          'GET    /api/foundation/migration/comparisons/:projectId/:agentKey',
        ],
      },
      {
        area: 'orchestration-v2',
        routes: [
          'POST   /api/foundation/orchestration/plans',
          'POST   /api/foundation/orchestration/plans/:id/run',
          'POST   /api/foundation/orchestration/plans/:id/pause',
          'POST   /api/foundation/orchestration/plans/:id/resume',
          'POST   /api/foundation/orchestration/plans/:id/nodes/:nodeId/retry',
          'POST   /api/foundation/orchestration/plans/:id/checkpoints/:nodeId/approve',
          'POST   /api/foundation/orchestration/plans/:id/checkpoints/:nodeId/reject',
          'GET    /api/foundation/orchestration/plans/:id',
          'GET    /api/foundation/orchestration/projects/:projectId/plans',
        ],
      },
      {
        area: 'canonical',
        routes: [
          'GET    /api/foundation/canonical/kinds',
          'POST   /api/foundation/canonical/projects/:projectId/ingest',
          'GET    /api/foundation/canonical/projects/:projectId/items',
          'GET    /api/foundation/canonical/projects/:projectId/items/:kind/:externalId',
          'GET    /api/foundation/canonical/projects/:projectId/items/:kind/:externalId/versions',
          'GET    /api/foundation/canonical/projects/:projectId/items/:kind/:externalId/provenance',
        ],
      },
    ];
    return {
      name: 'foundation',
      version: '1.0.0',
      areas,
    };
  }
}
