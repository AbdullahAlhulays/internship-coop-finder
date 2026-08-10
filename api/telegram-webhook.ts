// Receives Telegram's callback_query updates (button taps) and does
// two things, fast:
//
//   1. Immediately acknowledges the tap (answerCallbackQuery), so the
//      button stops spinning. Telegram shows an infinite loading
//      spinner on a button until this is called -- that's exactly
//      what happened before this file existed.
//   2. For Approve/Reject, tells GitHub to actually process the
//      decision (via repository_dispatch). The real file-editing
//      logic lives entirely in process_approval.py, not here -- this
//      file's whole job is "receive the tap, unstick the UI, hand off
//      to the code that's actually allowed to touch the site."
//
// DEPLOY: place this file at api/telegram-webhook.ts in your Vercel
// project. Vercel's zero-config convention turns any file under /api
// into its own serverless function, regardless of the rest of the app
// being a Vite SPA -- no extra Vercel config needed.
//
// This file also needs webhook-logic.ts next to it (copy it into the
// same api/ folder, or a shared lib/ folder with the import path
// adjusted) -- that's where the pure, tested logic lives (see
// test-webhook-logic.ts).
//
// ENV VARS needed in Vercel (Project -> Settings -> Environment Variables):
//   TELEGRAM_BOT_TOKEN       same bot token used everywhere else
//   TELEGRAM_CHAT_ID         the only chat allowed to use this bot; must
//                            match the GitHub Actions secret of the same name
//   TELEGRAM_WEBHOOK_SECRET  a random string YOU make up (e.g. a long
//                            password) -- proves a request really came
//                            from Telegram, not a random POST to a
//                            guessable public URL. Set the same value
//                            when registering the webhook (see
//                            TOKEN_SETUP.md's webhook section).
//   GITHUB_DISPATCH_TOKEN    a GitHub personal access token, `repo`
//                            scope. Used to trigger the Approve/Reject
//                            Actions workflow AND, directly from this
//                            function, to read/write state/pending.json
//                            for the calendar and edit-field flows (see
//                            github-state.ts) -- those can't afford a
//                            full Actions round-trip (10-60+ seconds)
//                            just to feel like tapping a calendar day
//                            worked. This is the most powerful secret
//                            in the whole system -- it can write to
//                            your repo. Treat it accordingly.
//   GITHUB_REPO              "your-username/your-repo-name"

export const config = { runtime: "edge" };

import {
  buildApprovalKeyboard,
  buildCalendarKeyboard,
  buildConstrainedChoiceKeyboard,
  buildCreateDispatchPayload,
  buildFieldChoiceKeyboard,
  buildDispatchPayload,
  buildLetterChoiceKeyboard,
  buildLocationPromptKeyboard,
  buildTypeChoiceKeyboard,
  CALENDAR_ACTIONS,
  CREATION_ACTIONS,
  CREATION_PROMPTS,
  CREATION_STEP_FIELD,
  type CreationStep,
  EDIT_ACTIONS,
  EditableField,
  FIELD_LABELS,
  formatCandidateCardMessage,
  formatIsoDate,
  isCancelCommand,
  isConstrainedField,
  isCreationCommand,
  isCreationStep,
  isEditableField,
  isAuthorizedChat,
  isFromTelegram,
  isHandledAction,
  nextCreationStep,
  parseCalendarNav,
  parseCalendarPick,
  parseCallbackData,
  parseEditField,
  parseEditSet,
  parseNewChoice,
  validateCreationValue,
  validateFieldValue,
} from "./webhook-logic";
import {
  applyAwaitingEditPatch,
  applyCreationFieldAndAdvance,
  applyDeadlinePatch,
  applyFieldValuePatch,
  clearAwaitingEdit,
  createDraft,
  discardDraft,
  findAppliedEditRetry,
  findAwaitingCreation,
  findAwaitingEdit,
  newDraftId,
  patchPending,
  PatchError,
  readPending,
  restoreDraft,
  type PendingFile,
  type PendingRecord,
} from "./github-state";

const TELEGRAM_API = "https://api.telegram.org";

class TelegramApiError extends Error {}

interface TelegramUpdate {
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number | string }; message_id: number };
  };
  message?: {
    message_id?: number;
    text?: string;
    chat: { id: number | string };
  };
}

