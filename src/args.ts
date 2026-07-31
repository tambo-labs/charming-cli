export type OptionValue = boolean | string | string[];

export type ParsedArgs = {
  command: string[];
  options: Record<string, OptionValue>;
};

const booleanOptions = new Set(['dry-run', 'help', 'no-open', 'version', 'yes']);
const repeatedOptions = new Set(['header', 'param']);

function addOption(options: Record<string, OptionValue>, name: string, value: boolean | string) {
  if (!repeatedOptions.has(name)) {
    options[name] = value;
    return;
  }
  const current = options[name];
  options[name] = Array.isArray(current)
    ? [...current, String(value)]
    : current === undefined
      ? [String(value)]
      : [String(current), String(value)];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const command: string[] = [];
  const options: Record<string, OptionValue> = {};
  let optionsEnabled = true;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--' && optionsEnabled) {
      optionsEnabled = false;
      continue;
    }
    if (!optionsEnabled || !value.startsWith('--')) {
      command.push(value);
      continue;
    }

    const equals = value.indexOf('=');
    const name = value.slice(2, equals === -1 ? undefined : equals);
    if (equals !== -1) {
      addOption(options, name, value.slice(equals + 1));
      continue;
    }
    if (booleanOptions.has(name)) {
      addOption(options, name, true);
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) {
      throw new Error(`--${name} requires a value`);
    }
    addOption(options, name, next);
    index += 1;
  }

  return { command, options };
}

export function stringOption(
  options: Record<string, OptionValue>,
  name: string,
): string | undefined {
  const value = options[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`--${name} must be used once with a value`);
  return value;
}

export function stringOptions(options: Record<string, OptionValue>, name: string): string[] {
  const value = options[name];
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [value];
  throw new Error(`--${name} requires a value`);
}
