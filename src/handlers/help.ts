import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { type Ctx } from "../bot.js";

const HELP =
  "ℹ️ Here's how Football Predictor works:\n\n" +
  "• ⚽ Matches — see upcoming games\n" +
  "• 🔮 Predict — pick who you think will win\n" +
  "• 🏆 Leagues — browse by league\n" +
  "• 🏆 Leaderboard — check the top predictors\n" +
  "• 📊 My Guesses — review your predictions\n\n" +
  "Tap /start to open the menu and get going!";

const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);

const composer = new Composer<BotContext>();

composer.command("help", async (ctx) => {
  await ctx.reply(HELP);
});

composer.callbackQuery("menu:help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(HELP, { reply_markup: backToMenu });
});

export default composer;