async function answerCallbackQuery(token: string, callbackQueryId: string, text?: string): Promise<void> {
  await fetch(`${TELEGRAM_API}/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
      show_alert: Boolean(text),
    }),
  });
}

async function editMessageReplyMarkup(
  token: string,
  chatId: number | string,
  messageId: number,
  replyMarkup: unknown,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${TELEGRAM_API}/bot${token}/editMessageReplyMarkup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: replyMarkup }),
    });
  } catch (err) {
    throw new TelegramApiError(`Telegram editMessageReplyMarkup network failure: ${String(err)}`);
  }
  if (!response.ok) {
    const detail = await response.text();
    // A webhook retry can legitimately ask Telegram to apply the same
    // keyboard twice after the first edit succeeded but the following
    // prompt failed. Telegram reports that idempotent replay as 400.
    if (response.status === 400 && detail.toLowerCase().includes("message is not modified")) return;
    throw new TelegramApiError(`Telegram editMessageReplyMarkup failed (${response.status}): ${detail}`);
  }
}

async function editMessageText(
  token: string,
  chatId: number | string,
  messageId: number,
  text: string,
  replyMarkup: unknown,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${TELEGRAM_API}/bot${token}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: replyMarkup,
      }),
    });
  } catch (err) {
    throw new TelegramApiError(`Telegram editMessageText network failure: ${String(err)}`);
  }
  if (!response.ok) {
    const detail = await response.text();
    // Telegram uses this 400 for a successful idempotent replay after
    // our first response was lost. Treat it as already completed.
    if (response.status === 400 && detail.toLowerCase().includes("message is not modified")) return;
    throw new TelegramApiError(`Telegram editMessageText failed (${response.status}): ${detail}`);
  }
}

async function sendPlainMessage(token: string, chatId: number | string, text: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (err) {
    throw new TelegramApiError(`Telegram sendMessage network failure: ${String(err)}`);
  }
  if (!response.ok) {
    throw new TelegramApiError(`Telegram sendMessage failed (${response.status}): ${await response.text()}`);
  }
}

/** Same as sendPlainMessage, but attaches a keyboard -- used to open a
 * NEW prompt message for a /new step (type/location/deadline/letter),
 * as opposed to editMessageReplyMarkup, which only changes the
 * keyboard on a message that's already there. */
async function sendMessageWithKeyboard(token: string, chatId: number | string, text: string, replyMarkup: unknown): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, reply_markup: replyMarkup }),
    });
  } catch (err) {
    throw new TelegramApiError(`Telegram sendMessage with keyboard network failure: ${String(err)}`);
  }
  if (!response.ok) {
    throw new TelegramApiError(`Telegram sendMessage with keyboard failed (${response.status}): ${await response.text()}`);
  }
}

async function postDispatch(repo: string, ghToken: string, payload: unknown): Promise<void> {
  const response = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub rejected the dispatch (${response.status}): ${body}`);
  }
}

async function dispatchToGitHub(repo: string, ghToken: string, action: string, candidateId: string): Promise<void> {
  await postDispatch(repo, ghToken, buildDispatchPayload(action, candidateId));
}

function currentDeadlineOf(pending: PendingFile, candidateId: string): string | null {
  const raw = pending[candidateId]?.extracted?.deadline;
  return typeof raw === "string" ? raw : null;
}

function storedCardMessageId(record: PendingRecord | undefined): number | undefined {
  const value = record?.delivery?.telegram_message_id;
  return typeof value === "number" ? value : undefined;
}

async function refreshPendingCard(
  token: string,
  chatId: number | string,
  messageId: number,
  candidateId: string,
  pending: PendingFile,
): Promise<void> {
  const record = pending[candidateId];
  if (!record) {
    throw new PatchError(`${candidateId} is no longer pending -- the Telegram card cannot be refreshed`);
  }
  await editMessageText(
    token,
    chatId,
    messageId,
    formatCandidateCardMessage(candidateId, record.extracted, record.post),
    buildApprovalKeyboard(candidateId, currentDeadlineOf(pending, candidateId)),
  );
}

/**
 * Everything that isn't Approve/Reject: the deadline calendar and the
 * edit-a-field flow. Both write directly to state/pending.json via
 * GitHub's Contents API (github-state.ts) instead of going through
 * GitHub Actions, because those need to feel roughly instant when
 * Abood taps a calendar day, not take 10-60+ seconds.
 */
