export type OptionValue = boolean | string | string[];

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
