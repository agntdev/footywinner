# Football Predictor Bot — Bot specification

**Archetype:** community

**Voice:** warm and encouraging — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot for football fans to predict match winners, track predictions, and compete on leaderboards. Supports group chats with per-chat leaderboards and admin-managed match data. Users earn points for correct predictions and receive result notifications.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- football fans
- prediction game enthusiasts
- group chat participants

## Success criteria

- active user participation in predictions
- weekly leaderboard updates
- admin-managed match data with result notifications

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Show welcome message and available commands
- **/matches** (command, actor: user, command: /matches) — List upcoming matches with prediction buttons
- **/predict** (command, actor: user, command: /predict) — Make or update prediction for a specific match
- **/leaderboard** (command, actor: user, command: /leaderboard) — Show top users by prediction accuracy
- **/myguesses** (command, actor: user, command: /myguesses) — View personal prediction history and status
- **Predict** (button, actor: user, callback: predict:match_id) — Inline button to select prediction outcome

## Flows

### onboarding
_Trigger:_ /start

1. Display welcome message
2. List available commands

_Data touched:_ User

### prediction_flow
_Trigger:_ /predict <match_id> or Predict button

1. Show match details
2. Display home/draw/away buttons
3. Record prediction with timestamp

_Data touched:_ Prediction, Match

### result_processing
_Trigger:_ Admin posts result

1. Validate outcome against match data
2. Update leaderboard points
3. Notify users of results

_Data touched:_ Result, LeaderboardEntry

### leaderboard_display
_Trigger:_ /leaderboard

1. Fetch top users
2. Format and display scores

_Data touched:_ LeaderboardEntry

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User** _(retention: persistent)_ — Telegram user with display name and handle
  - fields: telegram_id, display_name, handle
- **Match** _(retention: persistent)_ — Football match with teams, date, and status
  - fields: id, home_team, away_team, match_datetime, competition_name
- **Prediction** _(retention: persistent)_ — User's prediction for a match outcome
  - fields: user_id, match_id, outcome, timestamp
- **Result** _(retention: persistent)_ — Match outcome and score
  - fields: match_id, final_outcome, final_score, result_timestamp
- **LeaderboardEntry** _(retention: persistent)_ — User's prediction accuracy score
  - fields: user_id, points, correct_predictions

## Integrations

- **Telegram** (required) — Bot API messaging and group chat support
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Add/edit matches via admin interface
- Configure per-chat vs global leaderboards
- Set admin notification preferences
- Manage group-specific prediction rules

## Notifications

- Result notifications to users after match settlement
- Daily admin summary of upcoming matches and unresolved predictions

## Permissions & privacy

- User data stored with per-chat isolation by default
- Optional group-specific data isolation
- Admin controls for match data and configuration

## Edge cases

- Prediction changes after match kickoff (locked predictions)
- Multiple admins managing matches in group chats
- Tie scores in leaderboard calculations

## Required tests

- Prediction submission and modification flow
- Leaderboard updates after result posting
- Group chat isolation of predictions and scores

## Assumptions

- Matches are manually added by admins by default
- Outcome-only scoring (no score-based partial credit)
- Per-chat leaderboards enabled by default