async function handleLocalAction(
  action: string,
  rest: string,
  callbackQueryId: string,
  chatId: number | string,
  messageId: number,
  token: string,
): Promise<Response> {
  const repo = process.env.GITHUB_REPO;
  const ghToken = process.env.GITHUB_DISPATCH_TOKEN;
  if (!repo || !ghToken) {
    await answerCallbackQuery(token, callbackQueryId, "Server misconfigured: GITHUB_REPO or GITHUB_DISPATCH_TOKEN not set.");
    return new Response("ok", { status: 200 });
  }

  try {
    switch (action) {
      case "calnoop": {
        await answerCallbackQuery(token, callbackQueryId);
        return new Response("ok", { status: 200 });
      }

      case "deadline": {
        // Entry point: rest is just the candidateId here (no year/month yet).
        const now = new Date();
        const kb = buildCalendarKeyboard(now.getUTCFullYear(), now.getUTCMonth() + 1, rest);
        await answerCallbackQuery(token, callbackQueryId);
        await editMessageReplyMarkup(token, chatId, messageId, kb);
        return new Response("ok", { status: 200 });
      }

      case "cal": {
        const nav = parseCalendarNav(rest);
        if (!nav) throw new Error("malformed calendar navigation button");
        const kb = buildCalendarKeyboard(nav.year, nav.month, nav.candidateId);
        await answerCallbackQuery(token, callbackQueryId);
        await editMessageReplyMarkup(token, chatId, messageId, kb);
        return new Response("ok", { status: 200 });
      }

      case "calback": {
        // Same button, two different meanings depending on whether the
        // id behind it is a real pending candidate or a /new draft
        // still mid-collection (see creating_step) -- a draft has no
        // approval keyboard to go back to yet, so "Back" here just
        // means "skip the deadline", same as "No deadline" below.
        const candidateId = rest;
        const pending = await readPending(repo, ghToken);
        const record = pending[candidateId];
        await answerCallbackQuery(token, callbackQueryId);
        if (record?.creating_step) {
          await resolveCreationDeadline(candidateId, null, chatId, messageId, token, repo, ghToken);
        } else {
          await editMessageReplyMarkup(token, chatId, messageId, buildApprovalKeyboard(candidateId, currentDeadlineOf(pending, candidateId)));
        }
        return new Response("ok", { status: 200 });
      }

      case "calnone": {
        const candidateId = rest;
        const pending = await readPending(repo, ghToken);
        const record = pending[candidateId];
        if (record?.creating_step) {
          await answerCallbackQuery(token, callbackQueryId);
          await resolveCreationDeadline(candidateId, null, chatId, messageId, token, repo, ghToken);
        } else {
          const updated = await patchPending(repo, ghToken, `Telegram: clear deadline for ${candidateId}`, (data) => applyDeadlinePatch(data, candidateId, null));
          await answerCallbackQuery(token, callbackQueryId, "Deadline cleared.");
          await refreshPendingCard(token, chatId, messageId, candidateId, updated);
        }
        return new Response("ok", { status: 200 });
      }

      case "calpick": {
        const pick = parseCalendarPick(rest);
        if (!pick) throw new Error("malformed calendar day button");
        const iso = formatIsoDate(pick.year, pick.month, pick.day);
        const pending = await readPending(repo, ghToken);
        const record = pending[pick.candidateId];
        if (record?.creating_step) {
          await answerCallbackQuery(token, callbackQueryId, `Deadline set: ${iso}`);
          await resolveCreationDeadline(pick.candidateId, iso, chatId, messageId, token, repo, ghToken);
        } else {
          const updated = await patchPending(repo, ghToken, `Telegram: set deadline ${iso} for ${pick.candidateId}`, (data) => applyDeadlinePatch(data, pick.candidateId, iso));
          await answerCallbackQuery(token, callbackQueryId, `Deadline set: ${iso}`);
          await refreshPendingCard(token, chatId, messageId, pick.candidateId, updated);
        }
        return new Response("ok", { status: 200 });
      }

      case "edit": {
        // Entry point: rest is just the candidateId.
        await answerCallbackQuery(token, callbackQueryId);
        await editMessageReplyMarkup(token, chatId, messageId, buildFieldChoiceKeyboard(rest));
        return new Response("ok", { status: 200 });
      }

      case "editcancel": {
        const candidateId = rest;
        const pending = await patchPending(repo, ghToken, `Telegram: cancel edit for ${candidateId}`, (data) => clearAwaitingEdit(data, candidateId));
        await answerCallbackQuery(token, callbackQueryId);
        await editMessageReplyMarkup(token, chatId, messageId, buildApprovalKeyboard(candidateId, currentDeadlineOf(pending, candidateId)));
        return new Response("ok", { status: 200 });
      }

      case "editfield": {
        const parsed = parseEditField(rest);
        if (!parsed || !isEditableField(parsed.field)) throw new Error("malformed edit-field button");
        const { field, candidateId } = parsed;
        if (isConstrainedField(field)) {
          await answerCallbackQuery(token, callbackQueryId);
          await editMessageReplyMarkup(token, chatId, messageId, buildConstrainedChoiceKeyboard(field, candidateId));
        } else {
          await patchPending(repo, ghToken, `Telegram: awaiting ${field} for ${candidateId}`, (data) =>
            applyAwaitingEditPatch(data, candidateId, field, messageId));
          await answerCallbackQuery(token, callbackQueryId, `Reply to this chat with the new ${FIELD_LABELS[field].toLowerCase()}.`);
        }
        return new Response("ok", { status: 200 });
      }

      case "editset": {
        const parsed = parseEditSet(rest);
        if (!parsed || !isEditableField(parsed.field)) throw new Error("malformed edit-set button");
        const { field, value, candidateId } = parsed;
        const typedValue: unknown = field === "requires_letter" ? value === "true" : value;
        const pending = await patchPending(repo, ghToken, `Telegram: set ${field} for ${candidateId}`, (data) =>
          applyFieldValuePatch(data, candidateId, field, typedValue, undefined, messageId));
        await answerCallbackQuery(token, callbackQueryId, "Updated.");
        await refreshPendingCard(token, chatId, messageId, candidateId, pending);
        return new Response("ok", { status: 200 });
      }

      case "newtype": {
        const parsed = parseNewChoice(rest);
        if (!parsed) throw new Error("malformed newtype button");
        const { value, draftId } = parsed;
        const next = nextCreationStep("type"); // always "link"
        await patchPending(repo, ghToken, `Telegram: /new type=${value} for ${draftId}`, (data) =>
          applyCreationFieldAndAdvance(data, draftId, CREATION_STEP_FIELD.type, value, next));
        await answerCallbackQuery(token, callbackQueryId);
        await editMessageReplyMarkup(token, chatId, messageId, { inline_keyboard: [] });
        if (next !== "done") await promptForStep(draftId, next, chatId, token);
        return new Response("ok", { status: 200 });
      }

      case "newskip": {
        const draftId = rest; // "newskip:draftId" -- no extra value, like calnone/calback
        const next = nextCreationStep("location"); // always "deadline"
        await patchPending(repo, ghToken, `Telegram: /new location skipped for ${draftId}`, (data) =>
          applyCreationFieldAndAdvance(data, draftId, CREATION_STEP_FIELD.location, "", next));
        await answerCallbackQuery(token, callbackQueryId);
        await editMessageReplyMarkup(token, chatId, messageId, { inline_keyboard: [] });
        if (next !== "done") await promptForStep(draftId, next, chatId, token);
        return new Response("ok", { status: 200 });
      }

      case "newletter": {
        const parsed = parseNewChoice(rest);
        if (!parsed) throw new Error("malformed newletter button");
        const { value, draftId } = parsed;
        await answerCallbackQuery(token, callbackQueryId);
        await editMessageReplyMarkup(token, chatId, messageId, { inline_keyboard: [] });
        await finishCreation(draftId, value, chatId, token, repo, ghToken);
        return new Response("ok", { status: 200 });
      }

      case "newcancel": {
        const draftId = rest;
        await patchPending(repo, ghToken, `Telegram: /new cancelled for ${draftId}`, (data) => discardDraft(data, draftId));
        await answerCallbackQuery(token, callbackQueryId, "Cancelled.");
        await editMessageReplyMarkup(token, chatId, messageId, { inline_keyboard: [] });
        return new Response("ok", { status: 200 });
      }

      default:
        await answerCallbackQuery(token, callbackQueryId, "Not built yet — for now, Approve or Reject this card as-is.");
        return new Response("ok", { status: 200 });
    }
  } catch (err) {
    if (err instanceof TelegramApiError) {
      // A 5xx makes Telegram retry the exact same update. Every local
      // state transition above is idempotent, including the special
      // "message is not modified" handling in both Telegram edit calls.
      console.error("telegram-webhook: Telegram delivery failed; requesting update retry", action, err);
      return new Response("Telegram delivery failed", { status: 502 });
    }
    const message = err instanceof PatchError
      ? err.message
      : "Something went wrong saving that — please try again, or reject and re-check the source post.";
    console.error("telegram-webhook: local action failed", action, err);
    await answerCallbackQuery(token, callbackQueryId, message);
    return new Response("ok", { status: 200 });
  }
}

