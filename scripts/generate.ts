import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient, definePluginConfig, type IR } from '@hey-api/openapi-ts';

type RawParameter = {
  description?: string;
  in?: string;
  name?: string;
  required?: boolean;
  schema?: unknown;
};

type RawOperation = {
  parameters?: RawParameter[];
  requestBody?: {
    content?: Record<string, { example?: unknown; schema?: unknown }>;
    required?: boolean;
  };
  responses?: Record<
    string,
    {
      content?: Record<string, { example?: unknown; schema?: unknown }>;
      description?: string;
    }
  >;
  security?: Array<Record<string, unknown>>;
  'x-charming-timeout-ms'?: number;
};

type RawSpec = {
  info?: {
    'x-charming-sla'?: {
      call_ms?: number;
      mutate_ms?: number;
      read_ms?: number;
    };
  };
  paths?: Record<
    string,
    Record<string, RawOperation> & {
      parameters?: RawParameter[];
    }
  >;
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = resolve(scriptDirectory, '..');
const inputPath = resolve(packageDirectory, '../../apps/docs/openapi.fallback.json');
const outputPath = resolve(packageDirectory, 'src/generated/operations.ts');
const httpMethods = ['delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'trace'] as const;
const temporaryOutput = await mkdtemp(join(tmpdir(), 'charming-cli-hey-api-'));
let operations: ReturnType<typeof buildOperationCatalog> = [];
const catalogPlugin = definePluginConfig({
  name: 'charming-operation-catalog',
  config: {},
  handler({ plugin }) {
    operations = buildOperationCatalog(
      plugin.context.ir,
      plugin.context.spec as RawSpec,
      (reference) => plugin.context.resolveRef(reference),
    );
  },
})();
const generatorConfig = {
  dryRun: true,
  input: inputPath,
  logs: { level: 'silent' },
  output: temporaryOutput,
  plugins: [catalogPlugin],
} as Parameters<typeof createClient>[0];

try {
  await createClient(generatorConfig);
  if (operations.length === 0) throw new Error('Hey API did not return any OpenAPI operations.');

  operations.sort((left, right) => left.id.localeCompare(right.id));
  const source = `// Generated from apps/docs/openapi.fallback.json by @hey-api/openapi-ts. Run \`bun run cli:gen\`.\nexport const generatedOperations = ${JSON.stringify(
    operations,
    null,
    2,
  )} as const;\n`;

  if (process.argv.includes('--check')) {
    const current = await readFile(outputPath, 'utf8').catch(() => '');
    if (current !== source) {
      console.error('Charming CLI operation catalog is stale. Run `bun run cli:gen`.');
      process.exitCode = 1;
    }
  } else {
    await writeFile(outputPath, source);
    console.log(`Generated ${operations.length} Charming CLI operations with Hey API.`);
  }
} finally {
  await rm(temporaryOutput, { force: true, recursive: true });
}

function buildOperationCatalog(
  model: IR.Model,
  rawSpec: RawSpec,
  resolveReference: (reference: string) => unknown,
) {
  const sla = rawSpec.info?.['x-charming-sla'] ?? {};
  return (Object.entries(model.paths ?? {}) as Array<[string, IR.PathItemObject]>).flatMap(
    ([path, pathItem]) =>
      operationEntries(pathItem).flatMap(([method, operation]) => {
        if (!operation.operationId) return [];
        const rawOperation = rawSpec.paths?.[path]?.[method] ?? {};
        const rawParameters = [
          ...(rawSpec.paths?.[path]?.parameters ?? []),
          ...(rawOperation.parameters ?? []),
        ];
        const parameters = flattenParameters(operation.parameters).map((parameter) => ({
          description: parameter.description ?? '',
          in: parameter.location,
          name: parameter.name,
          required: parameter.required === true,
          schema: resolveSchema(
            rawParameters.find(
              (item) => item.in === parameter.location && item.name === parameter.name,
            )?.schema ?? parameter.schema,
            resolveReference,
          ),
        }));
        const security = (rawOperation.security ?? []).flatMap((item) => Object.keys(item));
        const requestMediaType = rawOperation.requestBody
          ? Object.keys(rawOperation.requestBody.content ?? {})[0]
          : undefined;
        const rawRequest = requestMediaType
          ? rawOperation.requestBody?.content?.[requestMediaType]
          : undefined;
        const timeoutMs =
          rawOperation['x-charming-timeout-ms'] ??
          (operation.operationId === 'call-app-operation'
            ? sla.call_ms
            : method === 'get'
              ? sla.read_ms
              : sla.mutate_ms);
        const successResponse = responseEntries(operation.responses).find(([status]) =>
          /^2\d\d$/.test(status),
        );
        const successStatus = successResponse?.[0];
        const response = successResponse?.[1];
        const requiredParameters = parameters
          .filter((parameter) => parameter.required)
          .map((parameter) => `--param ${parameter.name}=VALUE`);
        const bodyArgument = operation.body ? ['--body @body.json'] : [];

        return [
          {
            id: operation.operationId,
            method: method.toUpperCase(),
            path,
            summary: operation.summary ?? '',
            description: operation.description ?? '',
            parameters,
            requestBody: operation.body
              ? {
                  mediaType: requestMediaType ?? 'application/json',
                  required: operation.body.required === true,
                  schema: resolveSchema(rawRequest?.schema, resolveReference),
                  example:
                    rawRequest?.example ??
                    exampleFromSchema(resolveSchema(rawRequest?.schema, resolveReference)),
                }
              : null,
            response: response
              ? {
                  description:
                    (successStatus && rawOperation.responses?.[successStatus]?.description) ??
                    response.schema.description ??
                    '',
                  schema: resolveSchema(
                    successStatus
                      ? rawOperation.responses?.[successStatus]?.content?.['application/json']
                          ?.schema
                      : undefined,
                    resolveReference,
                  ),
                  example:
                    (successStatus &&
                      rawOperation.responses?.[successStatus]?.content?.['application/json']
                        ?.example) ??
                    response.schema.example,
                }
              : null,
            security: [...new Set(security)].sort(),
            streaming: responseEntries(operation.responses).some(
              ([, item]) => item.mediaType === 'text/event-stream',
            ),
            timeoutMs: timeoutMs ?? 10_000,
            usage: [
              'charming',
              'api',
              'request',
              operation.operationId,
              ...requiredParameters,
              ...(requestMediaType === 'multipart/form-data'
                ? ['--body \'{"key":"name"}\'', '--file FILE']
                : bodyArgument),
            ].join(' '),
          },
        ];
      }),
  );
}

function operationEntries(pathItem: IR.PathItemObject): Array<[string, IR.OperationObject]> {
  return httpMethods.flatMap((method) => {
    const operation = pathItem[method];
    return operation ? [[method, operation]] : [];
  });
}

function responseEntries(
  responses: IR.ResponsesObject | undefined,
): Array<[string, IR.ResponseObject]> {
  return Object.entries(responses ?? {}).filter(
    (entry): entry is [string, IR.ResponseObject] => entry[1] !== undefined,
  );
}

function flattenParameters(parameters: IR.ParametersObject | undefined): Array<IR.ParameterObject> {
  return Object.values(parameters ?? {}).flatMap((group) => Object.values(group ?? {}));
}

function resolveSchema(
  value: unknown,
  resolveReference: (reference: string) => unknown,
  seen = new Set<string>(),
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolveSchema(item, resolveReference, seen));
  }
  if (!value || typeof value !== 'object') return value;

  const schema = value as Record<string, unknown>;
  if (typeof schema.$ref === 'string' && schema.$ref.startsWith('#/')) {
    if (seen.has(schema.$ref)) return value;
    const target = resolveReference(schema.$ref);
    if (target === undefined) return value;
    return resolveSchema(target, resolveReference, new Set([...seen, schema.$ref]));
  }

  return Object.fromEntries(
    Object.entries(schema).map(([key, item]) => [key, resolveSchema(item, resolveReference, seen)]),
  );
}

function exampleFromSchema(value: unknown): unknown {
  if (!value || typeof value !== 'object') return undefined;
  const schema = value as Record<string, unknown>;
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (schema.type === 'boolean') return false;
  if (schema.type === 'integer' || schema.type === 'number') return 0;
  if (schema.type === 'string') return 'string';
  if (schema.type === 'array') return [];
  if (schema.type === 'object' && schema.properties && typeof schema.properties === 'object') {
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    return Object.fromEntries(
      Object.entries(schema.properties as Record<string, unknown>)
        .filter(([key]) => required.has(key))
        .map(([key, item]) => [key, exampleFromSchema(item)]),
    );
  }
  return undefined;
}
