const GITHUB_USERNAME_MAX_LENGTH = 39;
const GITHUB_USERNAME_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/;

export function isValidUsername(username: string): boolean {
  if (username.length === 0 || username.length > GITHUB_USERNAME_MAX_LENGTH) {
    return false;
  }
  return GITHUB_USERNAME_PATTERN.test(username);
}