// ---------------------------------------------------------- /new (create)

/** After the deadline calendar resolves (a day picked, "No deadline",
 * or "← Back", all treated the same for a draft -- see the calpick/
 * calnone/calback cases above), advance the draft to the last step
 * and swap the SAME message's keyboard over to the letter choice, no
 * new message needed. */
async function resolveCreationDeadline(
  draftId: string,
  iso: string | null,
  chatId: number | string,
  messageId: number,
  token: string,
  repo: string,
  ghToken: string,
): Promise<void> {
  const next = nextCreationStep("deadline"); // always "letter"
  await patchPending(repo, ghToken, `Telegram: /new deadline=${iso ?? "none"} for ${draftId}`, (data) =>
    applyCreationFieldAndAdvance(data, draftId, CREATION_STEP_FIELD.deadline, iso, next));
  if (next !== "done") {
    await editMessageReplyMarkup(token, chatId, messageId, buildLetterChoiceKeyboard(draftId));
  }
}

/** Sends the prompt for whatever step comes next -- a keyboard for the
 * button-driven steps (type/location/deadline/letter), plain text for
 * the free-text ones (company/link). Used both right after a text
 * reply advances the draft and right after a button-driven step does. */
async function promptForStep(draftId: string, step: CreationStep, chatId: number | string, token: string): Promise<void> {
  switch (step) {
    case "type":
      await sendMessageWithKeyboard(token, chatId, CREATION_PROMPTS.type, buildTypeChoiceKeyboard(draftId));
      return;
    case "location":
      await sendMessageWithKeyboard(token, chatId, CREATION_PROMPTS.location, buildLocationPromptKeyboard(draftId));
      return;
    case "deadline": {
      const now = new Date();
      await sendMessageWithKeyboard(token, chatId, CREATION_PROMPTS.deadline, buildCalendarKeyboard(now.getUTCFullYear(), now.getUTCMonth() + 1, draftId));
      return;
    }
    case "letter":
      await sendMessageWithKeyboard(token, chatId, CREATION_PROMPTS.letter, buildLetterChoiceKeyboard(draftId));
      return;
    case "company":
    case "link":
      await sendPlainMessage(token, chatId, CREATION_PROMPTS[step]);
      return;
  }
}

