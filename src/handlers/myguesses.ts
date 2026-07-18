import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { type Ctx } from "../bot.js";

const composer = new Composer<BotContext>();

function outcomeLabel(outcome: string): string {
  if (outcome === "home") return "Home win";
  if (outcome === "away") return "Away win";
  return "Draw";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

composer.callbackQuery("myguesses:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const userId = ctx.from?.id;

  if (!userId) {
    await ctx.editMessageText("Something went wrong — please try again.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const predictions = await storage.getUserPredictions(chatId, userId);

  if (predictions.length === 0) {
    await ctx.editMessageText("You haven't made any predictions yet — tap Predict to get started!", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const lines: string[] = [];
  for (const pred of predictions) {
    const match = await storage.getMatch(chatId, pred.match_id);
    if (match) {
      const result = await storage.getResult(pred.match_id);
      let status = "Pending";
      if (result) {
        status = result.final_outcome === pred.outcome ? "Correct" : "Wrong";
      }
      lines.push(
        `⚽ ${match.home_team} vs ${match.away_team} (${formatDate(match.match_datetime)})\n` +
          `   ${outcomeLabel(pred.outcome)} — ${status}`,
      );
    }
  }

  const text = `📊 Your predictions:\n\n${lines.join("\n\n")}`;

  await ctx.editMessageText(text, {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

composer.command("myguesses", async (ctx) => {
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const userId = ctx.from?.id;

  if (!userId) {
    await ctx.reply("Something went wrong — please try again.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const predictions = await storage.getUserPredictions(chatId, userId);

  if (predictions.length === 0) {
    await ctx.reply("You haven't made any predictions yet — tap Predict to get started!", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const lines: string[] = [];
  for (const pred of predictions) {
    const match = await storage.getMatch(chatId, pred.match_id);
    if (match) {
      const result = await storage.getResult(pred.match_id);
      let status = "Pending";
      if (result) {
        status = result.final_outcome === pred.outcome ? "Correct" : "Wrong";
      }
      lines.push(
        `⚽ ${match.home_team} vs ${match.away_team} (${formatDate(match.match_datetime)})\n` +
          `   ${outcomeLabel(pred.outcome)} — ${status}`,
      );
    }
  }

  const text = `📊 Your predictions:\n\n${lines.join("\n\n")}`;

  await ctx.reply(text, {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

export default composer;
