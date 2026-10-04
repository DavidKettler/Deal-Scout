import type { RunFile, RunItem, StatusFile } from "@deal-scout/core";

const esc = (s: unknown = "") =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const dashboardUrl = () => (process.env.DASHBOARD_URL || "http://localhost:5173").replace(/\/$/, "");

function section(title: string, items: RunItem[], body: (i: RunItem) => string) {
  if (!items.length) return "";
  return `<h2 style="font:600 18px system-ui;margin:28px 0 8px;border-bottom:2px solid #eee;padding-bottom:6px">${title}</h2>
${items.map((i) => card(i, body(i))).join("")}`;
}

function card(i: RunItem, body: string) {
  const queue = i.kind === "deal" ? "" : ` · <a href="${esc(`${dashboardUrl()}/items/${i.id}`)}" style="color:#0b57d0">Open in queue →</a>`;
  return `<div style="margin:0 0 14px;padding:12px 14px;border:1px solid #e5e5e5;border-radius:10px">
<a href="${esc(i.url)}" style="font:600 15px system-ui;color:#0b57d0;text-decoration:none">${esc(i.title)}</a>
<div style="font:14px/1.45 system-ui;color:#333;margin-top:4px">${body}</div>
<div style="font:12px system-ui;color:#888;margin-top:6px">${esc(i.domain)}${queue}</div></div>`;
}

function queueSummary(status: StatusFile | null) {
  if (!status) return "";
  const count = (s: string) => Object.values(status.items).filter((i) => i.status === s).length;
  const parts = [
    [count("ready_for_review"), "ready for your review"],
    [count("manual"), "need manual handling"],
    [count("new"), "awaiting triage"],
  ].filter(([n]) => n);
  if (!parts.length) return "";
  return `<p style="font:14px system-ui;background:#f5f7ff;border-radius:8px;padding:10px 12px">
<b>Your queue:</b> ${parts.map(([n, label]) => `${n} ${label}`).join(" · ")} — <a href="${esc(dashboardUrl())}">open dashboard</a></p>`;
}

export function renderDigest(run: RunFile, status: StatusFile | null) {
  const of = (k: RunItem["kind"]) => run.items.filter((i) => i.kind === k);
  return `<div style="max-width:640px;margin:auto;padding:16px;font-family:system-ui">
<p style="font:15px system-ui;color:#555">${esc(run.headline)}</p>
${queueSummary(status)}
${section("🏷️ Deals", of("deal"), (d) =>
  `<b>${esc(d.details.price)}</b>${d.details.was_price ? ` <s style="color:#999">${esc(d.details.was_price)}</s>` : ""} — ${esc(d.why)}`)}
${section("🎁 Free samples", of("sample"), (s) => `${esc(s.why)}${s.deadline ? `<br><i>Ends ${esc(s.deadline)}</i>` : ""}`)}
${section("⚖️ Settlements you may qualify for", of("settlement"), (s) =>
  `<b>Deadline:</b> ${esc(s.deadline ?? "unknown")} · <b>Payout:</b> ${esc(s.details.payout ?? "unknown")}<br>${esc(s.why)}
  <br><i>Proof required: ${esc(s.details.proof_required ?? "unknown")}</i>`)}
<p style="font:12px system-ui;color:#999;margin-top:24px">Claim forms are sworn statements — only file where you actually qualify.</p>
</div>`;
}
