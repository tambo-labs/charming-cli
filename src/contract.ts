import { generatedOperations } from './generated/operations.js';

export type Operation = {
  description: string;
  id: string;
  method: string;
  parameters: ReadonlyArray<{
    description: string;
    in: string;
    name: string;
    required: boolean;
    schema: unknown;
  }>;
  path: string;
  requestBody: {
    example?: unknown;
    mediaType: string;
    required: boolean;
    schema?: unknown;
  } | null;
  response: {
    description: string;
    example?: unknown;
    schema?: unknown;
  } | null;
  security: readonly string[];
  streaming: boolean;
  summary: string;
  timeoutMs: number;
  usage: string;
};

export const operations: readonly Operation[] = generatedOperations;

export function findOperation(id: string): Operation | undefined {
  return operations.find((operation) => operation.id === id);
}
