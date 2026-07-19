import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import { mainMenuKeyboard, registerMainMenuItem, inlineButton, inlineKeyboard, paginate } from "../toolkit/index.js";
import { type Ctx } from "../bot.js";

registerMainMenuItem({ label: "⚽ Matches", data: "matches:list", order: 10 });
registerMainMenuItem({ label: "🔮 Predict", data: "predict:start", order: 20 });
registerMainMenuItem({ label: "🏆 Leaderboard", data: "leaderboard:show", order: 30 });
registerMainMenuItem({ label: "📊 My Guesses", data: "myguesses:show", order: 40 });
registerMainMenuItem({ label: "⚙️ Admin", data: "admin:menu", order: 90 });

const WELCOME = "👋 Welcome to Football Predictor! Tap a button below to get started.";

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

const MATCHES_PER_PAGE = 5;

const composer = new Composer<BotContext>();

async function renderTodayLeaguesEdit(ctx: { editMessageText: Function; from?: { id: number }; chat?: { id: number } }) {
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const leaguesWithMatches = await storage.getLeaguesWithTodayMatches(chatId);

  if (leaguesWithMatches.length === 0) {
    const nextDate = await storage.getNextMatchDate(chatId);
    const nextDateText = nextDate
      ? `Next match: ${formatDate(nextDate)} at ${formatTime(nextDate)}`
      : "No matches scheduled yet — check back soon!";
    const text = `📅 No matches today!\n\n${nextDateText}`;
    const kb = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);
    await ctx.editMessageText(text, { reply_markup: kb });
    return;
  }

  const buttons = leaguesWithMatches.map((l) => [
    inlineButton(`${l.league.name} (${l.league.country}) — ${l.matchCount} match${l.matchCount > 1 ? "es" : ""}`, `today:league:${l.league.id}`),
  ]);
  buttons.push([inlineButton("🏠 All matches", "matches:list")]);
  buttons.push([inlineButton("❓ Help", "menu:help")]);

  const text = `📅 Today's matches — pick a league:`;
  await ctx.editMessageText(text, { reply_markup: inlineKeyboard(buttons) });
}

async function renderTodayLeaguesReply(ctx: { reply: Function; from?: { id: number }; chat?: { id: number } }) {
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const leaguesWithMatches = await storage.getLeaguesWithTodayMatches(chatId);

  if (leaguesWithMatches.length === 0) {
    const nextDate = await storage.getNextMatchDate(chatId);
    const nextDateText = nextDate
      ? `Next match: ${formatDate(nextDate)} at ${formatTime(nextDate)}`
      : "No matches scheduled yet — check back soon!";
    const text = `📅 No matches today!\n\n${nextDateText}`;
    const kb = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);
    await ctx.reply(text, { reply_markup: kb });
    return;
  }

  const buttons = leaguesWithMatches.map((l) => [
    inlineButton(`${l.league.name} (${l.league.country}) — ${l.matchCount} match${l.matchCount > 1 ? "es" : ""}`, `today:league:${l.league.id}`),
  ]);
  buttons.push([inlineButton("🏠 All matches", "matches:list")]);
  buttons.push([inlineButton("❓ Help", "menu:help")]);

  const text = `📅 Today's matches — pick a league:`;
  await ctx.reply(text, { reply_markup: inlineKeyboard(buttons) });
}

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
  await renderTodayLeaguesReply(ctx);
});

composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
});

// ── Today's leagues chooser ────────────────────────────────────────────────

composer.callbackQuery("today:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderTodayLeaguesEdit(ctx);
});

// ── Today's matches for a specific league ──────────────────────────────────

composer.callbackQuery(/^today:league:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const leagueId = ctx.match![1];
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const league = await storage.getLeague(chatId, leagueId);

  if (!league) {
    await ctx.editMessageText("Couldn't find that league.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to leagues", "today:show")]]),
    });
    return;
  }

  const matches = await storage.getTodayMatchesByLeague(chatId, leagueId);

  if (matches.length === 0) {
    await ctx.editMessageText(`No matches today in ${league.name} — check back soon!`, {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to leagues", "today:show")],
        [inlineButton("🏠 Menu", "menu:main")],
      ]),
    });
    return;
  }

  await renderTodayLeagueMatches(ctx, chatId, league, matches, 0);
});

// ── Pagination for today's matches ─────────────────────────────────────────

composer.callbackQuery(/^today:page:(.+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const leagueId = ctx.match![1];
  const page = parseInt(ctx.match![2], 10);
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const league = await storage.getLeague(chatId, leagueId);

  if (!league) {
    await ctx.editMessageText("Couldn't find that league.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "today:show")]]),
    });
    return;
  }

  const matches = await storage.getTodayMatchesByLeague(chatId, leagueId);
  await renderTodayLeagueMatches(ctx, chatId, league, matches, page);
});

async function renderTodayLeagueMatches(
  ctx: { editMessageText: Function },
  chatId: number,
  league: { id: string; name: string; country: string },
  matches: { id: string; home_team: string; away_team: string; match_datetime: string }[],
  page: number,
) {
  const paged = paginate(matches, {
    page,
    perPage: MATCHES_PER_PAGE,
    callbackPrefix: `today:page:${league.id}`,
  });

  const lines = paged.pageItems.map(
    (m) => `⏰ ${formatTime(m.match_datetime)} — ${m.home_team} vs ${m.away_team}`,
  );
  const text = `⚽ ${league.name} (${league.country})\n📅 Today's matches:\n\n${lines.join("\n")}`;

  const rows = paged.pageItems.map((m) => [
    inlineButton(`🔮 Predict ${m.home_team} vs ${m.away_team}`, `predict:match:${m.id}`),
  ]);

  if (paged.controls.inline_keyboard.length > 0) {
    rows.push(paged.controls.inline_keyboard[0] as { text: string; callback_data: string }[]);
  }

  rows.push([inlineButton("⬅️ Leagues", "today:show")]);
  rows.push([inlineButton("🏠 Menu", "menu:main")]);

  await ctx.editMessageText(text, { reply_markup: inlineKeyboard(rows) });
}

export default composer;
