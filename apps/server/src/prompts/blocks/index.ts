/**
 * Central prompt block registry. Blocks are reusable fragments that
 * can be referenced by name in any template (e.g. `@block:shared.output-contract`).
 */
import { SHARED_OUTPUT_CONTRACT } from './shared-output-contract';
import { ENTERPRISE_GLOBAL_INSTRUCTION } from './enterprise-global';

export const PROMPT_BLOCKS = {
  'shared.output-contract': SHARED_OUTPUT_CONTRACT,
  'enterprise.global': ENTERPRISE_GLOBAL_INSTRUCTION,
} as const;

export type BlockName = keyof typeof PROMPT_BLOCKS;

export function getBlock(name: string): string {
  const block = PROMPT_BLOCKS[name as BlockName];
  if (!block) throw new Error(`Unknown prompt block: ${name}`);
  return block;
}
