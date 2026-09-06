// CRUD template. Rename `manifest.id`, `manifest.meta.name`, and the storage
// key, then adapt `Item` to the app's real data model.

export const manifest = {
  $schema: 'https://charm.ing/schema/app-manifest/2026-07-31.json',
  id: 'my-app',
  meta: { name: 'My App', icon: { emoji: '📝', bg: '#0ea5e9' } },
  capabilities: { imports: ['charming:storage/kv@1.0'] },
};

const STORAGE_KEY = 'items_v1';

function normalize(item) {
  return { done: false, ...item };
}

async function readItems(env) {
  const raw = (await env.storage.get(STORAGE_KEY)) ?? [];
  return raw.map(normalize);
}

function idInputSchema() {
  return {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string' } },
    additionalProperties: false,
  };
}

export const routes = [
  {
    op: 'list',
    method: 'GET',
    annotations: { readOnlyHint: true },
    handler: async (_input, { env }) => readItems(env),
  },
  {
    op: 'add',
    method: 'POST',
    inputSchema: {
      type: 'object',
      required: ['text'],
      properties: { text: { type: 'string' } },
      additionalProperties: false,
    },
    handler: async (input, { env }) => {
      const items = await readItems(env);
      const item = normalize({ id: crypto.randomUUID(), text: input.text });
      items.push(item);
      await env.storage.put(STORAGE_KEY, items);
      return item;
    },
  },
  {
    op: 'toggle',
    method: 'POST',
    inputSchema: idInputSchema(),
    handler: async (input, { env }) => {
      const items = await readItems(env);
      const next = items.map((item) =>
        item.id === input.id ? { ...item, done: !item.done } : item,
      );
      await env.storage.put(STORAGE_KEY, next);
      return next.find((item) => item.id === input.id) ?? null;
    },
  },
  {
    op: 'remove',
    method: 'POST',
    inputSchema: idInputSchema(),
    handler: async (input, { env }) => {
      const items = await readItems(env);
      const next = items.filter((item) => item.id !== input.id);
      await env.storage.put(STORAGE_KEY, next);
      return { removed: items.length !== next.length };
    },
  },
  {
    op: 'restore',
    method: 'POST',
    inputSchema: {
      type: 'object',
      required: ['item'],
      properties: { item: { type: 'object' } },
      additionalProperties: false,
    },
    handler: async (input, { env }) => {
      const items = await readItems(env);
      const withoutDup = items.filter((item) => item.id !== input.item.id);
      withoutDup.push(normalize(input.item));
      await env.storage.put(STORAGE_KEY, withoutDup);
      return input.item;
    },
  },
];
