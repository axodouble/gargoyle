# Design: Role Invite Trees (Lobste.rs-style trusted roles)

Date: 2026-10-12
Status: Approved for planning

## Intent

Guilds want roles that are gated by a chain of trust instead of being freely
grantable. Like Lobste.rs membership: the _only_ way a member gets one of
these roles is that someone who already holds it invites them, and the
invitation must be accepted. Every accepted invitation records a
parent→child link, so the whole population of role holders is one
easily indexable tree (technically a forest — see "Founding fathers").
Being in the tree _is_ the role; there is no other path into it.

This is built for and integrated into Gargoyle, a Discord bot
(Discord.js v14, TypeScript, Bun, Drizzle/Postgres). The feature extends
the existing `/role` command in `src/modules/utilities/role.ts`.

## Goals

- A guild manager (Discord `ManageRoles`) opts specific guild roles into the
  invite-tree system. Any number of roles per guild can be opted in.
- Each opted-in role has its own independent tree. Trees never interact.
- A holder of an opted-in role invites another **guild member**:
  `/role invite invite <user> [role]`. The `role` option is optional and
  only required when the inviter holds more than one opted-in role; when
  the inviter holds exactly one, it is used implicitly. An explicit role
  is always validated: the inviter must hold it.
- The invite is an **offer**, not a grant. It posts a components-v2
  message in the channel the command was used in, with **Accept** and
  **Deny** buttons, and DMs the target a jump link to that message.
- Accepting grants the Discord role and records the parent→child link
  (parent = the inviter). Denying closes the offer; no role is granted.
- Only the invite target can press Accept or Deny.
- A management action force-adopts: grants the role and writes the parent
  link immediately, no offer. `/role invite adopt <user> <parent> [role]`,
  gated on `ManageRoles`. `role` is optional with the same single-vs-multiple
  logic — except here the _manager_ picks, so when `role` is omitted and
  more than one opted-in role exists it errors asking for it to be specified.
- A management action forgets/unlinks a member: deletes their tree row for
  a role. `/role invite forget <user> [role]`, gated on `ManageRoles`.
- The tree is stored in a queryable Drizzle table: given a guild and a role,
  the full parent→child structure is a plain SQL query.

## Non-goals

- No invite limits (a holder may invite as many members as they like).
- No invite expiry; pending offers stay open until accepted or denied.
- No tree-viewing UI command in this feature (the data just has to be
  indexable in the database).
- No cascading: losing the role or leaving the guild does **not** affect
  recorded links or the subtree. Only the explicit `forget` admin action
  removes a link.
- No in-place reparenting: the sanctioned way to move a member to another
  branch is `forget` followed by a new `invite` or `adopt`.
- Nothing cross-guild: every tree is scoped to one guild.
- No new test infrastructure (see Constraints); no changes to the existing
  `/role give`, `/role create`, `/role delete`, `/role panel` flows.

## Anti-goals (what would make this a failure)

- A member who does not hold an opted-in role can invite.
- An invitation grants a role without the target's acceptance (except
  force-adopt, which is explicit admin action).
- The tree cannot be reconstructed from the database (e.g. links only
  live in message content or caches).
- Two different opted-in roles share a tree.

## What the owner decided (fixed requirements)

- Invite is accept-based, not an instant grant.
- Founding fathers: any role holder **without a parent link** is a root.
  Enabling the feature never rewrites existing holders — they simply have no
  parent row, so they are roots. Enabling a role with zero members is a
  no-op situation: nothing breaks, and anyone who later obtains the role by
  other means (e.g. an admin grants it manually) is just another root.
- Per-role opt-in, multiple roles allowed, each with its own tree.
- `/role invite invite <user> [role]` with the option required only when
  the inviter holds multiple opted-in roles.
- Chat message with Accept/Deny buttons **plus** a DM to the target with a
  link to the button.
- A management option to set a parent / force-adopt.
- Integration into the existing `/role` command.

## Commands (all on the existing `role` slash command, guild-only)

A new **subcommand group `invite`** is added to the `slashCommands` array
in `src/modules/utilities/role.ts`, alongside the existing `delete` and
`panel` subcommands. Every feature of this design lives under
`/role invite <subcommand>` (registration is automatic on bot start, no
extra steps — see `src/system/backend/initializers/registerModules.ts`).
The existing flat subcommands stay untouched.

