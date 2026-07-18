import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { type Ctx } from "../bot.js";
import { runBacktest, formatAccuracyReport } from "../predictions/accuracy.js";

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
    "• View all matches\n" +
    "• Manage leagues\n" +
    "• Accuracy dashboard\n" +
    "• Tuning settings";

  await ctx.editMessageText(text, {
    reply_markup: inlineKeyboard([
      [inlineButton("➕ Add match", "admin:addmatch")],
      [inlineButton("📝 Post result", "admin:postresult")],
      [inlineButton("📋 All matches", "admin:listmatches")],
      [inlineButton("🏆 Manage leagues", "admin:leagues")],
      [inlineButton("📊 Accuracy", "admin:accuracy")],
      [inlineButton("🔧 Tuning", "admin:tuning")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

// ── Add match flow ───────────────────────────────────────────────────────────

composer.callbackQuery("admin:addmatch", async (ctx) => {
  await ctx.answerCallbackQuery();
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

    // Check if there are leagues — ask for league assignment
    const leagues = await storage.getAllLeagues(chatId);
    if (leagues.length > 0) {
      session.step = "awaiting_league";
      const buttons = leagues.map((l) => [
        inlineButton(`${l.name} (${l.country})`, `admin:setleague:${l.id}`),
      ]);
      buttons.push([inlineButton("Skip (no league)", `admin:setleague:none`)]);
      buttons.push([inlineButton("❌ Cancel", "admin:cancel")]);
      await ctx.reply(
        `Competition: ${text}\n\nAssign a league (or skip):`,
        { reply_markup: inlineKeyboard(buttons) },
      );
      return;
    }

    // No leagues — finalize directly
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

  if (step === "awaiting_league") {
    // This handles text input during league selection — shouldn't happen
    // but fall through to next handler
    return next();
  }

  return next();
});

// ── Admin set league for match ────────────────────────────────────────────

composer.callbackQuery(/^admin:setleague:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const leagueId = ctx.match![1];
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const session = ctx.session as Record<string, unknown>;
  const data = session.addMatch as Record<string, string> | undefined;

  if (!data || !data.home_team || !data.away_team || !data.match_datetime || !data.competition_name) {
    await ctx.editMessageText("Something went wrong — please start over.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    session.step = undefined;
    session.addMatch = undefined;
    return;
  }

  const matchId = `m_${Date.now()}`;
    const match = {
      id: matchId,
      home_team: data.home_team!,
      away_team: data.away_team!,
      match_datetime: data.match_datetime!,
      competition_name: data.competition_name!,
      chat_id: chatId,
      league_id: leagueId !== "none" ? leagueId : undefined,
    };

    await storage.addMatch(match as import("../storage.js").Match);

  session.step = undefined;
  session.addMatch = undefined;

  const dt = new Date(data.match_datetime!);
  const leagueName = leagueId !== "none"
    ? (await storage.getLeague(chatId, leagueId))?.name ?? "Unknown"
    : "None";
  const confirmation =
    `✅ Match added!\n\n` +
    `⚽ ${data.home_team} vs ${data.away_team}\n` +
    `📅 ${dt.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} at ${dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}\n` +
    `🏆 ${data.competition_name}\n` +
    `🏅 League: ${leagueName}`;

  await ctx.editMessageText(confirmation, {
    reply_markup: inlineKeyboard([
      [inlineButton("➕ Add another", "admin:addmatch")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
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
  const matches = await storage.getAllMatches(chatId);

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
      // Record per-market outcome
      await storage.recordPredictionOutcome(chatId, userId, matchId, pred.outcome, outcome);
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

// ── Manage leagues ───────────────────────────────────────────────────────────

composer.callbackQuery("admin:leagues", async (ctx) => {
  await ctx.answerCallbackQuery();
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const leagues = await storage.getAllLeagues(chatId);

  const text =
    leagues.length === 0
      ? "🏆 No leagues yet — add one to organize your matches!"
      : `🏆 Leagues (${leagues.length}):\n\n` +
        leagues.map((l) => `• ${l.name} (${l.country}, Tier ${l.tier})`).join("\n");

  const buttons = [
    [inlineButton("➕ Add league", "admin:addleague")],
    [inlineButton("⬅️ Back to admin", "admin:menu")],
  ];

  await ctx.editMessageText(text, { reply_markup: inlineKeyboard(buttons) });
});

// ── Add league flow ──────────────────────────────────────────────────────────

composer.callbackQuery("admin:addleague", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = ctx.session as Record<string, unknown>;
  session.step = "awaiting_league_name";
  session.addMatch = {};

  await ctx.editMessageText(
    "➕ Let's add a league!\n\nWhat's the league name?",
    {
      reply_markup: inlineKeyboard([[inlineButton("❌ Cancel", "admin:cancel")]]),
    },
  );
});

// Handle league creation text input
composer.on("message:text", async (ctx, next) => {
  const session = ctx.session as Record<string, unknown>;
  const step = session.step as string | undefined;

  if (step === "awaiting_league_name") {
    const storage = (ctx as unknown as Ctx).storage;
    const chatId = ctx.chat?.id ?? 0;
    (session.addMatch as Record<string, string>) = { home_team: ctx.message.text };
    session.step = "awaiting_league_country";
    await ctx.reply(
      `League name: ${ctx.message.text}\n\nWhich country? (e.g. "England", "Spain")`,
      { reply_markup: inlineKeyboard([[inlineButton("❌ Cancel", "admin:cancel")]]) },
    );
    return;
  }

  if (step === "awaiting_league_country") {
    const storage = (ctx as unknown as Ctx).storage;
    const chatId = ctx.chat?.id ?? 0;
    (session.addMatch as Record<string, string>).away_team = ctx.message.text;
    session.step = "awaiting_league_tier";
    await ctx.reply(
      `Country: ${ctx.message.text}\n\nWhat tier? (1 = top division, 2 = second, etc.)`,
      { reply_markup: inlineKeyboard([[inlineButton("❌ Cancel", "admin:cancel")]]) },
    );
    return;
  }

  if (step === "awaiting_league_tier") {
    const storage = (ctx as unknown as Ctx).storage;
    const chatId = ctx.chat?.id ?? 0;
    const tier = parseInt(ctx.message.text, 10);
    if (isNaN(tier) || tier < 1) {
      await ctx.reply(
        "Please enter a valid tier number (1 or higher).",
        { reply_markup: inlineKeyboard([[inlineButton("❌ Cancel", "admin:cancel")]]) },
      );
      return;
    }

    const data = session.addMatch as Record<string, string>;
    const leagueId = `l_${Date.now()}`;
    await storage.addLeague({
      id: leagueId,
      name: data.home_team!,
      country: data.away_team!,
      tier,
      chat_id: chatId,
    });

    session.step = undefined;
    session.addMatch = undefined;

    await ctx.reply(
      `✅ League added!\n\n` +
        `🏆 ${data.home_team}\n` +
        `🌍 ${data.away_team}\n` +
        `📊 Tier ${tier}`,
      {
        reply_markup: inlineKeyboard([
          [inlineButton("➕ Add another", "admin:addleague")],
          [inlineButton("⬅️ Back to admin", "admin:menu")],
        ]),
      },
    );
    return;
  }

  return next();
});

// ── Accuracy dashboard ───────────────────────────────────────────────────────

composer.callbackQuery("admin:accuracy", async (ctx) => {
  await ctx.answerCallbackQuery();
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const report = await runBacktest(storage, chatId);

  const text = formatAccuracyReport(report);

  await ctx.editMessageText(text, {
    reply_markup: inlineKeyboard([
      [inlineButton("🔄 Refresh", "admin:accuracy")],
      [inlineButton("⬅️ Back to admin", "admin:menu")],
    ]),
  });
});

// ── Tuning settings ──────────────────────────────────────────────────────────

composer.callbackQuery("admin:tuning", async (ctx) => {
  await ctx.answerCallbackQuery();
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const settings = await storage.getAdminSettings(chatId);

  const status = settings.tuning_enabled ? "ON" : "OFF";
  const text =
    `🔧 Tuning settings\n\n` +
    `Status: ${status}\n` +
    `Target accuracy: ${settings.target_accuracy_pct}%`;

  const toggleLabel = settings.tuning_enabled ? "🔕 Disable tuning" : "🔔 Enable tuning";

  await ctx.editMessageText(text, {
    reply_markup: inlineKeyboard([
      [inlineButton(toggleLabel, "admin:tuning:toggle")],
      [inlineButton("🎯 Set target", "admin:tuning:target")],
      [inlineButton("⬅️ Back to admin", "admin:menu")],
    ]),
  });
});

composer.callbackQuery("admin:tuning:toggle", async (ctx) => {
  await ctx.answerCallbackQuery();
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const settings = await storage.getAdminSettings(chatId);
  settings.tuning_enabled = !settings.tuning_enabled;
  await storage.setAdminSettings(settings);

  const status = settings.tuning_enabled ? "ON" : "OFF";
  await ctx.editMessageText(`Tuning is now ${status}.`, {
    reply_markup: inlineKeyboard([
      [inlineButton("⬅️ Back to tuning", "admin:tuning")],
    ]),
  });
});

composer.callbackQuery("admin:tuning:target", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = ctx.session as Record<string, unknown>;
  session.step = "awaiting_target_accuracy";

  await ctx.reply(
    "What target accuracy percentage? (e.g. 95)",
    { reply_markup: inlineKeyboard([[inlineButton("❌ Cancel", "admin:cancel")]]) },
  );
});

composer.on("message:text", async (ctx, next) => {
  const session = ctx.session as Record<string, unknown>;
  const step = session.step as string | undefined;

  if (step === "awaiting_target_accuracy") {
    const storage = (ctx as unknown as Ctx).storage;
    const chatId = ctx.chat?.id ?? 0;
    const target = parseInt(ctx.message.text, 10);

    if (isNaN(target) || target < 1 || target > 100) {
      await ctx.reply(
        "Please enter a valid percentage between 1 and 100.",
        { reply_markup: inlineKeyboard([[inlineButton("❌ Cancel", "admin:cancel")]]) },
      );
      return;
    }

    const settings = await storage.getAdminSettings(chatId);
    settings.target_accuracy_pct = target;
    await storage.setAdminSettings(settings);
    session.step = undefined;

    await ctx.reply(
      `✅ Target accuracy set to ${target}%.`,
      {
        reply_markup: inlineKeyboard([
          [inlineButton("⬅️ Back to tuning", "admin:tuning")],
        ]),
      },
    );
    return;
  }

  return next();
});

export default composer;
