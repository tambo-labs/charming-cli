export const DEFAULT_PROFILE = 'default';

export const MAX_PROFILE_NAME_LENGTH = 64;

export function isValidProfileName(name: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name) && name.length <= MAX_PROFILE_NAME_LENGTH;
}

export function validateProfileName(name: string): void {
  if (!isValidProfileName(name)) {
    throw new Error(
      `Profile names must start with a letter, contain only letters, numbers, _ or -, and be at most ${MAX_PROFILE_NAME_LENGTH} characters.`,
    );
  }
}
