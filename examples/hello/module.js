export const manifest = {
  $schema: 'https://charm.ing/schema/app-manifest/2026-07-31.json',
  id: 'charming-cli-hello',
  meta: { name: 'Charming CLI Hello', icon: { emoji: '👋', bg: '#0ea5e9' } },
  capabilities: { imports: [] },
};

export const routes = [
  {
    op: 'hello',
    method: 'GET',
    annotations: { readOnlyHint: true },
    handler: async (input) => ({
      message: `Hello, ${typeof input?.name === 'string' ? input.name : 'world'}!`,
    }),
  },
];
