import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import { mainMenuKeyboard, registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { type Ctx } from "../bot.js";

registerMainMenuItem({ label: "⚽ Matches", data: "matches:list", order: 10 });
registerMainMenuItem({ label: "🔮 Predict", data: "predict:start", order: 20 });
registerMainMenuItem({ label: "🏆 Leaderboard", data: "leaderboard:show", order: 30 });
registerMainMenuItem({ label: "📊 My Guesses", data: "myguesses:show", order: 40 });
registerMainMenuItem({ label: "⚙️ Admin", data: "admin:menu", order: 90 });

const WELCOME = "👋 Welcome to Football Predictor! Tap a button below to get started.";

const composer = new Composer<BotContext>();

composer.command("start", async (ctx) => {
  console.log("[/start] user=%d chat=%d", ctx.from?.id, ctx.chat?.id);
  if (ctx.from) {
    try {
      const storage = (ctx as unknown as Ctx).storage;
      await storage.setUser({
        telegram_id: ctx.from.id,
        display_name: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" "),
        handle: ctx.from.username,
      });
    } catch (err) {
      console.error("[/start] failed to save user:", err);
    }
  }
  await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard() });
});

composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
});

export default composer;
