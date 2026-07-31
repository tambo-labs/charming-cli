export const manifest = {
  id: 'charming-cli-hello',
  version: '0.0.1',
  displayName: 'Charming CLI Hello',
  capabilities: {
    imports: [],
    exports: ['hello'],
  },
};

export const routes = [
  {
    op: 'hello',
    readOnly: true,
    handler: async (input) => ({
      message: `Hello, ${typeof input?.name === 'string' ? input.name : 'world'}!`,
    }),
  },
];
