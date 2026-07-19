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

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

const composer = new Composer<BotContext>();

/**
 * Build the "today's matches grouped by league" message text.
 * Sorts leagues by earliest kickoff time, then alphabetically if times tie.
 */
async function buildTodayGroupedText(storage: Ctx["storage"], chatId: number, now: () => Date = () => new Date()): Promise<string> {
  const todayMatches = await storage.getTodayMatches(chatId, now);

  if (todayMatches.length === 0) {
    return "📅 No matches today!";
  }

  // Group matches by league_id
  const leagueMatches = new Map<string, { name: string; country: string; matches: typeof todayMatches }>();
  const noLeagueMatches: typeof todayMatches = [];

  for (const m of todayMatches) {
    if (m.league_id) {
      const existing = leagueMatches.get(m.league_id);
      if (existing) {
        existing.matches.push(m);
      } else {
        const league = await storage.getLeague(chatId, m.league_id);
        leagueMatches.set(m.league_id, {
          name: league?.name ?? "Unknown League",
          country: league?.country ?? "",
          matches: [m],
        });
      }
    } else {
      noLeagueMatches.push(m);
    }
  }

  // Sort leagues by earliest kickoff time, then alphabetically
  const sortedLeagues = [...leagueMatches.values()].sort((a, b) => {
    const aMin = Math.min(...a.matches.map((m) => new Date(m.match_datetime).getTime()));
    const bMin = Math.min(...b.matches.map((m) => new Date(m.match_datetime).getTime()));
    if (aMin !== bMin) return aMin - bMin;
    return a.name.localeCompare(b.name);
  });

  const lines: string[] = [];
  for (const league of sortedLeagues) {
    const leagueHeader = league.country ? `${league.name} (${league.country})` : league.name;
    lines.push(`⚽ ${leagueHeader}`);
    for (const m of league.matches) {
      lines.push(`  ${formatTime(m.match_datetime)} — ${m.home_team} vs ${m.away_team}`);
    }
    lines.push("");
  }

  // Matches without a league
  if (noLeagueMatches.length > 0) {
    lines.push("⚽ Other matches");
    for (const m of noLeagueMatches) {
      lines.push(`  ${formatTime(m.match_datetime)} — ${m.home_team} vs ${m.away_team}`);
    }
  }

  return lines.join("\n").trim();
}

/**
 * Build the inline keyboard for today's matches grouped by league.
 * Each match gets a "Predict" button.
 */
async function buildTodayGroupedKeyboard(storage: Ctx["storage"], chatId: number, now: () => Date = () => new Date()): Promise<{ text: string; keyboard: ReturnType<typeof inlineKeyboard> }> {
  const text = await buildTodayGroupedText(storage, chatId, now);
  const todayMatches = await storage.getTodayMatches(chatId, now);

  if (todayMatches.length === 0) {
    const nextDate = await storage.getNextMatchDate(chatId);
    const nextDateText = nextDate
      ? `\n\nNext match: ${formatDate(nextDate)} at ${formatTime(nextDate)}`
      : "";
    return {
      text: text + nextDateText,
      keyboard: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    };
  }

  // Group matches by league_id
  const leagueMatches = new Map<string, { name: string; country: string; matches: typeof todayMatches }>();
  const noLeagueMatches: typeof todayMatches = [];

  for (const m of todayMatches) {
    if (m.league_id) {
      const existing = leagueMatches.get(m.league_id);
      if (existing) {
        existing.matches.push(m);
      } else {
        const league = await storage.getLeague(chatId, m.league_id);
        leagueMatches.set(m.league_id, {
          name: league?.name ?? "Unknown League",
          country: league?.country ?? "",
          matches: [m],
        });
      }
    } else {
      noLeagueMatches.push(m);
    }
  }

  const sortedLeagues = [...leagueMatches.values()].sort((a, b) => {
    const aMin = Math.min(...a.matches.map((m) => new Date(m.match_datetime).getTime()));
    const bMin = Math.min(...b.matches.map((m) => new Date(m.match_datetime).getTime()));
    if (aMin !== bMin) return aMin - bMin;
    return a.name.localeCompare(b.name);
  });

  const rows: ReturnType<typeof inlineButton>[][] = [];

  for (const league of sortedLeagues) {
    for (const m of league.matches) {
      rows.push([
        inlineButton(`🔮 Predict ${m.home_team} vs ${m.away_team}`, `predict:match:${m.id}`),
      ]);
    }
  }

  for (const m of noLeagueMatches) {
    rows.push([
      inlineButton(`🔮 Predict ${m.home_team} vs ${m.away_team}`, `predict:match:${m.id}`),
    ]);
  }

  rows.push([inlineButton("🏠 All matches", "matches:list")]);
  rows.push([inlineButton("❓ Help", "menu:help")]);

  return { text, keyboard: inlineKeyboard(rows) };
}

composer.command("start", async (ctx) => {
  if (ctx.from) {
    try {
      const storage = (ctx as unknown as Ctx).storage;
      await storage.setUser({
        telegram_id: ctx.from.id,
        display_name: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" "),
        handle: ctx.from.username,
      });
    } catch {
      // non-fatal
    }
  }

  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const { text, keyboard } = await buildTodayGroupedKeyboard(storage, chatId);
  await ctx.reply(text, { reply_markup: keyboard });
});

composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
});

composer.callbackQuery("today:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const { text, keyboard } = await buildTodayGroupedKeyboard(storage, chatId);
  await ctx.editMessageText(text, { reply_markup: keyboard });
});

export default composer;
