import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { type Ctx } from "../bot.js";

const composer = new Composer<BotContext>();

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day} at ${time}`;
}

function labelFor(outcome: string): string {
  if (outcome === "home") return "Home win";
  if (outcome === "away") return "Away win";
  return "Draw";
}

// Handle predict:match:<id> — show match details with outcome buttons
composer.callbackQuery(/^predict:match:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const matchId = ctx.match![1];
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const match = await storage.getMatch(chatId, matchId);

  if (!match) {
    await ctx.editMessageText("Couldn't find that match — it may have been removed.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const existing = ctx.from
    ? await storage.getPrediction(chatId, ctx.from.id, matchId)
    : undefined;

  const predLabel = existing ? `\nYour pick: ${labelFor(existing.outcome)}` : "";

  const text =
    `⚽ ${match.home_team} vs ${match.away_team}\n` +
    `📅 ${formatDate(match.match_datetime)}\n` +
    `🏆 ${match.competition_name}` +
    predLabel +
    `\n\nWho do you think will win?`;

  const buttons = [
    [inlineButton(`🏠 ${match.home_team} win`, `predict:pick:${matchId}:home`)],
    [inlineButton("🤝 Draw", `predict:pick:${matchId}:draw`)],
    [inlineButton(`✈️ ${match.away_team} win`, `predict:pick:${matchId}:away`)],
    [inlineButton("⬅️ Back to matches", "matches:list")],
  ];

  await ctx.editMessageText(text, { reply_markup: inlineKeyboard(buttons) });
});

// Handle predict:pick:<id>:<outcome> — record the prediction
composer.callbackQuery(/^predict:pick:(.+):(home|draw|away)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const matchId = ctx.match![1];
  const outcome = ctx.match![2] as "home" | "draw" | "away";
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const userId = ctx.from?.id;

  if (!userId) {
    await ctx.editMessageText("Something went wrong — please try again.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const match = await storage.getMatch(chatId, matchId);
  if (!match) {
    await ctx.editMessageText("Couldn't find that match — it may have been removed.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const now = new Date();
  if (new Date(match.match_datetime).getTime() <= now.getTime()) {
    await ctx.editMessageText("This match has already kicked off — predictions are locked.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  await storage.setPrediction({
    user_id: userId,
    match_id: matchId,
    outcome,
    timestamp: now.toISOString(),
    chat_id: chatId,
  });

  const text =
    `✅ Prediction recorded!\n\n` +
    `⚽ ${match.home_team} vs ${match.away_team}\n` +
    `🔮 Your pick: ${labelFor(outcome)}`;

  await ctx.editMessageText(text, {
    reply_markup: inlineKeyboard([
      [inlineButton("⬅️ Back to matches", "matches:list")],
      [inlineButton("🏠 Main menu", "menu:main")],
    ]),
  });
});

export default composer;
