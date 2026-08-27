import { Injectable, Logger } from '@nestjs/common';
import { buildAllowedIdIndex, validateAgentOutput } from './validate-agent-output';
import type { AgentValidationResult } from './validation.types';

/**
 * Nest wrapper around the pure validator. Keeps validation logic framework-free
 * (unit-testable without an LLM) while giving the workflow layer a DI handle.
 */
@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);

  validate(
    agentKey: string,
    output: unknown,
    upstreamItems: Array<{ externalId?: string | null }> = [],
  ): AgentValidationResult {
    const result = validateAgentOutput({
      agentKey,
      output,
      allowedIdsByPrefix: buildAllowedIdIndex(upstreamItems),
    });

    for (const flag of result.paddingFlags) {
      this.logger.warn(`Padding flag [${agentKey}]: ${flag.message}`);
    }
    for (const warning of result.warnings) {
      this.logger.warn(`Validation warning [${agentKey}]: ${warning.message}`);
    }

    return result;
  }
}
