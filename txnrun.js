// txnrun.js：按预算清理日志并留账（基线：一律给空表）
import { canCommit, isSettledTx } from "./stage.js";

export function step(spec) {
  return { state: spec.state, committed: [], aborted: [], cleaned: 0, dup_prepare: 0,
           pending_before: 0, pending_ids: [], catchup: 0, judged: 0, judged_bound: 0 };
}

export function close(spec) {
  return { state: spec.state, catchup: 0 };
}
