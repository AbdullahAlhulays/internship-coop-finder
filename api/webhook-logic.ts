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

// "approve"/"reject" go straight to GitHub via repository_dispatch.
// The calendar and edit-field actions below are handled entirely
// inside the webhook itself (no Actions round-trip -- see
// github-state.ts) because a full dispatch-and-run cycle takes
// 10-60+ seconds, which would make tapping through a calendar feel
// broken. "calnoop" is header/blank calendar cells -- tappable
// because Telegram requires every inline button to have SOME
// callback_data, but deliberately does nothing.
export const HANDLED_ACTIONS = new Set(["approve", "reject"]);
// "deadline" is the already-deployed button's action name (see
// notify.py's approval_keyboard) -- it's the entry point that opens
// the calendar on the current month. Everything else in this set is
// navigation/selection within that calendar.
export const CALENDAR_ACTIONS = new Set(["deadline", "cal", "calpick", "calnone", "calback", "calnoop"]);
// "edit" is likewise the already-deployed entry-point button name.
export const EDIT_ACTIONS = new Set(["edit", "editfield", "editset", "editcancel"]);

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

/** The webhook secret proves the request came through Telegram, but
 * it does not prove it came from Abood's chat. Keep the bot private:
 * an arbitrary Telegram user who discovers the bot username must
 * never be able to create/edit/approve repository state. */
export function isAuthorizedChat(
  chatId: number | string | undefined,
  expectedChatId: string | undefined,
): boolean {
  const expected = expectedChatId?.trim();
  return Boolean(expected) && chatId !== undefined && String(chatId) === expected;
}

// ------------------------------------------------------------- calendar
//
// Encoding: after parseCallbackData() strips the leading "action:",
// what's left for calendar actions is "YYYY:M:candidateId" (navigate)
// or "YYYY:M:D:candidateId" (a day was picked). Both split on exactly
// as many leading colons as there are numeric fields and treat
// whatever's left as the candidate id -- same rule as
// parseCallbackData, so a candidate id's own colon is never truncated.
// "calnone" and "calback" carry no extra fields, so they parse with
// plain parseCallbackData like approve/reject do.

export interface CalendarNav {
  year: number;
  month: number; // 1-12
  candidateId: string;
}

function parseLeadingInts(rest: string, count: number): { values: number[]; candidateId: string } | null {
  const values: number[] = [];
  let remainder = rest;
  for (let i = 0; i < count; i++) {
    const idx = remainder.indexOf(":");
    if (idx === -1) return null;
    const piece = remainder.slice(0, idx);
    if (!/^-?\d+$/.test(piece)) return null;
    values.push(Number(piece));
    remainder = remainder.slice(idx + 1);
  }
  if (!remainder) return null;
  return { values, candidateId: remainder };
}

export function parseCalendarNav(rest: string): CalendarNav | null {
  const parsed = parseLeadingInts(rest, 2);
  if (!parsed) return null;
  const [year, month] = parsed.values;
  if (month < 1 || month > 12) return null;
  return { year, month, candidateId: parsed.candidateId };
}

export interface CalendarPick extends CalendarNav {
  day: number;
}

export function parseCalendarPick(rest: string): CalendarPick | null {
  const parsed = parseLeadingInts(rest, 3);
  if (!parsed) return null;
  const [year, month, day] = parsed.values;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day, candidateId: parsed.candidateId };
}

const CALLBACK_LIMIT = 64; // Telegram's hard byte limit on callback_data, same constant as notify.py

function withinLimit(data: string): string {
  if (new TextEncoder().encode(data).length > CALLBACK_LIMIT) {
    throw new Error(`callback_data ${JSON.stringify(data)} exceeds Telegram's ${CALLBACK_LIMIT}-byte limit`);
  }
  return data;
}

export function calNavCallback(year: number, month: number, candidateId: string): string {
  return withinLimit(`cal:${year}:${month}:${candidateId}`);
}

export function calPickCallback(year: number, month: number, day: number, candidateId: string): string {
  return withinLimit(`calpick:${year}:${month}:${day}:${candidateId}`);
}

/** Previous/next month, correctly rolling the year at Jan/Dec. */
export function shiftMonth(year: number, month: number, delta: 1 | -1): { year: number; month: number } {
  let m = month + delta;
  let y = year;
  if (m < 1) {
    m = 12;
    y -= 1;
  } else if (m > 12) {
    m = 1;
    y += 1;
  }
  return { year: y, month: m };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1-12; day 0 of next month = last day of this one
}

