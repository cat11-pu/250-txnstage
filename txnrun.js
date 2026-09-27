// txnrun.js：两阶段提交日志按预算清理。
// 准备把事务放进准备集合与日志；提交/中止要求事务确在准备集合里，落定后才允许从日志清掉。
// 整批共用一份清理预算：只清已落定条目，未落定的跳过不花预算；用尽后压在账上带出下一轮。
import { canCommit, isSettledTx } from "./stage.js";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validKey(value) {
  return (typeof value === "number" || typeof value === "string") && value !== "";
}

function cloneState(state) {
  return {
    prepared: (state.prepared || []).slice(),
    committed: (state.committed || []).slice(),
    aborted: (state.aborted || []).slice(),
    log: (state.log || []).map(function (entry) {
      return entry && typeof entry === "object"
        ? { id: entry.id, tx: entry.tx }
        : { id: entry, tx: entry };
    }),
    applied: (state.applied || []).slice()
  };
}

// 每次事件后从日志队首扫：已落定的清掉（花预算），未落定的跳过（不花预算），预算用尽即停。
function sweep(state, budgetRef) {
  let cleaned = 0;
  while (state.log.length > 0) {
    if (!isSettledTx(state, state.log[0].tx)) {
      break;
    }
    if (budgetRef.budget <= 0) {
      break;
    }
    state.log.shift();
    budgetRef.budget -= 1;
    cleaned += 1;
  }
  return cleaned;
}

export function step(spec) {
  const state = cloneState(spec.state || {});
  const events = Array.isArray(spec.events) ? spec.events : [];
  const budgetRef = { budget: Number.isFinite(spec.budget) ? Math.max(0, Math.floor(spec.budget)) : 0 };

  const committed0 = state.committed.length;
  const aborted0 = state.aborted.length;
  let cleaned = 0;
  let dupPrepare = 0;
  let judged = 0;

  for (const event of events) {
    if (!event || typeof event !== "object"
      || !validKey(event.id) || !validKey(event.tx) || typeof event.kind !== "string") {
      throw fail("E_BAD_EVENT", "事件缺字段或类型不对：要带 id、kind、tx");
    }
    if (["prepare", "commit", "abort"].indexOf(event.kind) === -1) {
      throw fail("E_BAD_EVENT", "不认识的事件 kind：" + event.kind);
    }
    if (state.applied.indexOf(event.id) !== -1) {
      continue;
    }
    judged += 1;

    if (event.kind === "prepare") {
      if (isSettledTx(state, event.tx) || state.prepared.indexOf(event.tx) !== -1) {
        dupPrepare += 1;
      } else {
        state.prepared.push(event.tx);
        state.log.push({ id: event.id, tx: event.tx });
      }
    } else if (event.kind === "commit") {
      if (!canCommit(state, event.tx)) {
        throw fail("E_NOT_PREPARED", "事务 " + event.tx + " 不在准备集合里，不能提交");
      }
      state.prepared.splice(state.prepared.indexOf(event.tx), 1);
      state.committed.push(event.tx);
    } else {
      if (!canCommit(state, event.tx)) {
        throw fail("E_NOT_PREPARED", "事务 " + event.tx + " 不在准备集合里，不能中止");
      }
      state.prepared.splice(state.prepared.indexOf(event.tx), 1);
      state.aborted.push(event.tx);
    }

    state.applied.push(event.id);
    cleaned += sweep(state, budgetRef);
  }

  const pending = state.log.filter(function (entry) { return isSettledTx(state, entry.tx); });

  return {
    state,
    committed: state.committed.slice(committed0),
    aborted: state.aborted.slice(aborted0),
    cleaned,
    dup_prepare: dupPrepare,
    pending_before: pending.length,
    pending_ids: pending.map(function (entry) { return entry.id; }),
    catchup: 0,
    judged,
    judged_bound: events.length
  };
}

// 收尾：不限预算，把已落定条目全部清掉（未落定的仍留在日志里）。
export function close(spec) {
  const state = cloneState(spec.state || {});
  let catchup = 0;
  let index = 0;
  while (index < state.log.length) {
    if (isSettledTx(state, state.log[index].tx)) {
      state.log.splice(index, 1);
      catchup += 1;
    } else {
      index += 1;
    }
  }
  return { state, catchup };
}
