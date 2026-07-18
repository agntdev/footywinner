import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { type Ctx } from "../bot.js";

const composer = new Composer<BotContext>();

// ── Admin menu ───────────────────────────────────────────────────────────────

composer.callbackQuery("admin:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;

  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const admins = await storage.getAdminIds(chatId);

  if (admins.length > 0 && !admins.includes(userId)) {
    await ctx.editMessageText("Only admins can manage matches.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const text =
    "⚙️ Admin panel\n\n" +
    "• Add a new match\n" +
    "• Post match results\n" +
    "• View all matches";

  await ctx.editMessageText(text, {
    reply_markup: inlineKeyboard([
      [inlineButton("➕ Add match", "admin:addmatch")],
      [inlineButton("📝 Post result", "admin:postresult")],
      [inlineButton("📋 All matches", "admin:listmatches")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

// ── Add match flow ───────────────────────────────────────────────────────────

composer.callbackQuery("admin:addmatch", async (ctx) => {
  await ctx.answerCallbackQuery();
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;

  // Store session state for the add match flow
  const session = ctx.session as Record<string, unknown>;
  session.step = "awaiting_home_team";
  session.addMatch = {};

  await ctx.editMessageText(
    "➕ Let's add a match!\n\nWhat's the home team's name?",
    {
      reply_markup: inlineKeyboard([[inlineButton("❌ Cancel", "admin:cancel")]]),
    },
  );
});

// Handle text input for the add match flow
composer.on("message:text", async (ctx, next) => {
  const session = ctx.session as Record<string, unknown>;
  const step = session.step as string | undefined;

  if (!step || !step.startsWith("awaiting_")) {
    return next();
  }

  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const text = ctx.message.text;

  if (step === "awaiting_home_team") {
    (session.addMatch as Record<string, string>) = { home_team: text };
    session.step = "awaiting_away_team";
    await ctx.reply(
      `Home team: ${text}\n\nNow, what's the away team's name?`,
      { reply_markup: inlineKeyboard([[inlineButton("❌ Cancel", "admin:cancel")]]) },
    );
    return;
  }

  if (step === "awaiting_away_team") {
    (session.addMatch as Record<string, string>).away_team = text;
    session.step = "awaiting_datetime";
    await ctx.reply(
      `Away team: ${text}\n\nWhen is the match? (e.g. "2026-07-25 20:00")`,
      { reply_markup: inlineKeyboard([[inlineButton("❌ Cancel", "admin:cancel")]]) },
    );
    return;
  }

  if (step === "awaiting_datetime") {
    const dt = new Date(text);
    if (isNaN(dt.getTime())) {
      await ctx.reply(
        "Couldn't understand that date — try something like '2026-07-25 20:00'.",
        { reply_markup: inlineKeyboard([[inlineButton("❌ Cancel", "admin:cancel")]]) },
      );
      return;
    }
    (session.addMatch as Record<string, string>).match_datetime = dt.toISOString();
    session.step = "awaiting_competition";
    await ctx.reply(
      `Match date: ${dt.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} at ${dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}\n\nWhich competition? (e.g. "Premier League", "Champions League")`,
      { reply_markup: inlineKeyboard([[inlineButton("❌ Cancel", "admin:cancel")]]) },
    );
    return;
  }

  if (step === "awaiting_competition") {
    const data = session.addMatch as Record<string, string>;
    data.competition_name = text;

    const matchId = `m_${Date.now()}`;
    await storage.addMatch({
      id: matchId,
      home_team: data.home_team!,
      away_team: data.away_team!,
      match_datetime: data.match_datetime!,
      competition_name: data.competition_name!,
      chat_id: chatId,
    });

    session.step = undefined;
    session.addMatch = undefined;

    const dt = new Date(data.match_datetime!);
    const confirmation =
      `✅ Match added!\n\n` +
      `⚽ ${data.home_team} vs ${data.away_team}\n` +
      `📅 ${dt.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} at ${dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}\n` +
      `🏆 ${data.competition_name}`;

    await ctx.reply(confirmation, {
      reply_markup: inlineKeyboard([
        [inlineButton("➕ Add another", "admin:addmatch")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }

  return next();
});

// ── Cancel flow ──────────────────────────────────────────────────────────────

composer.callbackQuery("admin:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = ctx.session as Record<string, unknown>;
  session.step = undefined;
  session.addMatch = undefined;

  await ctx.editMessageText("Cancelled.", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

// ── Post result flow ─────────────────────────────────────────────────────────

composer.callbackQuery("admin:postresult", async (ctx) => {
  await ctx.answerCallbackQuery();
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const matches = await storage.getUpcomingMatches(chatId);

  if (matches.length === 0) {
    await ctx.editMessageText("No matches to post results for.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const buttons = matches.map((m) => [
    inlineButton(`${m.home_team} vs ${m.away_team}`, `admin:result:${m.id}`),
  ]);
  buttons.push([inlineButton("⬅️ Back to menu", "menu:main")]);

  await ctx.editMessageText("Select a match to post the result:", {
    reply_markup: inlineKeyboard(buttons),
  });
});

// Handle result posting for a specific match
composer.callbackQuery(/^admin:result:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const matchId = ctx.match![1];
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const match = await storage.getMatch(chatId, matchId);

  if (!match) {
    await ctx.editMessageText("Couldn't find that match.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  await ctx.editMessageText(
    `⚽ ${match.home_team} vs ${match.away_team}\n\nWho won?`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton(`🏠 ${match.home_team} win`, `admin:setresult:${matchId}:home`)],
        [inlineButton("🤝 Draw", `admin:setresult:${matchId}:draw`)],
        [inlineButton(`✈️ ${match.away_team} win`, `admin:setresult:${matchId}:away`)],
        [inlineButton("⬅️ Back", "admin:postresult")],
      ]),
    },
  );
});

// Set result outcome and update predictions/leaderboard
composer.callbackQuery(/^admin:setresult:(.+):(home|draw|away)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const matchId = ctx.match![1];
  const outcome = ctx.match![2] as "home" | "draw" | "away";
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const match = await storage.getMatch(chatId, matchId);

  if (!match) {
    await ctx.editMessageText("Couldn't find that match.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  // Record the result
  await storage.setResult({
    match_id: matchId,
    final_outcome: outcome,
    final_score: "N/A",
    result_timestamp: new Date().toISOString(),
  });

  // Update predictions and leaderboard
  const predictionUserIds = await storage.getMatchPredictionIds(chatId, matchId);
  let correctCount = 0;

  for (const userId of predictionUserIds) {
    const pred = await storage.getPrediction(chatId, userId, matchId);
    if (pred) {
      const isCorrect = pred.outcome === outcome;
      if (isCorrect) correctCount++;
      await storage.updateLeaderboard(chatId, userId, isCorrect ? 3 : 0, isCorrect ? 1 : 0);
    }
  }

  const outcomeLabel = outcome === "home" ? `🏠 ${match.home_team} win` :
    outcome === "away" ? `✈️ ${match.away_team} win` : "🤝 Draw";

  const text =
    `✅ Result posted!\n\n` +
    `⚽ ${match.home_team} vs ${match.away_team}\n` +
    `🏆 ${outcomeLabel}\n` +
    `📊 ${predictionUserIds.length} predictions, ${correctCount} correct`;

  await ctx.editMessageText(text, {
    reply_markup: inlineKeyboard([
      [inlineButton("📝 Post another result", "admin:postresult")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

// ── List all matches ─────────────────────────────────────────────────────────

composer.callbackQuery("admin:listmatches", async (ctx) => {
  await ctx.answerCallbackQuery();
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const matches = await storage.getAllMatches(chatId);

  if (matches.length === 0) {
    await ctx.editMessageText("No matches added yet.", {
      reply_markup: inlineKeyboard([
        [inlineButton("➕ Add match", "admin:addmatch")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }

  const lines = matches.map((m, i) => {
    const dt = new Date(m.match_datetime);
    const dateStr = dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return `${i + 1}. ${m.home_team} vs ${m.away_team} — ${dateStr} · ${m.competition_name}`;
  });

  await ctx.editMessageText(`📋 All matches:\n\n${lines.join("\n")}`, {
    reply_markup: inlineKeyboard([
      [inlineButton("➕ Add match", "admin:addmatch")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

export default composer;