/** Writes one text-answered field and moves the draft to whatever step
 * comes next. Shared by the company/link/location replies -- the only
 * three steps a plain-text message can ever answer. */
async function advanceCreationAndPrompt(
  draftId: string,
  step: "company" | "link" | "location",
  value: string,
  chatId: number | string,
  token: string,
  repo: string,
  ghToken: string,
  messageId?: number,
): Promise<void> {
  const next = nextCreationStep(step);
  await patchPending(repo, ghToken, `Telegram: /new ${step} for ${draftId}`, (data) =>
    applyCreationFieldAndAdvance(data, draftId, CREATION_STEP_FIELD[step], value, next, messageId));
  if (next === "done") {
    // Unreachable given CREATION_STEPS' fixed order (company/link/location
    // are never last) -- logged rather than silently ignored in case that
    // order ever changes without this function being revisited.
    console.error("telegram-webhook: unexpected 'done' immediately after a text step", step, draftId);
    return;
  }
  await promptForStep(draftId, next, chatId, token);
}

/** The last step: a requires_letter choice was just tapped. Reads the
 * draft's accumulated fields, removes the draft from pending.json (its
 * job -- collecting fields for THIS dispatch -- is done, and leaving it
 * behind would collide with create_candidate.py's add_pending() call,
 * which refuses to overwrite an existing id), then hands the whole
 * card to create-candidate.yml the same way approve/reject hands off
 * to process-approval.yml. If dispatch fails, the draft is restored at
 * the letter step so no typed answers are lost. */
async function finishCreation(
  draftId: string,
  requiresLetterValue: string,
  chatId: number | string,
  token: string,
  repo: string,
  ghToken: string,
): Promise<void> {
  let captured: Record<string, unknown> | null = null;
  try {
    await patchPending(repo, ghToken, `Telegram: /new complete for ${draftId}`, (data) => {
      const record = data[draftId];
      if (!record) throw new PatchError(`${draftId} draft not found -- it may already have been cancelled or completed`);
      captured = record.extracted;
      return discardDraft(data, draftId);
    });
  } catch (err) {
    const detail = err instanceof PatchError ? err.message : "please try again";
    await sendPlainMessage(token, chatId, `Couldn't finish that card — ${detail}`);
    return;
  }
  if (!captured) {
    await sendPlainMessage(token, chatId, "Something went wrong finishing that card — please /new again.");
    return;
  }

  const c: Record<string, unknown> = captured;
  const fields = {
    company: typeof c.company === "string" ? c.company : "",
    type: typeof c.type === "string" ? c.type : "",
    url: typeof c.url === "string" ? c.url : "",
    location: typeof c.location === "string" && c.location ? c.location : null,
    deadline: typeof c.deadline === "string" && c.deadline ? c.deadline : null,
    requiresLetter: requiresLetterValue === "true",
  };

  try {
    await postDispatch(repo, ghToken, buildCreateDispatchPayload(draftId, fields));
  } catch (err) {
    // The draft was already removed above so create_candidate.py can
    // claim the same id. Restore it before returning, making a transient
    // GitHub failure retryable without asking Abood to retype six fields.
    console.error("telegram-webhook: /new dispatch to GitHub failed", err);
    try {
      await patchPending(repo, ghToken, `Telegram: restore /new draft ${draftId} after dispatch failure`, (data) =>
        restoreDraft(data, draftId, captured!),
      );
    } catch (restoreErr) {
      console.error("telegram-webhook: failed to restore /new draft after dispatch failure", restoreErr);
      await sendPlainMessage(
        token,
        chatId,
        "Couldn't submit that card, and automatic draft recovery also failed. Please check Vercel logs before trying again.",
      );
      return;
    }
    await sendMessageWithKeyboard(
      token,
      chatId,
      "GitHub couldn't accept that card just now. Your answers were saved — tap the letter choice again to retry.",
      buildLetterChoiceKeyboard(draftId),
    );
    return;
  }
  try {
    await sendPlainMessage(token, chatId, `Creating card for "${fields.company}"… you'll get the review card shortly.`);
  } catch (err) {
    // repository_dispatch already succeeded and cannot be rolled back.
    // Do not ask Telegram to replay the final button (which could send
    // the dispatch twice); the Actions workflow will deliver the real
    // review card shortly even if this courtesy message was lost.
    console.error("telegram-webhook: post-dispatch confirmation failed", err);
  }
}

