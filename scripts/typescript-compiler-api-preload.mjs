import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const typescriptPath = require.resolve('typescript');
const compilerApi = require('typescript-compiler-api');

Bun.plugin({
  name: 'typescript-compiler-api',
  setup(build) {
    build.onLoad({ filter: new RegExp(`^${RegExp.escape(typescriptPath)}$`) }, () => ({
      exports: { ...compilerApi, default: compilerApi },
      loader: 'object',
    }));
  },
});