| Subcommand | Options                                                         | Permission                                                                                                                                                | Behavior                                                                                                                                                                   |
| ---------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invite`   | `user` (required), `role` (optional)                            | Inviter must be a guild member holding ≥1 opted-in role (checked via `member.roles.cache` against the guild's opted-in role list — **not** `ManageRoles`) | Creates a pending invite: DB row, chat message with buttons, DM with jump link.                                                                                            |
| `enable`   | `role` (required)                                               | `ManageRoles`                                                                                                                                             | Adds the role to the guild's opted-in list. If already enabled, reply so. Existing holders are untouched (they are roots).                                                 |
| `disable`  | `role` (required)                                               | `ManageRoles`                                                                                                                                             | Removes the role from the opted-in list. Recorded tree rows are **kept**; re-enabling later restores the same tree. While disabled, no one can `invite` or `adopt` for it. |
| `adopt`    | `user` (required), `parent` (required, user), `role` (optional) | `ManageRoles`                                                                                                                                             | Grants the role to `user` and upserts their tree row as accepted with `parent`. No offer, no DM.                                                                           |
| `forget`   | `user` (required), `role` (optional)                            | `ManageRoles`                                                                                                                                             | Deletes the user's tree row for the role, severing their link. See "Forget in detail".                                                                                     |

Slash command notes:

- `role` options use the existing role-select/role-option style already used
  by this command (`options.addRoleOption`).
- All replies for validation errors are ephemeral, matching the existing
  style in `role.ts` (`flags: MessageFlags.Ephemeral`).

## Invite flow in detail

1. **Validation** (any failure → ephemeral error reply, nothing posted):
    - Inviter holds the resolved role and the role is opted in.
    - Target is a current guild member.
    - Target does not already hold the role.
    - Target does not already have an _accepted_ row for that role's tree
      ("you are already in the tree").
    - Target has no _pending_ invite for that role — a pending invite is
      replaced by the new one (new parent, new message); the old message's
      buttons are disabled. (Builder's call: replacement rather than error —
      the newest offer is the live one.)
    - The Discord role still exists and is editable by the bot (same
      `role.editable` concern the existing code already handles).
2. **Post** the components-v2 message in the invoking channel:
    - Text: who invited whom into which role.
    - Buttons: `GargoyleButtonBuilder(module, 'inviteaccept', <rowId>)`
      (Success) and `GargoyleButtonBuilder(module, 'invitedeny', <rowId>)`
      (Danger). customIds route through the standard
      `gm1:role:<action>:<arg>` scheme — note the 100-char customId limit
      and that args split on `:` (a row id is fine).
    - Store `channel_id` + `message_id` on the row (like
      `faction_panelsTable`) so the message can be edited later.
3. **DM** the target: short text plus a `GargoyleURLButtonBuilder`
   (label e.g. "Respond") linking to
   `https://discord.com/channels/<guildId>/<channelId>/<messageId>`.
   DMs can be blocked — `.catch(() => ...)` with a `client.logger.warning`,
   exactly like the existing DM calls in `src/modules/factions/_application.ts`.
   A failed DM is not a failure of the invite; the channel message remains.
