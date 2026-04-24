# Fix Worktree-to-Local Cleanup Handoff

- Spec ID: `202604221539-worktree-local-cleanup-handoff`
- Created At: `2026-04-22T15:39:10+07:00`
- Spec Path: `docs/specs/202604221539-worktree-local-cleanup-handoff.md`

## Summary

The Linux patches currently preserve a terminal/session during worktree-to-local
handoff, but worktree environment cleanup only runs on the later delete path.
This can leave cleanup scripts effectively skipped when a conversation returns
to `local`. The fix should trigger cleanup on handoff, keep session continuity,
and preserve delete-time cleanup as a fallback without double-running cleanup.

## Locked Decisions

- Trigger worktree environment cleanup on handoff back to `local` instead of
  waiting for worktree deletion.
- Keep the resumed terminal session alive during handoff; do not force-close it
  to trigger cleanup.
- Reuse the existing worktree cleanup pipeline and pass both source/local and
  worktree roots into cleanup input.

## Checklist

- [x] Implement handoff-triggered worktree cleanup state and patch output in `src/repack.js`. Verify with targeted `node --test test/repack.test.js`.
- [x] Extend bundle fixture coverage for worktree handoff cleanup, injected cleanup environment, and cleanup dedupe in `test/repack.test.js`. Verify with targeted `node --test test/repack.test.js`.
- [x] Run the relevant test suite and confirm the spec matches the final behavior. Verify with `node --test test/repack.test.js`.

## Progress Notes

- `2026-04-22T15:39:10+07:00` Spec created.
- `2026-04-22T15:44:00+07:00` Updated the worker worktree cleanup patch to derive the source workspace root from the worktree `.git` file and inject both source and worktree roots into cleanup scripts. Files changed: `src/repack.js`, `test/repack.test.js`. Verification: `node --test test/repack.test.js`.
