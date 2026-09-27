// stage.js：事务落定判定
function contains(container, tx) {
  if (!container) return false;
  if (typeof container.has === "function") return container.has(tx);
  if (Array.isArray(container)) return container.indexOf(tx) !== -1;
  return false;
}

// 在准备集合里才能落定（提交或中止）
export function canCommit(state, tx) {
  return contains(state && state.prepared, tx);
}

// 已落定：已经进了提交集合或中止集合
export function isSettledTx(state, tx) {
  return contains(state && state.committed, tx) || contains(state && state.aborted, tx);
}