4. **Accept** (button, target only):
    - Re-validate (still opted in, target still the row's user).
    - Grant the role via `member.roles.add(role)`.
    - Mark the row accepted (parent stays the original inviter).
    - Edit the message: disable both buttons.
    - Ephemeral confirmation. If the role grant fails (uneditable role),
      reply with the failure and leave the row pending.
5. **Deny** (button, target only):
    - Mark the row denied, disable both buttons, ephemeral confirmation.

Button dispatch: extend `executeButtonCommand` in `role.ts`; args arrive as
`...args` strings (`inviteaccept` / `invitedeny` + row id). Only
`interaction.user.id === row.user_id` may act; anyone else gets an ephemeral
"not your invite".

## Force-adopt in detail

`/role invite adopt <user> <parent> [role]`:

- `parent` must currently hold the resolved role (they become the recorded
  parent). `user` must be a guild member.
- If `user` already has an **accepted** row for that role → error "already
  in the tree" (no reparenting).
- Otherwise upsert the row as accepted (this also supersedes any pending
  invite — disable that message's buttons), and grant the role
  (`member.roles.add`, with the same editable-role handling).
- `parent` may be a root (founding father) — no requirement that they have
  children.

## Forget in detail

`/role invite forget <user> [role]`:

- `role` uses the manager-picks logic from `adopt` (optional, required when
  more than one opted-in role exists).
- The user must currently have a row (pending or accepted) for that role;
  otherwise error "not in the tree".
- Deletes the row — the user is fully out of the tree, children included
  in nothing: **their children keep their own rows and are unaffected**
  (no cascading). If the user still holds the Discord role after the forget,
  they are simply a role holder with no parent — i.e. a root — until the
  role is removed or they are re-invited/adopted.
- `forget` does **not** remove the Discord role itself (builder's call:
  link and role are separate concerns; a manager with `ManageRoles` removes
  the role by normal means if they want the member out entirely).
- If the row was pending, disable its invite message's buttons.
- Ephemeral confirmation either way.

## Storage

Schema lives in `src/system/backend/database/schema.ts`; generate and apply
migrations with `bun run db:generate` / `bun run db:migrate`.

1. **Guild opt-in list** — new column on the existing `guildsTable`
   (which already stores `auto_roles: text[]`):
   `invite_tree_roles: text[]`, default `[]`. Read/modify/write with the
   existing `client.db.getGuild` / `setGuild` helpers.

2. **Tree rows** — new table (name at the builder's discretion, e.g.
   `role_invite_tree`), one row per (guild, role, user):

    | Column                                | Notes                                              |
    | ------------------------------------- | -------------------------------------------------- |
    | `guild_id`                            | text                                               |
    | `role_id`                             | text                                               |
    | `user_id`                             | text — the child                                   |
    | `parent_user_id`                      | text — nullable; **NULL = root / founding father** |
    | `status`                              | `pending` \| `accepted` \| `denied`                |
    | `channel_id` / `message_id`           | the invite message (null for admin grants)         |
    | `created_at`, `updated_at`            | timestamps                                         |
    | unique `(guild_id, role_id, user_id)` | one parent per user per role                       |

    This mirrors `applicationsTable` (status workflow + decided-by-style
    fields). Helper module follows the `_db.ts` house pattern (underscore
    prefix so the module loader skips it), e.g.
    `src/modules/utilities/_inviteTree.ts`, with a `requireDb(client)` guard
    and typed row types, like `src/modules/factions/_db.ts`.

The tree for a role is simply `SELECT user_id, parent_user_id FROM ...
WHERE guild_id = ? AND role_id = ?` — roots are the NULL parents; every
other member appears exactly once as a child.

## Constraints and house patterns (from the codebase)

- Discord.js v14 + TypeScript + Bun; path aliases `@src/*`, `@classes/*`,
  `@builders/*`, `@database/*`; explicit `.js` extensions on imports.
- Slash commands register globally on client ready — adding subcommands to
  the `slashCommands` array is the whole registration step.
- Buttons route by customId `gm1:<module>:<action>:<args...>`; args arrive
  to `executeButtonCommand` as split strings.
- Panels use components v2: `ContainerBuilder` + `flags: [MessageFlags.IsComponentsV2]`
  (see `src/modules/factions/_panels.ts:235-285` for the exact
  accept/deny-button pattern to copy).
- `client.db` is nullable — guard with the standard
  "database not connected" ephemeral reply (pattern in `src/modules/factions/factions.ts:163-166`).
- Role grant/remove: `member.roles.add/remove` with `role.editable`
  checked; existing code in `role.ts` handles this.
- DMs: `client.users.fetch(id).send(...).catch(() => client.logger.warning(...))`.
- Quality gate: `bun run check` (prettier + `tsc`). **No test suite exists**
  in this repo and none is required for this feature; builder's call if
  they want to add one.
- Style: prettier config — 4-space indent, single quotes, print width 150.

## Open items left to the builder

- Exact table/column names and migration naming.
- Wording of all user-facing strings (invite message, DM, confirmations,
  error replies), keeping consistent with existing message tone.
- Whether `disable` should also disable any currently pending invite
  messages' buttons (reasonable default: yes; data stays).
- How to handle the corner case where the target already holds the role at
  button-press time (e.g. granted by an admin after the invite was sent):
  reasonable default — mark accepted, keep the recorded parent, skip the
  redundant grant.
- Embed vs plain text for the invite message (components-v2 text display is
  the modern pattern in this codebase; embeds are legacy).
