// Cliente GitHub (Tarefa 3): busca de perfil via /users/:username e classificação de erros (CA-8, CA-9).
export type GithubAccountType = 'User' | 'Organization';

export interface GithubProfile {
  login: string;
  type: GithubAccountType;
}

export type GithubErrorCode =
  | 'USER_NOT_FOUND'
  | 'ORGANIZATION_NOT_SUPPORTED'
  | 'GITHUB_RATE_LIMITED'
  | 'GITHUB_UNAVAILABLE';

export class GithubClientError extends Error {
  readonly code: GithubErrorCode;

  constructor(code: GithubErrorCode, message: string) {
    super(message);
    this.name = 'GithubClientError';
    this.code = code;
  }
}

const GITHUB_API_BASE_URL = 'https://api.github.com';

function buildRequestHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'github-timeline',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function isRateLimitedForbidden(response: Response): boolean {
  return response.headers.get('x-ratelimit-remaining') === '0';
}

function isSecondaryRateLimitForbidden(response: Response): boolean {
  return response.headers.get('retry-after') !== null;
}

function hasRateLimitMessage(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const message = (body as Record<string, unknown>).message;
  return typeof message === 'string' && message.toLowerCase().includes('rate limit');
}

async function parseJsonBody(response: Response): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await response.json() };
  } catch {
    return { ok: false };
  }
}

function isGithubProfile(body: unknown): body is { login: string; type: GithubAccountType } {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const record = body as Record<string, unknown>;
  return typeof record.login === 'string' && (record.type === 'User' || record.type === 'Organization');
}

export async function fetchGithubUser(
  username: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubProfile> {
  let response: Response;
  try {
    response = await fetchImpl(`${GITHUB_API_BASE_URL}/users/${username}`, {
      headers: buildRequestHeaders(),
    });
  } catch {
    throw new GithubClientError('GITHUB_UNAVAILABLE', 'Falha de rede ao consultar a API do GitHub.');
  }

  if (response.status === 404) {
    throw new GithubClientError('USER_NOT_FOUND', 'Conta GitHub não encontrada.');
  }

  if (response.status === 429) {
    throw new GithubClientError('GITHUB_RATE_LIMITED', 'Limite de requisições do GitHub atingido.');
  }

  if (response.status === 403) {
    if (isRateLimitedForbidden(response) || isSecondaryRateLimitForbidden(response)) {
      throw new GithubClientError('GITHUB_RATE_LIMITED', 'Limite de requisições do GitHub atingido.');
    }

    const parsed = await parseJsonBody(response);
    if (parsed.ok && hasRateLimitMessage(parsed.value)) {
      throw new GithubClientError('GITHUB_RATE_LIMITED', 'Limite de requisições do GitHub atingido.');
    }

    throw new GithubClientError('GITHUB_UNAVAILABLE', 'Falha ao consultar a API do GitHub.');
  }

  if (!response.ok) {
    throw new GithubClientError('GITHUB_UNAVAILABLE', 'Falha ao consultar a API do GitHub.');
  }

  const parsedBody = await parseJsonBody(response);
  if (!parsedBody.ok || !isGithubProfile(parsedBody.value)) {
    throw new GithubClientError('GITHUB_UNAVAILABLE', 'Resposta inválida da API do GitHub.');
  }

  const body = parsedBody.value;

  if (body.type === 'Organization') {
    throw new GithubClientError('ORGANIZATION_NOT_SUPPORTED', 'Contas de organização não são suportadas.');
  }

  return { login: body.login, type: body.type };
}