async function handleNewCommand(chatId: number | string, token: string, repo: string, ghToken: string): Promise<Response> {
  const pending = await readPending(repo, ghToken);
  const existing = findAwaitingCreation(pending);
  if (existing.status === "found") {
    if (isCreationStep(existing.step)) {
      await promptForStep(existing.draftId, existing.step, chatId, token);
    } else {
      await sendPlainMessage(token, chatId, "A saved draft is in an invalid state. Send /cancel before trying again.");
    }
    return new Response("ok", { status: 200 });
  }
  if (existing.status === "ambiguous") {
    await sendPlainMessage(token, chatId, "More than one draft exists. Check state/pending.json before creating another card.");
    return new Response("ok", { status: 200 });
  }
  const draftId = newDraftId();
  try {
    await patchPending(repo, ghToken, `Telegram: start /new draft ${draftId}`, (data) => createDraft(data, draftId));
  } catch (err) {
    const detail = err instanceof PatchError ? err.message : "please try again";
    await sendPlainMessage(token, chatId, `Couldn't start a new card — ${detail}`);
    return new Response("ok", { status: 200 });
  }
  await sendPlainMessage(token, chatId, CREATION_PROMPTS.company);
  return new Response("ok", { status: 200 });
}

async function handleCancelCommand(chatId: number | string, token: string, repo: string, ghToken: string): Promise<Response> {
  const pending = await readPending(repo, ghToken);
  const lookup = findAwaitingCreation(pending);
  if (lookup.status === "none") {
    await sendPlainMessage(token, chatId, "Nothing to cancel — no card is currently being created.");
    return new Response("ok", { status: 200 });
  }
  if (lookup.status === "ambiguous") {
    await sendPlainMessage(token, chatId, "More than one card is being created — this shouldn't normally happen. Check pending.json directly.");
    return new Response("ok", { status: 200 });
  }
  await patchPending(repo, ghToken, `Telegram: cancel /new draft ${lookup.draftId}`, (data) => discardDraft(data, lookup.draftId));
  await sendPlainMessage(token, chatId, "Cancelled.");
  return new Response("ok", { status: 200 });
}

/** A plain text reply while a /new draft is mid-collection. Only
 * company/link/location are ever actually answered this way --
 * type/deadline/letter are button-only, so a text reply during one of
 * those steps is told to use the buttons instead of being silently
 * accepted or misinterpreted. */
async function handleCreationTextReply(
  message: NonNullable<TelegramUpdate["message"]>,
  token: string,
  repo: string,
  ghToken: string,
  step: string,
  draftId: string,
  lastMessageId?: number,
): Promise<Response> {
  const chatId = message.chat.id;
  const text = (message.text ?? "").trim();

  // isCreationStep narrows `step` from plain `string` to the CreationStep
  // union FIRST, before any of the literal comparisons below -- doing it
  // in the other order (compare against "type"/"letter"/"deadline" while
  // step is still just `string`, narrow afterward) is exactly the same
  // mistake isConstrainedField made in webhook-logic.ts: the later `step
  // === "company" | "link"` usage wouldn't narrow away "deadline" etc.,
  // and tsc would refuse to accept it as `"company" | "link"`. Caught by
  // `tsc --noEmit`, not the runtime tests -- same lesson, same fix shape.
  if (!isCreationStep(step)) {
    return new Response("ok", { status: 200 }); // defensive; shouldn't happen -- creating_step is only ever set by this same code
  }

  // Telegram is retrying a text update whose state write succeeded
  // but whose next prompt failed. Re-send the current prompt; never
  // reinterpret that same text as the next field.
  if (message.message_id !== undefined && message.message_id === lastMessageId) {
    await promptForStep(draftId, step, chatId, token);
    return new Response("ok", { status: 200 });
  }

  if (step === "type" || step === "letter") {
    await sendPlainMessage(token, chatId, "Please use the buttons above to answer this one, or send /cancel to abandon this card.");
    return new Response("ok", { status: 200 });
  }
  if (step === "deadline") {
    await sendPlainMessage(token, chatId, 'Please tap a day on the calendar above (or "No deadline"), or send /cancel to abandon this card.');
    return new Response("ok", { status: 200 });
  }

  if (step === "location") {
    const error = validateCreationValue("location", text);
    if (error) {
      await sendPlainMessage(token, chatId, error);
      return new Response("ok", { status: 200 });
    }
    await advanceCreationAndPrompt(draftId, "location", text, chatId, token, repo, ghToken, message.message_id);
    return new Response("ok", { status: 200 });
  }

  // step is "company" | "link" here
  const error = validateCreationValue(step, text);
  if (error) {
    await sendPlainMessage(token, chatId, error);
    return new Response("ok", { status: 200 });
  }
  await advanceCreationAndPrompt(draftId, step, text, chatId, token, repo, ghToken, message.message_id);
  return new Response("ok", { status: 200 });
}

