import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { loadAppToken, loadToken, removeCredentials, resolveToken, saveToken } from './config.js';

describe('token config', () => {
  test('prefers CHARMING_TOKEN over the saved token', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'charming-cli-'));
    await saveToken('saved', { configDir: directory });

    await expect(
      loadToken({ configDir: directory, env: { CHARMING_TOKEN: 'from-env' } }),
    ).resolves.toBe('from-env');
  });

  test('stores credentials in a user-only file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'charming-cli-'));
    await saveToken('bld_user_secret', { configDir: directory });

    expect(JSON.parse(await readFile(join(directory, 'config.json'), 'utf8'))).toEqual({
      token: 'bld_user_secret',
    });
    expect((await stat(join(directory, 'config.json'))).mode & 0o777).toBe(0o600);
  });

  test('does not reuse the production file token for another API origin', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'charming-cli-'));
    await saveToken('production', { configDir: directory });

    await expect(
      loadToken({ baseUrl: 'http://localhost:3000', configDir: directory, env: {} }),
    ).resolves.toBeUndefined();
  });

  test('does not send an environment token to another API origin', async () => {
    await expect(
      loadToken({
        baseUrl: 'https://preview.example',
        configDir: await mkdtemp(join(tmpdir(), 'charming-cli-')),
        env: { CHARMING_TOKEN: 'production' },
      }),
    ).resolves.toBeUndefined();
  });

  test('does not reuse an old unscoped app token for another API origin', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'charming-cli-'));
    await writeFile(
      join(directory, 'config.json'),
      JSON.stringify({ appTokens: { 'app-1': 'production' } }),
    );

    await expect(
      loadAppToken('app-1', {
        baseUrl: 'https://preview.example',
        configDir: directory,
        env: {},
      }),
    ).resolves.toBeUndefined();
  });

  test('reports a legacy fallback before logout can remove a saved token', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'charming-cli-'));
    const legacyTokenPath = join(directory, 'legacy-token');
    await saveToken('saved', { configDir: directory });
    await writeFile(legacyTokenPath, 'legacy');

    await expect(resolveToken({ configDir: directory, env: {}, legacyTokenPath })).resolves.toEqual(
      {
        fallbackSource: 'legacy',
        source: 'config',
        token: 'saved',
      },
    );
  });

  test('reports legacy credentials by their real source', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'charming-cli-'));
    const legacyTokenPath = join(directory, 'legacy-token');
    await writeFile(legacyTokenPath, 'legacy');

    await expect(resolveToken({ configDir: directory, env: {}, legacyTokenPath })).resolves.toEqual(
      {
        source: 'legacy',
        token: 'legacy',
      },
    );
  });

  test('reports invalid config instead of replacing it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'charming-cli-'));
    await writeFile(join(directory, 'config.json'), '{broken');

    await expect(loadToken({ configDir: directory, env: {} })).rejects.toThrow(
      `Invalid JSON in ${join(directory, 'config.json')}`,
    );
  });

  test('removes current and legacy app credentials for the production origin', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'charming-cli-'));
    await writeFile(
      join(directory, 'config.json'),
      JSON.stringify({
        appTokens: {
          'legacy-app': 'legacy-production-token',
          'https://charm.ing|current-app': 'current-production-token',
          'https://preview.example|preview-app': 'preview-token',
        },
        token: 'production-user-token',
        tokens: { 'https://preview.example': 'preview-user-token' },
      }),
    );

    await removeCredentials({ configDir: directory, env: {} });

    expect(JSON.parse(await readFile(join(directory, 'config.json'), 'utf8'))).toEqual({
      appTokens: { 'https://preview.example|preview-app': 'preview-token' },
      tokens: { 'https://preview.example': 'preview-user-token' },
    });
  });
});
