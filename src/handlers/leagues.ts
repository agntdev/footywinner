import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import {
  inlineButton,
  inlineKeyboard,
  paginate,
  type PaginateOptions,
} from "../toolkit/index.js";
import { type Ctx } from "../bot.js";
import { registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "🏆 Leagues", data: "leagues:list", order: 15 });

const LEAGUES_PER_PAGE = 5;
const composer = new Composer<BotContext>();

// ── Leagues list (main entry) ────────────────────────────────────────────

composer.callbackQuery("leagues:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const leagues = await storage.getAllLeagues(chatId);

  if (leagues.length === 0) {
    await ctx.editMessageText("No leagues available yet — check back soon!", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  await renderLeaguePage(ctx, chatId, leagues, 0);
});

// ── Leagues command ──────────────────────────────────────────────────────

composer.command("leagues", async (ctx) => {
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const leagues = await storage.getAllLeagues(chatId);

  if (leagues.length === 0) {
    await ctx.reply("No leagues available yet — check back soon!", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  await renderLeaguePageReply(ctx, chatId, leagues, 0);
});

// ── Paginate ─────────────────────────────────────────────────────────────

composer.callbackQuery(/^leagues:page:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const page = parseInt(ctx.match![1], 10);
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const leagues = await storage.getAllLeagues(chatId);

  if (leagues.length === 0) {
    await ctx.editMessageText("No leagues available yet — check back soon!", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  await renderLeaguePage(ctx, chatId, leagues, page);
});

// ── Filter by country ────────────────────────────────────────────────────

composer.callbackQuery(/^leagues:country:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const country = decodeURIComponent(ctx.match![1]);
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const leagues = await storage.getLeaguesByCountry(chatId, country);

  if (leagues.length === 0) {
    await ctx.editMessageText(`No leagues found in ${country}.`, {
      reply_markup: inlineKeyboard([
        [inlineButton("🏆 All leagues", "leagues:list")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }

  await renderLeaguePage(ctx, chatId, leagues, 0, ` — ${country}`);
});

// ── Filter by tier ───────────────────────────────────────────────────────

composer.callbackQuery(/^leagues:tier:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const tier = parseInt(ctx.match![1], 10);
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const leagues = await storage.getLeaguesByTier(chatId, tier);

  if (leagues.length === 0) {
    await ctx.editMessageText(`No leagues found at tier ${tier}.`, {
      reply_markup: inlineKeyboard([
        [inlineButton("🏆 All leagues", "leagues:list")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }

  const tierLabel = tier === 1 ? "1st tier" : tier === 2 ? "2nd tier" : `${tier}th tier`;
  await renderLeaguePage(ctx, chatId, leagues, 0, ` — ${tierLabel}`);
});

// ── Select a league → show upcoming matches ──────────────────────────────

composer.callbackQuery(/^leagues:select:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const leagueId = ctx.match![1];
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const league = await storage.getLeague(chatId, leagueId);

  if (!league) {
    await ctx.editMessageText("Couldn't find that league — it may have been removed.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const matches = await storage.getUpcomingMatchesByLeague(chatId, leagueId);

  if (matches.length === 0) {
    await ctx.editMessageText(
      `No upcoming matches in ${league.name} — check back soon!`,
      {
        reply_markup: inlineKeyboard([
          [inlineButton("🏆 Leagues", "leagues:list")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  const lines = matches.map(
    (m, i) =>
      `${i + 1}. ${m.home_team} vs ${m.away_team}\n   ${formatDate(m.match_datetime)}`,
  );
  const text =
    `🏆 ${league.name} (${league.country})\n\nUpcoming matches:\n\n${lines.join("\n\n")}`;

  const buttons = matches.map((m) => [
    inlineButton(
      `🔮 ${m.home_team} vs ${m.away_team}`,
      `predict:match:${m.id}`,
    ),
  ]);
  buttons.push([inlineButton("⬅️ Leagues", "leagues:list")]);
  buttons.push([inlineButton("🏠 Menu", "menu:main")]);

  await ctx.editMessageText(text, { reply_markup: inlineKeyboard(buttons) });
});

// ── Country filter buttons ───────────────────────────────────────────────

composer.callbackQuery("leagues:countries", async (ctx) => {
  await ctx.answerCallbackQuery();
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const countries = await storage.getCountries(chatId);

  if (countries.length === 0) {
    await ctx.editMessageText("No leagues available yet.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const buttons = countries.map((c) => [
    inlineButton(`🌍 ${c}`, `leagues:country:${encodeURIComponent(c)}`),
  ]);
  buttons.push([inlineButton("⬅️ All leagues", "leagues:list")]);
  buttons.push([inlineButton("🏠 Menu", "menu:main")]);

  await ctx.editMessageText("Filter by country:", {
    reply_markup: inlineKeyboard(buttons),
  });
});

// ── Tier filter buttons ──────────────────────────────────────────────────

composer.callbackQuery("leagues:tiers", async (ctx) => {
  await ctx.answerCallbackQuery();
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const tiers = await storage.getTiers(chatId);

  if (tiers.length === 0) {
    await ctx.editMessageText("No leagues available yet.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const buttons = tiers.map((t) => {
    const label = t === 1 ? "1st tier" : t === 2 ? "2nd tier" : `${t}th tier`;
    return [inlineButton(label, `leagues:tier:${t}`)];
  });
  buttons.push([inlineButton("⬅️ All leagues", "leagues:list")]);
  buttons.push([inlineButton("🏠 Menu", "menu:main")]);

  await ctx.editMessageText("Filter by tier:", {
    reply_markup: inlineKeyboard(buttons),
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} ${time}`;
}

async function renderLeaguePage(
  ctx: { editMessageText: Function },
  chatId: number,
  leagues: { id: string; name: string; country: string; tier: number }[],
  page: number,
  suffix = "",
) {
  const paged = paginate(leagues, {
    page,
    perPage: LEAGUES_PER_PAGE,
    callbackPrefix: "leagues:page",
  });

  const lines = paged.pageItems.map(
    (l, i) =>
      `${page * LEAGUES_PER_PAGE + i + 1}. ${l.name}\n   🌍 ${l.country} · Tier ${l.tier}`,
  );

  const text =
    `🏆 Leagues${suffix} (page ${paged.page + 1}/${paged.totalPages}):\n\n${lines.join("\n\n")}`;

  const rows = paged.pageItems.map((l) => [
    inlineButton(`${l.name}`, `leagues:select:${l.id}`),
  ]);

  if (paged.controls.inline_keyboard.length > 0) {
    rows.push(paged.controls.inline_keyboard[0] as { text: string; callback_data: string }[]);
  }

  rows.push([
    inlineButton("🌍 By country", "leagues:countries"),
    inlineButton("📊 By tier", "leagues:tiers"),
  ]);
  rows.push([inlineButton("⬅️ Back to menu", "menu:main")]);

  await ctx.editMessageText(text, { reply_markup: inlineKeyboard(rows) });
}

async function renderLeaguePageReply(
  ctx: { reply: Function },
  chatId: number,
  leagues: { id: string; name: string; country: string; tier: number }[],
  page: number,
  suffix = "",
) {
  const paged = paginate(leagues, {
    page,
    perPage: LEAGUES_PER_PAGE,
    callbackPrefix: "leagues:page",
  });

  const lines = paged.pageItems.map(
    (l, i) =>
      `${page * LEAGUES_PER_PAGE + i + 1}. ${l.name}\n   🌍 ${l.country} · Tier ${l.tier}`,
  );

  const text =
    `🏆 Leagues${suffix} (page ${paged.page + 1}/${paged.totalPages}):\n\n${lines.join("\n\n")}`;

  const rows = paged.pageItems.map((l) => [
    inlineButton(`${l.name}`, `leagues:select:${l.id}`),
  ]);

  if (paged.controls.inline_keyboard.length > 0) {
    rows.push(paged.controls.inline_keyboard[0] as { text: string; callback_data: string }[]);
  }

  rows.push([
    inlineButton("🌍 By country", "leagues:countries"),
    inlineButton("📊 By tier", "leagues:tiers"),
  ]);
  rows.push([inlineButton("⬅️ Back to menu", "menu:main")]);

  await ctx.reply(text, { reply_markup: inlineKeyboard(rows) });
}

export default composer;
