const globalFlags = new Set(['--base-url', '--token']);

export function canonicalizeGlobalFlags(argv: string[]): string[] {
  const command: string[] = [];
  const globals: string[] = [];
  let optionsEnabled = true;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--' && optionsEnabled) {
      optionsEnabled = false;
      command.push(value);
      continue;
    }
    if (!optionsEnabled || !value.startsWith('--')) {
      command.push(value);
      continue;
    }

    const [flag] = value.split('=', 1);
    if (!globalFlags.has(flag)) {
      command.push(value);
      continue;
    }

    globals.push(value);
    if (!value.includes('=')) {
      const next = argv[index + 1];
      if (next !== undefined && next !== '--' && !next.startsWith('--')) {
        globals.push(next);
        index += 1;
      }
    }
  }

  return [...command, ...globals];
}
