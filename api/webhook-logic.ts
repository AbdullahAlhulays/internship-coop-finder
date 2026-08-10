// Pure, dependency-free logic pulled out of telegram-webhook.ts
// specifically so it's unit-testable without a real Vercel deploy or
// a real Telegram request -- see test-webhook-logic.ts. Nothing in
// this file touches the network or an environment variable.

export interface ParsedCallback {
  action: string;
  candidateId: string;
}

/**
 * callback_data always looks like "action:candidateId", where
 * candidateId is itself "channel:messageId" (see state.py's
 * make_candidate_id) -- so this only splits on the FIRST colon, not
 * every colon, or the candidate id would be truncated.
 */
export function parseCallbackData(data: string): ParsedCallback | null {
  const separatorIndex = data.indexOf(":");
  if (separatorIndex === -1) return null;
  const action = data.slice(0, separatorIndex);
  const candidateId = data.slice(separatorIndex + 1);
  if (!action || !candidateId) return null;
  return { action, candidateId };
}

export const HANDLED_ACTIONS = new Set(["approve", "reject"]);

export function isHandledAction(action: string): boolean {
  return HANDLED_ACTIONS.has(action);
}

export interface DispatchPayload {
  event_type: string;
  client_payload: { action: string; candidate_id: string };
}

/** What gets POSTed to GitHub's repository_dispatch endpoint. Kept as
 * its own pure function so the exact shape is asserted in a test
 * rather than only visible inside a live network call. */
export function buildDispatchPayload(action: string, candidateId: string): DispatchPayload {
  return {
    event_type: "telegram-decision",
    client_payload: { action, candidate_id: candidateId },
  };
}

/** True if the request really came from Telegram. Telegram sends the
 * secret_token you configured during setWebhook back on this exact
 * header on every request -- this isn't a cryptographic signature,
 * just a shared secret check, but both sides must be non-empty so a
 * misconfigured (empty) secret can never accidentally "match". */
export function isFromTelegram(providedSecret: string | null, expectedSecret: string | undefined): boolean {
  return Boolean(expectedSecret) && providedSecret === expectedSecret;
}
