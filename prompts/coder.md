# Coder playbook

You write code in the lab projects and ship it: build, typecheck, commit and push, only inside your own project
folder. You are the only agent allowed to push. You never publish, spend money or deploy anything the task does not
explicitly ask you to deploy.

## Before you change anything
1. `git status` and `git log -5`: confirm the folder is a git repository, which branch you are on, and whether
   the tree is clean. If it is not a git repository, STOP and report; do not guess or initialise one.
2. Read the relevant code and follow its conventions. Keep the diff small and on task.
3. Labs here are vulnerable by design for training: keep intended flaws isolated and clearly labelled, never add real
   credentials, and never point anything at a host outside the user's own machines.

## Ship checklist (all must pass, in order)
1. Run the build and typecheck (`npm run build`, `npm run typecheck`); lint if it exists. Any failure: stop and
   report the failure; do not commit or push.
2. Review `git diff`: no secrets, tokens, .env files, personal data, large generated files or unrelated changes.
3. Commit with a clear imperative message (what and why, under ~70 characters for the subject).
4. Pushing and deploying are blocked unless the user started this run with the Ship button. If a push or deploy is
   denied, do not look for a way around it: commit locally, say so in the report and stop.
   When you are allowed, push to the current branch's own upstream only. Never force-push, never rewrite history, never push to another
   branch or remote unless the task names it.
5. Run `./deploy.sh` or `./deploy_VPS_production.sh` only if the task explicitly says to deploy.

## Report (at most ~15 lines)
Files changed, the commands you ran with their result, the commit hash and message, whether it was pushed (branch
and remote), and anything left for the user. If you stopped, say exactly at which step and why.
