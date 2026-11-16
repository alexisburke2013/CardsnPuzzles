/*
 * UNDO HISTORY
 * Snapshot stack shared by every game. The hub clones the active board before a
 * meaningful move and commits the result here; undo/redo just swap the snapshot
 * back in. Games stay unaware of the mechanics and only flag which of their
 * actions are worth a step (see the `undoable` flag on handler results).
 *
 * Snapshots are plain structured clones, so keep boards small enough to clone
 * cheaply and set a limit that fits the largest board.
 */

export function createHistory(limit = 80) {
  return { stack: [], index: -1, limit };
}

export function reset(history, snapshot) {
  history.stack = snapshot === undefined ? [] : [snapshot];
  history.index = snapshot === undefined ? -1 : 0;
}

/* Drop any redo tail, append the new snapshot, and trim to the limit. */
export function commit(history, snapshot) {
  history.stack = history.stack.slice(0, history.index + 1);
  history.stack.push(snapshot);
  if (history.stack.length > history.limit) history.stack.shift();
  history.index = history.stack.length - 1;
}

export function canUndo(history) { return history.index > 0; }
export function canRedo(history) { return history.index < history.stack.length - 1; }

export function undo(history) {
  if (!canUndo(history)) return null;
  history.index -= 1;
  return history.stack[history.index];
}

export function redo(history) {
  if (!canRedo(history)) return null;
  history.index += 1;
  return history.stack[history.index];
}