function firstWeekday(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 = Sunday
}

export interface InlineButton {
  text: string;
  callback_data: string;
}
export interface InlineKeyboard {
  inline_keyboard: InlineButton[][];
}

/** A month grid for Telegram: header, weekday labels, day rows padded
 * to full weeks with inert blanks, then prev/next/no-deadline/back.
 * Built as a table (Su-Sa columns) since that's the layout everyone
 * already reads a calendar as -- no reason to invent a different one.
 * UTC throughout (see daysInMonth/firstWeekday) so this can't drift a
 * day depending on the server's local timezone, which for a Vercel
 * Edge function is not something to assume. */
export function buildCalendarKeyboard(year: number, month: number, candidateId: string): InlineKeyboard {
  const rows: InlineButton[][] = [];
  const noop = (): InlineButton => ({ text: " ", callback_data: withinLimit(`calnoop:${candidateId}`) });

  rows.push([{ text: `${MONTH_NAMES[month - 1]} ${year}`, callback_data: withinLimit(`calnoop:${candidateId}`) }]);
  rows.push(["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((label) => ({ text: label, callback_data: withinLimit(`calnoop:${candidateId}`) })));

  const total = daysInMonth(year, month);
  const startWeekday = firstWeekday(year, month);

  let week: InlineButton[] = [];
  for (let i = 0; i < startWeekday; i++) week.push(noop());
  for (let day = 1; day <= total; day++) {
    week.push({ text: String(day), callback_data: calPickCallback(year, month, day, candidateId) });
    if (week.length === 7) {
      rows.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(noop());
    rows.push(week);
  }

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  rows.push([
    { text: "< Prev", callback_data: calNavCallback(prev.year, prev.month, candidateId) },
    { text: "Next >", callback_data: calNavCallback(next.year, next.month, candidateId) },
  ]);
  rows.push([
    { text: "No deadline", callback_data: withinLimit(`calnone:${candidateId}`) },
    { text: "← Back", callback_data: withinLimit(`calback:${candidateId}`) },
  ]);

  return { inline_keyboard: rows };
}

/** "2026-09-15" -- the exact shape extract.py's Extracted.deadline
 * and companies.js expect (see extract.py's validate()). Zero-padded,
 * because "2026-9-5" would fail that validation and silently never
 * make it into companies.js. */
export function formatIsoDate(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

// -------------------------------------------------------------- edit

// "edit:candidateId" -> show the field-choice keyboard.
// "editfield:FIELD:candidateId" -> either shows a constrained-choice
//   keyboard (type, requiresLetter) or starts a free-text prompt
//   (name, location, url) by writing awaiting_edit into pending.json.
// "editset:FIELD:VALUE:candidateId" -> commits a constrained choice
//   directly, no free text involved, so it can never hold an invalid
//   value.
// "editcancel:candidateId" -> back to the normal keyboard, no change.

export const EDITABLE_FIELDS = ["company", "type", "location", "url", "requires_letter"] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export const FIELD_LABELS: Record<EditableField, string> = {
  company: "Company name",
  type: "Type",
  location: "Location",
  url: "Application link",
  requires_letter: "Requires enrollment letter",
};

// Fields with a small fixed set of valid values get buttons, not free
// text -- exactly the same reasoning extract.py's own TYPE_DISPLAY
// mapping uses: a typo'd free-text type would silently fail to render
// on the site, since companies.js only recognizes these three strings.
export const CONSTRAINED_CHOICES: Partial<Record<EditableField, { value: string; label: string }[]>> = {
  type: [
    { value: "internship", label: "Internship" },
    { value: "coop", label: "CO-OP Training" },
    { value: "internship_or_coop", label: "Internship / CO-OP Training" },
  ],
  requires_letter: [
    { value: "true", label: "Yes" },
    { value: "false", label: "No" },
  ],
};

export type ConstrainedField = "type" | "requires_letter";

// The predicate narrows to ConstrainedField specifically, not the
// broader EditableField -- narrowing to EditableField here would make
// TypeScript think "not constrained" means "not an EditableField at
// all" in the else branch of an isConstrainedField() check, which is
// wrong (the free-text fields are still EditableField) and collapses
// that branch's type to `never`, a real bug this exact mistake caused
// during development -- caught by `tsc`, not by the runtime tests,
// which is why both are run before this ships.
export function isConstrainedField(field: EditableField): field is ConstrainedField {
  return field in CONSTRAINED_CHOICES;
}

export function isEditableField(field: string): field is EditableField {
  return (EDITABLE_FIELDS as readonly string[]).includes(field);
}

export function editFieldCallback(field: EditableField, candidateId: string): string {
  return withinLimit(`editfield:${field}:${candidateId}`);
}

export function editSetCallback(field: EditableField, value: string, candidateId: string): string {
  return withinLimit(`editset:${field}:${value}:${candidateId}`);
}

export interface ParsedEditField {
  field: string;
  candidateId: string;
}

/** "FIELD:candidateId" -- field names are plain words (see
 * EDITABLE_FIELDS), never containing a colon, so this only needs to
 * split on the first one. */
export function parseEditField(rest: string): ParsedEditField | null {
  const idx = rest.indexOf(":");
  if (idx === -1) return null;
  const field = rest.slice(0, idx);
  const candidateId = rest.slice(idx + 1);
  if (!field || !candidateId) return null;
  return { field, candidateId };
}

export interface ParsedEditSet {
  field: string;
  value: string;
  candidateId: string;
}

/** "FIELD:VALUE:candidateId" -- VALUE is always one of
 * CONSTRAINED_CHOICES's own values (true/false, or the three type
 * strings), never itself containing a colon, by construction of
 * editSetCallback -- same first-two-colons rule as parseCalendarPick. */
export function parseEditSet(rest: string): ParsedEditSet | null {
  const parsed = parseLeadingWords(rest, 2);
  if (!parsed) return null;
  const [field, value] = parsed.values;
  return { field, value, candidateId: parsed.candidateId };
}

function parseLeadingWords(rest: string, count: number): { values: string[]; candidateId: string } | null {
  const values: string[] = [];
  let remainder = rest;
  for (let i = 0; i < count; i++) {
    const idx = remainder.indexOf(":");
    if (idx === -1) return null;
    values.push(remainder.slice(0, idx));
    remainder = remainder.slice(idx + 1);
  }
  if (!remainder) return null;
  return { values, candidateId: remainder };
}

export function buildFieldChoiceKeyboard(candidateId: string): InlineKeyboard {
  const rows: InlineButton[][] = EDITABLE_FIELDS.map((field) => [
    { text: FIELD_LABELS[field], callback_data: editFieldCallback(field, candidateId) },
  ]);
  rows.push([{ text: "← Back", callback_data: withinLimit(`editcancel:${candidateId}`) }]);
  return { inline_keyboard: rows };
}

export function buildConstrainedChoiceKeyboard(field: EditableField, candidateId: string): InlineKeyboard {
  const choices = CONSTRAINED_CHOICES[field];
  if (!choices) throw new Error(`${field} is not a constrained field -- has no fixed choice list`);
  const rows: InlineButton[][] = choices.map((c) => [
    { text: c.label, callback_data: editSetCallback(field, c.value, candidateId) },
  ]);
  rows.push([{ text: "← Back", callback_data: withinLimit(`editcancel:${candidateId}`) }]);
  return { inline_keyboard: rows };
}

// ------------------------------------------------------- review-card text

const TYPE_LABELS: Record<string, string> = {
  internship: "Internship",
  coop: "CO-OP Training",
  internship_or_coop: "Internship / CO-OP Training",
};

export const TEST_CANDIDATE_PREFIX = "test:";
export const TEST_CARD_BANNER = "🧪 <b>TEST MODE</b> — Approve and Reject are simulated; the website will not change.";

export function isTestCandidateId(candidateId: string): boolean {
  return candidateId.startsWith(TEST_CANDIDATE_PREFIX);
}

/** Telegram uses HTML parse mode for review cards. Every editable and
 * source-derived value must be escaped before it is inserted into the
 * message, including URL attributes. */
export function escapeTelegramHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function riyadhTodayIso(): string {
  // Riyadh is UTC+03 year-round (no daylight-saving changes).
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function referenceDateIso(post: Record<string, unknown>, todayIso?: string): string {
  const postedAt = nonEmptyString(post.posted_at);
  const datePrefix = postedAt?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return datePrefix ?? todayIso ?? riyadhTodayIso();
}

/** Mirrors agent/notify.py's format_card_message() so an edited card
 * keeps the same shape as the card Python originally sent. todayIso is
 * injectable only for deterministic tests of the deadline warning. */
export function formatPendingCardMessage(
  extracted: Record<string, unknown>,
  post: Record<string, unknown> = {},
  todayIso?: string,
): string {
  const company = nonEmptyString(extracted.company) ?? "Unknown company";
  const rawType = nonEmptyString(extracted.type) ?? "unknown";
  const typeLabel = TYPE_LABELS[rawType] ?? rawType;
  const location = nonEmptyString(extracted.location);
  const url = nonEmptyString(extracted.url);
  const deadline = nonEmptyString(extracted.deadline);
  const deadlineRaw = nonEmptyString(extracted.deadline_raw);
  const lines = [
    `Name: ${escapeTelegramHtml(company)}`,
    `Type: ${escapeTelegramHtml(typeLabel)}`,
  ];

  if (location) lines.push(`Location: ${escapeTelegramHtml(location)}`);
  if (url) {
    const escapedUrl = escapeTelegramHtml(url);
    lines.push(`Link: <a href="${escapedUrl}">${escapedUrl}</a>`);
  }
  if (deadline) {
    lines.push(`Deadline found: ${escapeTelegramHtml(deadline)}`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(deadline) && deadline < referenceDateIso(post, todayIso)) {
      const warning = `AI found ${deadline}, but that's already in the past \u2014 likely wrong, please check`;
      lines.push(`\u26a0\ufe0f ${escapeTelegramHtml(warning)}`);
    }
  } else if (deadlineRaw) {
    lines.push(`No clear deadline parsed \u2014 post said: \u201c${escapeTelegramHtml(deadlineRaw)}\u201d`);
  } else {
    lines.push("Deadline: not found \u2014 pick one below, or leave it blank");
  }

  lines.push(`Requires enrollment letter: ${extracted.requires_letter ? "Yes" : "No"}`);

  const contact = objectValue(extracted.contact);
  if (contact) {
    lines.push(
      `Contact only, no application link: ${escapeTelegramHtml(contact.type)} ${escapeTelegramHtml(contact.value)}`,
    );
  }

  const confidence = typeof extracted.confidence === "number" && Number.isFinite(extracted.confidence)
    ? extracted.confidence
    : 0;
  lines.push(`Confidence: ${Math.round(confidence * 100)}%`);

  const evidence = objectValue(extracted.evidence);
  const note = evidence && (nonEmptyString(evidence.note) ?? nonEmptyString(evidence.reason));
  if (note) lines.push(`Why: ${escapeTelegramHtml(note)}`);

  const permalink = nonEmptyString(post.permalink);
  if (permalink) {
    lines.push(`Source: <a href="${escapeTelegramHtml(permalink)}">original post</a>`);
  }
  const channel = nonEmptyString(post.channel);
  if (channel) lines.push(`From: ${escapeTelegramHtml(channel)}`);

  return lines.join("\n");
}

export function formatCandidateCardMessage(
  candidateId: string,
  extracted: Record<string, unknown>,
  post: Record<string, unknown> = {},
  todayIso?: string,
): string {
  const text = formatPendingCardMessage(extracted, post, todayIso);
  return isTestCandidateId(candidateId) ? `${TEST_CARD_BANNER}\n\n${text}` : text;
}

// -------------------------------------------------------- back-to-normal

/**
 * Mirrors notify.py's approval_keyboard() exactly -- button text,
 * order, and callback_data format all have to match, since this is
 * what the calendar/edit flows switch back to when Abood cancels or
 * finishes. This duplication is deliberate, not an oversight: the
 * Python side can't be called from a Vercel Edge function, and this
 * is the one piece of message-building logic small enough (3 rows) to
 * duplicate safely rather than build a cross-language RPC for. If the
 * button layout ever changes, both this function AND notify.py's
 * approval_keyboard() need updating together -- test-webhook-logic.ts
 * pins the exact shape below as a tripwire.
 */
export function buildApprovalKeyboard(candidateId: string, currentDeadline: string | null): InlineKeyboard {
  const deadlineText = currentDeadline ? `\u{1F4C5} Change deadline (${currentDeadline})` : "\u{1F4C5} Set deadline";
  return {
    inline_keyboard: [
      [
        { text: "✅ Approve", callback_data: withinLimit(`approve:${candidateId}`) },
        { text: "❌ Reject", callback_data: withinLimit(`reject:${candidateId}`) },
      ],
      [{ text: deadlineText, callback_data: withinLimit(`deadline:${candidateId}`) }],
      [{ text: "✏️ Edit a field", callback_data: withinLimit(`edit:${candidateId}`) }],
    ],
  };
}

const FREE_TEXT_LIMITS = {
  company: 200,
  location: 300,
  url: 2048,
} as const;

function tooLongMessage(label: string, limit: number, cancelInstruction: string): string {
  return `${label} is too long (maximum ${limit} characters) -- shorten it and try again, ${cancelInstruction}`;
}

/** Refuse empty, malformed, or unreasonably large free-text values.
 * Telegram messages can be thousands of characters long, but the
 * resulting review-card text and GitHub dispatch must stay comfortably
 * within their API limits. extract.py's validate() remains the final
 * word on whether a card is publishable. */
export function validateFieldValue(field: EditableField, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "That's empty -- reply with the new value, or tap Back to cancel.";
  if (field === "company" && trimmed.length > FREE_TEXT_LIMITS.company) {
    return tooLongMessage("Company name", FREE_TEXT_LIMITS.company, "or tap Back to cancel.");
  }
  if (field === "location" && trimmed.length > FREE_TEXT_LIMITS.location) {
    return tooLongMessage("Location", FREE_TEXT_LIMITS.location, "or tap Back to cancel.");
  }
  if (field === "url" && trimmed.length > FREE_TEXT_LIMITS.url) {
    return tooLongMessage("Application link", FREE_TEXT_LIMITS.url, "or tap Back to cancel.");
  }
  if (field === "url" && !/^https?:\/\/\S+$/i.test(trimmed)) {
    return "That doesn't look like a link (should start with http:// or https://) -- try again, or tap Back to cancel.";
  }
  return null;
}

// ---------------------------------------------------------- /new (create)
//
// A guided, step-by-step creation of a brand new card, for opportunities
// Abood finds somewhere other than the three watched channels. Triggered
// by sending the bot the plain text "/new"; "/cancel" abandons a draft
// in progress. Steps are asked in this fixed order:
//
//   company -> type (buttons) -> link -> location (skippable) ->
//   deadline (the same calendar as everywhere else) -> letter (buttons)
//
// Company/link/location are collected as ordinary text replies, reusing
// the SAME "is anything awaiting a reply" plumbing as the edit-a-field
// flow (see github-state.ts's findAwaitingCreation, parallel to
// findAwaitingEdit). Deliberately does NOT reimplement dedupe or
// publishing here -- once all six steps are answered, the webhook
// dispatches to a dedicated GitHub Actions workflow that runs a small
// Python script reusing dedupe.decide(), add_pending(), and
// send_candidate() directly, so a manually created card goes through
// the exact same duplicate check and review card as an AI-extracted
// one, not a second, untested path.

export const CREATION_STEPS = ["company", "type", "link", "location", "deadline", "letter"] as const;
export type CreationStep = (typeof CREATION_STEPS)[number];

export const CREATION_PROMPTS: Record<CreationStep, string> = {
  company: "Creating a new card. What's the company name?",
  type: "Type?",
  link: "Application link?",
  location: "Location? (or tap Skip if unknown)",
  deadline: "Deadline?",
  letter: "Does it require an enrollment/proof-of-enrollment letter?",
};

export function nextCreationStep(step: CreationStep): CreationStep | "done" {
  const idx = CREATION_STEPS.indexOf(step);
  return idx === CREATION_STEPS.length - 1 ? "done" : CREATION_STEPS[idx + 1];
}

export function isCreationStep(step: string): step is CreationStep {
  return (CREATION_STEPS as readonly string[]).includes(step);
}

// The step names above are chosen for what Abood reads ("link" reads
// better than "url" in a prompt); the field names below are what
// Extracted/pending.json/create_candidate.py actually call them. Two
// of the six line up by coincidence (company, type, location,
// deadline share both names) -- "link" -> "url" and "letter" ->
// "requires_letter" don't, so this mapping is what keeps a stored
// draft field readable by create_candidate.py's Extracted dataclass
// instead of silently landing under the wrong key.
export const CREATION_STEP_FIELD: Record<CreationStep, string> = {
  company: "company",
  type: "type",
  link: "url",
  location: "location",
  deadline: "deadline",
  letter: "requires_letter",
};

export function isCreationCommand(text: string): boolean {
  return /^\/new(@\w+)?\s*$/i.test(text.trim());
}

export function isCancelCommand(text: string): boolean {
  return /^\/cancel(@\w+)?\s*$/i.test(text.trim());
}

// Routed the same way CALENDAR_ACTIONS/EDIT_ACTIONS are -- handled
// locally via the Contents API, never through GitHub Actions, since
// each is just advancing a draft one step (or bailing out of it), not
// touching companies.js/App.jsx.
export const CREATION_ACTIONS = new Set(["newtype", "newletter", "newskip", "newcancel"]);

// "newtype:VALUE:draftId", "newletter:VALUE:draftId", "newskip:draftId",
// "newcancel:draftId" -- same colon-counting rules as the edit-flow
// callbacks above (parseLeadingWords / parseCallbackData).

export function newTypeCallback(value: string, draftId: string): string {
  return withinLimit(`newtype:${value}:${draftId}`);
}

export function newLetterCallback(value: string, draftId: string): string {
  return withinLimit(`newletter:${value}:${draftId}`);
}

export interface ParsedNewChoice {
  value: string;
  draftId: string;
}

export function parseNewChoice(rest: string): ParsedNewChoice | null {
  const idx = rest.indexOf(":");
  if (idx === -1) return null;
  const value = rest.slice(0, idx);
  const draftId = rest.slice(idx + 1);
  if (!value || !draftId) return null;
  return { value, draftId };
}

export function buildTypeChoiceKeyboard(draftId: string): InlineKeyboard {
  const choices = CONSTRAINED_CHOICES.type!;
  return {
    inline_keyboard: [
      ...choices.map((c) => [{ text: c.label, callback_data: newTypeCallback(c.value, draftId) }]),
      [{ text: "Cancel", callback_data: withinLimit(`newcancel:${draftId}`) }],
    ],
  };
}

export function buildLetterChoiceKeyboard(draftId: string): InlineKeyboard {
  const choices = CONSTRAINED_CHOICES.requires_letter!;
  return {
    inline_keyboard: [
      ...choices.map((c) => [{ text: c.label, callback_data: newLetterCallback(c.value, draftId) }]),
      [{ text: "Cancel", callback_data: withinLimit(`newcancel:${draftId}`) }],
    ],
  };
}

export function buildLocationPromptKeyboard(draftId: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [{ text: "Skip (unknown)", callback_data: withinLimit(`newskip:${draftId}`) }],
      [{ text: "Cancel", callback_data: withinLimit(`newcancel:${draftId}`) }],
    ],
  };
}

/** Same rules as validateFieldValue, plus creation values can never
 * be empty -- unlike an edit, a draft has nothing to fall back to. */
export function validateCreationValue(step: "company" | "link" | "location", value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "That's empty -- please reply with a value, or send /cancel to abandon this card.";
  if (step === "company" && trimmed.length > FREE_TEXT_LIMITS.company) {
    return tooLongMessage("Company name", FREE_TEXT_LIMITS.company, "or send /cancel.");
  }
  if (step === "location" && trimmed.length > FREE_TEXT_LIMITS.location) {
    return tooLongMessage("Location", FREE_TEXT_LIMITS.location, "or send /cancel.");
  }
  if (step === "link" && trimmed.length > FREE_TEXT_LIMITS.url) {
    return tooLongMessage("Application link", FREE_TEXT_LIMITS.url, "or send /cancel.");
  }
  if (step === "link" && !/^https?:\/\/\S+$/i.test(trimmed)) {
    return "That doesn't look like a link (should start with http:// or https://) -- try again, or send /cancel.";
  }
  return null;
}

export interface CreateDispatchPayload {
  event_type: "telegram-create";
  client_payload: {
    draft_id: string;
    company: string;
    type: string;
    url: string;
    location: string; // "" means none -- create_candidate.py treats blank as "not provided"
    deadline: string; // "" means none
    requires_letter: "true" | "false";
  };
}

/** What gets POSTed to trigger create-candidate.yml once all six steps
 * are answered. A distinct event_type from buildDispatchPayload's
 * "telegram-decision" -- a separate workflow, not an overload of the
 * approve/reject one, since this runs different Python (dedupe against
 * companies.js + add_pending + send_candidate, never publish.py). */
export function buildCreateDispatchPayload(
  draftId: string,
  fields: {
    company: string;
    type: string;
    url: string;
    location: string | null;
    deadline: string | null;
    requiresLetter: boolean;
  },
): CreateDispatchPayload {
  return {
    event_type: "telegram-create",
    client_payload: {
      draft_id: draftId,
      company: fields.company,
      type: fields.type,
      url: fields.url,
      location: fields.location ?? "",
      deadline: fields.deadline ?? "",
      requires_letter: fields.requiresLetter ? "true" : "false",
    },
  };
}