/**
 * A plain text message. Checked, in order, against: the /new and
 * /cancel commands; whether a /new draft is currently awaiting a
 * text-answered step (company/link/location); whether ANY pending
 * candidate is waiting on a free-text edit reply (see EDIT_ACTIONS'
 * "editfield" case above). Ignored quietly if none of those match --
 * this is the only way an ordinary, unrelated message to the bot
 * doesn't produce a confusing response.
 */
async function handleTextMessage(update: TelegramUpdate, token: string): Promise<Response> {
  const message = update.message;
  if (!message?.text || !message.chat) {
    return new Response("ok", { status: 200 });
  }

  const repo = process.env.GITHUB_REPO;
  const ghToken = process.env.GITHUB_DISPATCH_TOKEN;
  if (!repo || !ghToken) {
    return new Response("ok", { status: 200 }); // can't act usefully; stay silent rather than error on every message
  }

  const text = message.text;

  if (isCreationCommand(text)) {
    return handleNewCommand(message.chat.id, token, repo, ghToken);
  }
  if (isCancelCommand(text)) {
    return handleCancelCommand(message.chat.id, token, repo, ghToken);
  }

  const pending = await readPending(repo, ghToken);

  const creationLookup = findAwaitingCreation(pending);
  if (creationLookup.status === "found") {
    return handleCreationTextReply(
      message,
      token,
      repo,
      ghToken,
      creationLookup.step,
      creationLookup.draftId,
      creationLookup.lastMessageId,
    );
  }
  if (creationLookup.status === "ambiguous") {
    await sendPlainMessage(token, message.chat.id, "More than one card is currently being created — this shouldn't normally happen. Send /cancel and try /new again.");
    return new Response("ok", { status: 200 });
  }

  const lookup = findAwaitingEdit(pending);

  if (message.message_id !== undefined) {
    const appliedRetry = findAppliedEditRetry(pending, message.message_id);
    if (appliedRetry.status === "found" && isEditableField(appliedRetry.field)) {
      const cardMessageId = appliedRetry.cardMessageId
        ?? storedCardMessageId(pending[appliedRetry.candidateId]);
      if (cardMessageId !== undefined) {
        await refreshPendingCard(token, message.chat.id, cardMessageId, appliedRetry.candidateId, pending);
      }
      await sendPlainMessage(
        token,
        message.chat.id,
        `Updated. ${FIELD_LABELS[appliedRetry.field]}: "${String(appliedRetry.value ?? "")}"`,
      );
      return new Response("ok", { status: 200 });
    }
    if (appliedRetry.status === "ambiguous") {
      await sendPlainMessage(token, message.chat.id, "That edit retry matches more than one pending card. Check state/pending.json before editing again.");
      return new Response("ok", { status: 200 });
    }
  }

  if (lookup.status === "none") {
    return new Response("ok", { status: 200 });
  }
  if (lookup.status === "ambiguous") {
    await sendPlainMessage(token, message.chat.id, "More than one card is waiting on a reply right now — finish one edit before starting another.");
    return new Response("ok", { status: 200 });
  }

  const { candidateId, field } = lookup;
  if (!isEditableField(field)) {
    return new Response("ok", { status: 200 }); // defensive; shouldn't happen, see applyAwaitingEditPatch's callers
  }
  const error = validateFieldValue(field, message.text);
  if (error) {
    await sendPlainMessage(token, message.chat.id, error);
    return new Response("ok", { status: 200 });
  }

  const value = message.text.trim();
  const cardMessageId = lookup.cardMessageId ?? storedCardMessageId(pending[candidateId]);
  let updated: PendingFile;
  try {
    updated = await patchPending(repo, ghToken, `Telegram edit: ${field} for ${candidateId}`, (data) =>
      applyFieldValuePatch(data, candidateId, field, value, message.message_id, cardMessageId),
    );
  } catch (err) {
    const detail = err instanceof PatchError ? err.message : "please try again";
    await sendPlainMessage(token, message.chat.id, `Couldn't save that — ${detail}`);
    return new Response("ok", { status: 200 });
  }
  // Keep delivery outside the write-error catch. If Telegram is down,
  // let the webhook return 5xx; the retry is recognized by last_edit
  // above and replays the idempotent card refresh plus confirmation
  // (never writes twice).
  if (cardMessageId !== undefined) {
    await refreshPendingCard(token, message.chat.id, cardMessageId, candidateId, updated);
  }
  await sendPlainMessage(token, message.chat.id, `Updated. ${FIELD_LABELS[field]}: "${value}"`);
  return new Response("ok", { status: 200 });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const providedSecret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!isFromTelegram(providedSecret, expectedSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return new Response("Server misconfigured: TELEGRAM_BOT_TOKEN not set", { status: 500 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return new Response("Bad request: not valid JSON", { status: 400 });
  }

  const expectedChatId = process.env.TELEGRAM_CHAT_ID;
  if (!expectedChatId) {
    return new Response("Server misconfigured: TELEGRAM_CHAT_ID not set", { status: 500 });
  }
  const updateChatId = update.callback_query?.message?.chat.id ?? update.message?.chat.id;
  if (!isAuthorizedChat(updateChatId, expectedChatId)) {
    // Always acknowledge unauthorized Telegram updates with 200 so
    // Telegram does not retry them. Crucially, perform no GitHub or
    // Telegram side effect for that chat.
    return new Response("ok", { status: 200 });
  }

  const callbackQuery = update.callback_query;
  if (!callbackQuery || !callbackQuery.data) {
    // Not a button tap -- could be a plain text reply for the
    // edit-a-field flow, or something unrelated. Either way, always
    // acknowledge with 200 so Telegram doesn't retry forever.
    return handleTextMessage(update, token);
  }

  const parsed = parseCallbackData(callbackQuery.data);
  if (!parsed) {
    await answerCallbackQuery(token, callbackQuery.id, "Something's wrong with this button — please reject and re-check the source post.");
    return new Response("ok", { status: 200 });
  }

  const { action, candidateId: rest } = parsed;
  const chatId = callbackQuery.message?.chat.id;
  const messageId = callbackQuery.message?.message_id;

  if (CALENDAR_ACTIONS.has(action) || EDIT_ACTIONS.has(action) || CREATION_ACTIONS.has(action)) {
    if (chatId === undefined || messageId === undefined) {
      // Defensive: Telegram always includes the originating message on
      // a callback_query in practice, but never silently no-op if it
      // somehow didn't.
      await answerCallbackQuery(token, callbackQuery.id, "Couldn't find the original message to update — please reject and re-check the source post.");
      return new Response("ok", { status: 200 });
    }
    return handleLocalAction(action, rest, callbackQuery.id, chatId, messageId, token);
  }

  if (!isHandledAction(action)) {
    await answerCallbackQuery(token, callbackQuery.id, "Not built yet — for now, Approve or Reject this card as-is.");
    return new Response("ok", { status: 200 });
  }

  // action is "approve" or "reject" -- the candidate id, unlike the
  // calendar/edit actions above, is the whole of `rest` with no extra
  // fields in front of it.
  const candidateId = rest;
  const repo = process.env.GITHUB_REPO;
  const ghToken = process.env.GITHUB_DISPATCH_TOKEN;
  if (!repo || !ghToken) {
    await answerCallbackQuery(token, callbackQuery.id, "Server misconfigured: GITHUB_REPO or GITHUB_DISPATCH_TOKEN not set.");
    return new Response("ok", { status: 200 });
  }

  try {
    await answerCallbackQuery(token, callbackQuery.id, action === "approve" ? "Working on it…" : "Rejected.");
    await dispatchToGitHub(repo, ghToken, action, candidateId);
  } catch (err) {
    // The tap is already un-stuck (answerCallbackQuery happened
    // first) -- this failure means GitHub was never actually told,
    // so nothing will happen silently. Shows up in Vercel's function
    // logs (Project -> Deployments -> Functions) for debugging.
    console.error("telegram-webhook: dispatch to GitHub failed", err);
    return new Response("Dispatch to GitHub failed", { status: 502 });
  }

  return new Response("ok", { status: 200 });
}
