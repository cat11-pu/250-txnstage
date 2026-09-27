// stage.js：事务能不能落定（基线：一律给真）
export function canCommit(state, tx) {
  return true;
}

export function isSettledTx(state, tx) {
  return false;
}
