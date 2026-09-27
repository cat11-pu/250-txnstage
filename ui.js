// ui.js：操作面板与视图（原生 DOM，无弹窗）
import { render } from "./app.js";

export function mount(spec, parts) {
  parts.log.textContent = "事件 " + (spec.events || []).length + " 条，本轮日志清理预算 " + (spec.budget || 0) + " 条。";

  function draw() {
    let view = null;
    try {
      view = render(spec);
    } catch (error) {
      parts.out.textContent = String(error && error.code ? error.code : error);
      parts.log.textContent = "跑不动：" + String(error && error.message ? error.message : error);
      return;
    }
    parts.out.textContent = JSON.stringify(view, null, 1);
    parts.stage.textContent = "";
    (spec.events || []).forEach(function (event, spot) {
      const row = document.createElement("div");
      row.className = "row";
      const head = document.createElement("span");
      head.textContent = "事件 " + (spot + 1) + " " + event.kind + " 事务 " + event.tx;
      row.appendChild(head);
      const mark = document.createElement("span");
      const pending = (view.pending_ids || []).indexOf(event.id) !== -1;
      mark.className = "chip" + (pending ? " warn" : " ok");
      mark.textContent = pending ? "压在账上" : "本轮已处理";
      row.appendChild(mark);
      parts.stage.appendChild(row);
    });
    parts.legend.textContent = "提交 " + view.committed.length + " 个，中止 " + view.aborted.length
      + " 个，首轮清理 " + view.cleaned + " 条，收尾补齐 " + view.catchup + " 条";
    parts.log.textContent = "收尾前待清理 " + view.pending_before + " 条，工作计数 " + view.judged
      + " / 上界 " + view.judged_bound;
  }

  const budgetInput = document.createElement("input");
  budgetInput.type = "number";
  budgetInput.value = "3";
  parts.controls.appendChild(budgetInput);

  const runButton = document.createElement("button");
  runButton.className = "primary";
  runButton.textContent = "跑一遍";
  runButton.addEventListener("click", draw);
  parts.controls.appendChild(runButton);

  const budgetButton = document.createElement("button");
  budgetButton.textContent = "把清理预算换成输入框的值";
  budgetButton.addEventListener("click", function () {
    const next = Number(budgetInput.value);
    spec.budget = Number.isFinite(next) ? Math.max(1, Math.round(next)) : 1;
    draw();
  });
  parts.controls.appendChild(budgetButton);

  const closeButton = document.createElement("button");
  closeButton.textContent = "看收尾清理后的日志";
  closeButton.addEventListener("click", function () {
    render(spec);
    draw();
  });
  parts.controls.appendChild(closeButton);

  const dropButton = document.createElement("button");
  dropButton.textContent = "删最后一条事件";
  dropButton.addEventListener("click", function () {
    spec.events = (spec.events || []).slice(0, Math.max(0, (spec.events || []).length - 1));
    draw();
  });
  parts.controls.appendChild(dropButton);

  draw();
}
