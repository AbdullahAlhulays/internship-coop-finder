// Direct reads/writes to state/pending.json via GitHub's Contents API,
// bypassing GitHub Actions entirely. Used only by the calendar and
// edit-field flows, where a response needs to feel roughly instant --
// a full repository_dispatch -> Actions run -> commit -> push cycle
// takes 10-60+ seconds, which would make tapping a calendar day feel
// broken. Approve/Reject still go through the existing Actions-based
// path (telegram-webhook.ts's dispatchToGitHub) -- those aren't about
// instant feedback, and keeping the actual site-file editing
// (companies.js, App.jsx) inside the same tested Python codebase as
// everything else matters more there than speed does. This file only
// ever touches state/pending.json -- never companies.js or App.jsx.
//
// GITHUB_DISPATCH_TOKEN (repo scope) already has the write access
// this needs -- no new secret required.

const PENDING_PATH = "state/pending.json";

function contentsUrl(repo: string, path: string): string {
  return `https://api.github.com/repos/${repo}/contents/${path}`;
}

export interface PendingRecord {
  extracted: Record<string, unknown>;
  post: Record<string, unknown>;
  decision: Record<string, unknown>;
  // Python's durable Telegram outbox. Webhook edits always spread the
  // existing record, preserving this receipt while changing card fields.
  delivery?: {
    status: "queued" | "sent";
    queued_at?: string;
    sent_at?: string;
    telegram_message_id?: number | null;
  };
  // The callback that starts a free-text edit knows which Telegram
  // card it came from. Keep that id until the reply arrives so the
  // webhook can rewrite that exact card after saving the new value.
  awaiting_edit?: { field: string; card_message_id?: number };
  // If Telegram retries a free-text edit after the GitHub write
  // succeeded but the card refresh or confirmation failed, recognize
  // the update and replay only those idempotent Telegram deliveries
  // (awaiting_edit has already been cleared by then).
  last_edit?: { message_id: number; field: string; card_message_id?: number };
  // Telegram retries the exact same update when a webhook returns a
  // 5xx. Remember the last applied text message so that a retry
  // re-sends the next prompt instead of applying the same text to the
  // next field (e.g. accidentally using the URL as the location).
  last_message_id?: number;
  // Present only while a /new draft is being built step by step;
  // removed once all fields are collected and the draft is handed
  // off to create-candidate.yml. A record with creating_step set is
  // never shown the normal approval keyboard, and process_approval.py
  // never sees it -- it isn't a real candidate yet.
  creating_step?: string;
}

export type PendingFile = Record<string, PendingRecord>;

interface FetchedFile {
  data: PendingFile;
  sha: string;
}

function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function encodeUtf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function fetchPendingFile(repo: string, token: string): Promise<FetchedFile> {
  const response = await fetch(contentsUrl(repo, PENDING_PATH), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!response.ok) {
    throw new Error(`GitHub rejected reading ${PENDING_PATH} (${response.status}): ${await response.text()}`);
  }
  const body = (await response.json()) as { content: string; sha: string };
  return { data: JSON.parse(decodeBase64Utf8(body.content)) as PendingFile, sha: body.sha };
}

class WriteConflictError extends Error {}

async function writePendingFile(repo: string, token: string, data: PendingFile, sha: string, message: string): Promise<void> {
  const text = JSON.stringify(data, null, 2) + "\n";
  const response = await fetch(contentsUrl(repo, PENDING_PATH), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, content: encodeUtf8Base64(text), sha }),
  });
  if (response.ok) return;
  const body = await response.text();
  if (response.status === 409 || response.status === 422) {
    throw new WriteConflictError(`stale sha (${response.status}): ${body}`);
  }
  throw new Error(`GitHub rejected writing ${PENDING_PATH} (${response.status}): ${body}`);
}

/**
 * Read-modify-write with retry on a stale sha -- someone else (e.g. an
 * in-flight Approve running through GitHub Actions) committed to
 * pending.json between the read and this write. Retries with a fresh
 * read each time rather than failing on the first collision, same
 * reasoning as process-approval.yml's push-retry loop: races here are
 * rare for one person tapping buttons, but silently losing an edit on
 * the rare occasion one happens is worse than a short retry.
 */
export async function patchPending(
  repo: string,
  token: string,
  commitMessage: string,
  patch: (data: PendingFile) => PendingFile,
  maxAttempts = 5,
): Promise<PendingFile> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { data, sha } = await fetchPendingFile(repo, token);
    const patched = patch(data);
    try {
      await writePendingFile(repo, token, patched, sha, commitMessage);
      return patched;
    } catch (err) {
      if (!(err instanceof WriteConflictError) || attempt === maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 700));
    }
  }
  throw new Error("unreachable");
}

