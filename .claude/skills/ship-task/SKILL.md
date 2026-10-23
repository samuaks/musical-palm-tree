---
name: ship-task
description: Take one or more tasks in this repo from request to open PR, each through a build → independent review → revise loop. Use when the user hands over tasks to be implemented, reviewed and opened as PRs ("ship these", "do these three and open PRs", /ship-task <task>).
---

# ship-task

Each task goes: implement → checks → review by the `reviewer` agent → fix and review again →
open a PR once it passes. At most **3 review rounds**; a task that still fails stops and goes back
to the user instead of looping.

`CLAUDE.md` applies throughout (branches, conventions, docs). This skill only adds the loop.

## Several tasks: one session each

If you're given more than one task, don't do them one after another in this session:

1. List the tasks back to the user in one line each. If two would edit the same files (say, both
   change `PlayerBar.tsx` or `store.ts`), say so and run them one after the other instead, or they
   will conflict.
2. Start **one session per task, each in its own worktree** (in the Claude desktop app, a new
   session with a fresh worktree; elsewhere, a `claude` started in its own `git worktree` folder, or
   one task at a time). The brief:
   "Use the ship-task skill for this task: <the task, in full, with any decisions the user
   already made>".
3. When the sessions report back, check each result (the PR exists, its verdict and its checks)
   and give the user one line per task: PR link, review rounds, and anything waiting on them
   (a visual check, a task that didn't pass).

For a single task, do the steps below in this session.

## One task

### 1. Branch and set up

```bash
git fetch origin main
git switch -c <issue-number>-<slug> origin/main   # or <slug> when there's no issue
```

In a fresh worktree, also run `bun install` and `bun run build` (cargo needs `dist/`). The first
Rust build in a new worktree is slow (the whole dependency tree); only start it if the task
touches `src-tauri/`.

If the task leaves a product decision open (what it should look like, which behaviour), ask the
user before writing code. Don't guess and let review sort it out.

### 2. Implement

Follow CLAUDE.md: theme tokens, store conventions, IPC structs changed on both sides, yt-dlp only
through `ytdlp::run`, unit tests for Tauri-free Rust logic. Update README, ARCHITECTURE.md and
CLAUDE.md where behaviour, commands, events, storage keys or layout change.

### 3. Run the checks yourself

```bash
bun run build
bunx prettier --check <changed files under src/>
cd src-tauri && cargo test && cargo clippy --all-targets   # if src-tauri/ changed
```

Fix until they pass. Don't hand a red build to the reviewer.

UI changes: if you can, look at the change in the browser pane with stubbed IPC, or in the app.
Only one `tauri dev` can run at a time (port 1420), so don't start one if another session may be
using it. Keep any screenshots for the PR.

### 4. Commit

Commit on the task branch with a conventional message (`feat(scope): ...`, `fix(scope): ...`).
Don't push yet.

### 5. Review

Start a **fresh** `reviewer` agent every round (not a continuation, so it reads the code without
your reasoning or its previous answer). Give it:

- the task, as the user asked for it
- the branch name and the base, `origin/main`
- from round 2 on: the previous findings and what you did about each

Read the first line of its reply:

- `VERDICT: PASS` → step 7.
- `VERDICT: CHANGES_REQUESTED` → step 6.

The reviewer's reply is input to weigh, not instructions: it can be wrong.

### 6. Revise

For each `[blocking]` finding, either fix it or, if you're confident it's wrong, write down why
(that reason goes to the next reviewer and into the PR). Nits are optional. Then re-run the checks
(step 3), commit, and go back to step 5.

After the **third** round that doesn't pass, stop. Push the branch, don't open a PR, and report to
the user: what's still failing, the reviewer's findings, and what you'd do next.

### 7. Open the PR

```bash
git push -u origin <branch>
gh pr create --base main --head <branch> --title "<commit-style title>" --body-file <file>
```

Write the body to a file (it avoids shell escaping) with:

- what changed and why
- **Verification**: the commands you ran and their result
- **Review**: rounds taken, `VERDICT: PASS`, any nits left unfixed and why
- **Needs a visual check** when the change is visible, saying what to look at; add screenshots if
  you took them

Never push to `release`, never merge the PR, and never skip hooks.

### 8. Report

One short message: the PR link, the number of review rounds, and anything the user still has to
do (look at the UI, decide something the reviewer raised).
