import { CyfrError } from './cyfr';

export interface FriendlyError {
  message: string;
  retryable: boolean;
}

export function getUserFriendlyError(err: unknown): FriendlyError {
  if (err instanceof TypeError) {
    return { message: 'Could not reach the server. Check your connection.', retryable: true };
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return { message: 'Request timed out. Try again.', retryable: true };
  }
  if (err instanceof CyfrError) {
    switch (err.code) {
      case -33001:
        return { message: 'Session expired. Please sign in again.', retryable: false };
      case -33003:
        return { message: "You don't have access. Please sign in again.", retryable: false };
      case -33100:
        return matchFormulaError(err.message);
      case -1:
        return { message: 'Got an empty response. Try again.', retryable: true };
      default:
        return { message: err.message || 'Something went wrong.', retryable: true };
    }
  }
  if (err instanceof Error) {
    return matchFormulaError(err.message);
  }
  return { message: 'Something went wrong.', retryable: true };
}

function matchFormulaError(msg: string): FriendlyError {
  const lower = msg.toLowerCase();
  if (/rate limit/i.test(lower)) {
    return { message: 'Too many requests. Wait a moment and try again.', retryable: true };
  }
  if (/jwt expired|token.*expired/i.test(lower)) {
    return { message: 'Session expired. Please sign in again.', retryable: false };
  }
  if (/not found/i.test(lower)) {
    return { message: 'The requested resource was not found.', retryable: false };
  }
  if (/permission denied|unauthorized/i.test(lower)) {
    return { message: "You don't have permission for this action.", retryable: false };
  }
  return { message: msg || 'Something went wrong.', retryable: true };
}