/** Read-only peek, for the incoming-text-reply path, which needs to
 * know whether anything is awaiting an edit BEFORE deciding whether to
 * write anything at all (an unrelated message shouldn't produce a
 * commit). */
export async function readPending(repo: string, token: string): Promise<PendingFile> {
  return (await fetchPendingFile(repo, token)).data;
}

// -------------------------------------------------------- pure patches
//
// Kept separate from the fetch/write plumbing above so each is
// directly unit-testable with a plain object in, plain object out --
// no network, no GitHub, see test-webhook-logic.ts.

export class PatchError extends Error {}

function requireRecord(data: PendingFile, candidateId: string): PendingRecord {
  const record = data[candidateId];
  if (!record) {
    throw new PatchError(`${candidateId} is not currently pending -- it may already have been handled, or the state file was reset`);
  }
  return record;
}

export function applyDeadlinePatch(data: PendingFile, candidateId: string, isoDate: string | null): PendingFile {
  const record = requireRecord(data, candidateId);
  return {
    ...data,
    [candidateId]: {
      ...record,
      extracted: { ...record.extracted, deadline: isoDate, deadline_raw: null },
    },
  };
}

export function applyAwaitingEditPatch(
  data: PendingFile,
  candidateId: string,
  field: string,
  cardMessageId?: number,
): PendingFile {
  const record = requireRecord(data, candidateId);
  return {
    ...data,
    [candidateId]: {
      ...record,
      awaiting_edit: {
        field,
        ...(cardMessageId === undefined ? {} : { card_message_id: cardMessageId }),
      },
    },
  };
}

function applyExtractedFieldValue(
  extracted: Record<string, unknown>,
  field: string,
  value: unknown,
): Record<string, unknown> {
  const descriptionMatch = field.match(/^description_(en|ar)$/);
  if (!descriptionMatch) return { ...extracted, [field]: value };

  const currentDescription = (
    typeof extracted.description === "object" &&
    extracted.description !== null &&
    !Array.isArray(extracted.description)
  ) ? extracted.description as Record<string, unknown> : {};

  return {
    ...extracted,
    description: { ...currentDescription, [descriptionMatch[1]]: value },
  };
}

function extractedFieldValue(extracted: Record<string, unknown>, field: string): unknown {
  const descriptionMatch = field.match(/^description_(en|ar)$/);
  if (!descriptionMatch) return extracted[field];
  if (typeof extracted.description !== "object" || extracted.description === null || Array.isArray(extracted.description)) {
    return undefined;
  }
  return (extracted.description as Record<string, unknown>)[descriptionMatch[1]];
}

export function applyFieldValuePatch(
  data: PendingFile,
  candidateId: string,
  field: string,
  value: unknown,
  lastMessageId?: number,
  cardMessageId?: number,
): PendingFile {
  const record = requireRecord(data, candidateId);
  const { awaiting_edit, ...rest } = record;
  const resolvedCardMessageId = cardMessageId
    ?? awaiting_edit?.card_message_id
    ?? record.delivery?.telegram_message_id
    ?? undefined;
  return {
    ...data,
    [candidateId]: {
      ...rest,
      extracted: applyExtractedFieldValue(record.extracted, field, value),
      ...(lastMessageId === undefined
        ? {}
        : {
            last_edit: {
              message_id: lastMessageId,
              field,
              ...(resolvedCardMessageId === undefined ? {} : { card_message_id: resolvedCardMessageId }),
            },
          }),
    },
  };
}

export function clearAwaitingEdit(data: PendingFile, candidateId: string): PendingFile {
  const record = data[candidateId];
  if (!record) return data;
  const { awaiting_edit, ...rest } = record;
  return { ...data, [candidateId]: rest };
}

export type AwaitingEditLookup =
  | { status: "none" }
  | { status: "ambiguous"; candidateIds: string[] }
  | { status: "found"; candidateId: string; field: string; cardMessageId?: number };

/** Scans for candidates currently awaiting a free-text edit reply.
 * Deliberately refuses to guess which one an incoming message is for
 * if more than one is found, rather than silently applying it to the
 * wrong candidate -- the same "never guess" rule the whole rest of
 * this pipeline follows. */
export function findAwaitingEdit(data: PendingFile): AwaitingEditLookup {
  const matches = Object.entries(data).filter(([, record]) => record.awaiting_edit?.field);
  if (matches.length === 0) return { status: "none" };
  if (matches.length > 1) return { status: "ambiguous", candidateIds: matches.map(([id]) => id) };
  const [candidateId, record] = matches[0];
  return {
    status: "found",
    candidateId,
    field: record.awaiting_edit!.field,
    cardMessageId: record.awaiting_edit!.card_message_id ?? record.delivery?.telegram_message_id ?? undefined,
  };
}

