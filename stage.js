// stage.js：事务落定判定。在准备集合里才允许提交/中止；在提交或中止集合里即已落定。
export function canCommit(state, tx) {
  return Array.isArray(state && state.prepared) && state.prepared.indexOf(tx) !== -1;
}

export function isSettledTx(state, tx) {
  return (Array.isArray(state && state.committed) && state.committed.indexOf(tx) !== -1)
    || (Array.isArray(state && state.aborted) && state.aborted.indexOf(tx) !== -1);
}
