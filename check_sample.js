import fs from "node:fs";
import assert from "node:assert";
import { step, close } from "./txnrun.js";

// 验收脚本：每条值收进 emit 与期望逐项比对；另带七条机检断言，真调实现，不符即非零退出。
const __lines = [];
function emit(label, value) { __lines.push([String(label).replace(/ =$/, ""), value]); }


const spec = JSON.parse(fs.readFileSync(process.argv[2] || "sample/stage.json", "utf8"));
const events = spec.events || [];
const half = Math.ceil(events.length / 2);
const first = step(spec);
const closed = close(Object.assign({}, spec, { state: first.state }));
const r1 = step(Object.assign({}, spec, { events: events.slice(0, half) }));
const r2 = step(Object.assign({}, spec, { state: r1.state, events: events.slice(half) }));
const closedTwo = close(Object.assign({}, spec, { state: r2.state }));
const replay = step(Object.assign({}, spec, { state: closed.state }));
const wide = step(Object.assign({}, spec, { budget: spec.budget + 2 }));
const full = step(Object.assign({}, spec, { budget: events.length + 2 }));
const fullClosed = close(Object.assign({}, spec, { state: full.state }));
const fingerprint = function (state) {
  return JSON.stringify({ prepared: state.prepared, committed: state.committed, aborted: state.aborted,
                          log: state.log, applied: state.applied.length });
};

emit("提交序列 =", JSON.stringify(closed.state.committed));
emit("中止序列 =", JSON.stringify(closed.state.aborted));
emit("首轮清理条数 =", first.cleaned);
emit("二档清理条数 =", wide.cleaned);
emit("重复准备条数 =", first.dup_prepare);
emit("收尾前待清理条数 =", first.pending_before);
emit("收尾补齐条数 =", closed.catchup);
emit("收尾后日志长度 =", closed.state.log.length);
emit("两个预算档清理不同 =", first.cleaned !== wide.cleaned);
emit("拆两轮中间态不同 =", fingerprint(r2.state) !== fingerprint(first.state));
emit("拆两轮收尾态一致 =", fingerprint(closedTwo.state) === fingerprint(closed.state));
emit("重放新增清理 =", replay.cleaned);
emit("工作计数未超上界 =", first.judged <= first.judged_bound);
emit("与全量对照差异 =", fingerprint(closed.state) === fingerprint(fullClosed.state) ? 0 : 1);


// ---- 异常路径探针：真调用实现，看它报出什么码（不是从样例里抄）----
function probe(eventsToTry) {
  try {
    step({ state: { prepared: [], committed: [], aborted: [], log: [], applied: [] },
      events: eventsToTry, budget: 1 });
    return null;
  } catch (error) {
    return error && error.code ? error.code : String(error && error.message);
  }
}
const notPreparedCode = probe([{ id: 1, kind: "commit", tx: 9 }]);
const badEventCode = probe([{ id: 1, kind: "peek", tx: 1 }]);
emit("未准备写错的错误码", notPreparedCode);
emit("事件写错的错误码", badEventCode);


// ---- 七条机检断言：脚本自己断言的事实（真调实现，不靠样例抄值）----
const assertions = [
  ["两档预算清理条数必须不同", function () {
    assert.notStrictEqual(first.cleaned, wide.cleaned);
  }],
  ["收尾前待清理大于零且收尾后归零", function () {
    assert.ok(first.pending_before > 0, "收尾前应有压账条目");
    assert.strictEqual(closed.state.log.length, 0);
  }],
  ["拆两轮中间态不同而收尾态一致", function () {
    assert.notStrictEqual(fingerprint(r2.state), fingerprint(first.state));
    assert.strictEqual(fingerprint(closedTwo.state), fingerprint(closed.state));
  }],
  ["收尾后重放不再产生清理", function () {
    assert.strictEqual(replay.cleaned, 0);
  }],
  ["工作计数不超事件条数", function () {
    assert.ok(first.judged >= 0);
    assert.ok(first.judged <= events.length);
  }],
  ["与全量预算对照差异为零", function () {
    assert.strictEqual(fingerprint(closed.state), fingerprint(fullClosed.state));
  }],
  ["状态型异常探针真调且错误带 code", function () {
    assert.strictEqual(notPreparedCode, "E_NOT_PREPARED");
    assert.strictEqual(badEventCode, "E_BAD_EVENT");
  }]
];
let __assertBad = 0;
for (const [name, fn] of assertions) {
  try { fn(); console.log("断言通过 " + name); }
  catch (error) { __assertBad += 1; console.log("断言失败 " + name + " :: " + (error && error.message)); }
}
console.log("机检断言 " + (assertions.length - __assertBad) + "/" + assertions.length + " 条通过");


// ---- 期望值（参考模型算出，与题面给的验收数值一致）----
const EXPECTED = {
  "提交序列": [
    1,
    2
  ],
  "中止序列": [
    3
  ],
  "首轮清理条数": 1,
  "二档清理条数": 3,
  "重复准备条数": 1,
  "收尾前待清理条数": 2,
  "收尾补齐条数": 2,
  "收尾后日志长度": 0,
  "两个预算档清理不同": true,
  "拆两轮中间态不同": true,
  "拆两轮收尾态一致": true,
  "重放新增清理": 0,
  "工作计数未超上界": true,
  "与全量对照差异": 0,
  "未准备写错的错误码": "E_NOT_PREPARED",
  "事件写错的错误码": "E_BAD_EVENT"
};
// 有的值在收进来之前已经 stringify 过，比较前先试着解析回来，避免类型错配把正确实现判成不过。
function __same(got, want) {
  if (typeof got === "string") {
    try { const parsed = JSON.parse(got); if (JSON.stringify(parsed) === JSON.stringify(want)) return true; } catch (error) { /* 不是 JSON 就按原文比 */ }
  }
  return JSON.stringify(got) === JSON.stringify(want);
}
let __bad = 0;
for (const [label, want] of Object.entries(EXPECTED)) {
  const found = __lines.find((pair) => pair[0] === label);
  if (!found) { __bad += 1; console.log("缺失验收项 " + label); continue; }
  const got = found[1];
  if (__same(got, want)) { console.log("一致 " + label + " = " + JSON.stringify(got)); }
  else { __bad += 1; console.log("不一致 " + label + " 期望 " + JSON.stringify(want) + " 实际 " + JSON.stringify(got)); }
}
console.log("验收项 " + (Object.keys(EXPECTED).length - __bad) + "/" + Object.keys(EXPECTED).length + " 通过");
process.exit(__bad === 0 && __assertBad === 0 ? 0 : 1);
