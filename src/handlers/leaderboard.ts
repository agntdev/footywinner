import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { type Ctx } from "../bot.js";

const composer = new Composer<BotContext>();

const MEDALS = ["🥇", "🥈", "🥉"];

composer.callbackQuery("leaderboard:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const entries = await storage.getLeaderboard(chatId);

  if (entries.length === 0) {
    await ctx.editMessageText("No predictions yet — be the first to predict a match!", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const lines = entries.map((e, i) => {
    const medal = i < 3 ? MEDALS[i] : `${i + 1}.`;
    const name = `User ${e.user_id}`;
    return `${medal} ${name} — ${e.points} pts (${e.correct_predictions} correct)`;
  });

  const text = `🏆 Leaderboard:\n\n${lines.join("\n")}`;

  await ctx.editMessageText(text, {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

composer.command("leaderboard", async (ctx) => {
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const entries = await storage.getLeaderboard(chatId);

  if (entries.length === 0) {
    await ctx.reply("No predictions yet — be the first to predict a match!", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const lines = entries.map((e, i) => {
    const medal = i < 3 ? MEDALS[i] : `${i + 1}.`;
    const name = `User ${e.user_id}`;
    return `${medal} ${name} — ${e.points} pts (${e.correct_predictions} correct)`;
  });

  const text = `🏆 Leaderboard:\n\n${lines.join("\n")}`;

  await ctx.reply(text, {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

export default composer;