// -------------------------------------------------------- /new (create)
//
// A draft is stored in the SAME pending.json, under a synthetic id, so
// it reuses every read/write/retry mechanism above with no new state
// file. It's distinguished from a real pending candidate purely by
// having `creating_step` set. See webhook-logic.ts's CREATION_STEPS
// module comment for the overall design.

export function newDraftId(): string {
  return `manual:${Date.now()}`;
}

export function createDraft(data: PendingFile, draftId: string): PendingFile {
  const existing = findAwaitingCreation(data);
  if (existing.status !== "none") {
    throw new PatchError("a card is already being created -- continue or cancel it before starting another");
  }
  if (data[draftId]) {
    throw new PatchError(`${draftId} already exists -- draft id collision, extremely unlikely, try again`);
  }
  return {
    ...data,
    [draftId]: { extracted: {}, post: {}, decision: {}, creating_step: "company" },
  };
}

export function advanceCreationStep(data: PendingFile, draftId: string, step: string): PendingFile {
  const record = requireRecord(data, draftId);
  return { ...data, [draftId]: { ...record, creating_step: step } };
}

/** Fills in one field of the draft AND advances to the next step in
 * one patch, so a single Contents-API write covers both -- half the
 * commits of doing them separately. */
export function applyCreationFieldAndAdvance(
  data: PendingFile,
  draftId: string,
  field: string,
  value: unknown,
  nextStep: string,
  lastMessageId?: number,
): PendingFile {
  const record = requireRecord(data, draftId);
  return {
    ...data,
    [draftId]: {
      ...record,
      extracted: { ...record.extracted, [field]: value },
      creating_step: nextStep,
      ...(lastMessageId === undefined ? {} : { last_message_id: lastMessageId }),
    },
  };
}

export type AppliedEditRetryLookup =
  | { status: "none" }
  | { status: "ambiguous"; candidateIds: string[] }
  | { status: "found"; candidateId: string; field: string; value: unknown; cardMessageId?: number };

/** Locate an edit whose state write already succeeded for this exact
 * Telegram message. Message ids are unique within the authorized chat,
 * so matching them is a safe idempotency key. */
export function findAppliedEditRetry(data: PendingFile, messageId: number): AppliedEditRetryLookup {
  const matches = Object.entries(data).filter(([, record]) => record.last_edit?.message_id === messageId);
  if (matches.length === 0) return { status: "none" };
  if (matches.length > 1) return { status: "ambiguous", candidateIds: matches.map(([id]) => id) };
  const [candidateId, record] = matches[0];
  const field = record.last_edit!.field;
  return {
    status: "found",
    candidateId,
    field,
    value: extractedFieldValue(record.extracted, field),
    cardMessageId: record.last_edit!.card_message_id ?? record.delivery?.telegram_message_id ?? undefined,
  };
}

/** Recreate a completed draft when repository_dispatch itself fails.
 * The old flow deleted the user's six collected fields before the
 * dispatch and lost them permanently on a transient GitHub outage.
 * Restoring at the final button step makes that failure retryable. */
export function restoreDraft(
  data: PendingFile,
  draftId: string,
  extracted: Record<string, unknown>,
): PendingFile {
  const existing = data[draftId];
  if (existing?.creating_step) return data; // idempotent webhook retry
  if (existing) throw new PatchError(`${draftId} is already a real pending candidate and cannot be restored as a draft`);
  return {
    ...data,
    [draftId]: { extracted: { ...extracted }, post: {}, decision: {}, creating_step: "letter" },
  };
}

export function discardDraft(data: PendingFile, draftId: string): PendingFile {
  const { [draftId]: _removed, ...rest } = data;
  return rest;
}

export type AwaitingCreationLookup =
  | { status: "none" }
  | { status: "ambiguous"; draftIds: string[] }
  | {
      status: "found";
      draftId: string;
      step: string;
      extracted: Record<string, unknown>;
      lastMessageId?: number;
    };

/** Parallel to findAwaitingEdit -- scans for a draft currently waiting
 * on a text reply (the company/link/location steps; type/deadline/
 * letter are all button-driven and never reach this). Refuses to guess
 * if more than one draft is somehow in progress at once, same "never
 * guess" rule as everywhere else in this pipeline. */
export function findAwaitingCreation(data: PendingFile): AwaitingCreationLookup {
  const matches = Object.entries(data).filter(([, record]) => record.creating_step);
  if (matches.length === 0) return { status: "none" };
  if (matches.length > 1) return { status: "ambiguous", draftIds: matches.map(([id]) => id) };
  const [draftId, record] = matches[0];
  return {
    status: "found",
    draftId,
    step: record.creating_step!,
    extracted: record.extracted,
    lastMessageId: record.last_message_id,
  };
}
