// txnrun.js：两阶段提交日志的预算清理
import { canCommit, isSettledTx } from "./stage.js";

function makeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isKey(value) {
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" && value.length > 0;
}

function isValidEvent(event) {
  return event !== null && typeof event === "object"
    && isKey(event.id) && isKey(event.tx)
    && (event.kind === "prepare" || event.kind === "commit" || event.kind === "abort");
}

function normalizeBudget(budget) {
  const value = Number(budget);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

// 不就地改写入参：拷一份跨轮状态出来
function cloneState(state) {
  state = state || {};
  return {
    prepared: Array.isArray(state.prepared) ? state.prepared.slice() : [],
    committed: Array.isArray(state.committed) ? state.committed.slice() : [],
    aborted: Array.isArray(state.aborted) ? state.aborted.slice() : [],
    log: Array.isArray(state.log) ? state.log.slice() : [],
    applied: Array.isArray(state.applied) ? state.applied.slice() : []
  };
}

// 从日志队首扫，清掉已落定条目；未落定的跳过、不花预算
function sweepLog(state, budgetLeft) {
  let remaining = budgetLeft;
  let cleaned = 0;
  const survivors = [];
  for (const entry of state.log) {
    if (isSettledTx(state, entry.tx) && remaining > 0) {
      remaining -= 1;
      cleaned += 1;
    } else {
      survivors.push(entry);
    }
  }
  state.log = survivors;
  return cleaned;
}

// 预算用尽后仍留在日志里的已落定条目（压在账上带出下一轮）
function pendingEntries(state) {
  return state.log.filter(function (entry) { return isSettledTx(state, entry.tx); });
}

export function step(spec) {
  spec = spec || {};
  const events = Array.isArray(spec.events) ? spec.events : [];
  const state = cloneState(spec.state);
  const appliedSet = new Set(state.applied);
  let budgetLeft = normalizeBudget(spec.budget);

  let cleaned = 0;
  let dupPrepare = 0;
  let judged = 0;

  events.forEach(function (event) {
    if (!isValidEvent(event)) {
      throw makeError("E_BAD_EVENT", "不认识或字段不合法的事件：" + JSON.stringify(event));
    }
    if (appliedSet.has(event.id)) {
      return; // 重放已处理事件：幂等，不再计活
    }

    judged += 1;

    if (event.kind === "prepare") {
      if (isSettledTx(state, event.tx)) {
        dupPrepare += 1; // 已落定再准备：单独计数
      } else {
        if (state.prepared.indexOf(event.tx) === -1) state.prepared.push(event.tx);
        state.log.push({ id: event.id, tx: event.tx });
      }
    } else if (event.kind === "commit" || event.kind === "abort") {
      if (!canCommit(state, event.tx)) {
        throw makeError("E_NOT_PREPARED", "事务不在准备集合里，不能" + event.kind + "：" + event.tx);
      }
      const slot = state.prepared.indexOf(event.tx);
      state.prepared.splice(slot, 1);
      (event.kind === "commit" ? state.committed : state.aborted).push(event.tx);
    }

    appliedSet.add(event.id);
    state.applied = Array.from(appliedSet);
    const justCleaned = sweepLog(state, budgetLeft);
    cleaned += justCleaned;
    budgetLeft -= justCleaned;
  });

  const pending = pendingEntries(state);

  return {
    state: state,
    committed: state.committed,
    aborted: state.aborted,
    cleaned: cleaned,
    dup_prepare: dupPrepare,
    pending_before: pending.length,
    pending_ids: pending.map(function (entry) { return entry.id; }),
    catchup: 0,
    judged: judged,
    judged_bound: events.length
  };
}

export function close(spec) {
  spec = spec || {};
  const state = cloneState(spec.state);
  const before = state.log.length;
  // 收尾不限预算：只清已落定条目，未落定的留下
  state.log = state.log.filter(function (entry) { return !isSettledTx(state, entry.tx); });
  const catchup = before - state.log.length;
  return { state: state, catchup: catchup };
}
