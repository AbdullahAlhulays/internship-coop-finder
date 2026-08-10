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
//   TELEGRAM_WEBHOOK_SECRET  a random string YOU make up (e.g. a long
//                            password) -- proves a request really came
//                            from Telegram, not a random POST to a
//                            guessable public URL. Set the same value
//                            when registering the webhook (see
//                            TOKEN_SETUP.md's webhook section).
//   GITHUB_DISPATCH_TOKEN    a GitHub personal access token, `repo`
//                            scope, used ONLY to trigger the Actions
//                            workflow. This is the most powerful
//                            secret in the whole system -- it can
//                            write to your repo. Treat it accordingly.
//   GITHUB_REPO              "your-username/your-repo-name"

export const config = { runtime: "edge" };

import { buildDispatchPayload, isFromTelegram, isHandledAction, parseCallbackData } from "./webhook-logic";

const TELEGRAM_API = "https://api.telegram.org";

interface TelegramUpdate {
  callback_query?: {
    id: string;
    data?: string;
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

async function dispatchToGitHub(action: string, candidateId: string): Promise<void> {
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!repo || !token) {
    throw new Error("GITHUB_REPO or GITHUB_DISPATCH_TOKEN is not set in Vercel's environment variables");
  }
  const response = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildDispatchPayload(action, candidateId)),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub rejected the dispatch (${response.status}): ${body}`);
  }
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

  const callbackQuery = update.callback_query;
  if (!callbackQuery || !callbackQuery.data) {
    // Not a button tap -- e.g. a plain text message, which this
    // endpoint doesn't handle yet. Acknowledge with 200 so Telegram
    // doesn't retry forever, but do nothing further.
    return new Response("ok", { status: 200 });
  }

  const parsed = parseCallbackData(callbackQuery.data);
  if (!parsed) {
    await answerCallbackQuery(token, callbackQuery.id, "Something's wrong with this button — please reject and re-check the source post.");
    return new Response("ok", { status: 200 });
  }

  const { action, candidateId } = parsed;

  if (!isHandledAction(action)) {
    // "deadline" / "edit" -- not built yet. Say so plainly instead of
    // silently doing nothing, which is what was happening before.
    await answerCallbackQuery(token, callbackQuery.id, "Not built yet — for now, Approve or Reject this card as-is.");
    return new Response("ok", { status: 200 });
  }

  try {
    await answerCallbackQuery(token, callbackQuery.id, action === "approve" ? "Working on it…" : "Rejected.");
    await dispatchToGitHub(action, candidateId);
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
