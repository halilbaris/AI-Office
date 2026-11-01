# Contributing

Thanks for helping. The office is deliberately small, local and private by default.

## Before a pull request

- Run `./scripts/check.sh`. It checks Python syntax, the unit tests, JSON files, frontend module syntax,
  the leftover-Turkish rule and boots a throwaway server on port 8798 for an API smoke test.
- Add a test under `tests/` for parser, mapping or ingestion changes.
- Keep it local: no network calls in tests, no model calls, no secrets.

## New agent providers

1. Add a `Provider` subclass in `providers/`; `poll()` returns ingest payloads.
2. Reuse `ingest.handle()` for mapping and event shape. Do not write events directly.
3. Add a parser test with a small fixture line.
4. Document the source in `README.md`, including which file or database it reads.
5. Respect the privacy rule: tool name and a short target only. Never store prompts, model output or file
   contents. A shell command is reduced to its first word.

## Style

- Python standard library only; no new runtime dependencies.
- English code, comments and UI copy.
- Keep changes small and explain the user-visible effect in the pull request.
