export type AuthErrorReason =
  | 'missing_token'
  | 'malformed_token'
  | 'invalid_signature'
  | 'expired_token'
  | 'invalid_claims'
  | 'insufficient_role'
  | 'config_error';

export class AuthError extends Error {
  readonly reason: AuthErrorReason;

  constructor(reason: AuthErrorReason, message?: string) {
    super(message ?? reason);
    this.name = 'AuthError';
    this.reason = reason;
  }
}
