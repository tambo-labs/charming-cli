// oxlint-disable-next-line charming/no-production-host -- the CLI's default API is production
export const PRODUCTION_BASE_URL = 'https://charm.ing';

export function normalizeOrigin(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
  } catch {
    return value.replace(/\/+$/, '');
  }
}
