"""planning/plan.json から計画書を生成する。

    python3 tools/build_plan.py

出力:
    docs/plan.html   … フローチャート・バックログ・アローダイアグラム・ガントチャート
    docs/backlog.md  … GitHub で読めるプロダクトバックログ
"""

import html
import json
import math
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAN = json.loads((ROOT / "planning" / "plan.json").read_text(encoding="utf-8"))
DIAGRAMS = ROOT / "docs" / "diagrams"

SCRUM = PLAN["scrum"]
DAYS_PER_POINT = SCRUM["sprint_days"] / SCRUM["velocity"]
START = date.fromisoformat(PLAN["project"]["start_date"])
DEADLINE = date.fromisoformat(PLAN["project"]["deadline"])

stories = {s["id"]: s for s in PLAN["stories"]}
events = {e["id"]: e for e in PLAN["events"]}
acts = PLAN["activities"]
act_by_id = {a["id"]: a for a in acts}


def esc(text):
    return html.escape(str(text))


LANG = "ja"  # render() で "ja" / "en" を切り替える


def t(ja, en):
    return en if LANG == "en" else ja


def tx(obj, key):
    """データの訳（xxx_en）があれば英語版で使う。"""
    return obj.get(key + "_en", obj[key]) if LANG == "en" else obj[key]


def days(n):
    return t(f"{n}日", f"{n} d")


def day_to_date(day):
    return START + timedelta(days=day)


def fmt(d):
    return f"{d.month}/{d.day}"


# ---------------------------------------------------------------- 見積もり

for a in acts:
    a["points"] = sum(stories[s]["pts"] for s in a.get("stories", []))
    if a.get("dummy"):
        a["days"] = 0
    elif "fixed_days" in a:
        a["days"] = a["fixed_days"]
    else:
        a["days"] = math.ceil(a["points"] * DAYS_PER_POINT)

# 同じ結合点の組を2つの作業が使っていないか（ダミーが必要な形）を確認
pairs = [(a["from"], a["to"]) for a in acts]
assert len(pairs) == len(set(pairs)), "同じ結合点の組に複数の作業 → ダミー作業が必要"

# ---------------------------------------------------------------- PERT（クリティカルパス法）

order = sorted(events)  # 結合点番号はトポロジカル順に振ってある
earliest = {e: 0 for e in order}
for e in order:
    for a in acts:
        if a["to"] == e:
            earliest[e] = max(earliest[e], earliest[a["from"]] + a["days"])

last = order[-1]
latest = {e: earliest[last] for e in order}
for e in reversed(order):
    for a in acts:
        if a["from"] == e:
            latest[e] = min(latest[e], latest[a["to"]] - a["days"])

for a in acts:
    a["es"] = earliest[a["from"]]
    a["ef"] = a["es"] + a["days"]
    a["lf"] = latest[a["to"]]
    a["ls"] = a["lf"] - a["days"]
    a["float"] = a["ls"] - a["es"]
    a["critical"] = a["float"] == 0

PERT_DAYS = earliest[last]
critical_path = [a["id"] for a in sorted(acts, key=lambda x: x["es"]) if a["critical"] and not a.get("dummy")]

# ---------------------------------------------------------------- 1人開発のスケジュール（山崩し）
# 開発作業（solo）は同時に1つだけ。待ち時間中心の作業（solo=false）は並行できる。
# 着手できる作業が複数あれば、全余裕の少ない作業から着手する。

scheduled = {}


def event_ready(e):
    incoming = [a for a in acts if a["to"] == e]
    if any(a["id"] not in scheduled for a in incoming):
        return None
    return max((scheduled[a["id"]][1] for a in incoming), default=0)


dev_free = 0
while len(scheduled) < len(acts):
    progressed = True
    while progressed:
        progressed = False
        for a in acts:
            if a["id"] in scheduled or a.get("solo"):
                continue
            ready = event_ready(a["from"])
            if ready is not None:
                scheduled[a["id"]] = (ready, ready + a["days"])
                progressed = True
    candidates = []
    for a in acts:
        if a["id"] in scheduled or not a.get("solo"):
            continue
        ready = event_ready(a["from"])
        if ready is not None:
            candidates.append((max(dev_free, ready), a["float"], a["id"]))
    if not candidates:
        continue
    start, _, aid = min(candidates)
    end = start + act_by_id[aid]["days"]
    scheduled[aid] = (start, end)
    dev_free = end

for a in acts:
    a["start"], a["end"] = scheduled[a["id"]]

SOLO_DAYS = max(a["end"] for a in acts)
release_day = act_by_id["L"]["end"]

# ストーリーをスプリントに割り当てる（作業の中では順番に進める）。
# スクラムでは終わったストーリーだけがベロシティに数えられるので、完了日のスプリントに入れる。
for a in acts:
    offset = 0.0
    for sid in a.get("stories", []):
        s = stories[sid]
        s["activity"] = a["id"]
        offset += s["pts"] * DAYS_PER_POINT
        s_done = min(a["start"] + math.ceil(offset), a["end"]) - 1 if a.get("solo") else a["start"]
        s["sprint"] = s_done // SCRUM["sprint_days"] + 1

sprint_count = max(s["sprint"] for s in stories.values() if "sprint" in s)
sprint_load = {n: 0 for n in range(1, sprint_count + 1)}
for s in stories.values():
    if "sprint" in s:
        sprint_load[s["sprint"]] += s["pts"]

# ---------------------------------------------------------------- SVG: アローダイアグラム

COL_W, ROW_H, MARGIN_X, MARGIN_Y, R = 165, 130, 60, 150, 17


def ev_xy(eid):
    e = events[eid]
    return MARGIN_X + e["col"] * COL_W, MARGIN_Y + e["row"] * ROW_H


def arrow_svg():
    w = int(MARGIN_X * 2 + max(e["col"] for e in events.values()) * COL_W)
    lowest = max([e["row"] for e in events.values()] + [(2 + 6 * a["lane"]) / 8 for a in acts if "lane" in a])
    h = int(MARGIN_Y + lowest * ROW_H + 50)
    out = [f'<svg class="pert" viewBox="0 0 {w} {h}" role="img" aria-label="{t('アローダイアグラム', 'Arrow diagram')}">']
    out.append(
        '<defs>'
        '<marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
        '<path d="M0,0 L10,5 L0,10 z" class="ah"/></marker>'
        '<marker id="ahc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
        '<path d="M0,0 L10,5 L0,10 z" class="ahc"/></marker>'
        '</defs>'
    )
    for a in acts:
        x1, y1 = ev_xy(a["from"])
        x2, y2 = ev_xy(a["to"])
        dx, dy = x2 - x1, y2 - y1
        dist = math.hypot(dx, dy)
        lane = a.get("lane")
        cls = "edge" + (" crit" if a["critical"] else "") + (" dummy" if a.get("dummy") else "")
        marker = "ahc" if a["critical"] else "ah"
        if lane is not None:
            # 長い作業は上下の「レーン」を通る曲線にして、他の作業と重ならないようにする
            ly_lane = MARGIN_Y + lane * ROW_H
            sgn = 1 if ly_lane > y1 else -1
            sx, sy, ex, ey = x1, y1 + sgn * R, x2, y2 + sgn * (R + 2)
            out.append(f'<path class="{cls}" d="M{sx:.1f},{sy:.1f} C{x1 + 40:.1f},{ly_lane:.1f} {x2 - 40:.1f},{ly_lane:.1f} {ex:.1f},{ey:.1f}" marker-end="url(#{marker})"/>')
            lx, ly = (x1 + x2) / 2, (y1 + y2 + 6 * ly_lane) / 8
        else:
            sx, sy = x1 + dx / dist * R, y1 + dy / dist * R
            ex, ey = x2 - dx / dist * (R + 2), y2 - dy / dist * (R + 2)
            out.append(f'<line class="{cls}" x1="{sx:.1f}" y1="{sy:.1f}" x2="{ex:.1f}" y2="{ey:.1f}" marker-end="url(#{marker})"/>')
            lx, ly = (x1 + x2) / 2, (y1 + y2) / 2
        if a.get("dummy"):
            continue
        tcls = "elabel" + (" crit" if a["critical"] else "")
        out.append(f'<text class="{tcls}" x="{lx:.1f}" y="{ly - 7:.1f}" text-anchor="middle">{esc(a["id"])} {esc(tx(a, "name"))}</text>')
        out.append(f'<text class="edays" x="{lx:.1f}" y="{ly + 13:.1f}" text-anchor="middle">{days(a["days"])}</text>')
    for eid in order:
        x, y = ev_xy(eid)
        crit = earliest[eid] == latest[eid]
        out.append(f'<circle class="node{" crit" if crit else ""}" cx="{x}" cy="{y}" r="{R}"/>')
        out.append(f'<text class="nlabel" x="{x}" y="{y + 5}" text-anchor="middle">{eid}</text>')
        # 最早 | 最遅 の箱（基本情報の書き方）
        by = y - R - 30 if events[eid]["row"] != 2 else y + R + 6
        out.append(f'<rect class="tbox" x="{x - 26}" y="{by}" width="52" height="22" rx="3"/>')
        out.append(f'<line class="tsep" x1="{x}" y1="{by}" x2="{x}" y2="{by + 22}"/>')
        out.append(f'<text class="tes" x="{x - 13}" y="{by + 16}" text-anchor="middle">{earliest[eid]}</text>')
        out.append(f'<text class="tls" x="{x + 13}" y="{by + 16}" text-anchor="middle">{latest[eid]}</text>')
    out.append("</svg>")
    return "".join(out)


# ---------------------------------------------------------------- SVG: ガントチャート

def gantt_svg():
    rows = sorted((a for a in acts if not a.get("dummy")), key=lambda a: (a["start"], a["id"]))
    span = (DEADLINE - START).days + 12
    label_w, scale, row_h, top = 150, 6.2, 26, 52
    w = int(label_w + span * scale + 20)
    h = top + len(rows) * row_h + 30
    out = [f'<svg class="gantt" viewBox="0 0 {w} {h}" role="img" aria-label="{t('ガントチャート', 'Gantt chart')}">']
    # スプリントの帯
    n = 0
    while n * SCRUM["sprint_days"] < span:
        x = label_w + n * SCRUM["sprint_days"] * scale
        sw = SCRUM["sprint_days"] * scale
        if n % 2 == 0:
            out.append(f'<rect class="sband" x="{x:.1f}" y="{top - 22}" width="{sw:.1f}" height="{h - top - 8}"/>')
        out.append(f'<text class="slabel" x="{x + sw / 2:.1f}" y="{top - 8}" text-anchor="middle">S{n + 1}</text>')
        n += 1
    # 月の目盛り
    d = date(START.year, START.month, 1)
    while (d - START).days <= span:
        off = (d - START).days
        if off >= 0:
            x = label_w + off * scale
            out.append(f'<line class="month" x1="{x:.1f}" y1="{top - 2}" x2="{x:.1f}" y2="{h - 8}"/>')
            out.append(f'<text class="mlabel" x="{x + 4:.1f}" y="{top - 30}">{d.year}/{d.month}</text>')
        d = date(d.year + (d.month == 12), d.month % 12 + 1, 1)
    for i, a in enumerate(rows):
        y = top + i * row_h
        out.append(f'<text class="glabel" x="{label_w - 8}" y="{y + 17}" text-anchor="end">{esc(a["id"])} {esc(tx(a, "name"))}</text>')
        cls = "bar" + (" crit" if a["critical"] else "") + ("" if a.get("solo") else " wait")
        x = label_w + a["start"] * scale
        bw = max(a["days"] * scale, 3)
        tip = f'{a["id"]} {tx(a, "name")}: {fmt(day_to_date(a["start"]))}–{fmt(day_to_date(a["end"] - 1))} ({days(a["days"])})'
        out.append(f'<rect class="{cls}" x="{x:.1f}" y="{y + 5}" width="{bw:.1f}" height="{row_h - 10}" rx="3"><title>{esc(tip)}</title></rect>')
        out.append(f'<text class="gdays" x="{x + bw + 4:.1f}" y="{y + 17}">{days(a["days"])}</text>')
    for day, cls, text in ((release_day, "ms", t("MVP公開 ", "MVP live ") + fmt(day_to_date(release_day))),
                           ((DEADLINE - START).days, "dl", t("締切 ", "Deadline ") + fmt(DEADLINE))):
        x = label_w + day * scale
        out.append(f'<line class="{cls}" x1="{x:.1f}" y1="{top - 22}" x2="{x:.1f}" y2="{h - 8}"/>')
        out.append(f'<text class="{cls}t" x="{x - 4:.1f}" y="{h - 12}" text-anchor="end">{esc(text)}</text>')
    out.append("</svg>")
    return "".join(out)


# ---------------------------------------------------------------- SVG: スプリントの負荷

def load_svg():
    bw, gap, h, top, base = 46, 14, 170, 20, 140
    vmax = max(max(sprint_load.values()), SCRUM["velocity"]) + 3
    w = 40 + sprint_count * (bw + gap)
    k = (base - top) / vmax
    out = [f'<svg class="load" viewBox="0 0 {w} {h}" role="img" aria-label="{t('スプリントごとのストーリーポイント', 'Story points per sprint')}">']
    vy = base - SCRUM["velocity"] * k
    for n in range(1, sprint_count + 1):
        x = 30 + (n - 1) * (bw + gap)
        v = sprint_load[n]
        out.append(f'<rect class="lbar{" over" if v > SCRUM["velocity"] + 2 else ""}" x="{x}" y="{base - v * k:.1f}" width="{bw}" height="{v * k:.1f}" rx="3"/>')
        out.append(f'<text class="lval" x="{x + bw / 2}" y="{base - v * k - 5:.1f}" text-anchor="middle">{v}</text>')
        out.append(f'<text class="llab" x="{x + bw / 2}" y="{base + 18}" text-anchor="middle">S{n}</text>')
    out.append(f'<line class="vel" x1="22" y1="{vy:.1f}" x2="{w - 4}" y2="{vy:.1f}"/>')
    out.append(f'<text class="velt" x="{w - 4}" y="{vy - 5:.1f}" text-anchor="end">{t("ベロシティ", "Velocity")} {SCRUM["velocity"]}</text>')
    out.append("</svg>")
    return "".join(out)


# ---------------------------------------------------------------- HTML

CSS = """
:root{--bg:#fbfaf7;--fg:#1e2328;--muted:#68707a;--card:#fff;--line:#dfe2e6;--accent:#2f6fde;--accent-soft:#e7effc;
--crit:#d4483b;--crit-soft:#fbe7e4;--wait:#9aa3ad;--band:#f1f3f6;--ok:#2f9e6b;--warn:#c98a12}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#15181c;--fg:#e6e8eb;--muted:#9aa3ad;--card:#1d2126;--line:#30363d;
--accent:#6ea0ff;--accent-soft:#1d2a40;--crit:#ff7a6b;--crit-soft:#3a2220;--wait:#69727c;--band:#20252b;--ok:#4cc38a;--warn:#e0a83a}}
:root[data-theme="dark"]{--bg:#15181c;--fg:#e6e8eb;--muted:#9aa3ad;--card:#1d2126;--line:#30363d;--accent:#6ea0ff;--accent-soft:#1d2a40;
--crit:#ff7a6b;--crit-soft:#3a2220;--wait:#69727c;--band:#20252b;--ok:#4cc38a;--warn:#e0a83a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.7 "Hiragino Sans","Noto Sans JP",system-ui,sans-serif}
main{max-width:1100px;margin:0 auto;padding:32px 16px 80px}
h1{font-size:28px;margin:0 0 4px}h2{font-size:21px;margin:56px 0 12px;padding-bottom:6px;border-bottom:2px solid var(--line)}
h3{font-size:16px;margin:28px 0 8px}
.top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.lang a{color:var(--accent);text-decoration:none;font-size:13px;border:1px solid var(--line);border-radius:999px;padding:2px 10px}
.lead{color:var(--muted);margin:0 0 20px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:20px 0}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.kpi b{display:block;font-size:24px;line-height:1.2}.kpi span{color:var(--muted);font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;overflow-x:auto}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:800px){.grid2{grid-template-columns:1fr}}
.wide{grid-column:1/-1}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{border-bottom:1px solid var(--line);padding:7px 8px;text-align:left;vertical-align:top}
th{font-size:12px;color:var(--muted);font-weight:600;white-space:nowrap}
td.num,th.num{text-align:right}.mono{font-family:ui-monospace,Menlo,monospace;font-size:13px;white-space:nowrap}
.muted{color:var(--muted);font-size:13px}
.pt{display:inline-block;min-width:26px;text-align:center;border-radius:6px;background:var(--accent-soft);color:var(--accent);font-weight:700}
.tag{font-size:12px;border-radius:999px;padding:1px 8px;border:1px solid var(--line)}
.tag.must{color:var(--crit);border-color:var(--crit)}.tag.should{color:var(--warn);border-color:var(--warn)}.tag.could{color:var(--muted)}
tr.crit td{background:var(--crit-soft)}
.legend{display:flex;flex-wrap:wrap;gap:16px;font-size:13px;color:var(--muted);margin:8px 0 0}
.legend i{display:inline-block;width:22px;height:4px;vertical-align:middle;margin-right:6px;border-radius:2px}
.fe{border-left:4px solid var(--accent);background:var(--accent-soft);padding:10px 14px;border-radius:0 8px 8px 0;margin:14px 0;font-size:14px}
.fe b{color:var(--accent)}
details{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 14px;margin:8px 0}
summary{cursor:pointer;font-weight:600}
svg{width:100%;height:auto;display:block}
svg text{fill:var(--fg);font-family:"Hiragino Sans","Noto Sans JP",system-ui,sans-serif}
.pert{min-width:1250px}.gantt{min-width:900px}.load{max-width:620px}
.edge{stroke:var(--muted);stroke-width:1.6;fill:none}.edge.crit{stroke:var(--crit);stroke-width:3}.edge.dummy{stroke-dasharray:6 5}
.ah{fill:var(--muted)}.ahc{fill:var(--crit)}
.node{fill:var(--card);stroke:var(--fg);stroke-width:1.6}.node.crit{stroke:var(--crit);stroke-width:2.6}
.nlabel{font-weight:700;font-size:14px}.elabel{font-size:12px;paint-order:stroke;stroke:var(--card);stroke-width:4px}
.elabel.crit{fill:var(--crit);font-weight:700}.edays{font-size:12px;fill:var(--muted);paint-order:stroke;stroke:var(--card);stroke-width:4px}
.tbox{fill:var(--card);stroke:var(--line)}.tsep{stroke:var(--line)}.tes{font-size:12px;font-weight:700}.tls{font-size:12px;fill:var(--muted)}
.sband{fill:var(--band)}.slabel{font-size:11px;fill:var(--muted)}.month{stroke:var(--line)}.mlabel{font-size:11px;fill:var(--muted)}
.glabel{font-size:12px}.gdays{font-size:11px;fill:var(--muted)}
.bar{fill:var(--accent)}.bar.crit{fill:var(--crit)}.bar.wait{fill:var(--wait);opacity:.75}
.ms{stroke:var(--ok);stroke-width:2}.mst{font-size:12px;fill:var(--ok);font-weight:700}
.dl{stroke:var(--crit);stroke-width:2;stroke-dasharray:5 4}.dlt{font-size:12px;fill:var(--crit);font-weight:700}
.lbar{fill:var(--accent)}.lbar.over{fill:var(--warn)}.lval{font-size:12px;font-weight:700}.llab{font-size:12px;fill:var(--muted)}
.vel{stroke:var(--crit);stroke-dasharray:5 4}.velt{font-size:11px;fill:var(--crit)}
pre.mermaid{background:transparent;margin:0;text-align:center}
footer{margin-top:60px;color:var(--muted);font-size:13px}
code{font-family:ui-monospace,Menlo,monospace;font-size:13px;background:var(--band);padding:1px 5px;border-radius:4px}
"""

mvp_points = sum(s["pts"] for s in stories.values() if s["release"] == "MVP")
total_points = sum(s["pts"] for s in stories.values())
buffer_days = (DEADLINE - day_to_date(release_day)).days
RELEASE_EN = {"後回し": "Later"}


def epic(s):
    return PLAN["epics_en" if LANG == "en" else "epics"][s["epic"]]


def release(s):
    return RELEASE_EN.get(s["release"], s["release"]) if LANG == "en" else s["release"]


def predecessors(a):
    direct = {p["id"] for p in acts if p["to"] == a["from"] and not p.get("dummy")}
    via_dummy = {q["id"] for d in acts if d.get("dummy") and d["to"] == a["from"] for q in acts if q["to"] == d["from"]}
    return sorted(direct | via_dummy)


def backlog_rows():
    rank = {"Must": 0, "Should": 1, "Could": 2}
    rel = {"MVP": 0, "v1.1": 1, "v1.2": 2, "後回し": 3}
    rows = sorted(stories.values(), key=lambda s: (rel[s["release"]], s.get("sprint", 99), rank[s["moscow"]], s["id"]))
    out = []
    for s in rows:
        sprint = f'S{s["sprint"]}' if "sprint" in s else "—"
        out.append(
            f'<tr><td class="mono">{s["id"]}</td><td>{esc(epic(s))}</td>'
            f'<td><strong>{esc(tx(s, "title"))}</strong><br><span class="muted">{esc(tx(s, "story"))}</span></td>'
            f'<td class="num"><span class="pt">{s["pts"]}</span></td>'
            f'<td><span class="tag {s["moscow"].lower()}">{s["moscow"]}</span></td>'
            f'<td>{esc(release(s))}</td><td class="mono">{s.get("activity", "—")}</td><td class="mono">{sprint}</td></tr>'
        )
    return "".join(out)


def activity_rows():
    out = []
    for a in sorted(acts, key=lambda x: (x["es"], x["id"])):
        if a.get("dummy"):
            continue
        note = f'<br><span class="muted">{esc(tx(a, "note"))}</span>' if a.get("note") else ""
        out.append(
            f'<tr class="{"crit" if a["critical"] else ""}"><td class="mono">{a["id"]}</td><td>{esc(tx(a, "name"))}{note}</td>'
            f'<td class="mono">{a["from"]}→{a["to"]}</td><td class="mono">{", ".join(predecessors(a)) or "—"}</td>'
            f'<td class="num">{a["points"] or "—"}</td><td class="num">{a["days"]}</td>'
            f'<td class="num">{a["es"]}</td><td class="num">{a["ls"]}</td><td class="num"><strong>{a["float"]}</strong></td>'
            f'<td class="mono">{fmt(day_to_date(a["start"]))}–{fmt(day_to_date(a["end"] - 1))}</td></tr>'
        )
    return "".join(out)


def mermaid(name):
    folder = DIAGRAMS / "en" if LANG == "en" else DIAGRAMS
    return f'<pre class="mermaid">{esc((folder / name).read_text(encoding="utf-8"))}</pre>'


def quiz():
    E, D = act_by_id["E"], act_by_id["D"]
    cp = " → ".join(critical_path)
    return [
        (t("Q1. クリティカルパスと、全体の最短日数は？", "Q1. What is the critical path and the shortest total duration?"),
         t(f"{cp}（ダミー d1 を含む）。最短 {PERT_DAYS} 日。最早結合点時刻と最遅結合点時刻が等しい結合点をたどる。",
           f"{cp} (including dummy d1). Shortest duration: {PERT_DAYS} days. "
           "Follow the events whose earliest and latest times are equal.")),
        (t(f"Q2. 作業E（{E['name']}）が5日遅れたら、全体は何日遅れる？",
           f"Q2. If activity E ({E['name_en']}) is 5 days late, how late is the whole project?"),
         t(f"Eの全余裕は {E['float']} 日なので、5 − {E['float']} = {max(0, 5 - E['float'])} 日遅れる。余裕の範囲内の遅れは全体に影響しない。",
           f"E has {E['float']} days of total float, so 5 − {E['float']} = {max(0, 5 - E['float'])} day(s) late. "
           "A delay within the float doesn't affect the end date.")),
        (t(f"Q3. 作業D（{D['name']}）の全余裕日数は？", f"Q3. What is the total float of activity D ({D['name_en']})?"),
         t(f"最遅開始日 {D['ls']} − 最早開始日 {D['es']} = {D['float']} 日。",
           f"Latest start {D['ls']} − earliest start {D['es']} = {D['float']} days.")),
        (t("Q4. なぜダミー作業 d1（⑥→⑦）が必要？", "Q4. Why is dummy activity d1 (6 → 7) needed?"),
         t("ESレビュー（G）と履歴書PDF（E）はどちらも④から始まり⑦で終わる。アローダイアグラムでは"
           "同じ2つの結合点の間に2本の作業を引けないので、⑥を作ってダミーでつなぐ。所要日数は0日。",
           "Entry-sheet review (G) and résumé PDF (E) both start at event 4 and end at event 7. In an arrow diagram "
           "two activities can't share the same pair of events, so event 6 is added and joined with a 0-day dummy.")),
        (t(f"Q5. PERTでは{PERT_DAYS}日なのに、ガントチャートでは長くなるのはなぜ？",
           f"Q5. PERT says {PERT_DAYS} days — why is the Gantt chart longer?"),
         t(f"PERTは「並行できる作業は同時に進める」前提（人数に制限なし）。実際は開発者が1人なので、"
           f"開発作業を1本ずつ並べ直す（山崩し＝資源の平準化）。その結果 {SOLO_DAYS} 日になる。",
           f"PERT assumes parallel activities run at the same time (unlimited people). With one developer, development "
           f"activities must be done one by one (resource levelling, 山崩し), which gives {SOLO_DAYS} days.")),
    ]


def fe_terms():
    rows = [
        ("アローダイアグラム（PERT図）", "Arrow diagram / PERT (アローダイアグラム)", "§4", "作業を矢印、結合点を○で表す", "Activities are arrows, events are circles"),
        ("ダミー作業", "Dummy activity (ダミー作業)", "§4", "点線の矢印・所要0日", "Dashed arrow, 0 days"),
        ("最早結合点時刻・最遅結合点時刻", "Earliest / latest event time (最早・最遅結合点時刻)", "§4", "○の上の箱：左が最早、右が最遅", "Box above each circle: left = earliest, right = latest"),
        ("クリティカルパス", "Critical path (クリティカルパス)", "§4", "余裕0の経路。赤で表示", "Path with zero float, shown in red"),
        ("全余裕（トータルフロート）", "Total float (全余裕)", t("§4 表", "§4 table"), "最遅開始日 − 最早開始日", "Latest start − earliest start"),
        ("ガントチャート", "Gantt chart (ガントチャート)", "§5", "横軸が日付の棒グラフ", "Bar chart with dates on the x-axis"),
        ("山崩し（資源の平準化）", "Resource levelling (山崩し)", "§5", "1人で回せるように作業をずらす", "Shift activities so one person can do them"),
        ("WBS", "WBS", "§3", "エピック → ストーリー → 作業", "Epic → story → activity"),
        ("アジャイル・スクラム", "Agile / Scrum (アジャイル・スクラム)", "§3", "スプリント・プロダクトバックログ・ベロシティ", "Sprints, product backlog, velocity"),
        ("流れ図（フローチャート）", "Flowchart (流れ図)", "§2", "ユーザーフロー", "User flow"),
        ("E-R図", "E-R diagram (E-R図)", "§2", "1対1・1対多のリレーションシップ", "One-to-one and one-to-many relationships"),
        ("シーケンス図（UML）", "Sequence diagram, UML (シーケンス図)", "§2", "ESレビューの処理の順番", "Order of calls in the entry-sheet review"),
    ]
    return "".join(f'<tr><td>{esc(t(ja, en))}</td><td>{esc(where)}</td><td class="muted">{esc(t(pja, pen))}</td></tr>'
                   for ja, en, where, pja, pen in rows)


def render():
    P, S = PLAN["project"], SCRUM
    cp = " → ".join(critical_path)
    other = t('<a href="plan.en.html">English</a>', '<a href="plan.html">日本語</a>')
    th_backlog = t("<th>ID</th><th>エピック</th><th>ユーザーストーリー</th><th class=num>SP</th><th>優先度</th><th>リリース</th><th>作業</th><th>スプリント</th>",
                   "<th>ID</th><th>Epic</th><th>User story</th><th class=num>SP</th><th>Priority</th><th>Release</th><th>Activity</th><th>Sprint</th>")
    th_acts = t("<th>作業</th><th>内容</th><th>結合点</th><th>先行作業</th><th class=num>SP</th><th class=num>日数</th><th class=num>最早開始</th><th class=num>最遅開始</th><th class=num>全余裕</th><th>実際の予定</th>",
                "<th>Act.</th><th>Description</th><th>Events</th><th>Predecessors</th><th class=num>SP</th><th class=num>Days</th><th class=num>Earliest start</th><th class=num>Latest start</th><th class=num>Total float</th><th>Actual schedule</th>")
    return f"""<!doctype html>
<html lang="{LANG}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{t('就活パイロット 計画書', 'Shukatsu Pilot Plan')}</title><style>{CSS}</style></head>
<body><main>
<div class="top"><p class="muted mono" style="margin:0">{esc(P['name_en'])} · project plan · {t('生成日', 'generated')} {date.today().isoformat()}</p><p class="lang" style="margin:0">{other}</p></div>
<h1>{t(esc(P['name']) + ' 計画書', 'Shukatsu Pilot — project plan')}</h1>
<p class="lead">{esc(tx(P, 'pitch'))}</p>

<div class="kpis">
  <div class="kpi"><b>{mvp_points} SP</b><span>{t(f'MVPのストーリーポイント（全体 {total_points} SP）', f'MVP story points ({total_points} SP in total)')}</span></div>
  <div class="kpi"><b>{sprint_count} {t('スプリント', 'sprints')}</b><span>{t('2週間 × ベロシティ', '2 weeks × velocity')} {S['velocity']}</span></div>
  <div class="kpi"><b>{PERT_DAYS} {t('日', 'days')}</b><span>{t('PERTの最短日数（並行作業あり）', 'Shortest PERT duration (with parallel work)')}</span></div>
  <div class="kpi"><b>{SOLO_DAYS} {t('日', 'days')}</b><span>{t('1人開発の日数（山崩し後）', 'Solo-developer duration (after levelling)')}</span></div>
  <div class="kpi"><b>{fmt(day_to_date(release_day))}</b><span>{t(f'MVP公開予定 · 締切まで {buffer_days} 日の余裕', f'Planned MVP release · {buffer_days} days of buffer')}</span></div>
</div>

<h2>{t('1. 概要', '1. Overview')}</h2>
<div class="card">
<p>{t('<strong>だれのため？</strong> 日本で就職活動をする留学生。履歴書の形式・ESの敬語・日本語の面接が大きな壁になっている。',
      '<strong>Who is it for?</strong> International students job hunting in Japan. Résumé formats, keigo in entry sheets and interviews in Japanese are major hurdles.')}</p>
<p>{t('<strong>なにを作る？</strong> 応募管理、JIS形式の履歴書PDF、AIによるESレビュー（解説はフランス語・英語でも）、v1.1で音声の面接練習。',
      '<strong>What does it do?</strong> Application tracking, JIS-format résumé PDFs, AI entry-sheet review (explanations in French and English too) and, in v1.1, spoken interview practice.')}</p>
<p>{t(f'<strong>いつまで？</strong> {fmt(DEADLINE)}（{esc(P["deadline_label"])}）。開発開始 {START.isoformat()}。',
      f'<strong>By when?</strong> {DEADLINE.isoformat()} ({esc(P["deadline_label_en"])}). Development starts {START.isoformat()}.')}</p>
<p style="margin:0">{t('<strong>見積もりの前提：</strong> ', '<strong>Estimation assumptions:</strong> ')}{esc(tx(S, 'note'))}{t('。ストーリーポイントはフィボナッチ数（', '. Story points use the Fibonacci scale (')}{', '.join(map(str, S['scale']))}{t('）。', ').')}</p>
</div>

<h2>{t('2. フローチャート・設計図', '2. Flowcharts and design')}</h2>
<div class="grid2">
  <div class="card wide"><h3 style="margin-top:0">{t('システム構成図', 'System architecture')}</h3>{mermaid('architecture.mmd')}</div>
  <div class="card"><h3 style="margin-top:0">{t('ユーザーフロー（流れ図）', 'User flow (flowchart)')}</h3>{mermaid('user-flow.mmd')}</div>
  <div class="card"><h3 style="margin-top:0">{t('ESレビューのシーケンス図', 'Entry-sheet review — sequence diagram')}</h3>{mermaid('es-review-sequence.mmd')}</div>
  <div class="card wide"><h3 style="margin-top:0">{t('E-R図（データモデル）', 'E-R diagram (data model)')}</h3>{mermaid('er.mmd')}</div>
</div>

<h2>{t('3. プロダクトバックログ（スクラム）', '3. Product backlog (Scrum)')}</h2>
<p class="muted">{t('ユーザーストーリーは「〜として、〜したい。〜だから」の形。MoSCoW で優先度を決め、Must と Should をMVPに入れる。「作業」は §4 のアローダイアグラムの作業記号。',
                    'User stories follow “As a …, I want …, so that …”. Priorities use MoSCoW; Must and Should go into the MVP. “Activity” is the letter used in the §4 arrow diagram.')}</p>
<div class="card"><table><thead><tr>{th_backlog}</tr></thead><tbody>{backlog_rows()}</tbody></table></div>
<h3>{t('スプリントごとの負荷', 'Load per sprint')}</h3>
<div class="card">{load_svg()}<p class="muted" style="margin:6px 0 0">{t(
    'ストーリーは<strong>完了したスプリント</strong>に数える。8 SPのストーリー（S11・S14）が終わるスプリントは負荷が高く（オレンジ）、その前は低い → スプリントプランニングで8 SP以上のストーリーを分割するのが次の改善。βテスト・審査待ちのスプリント（S8・S9）は開発が少ないので、v1.1の準備にあてる。',
    'A story counts in the sprint where it is <strong>finished</strong>. Sprints where an 8-SP story (S11, S14) ends are overloaded (orange) and the sprint before is light → the next improvement is splitting stories of 8 SP or more during sprint planning. Sprints spent on beta and App Store review (S8, S9) have little development, so they go to preparing v1.1.')}</p></div>
<div class="fe">{t('<b>基本情報メモ：</b> スクラムでは、スプリントごとに「スプリントプランニング → デイリースクラム → スプリントレビュー → レトロスペクティブ」を回す。ベロシティは「1スプリントで終わったSPの合計」で、実績から見積もりを直していく。',
                   '<b>FE exam note:</b> each Scrum sprint runs sprint planning → daily scrum → sprint review → retrospective. Velocity is the total SP finished in one sprint, and estimates are corrected from actual results.')}</div>

<h2>{t('4. アローダイアグラム（PERT）', '4. Arrow diagram (PERT)')}</h2>
<p class="muted">{t(f'ストーリーポイントを日数に変換（{S["velocity"]} SP = {S["sprint_days"]} 日 → 1 SP ≒ {DAYS_PER_POINT:.1f} 日、切り上げ）。○の上の箱は <strong>左＝最早結合点時刻、右＝最遅結合点時刻</strong>（開始からの日数）。',
                    f'Story points are converted to days ({S["velocity"]} SP = {S["sprint_days"]} days → 1 SP ≈ {DAYS_PER_POINT:.1f} days, rounded up). The box above each circle shows <strong>left = earliest event time, right = latest event time</strong> (days from the start).')}</p>
<div class="card">{arrow_svg()}
<div class="legend"><span><i style="background:var(--crit)"></i>{t('クリティカルパス', 'Critical path')}</span><span><i style="background:var(--muted)"></i>{t('余裕のある作業', 'Activity with float')}</span>
<span><i style="background:repeating-linear-gradient(90deg,var(--muted) 0 5px,transparent 5px 9px)"></i>{t('ダミー作業（0日）', 'Dummy activity (0 days)')}</span></div></div>
<h3>{t('作業一覧', 'Activities')}</h3>
<div class="card"><table><thead><tr>{th_acts}</tr></thead><tbody>{activity_rows()}</tbody></table></div>
<div class="fe">{t(f'<b>基本情報メモ：</b> 最早結合点時刻は「前から、入ってくる矢印のうち最大」、最遅結合点時刻は「後ろから、出ていく矢印のうち最小」。両方が等しい結合点を結ぶと <b>クリティカルパス {cp}</b>（{PERT_DAYS}日）。',
                   f'<b>FE exam note:</b> the earliest event time is computed forwards (the maximum over incoming arrows); the latest event time backwards (the minimum over outgoing arrows). Joining the events where both are equal gives the <b>critical path {cp}</b> ({PERT_DAYS} days).')}</div>

<h2>{t('5. ガントチャート（1人開発・山崩し後）', '5. Gantt chart (solo developer, after levelling)')}</h2>
<p class="muted">{t('開発作業は同時に1つだけ。β募集・βテスト・審査待ち（灰色）は並行できる。着手できる作業が複数あるときは全余裕の少ない順。',
                    'Only one development activity at a time. Recruiting testers, the beta and the App Store review (grey) can run in parallel. When several activities are ready, the one with the least float goes first.')}</p>
<div class="card">{gantt_svg()}
<div class="legend"><span><i style="background:var(--crit)"></i>{t('クリティカル作業', 'Critical activity')}</span><span><i style="background:var(--accent)"></i>{t('開発作業', 'Development')}</span>
<span><i style="background:var(--wait)"></i>{t('待ち・開発以外', 'Waiting / non-development')}</span><span><i style="background:var(--ok)"></i>{t('MVP公開', 'MVP release')}</span><span><i style="background:var(--crit)"></i>{t('締切（点線）', 'Deadline (dashed)')}</span></div></div>

<h2>{t('6. 基本情報技術者試験との対応', '6. Mapping to the FE exam (基本情報技術者試験)')}</h2>
<div class="card"><table><thead><tr><th>{t('用語', 'Term')}</th><th>{t('この計画書の場所', 'Where in this plan')}</th><th>{t('ポイント', 'Key point')}</th></tr></thead><tbody>{fe_terms()}</tbody></table></div>
<h3>{t('練習問題（この計画から）', 'Practice questions (from this plan)')}</h3>
{''.join(f'<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>' for q, a in quiz())}

<footer>{t('このページは <code>planning/plan.json</code> から <code>tools/build_plan.py</code> で自動生成。ストーリーや日数を変えたら <code>python3 tools/build_plan.py</code> を実行し直す。',
           'This page is generated from <code>planning/plan.json</code> by <code>tools/build_plan.py</code>. After changing stories or durations, run <code>python3 tools/build_plan.py</code> again.')}</footer>
</main>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<script>
const dark = matchMedia('(prefers-color-scheme: dark)').matches;
mermaid.initialize({{startOnLoad: true, theme: dark ? 'dark' : 'neutral', securityLevel: 'strict',
  flowchart: {{htmlLabels: true}}, fontFamily: '"Hiragino Sans","Noto Sans JP",sans-serif'}});
</script>
</body></html>
"""


def render_md():
    md = [t(f"# {PLAN['project']['name']} — プロダクトバックログ\n", "# Shukatsu Pilot — product backlog\n"),
          t(f"> 自動生成（`tools/build_plan.py`）。ベロシティ {SCRUM['velocity']} SP / {SCRUM['sprint_days']}日スプリント。"
            f" MVP {mvp_points} SP · PERT最短 {PERT_DAYS}日 · 1人開発 {SOLO_DAYS}日 · MVP公開 {day_to_date(release_day).isoformat()}\n",
            f"> Generated by `tools/build_plan.py`. Velocity {SCRUM['velocity']} SP per {SCRUM['sprint_days']}-day sprint."
            f" MVP {mvp_points} SP · PERT shortest {PERT_DAYS} days · solo {SOLO_DAYS} days · MVP release {day_to_date(release_day).isoformat()}\n"),
          t("| ID | エピック | ストーリー | SP | 優先度 | リリース | 作業 | スプリント |",
            "| ID | Epic | Story | SP | Priority | Release | Activity | Sprint |"),
          "|---|---|---|--:|---|---|---|---|"]
    for s in sorted(stories.values(), key=lambda s: (s["release"] != "MVP", s.get("sprint", 99), s["id"])):
        md.append(f"| {s['id']} | {epic(s)} | **{tx(s, 'title')}**<br>{tx(s, 'story')} | {s['pts']} | {s['moscow']} | "
                  f"{release(s)} | {s.get('activity', '—')} | {('S' + str(s['sprint'])) if 'sprint' in s else '—'} |")
    md.append(t("\n## 作業（アローダイアグラム）\n", "\n## Activities (arrow diagram)\n"))
    md.append(t("| 作業 | 内容 | 結合点 | 日数 | 最早開始 | 最遅開始 | 全余裕 |",
                "| Act. | Description | Events | Days | Earliest start | Latest start | Total float |"))
    md.append("|---|---|---|--:|--:|--:|--:|")
    for a in sorted(acts, key=lambda x: (x["es"], x["id"])):
        md.append(f"| {a['id']} | {tx(a, 'name')} | {a['from']}→{a['to']} | {a['days']} | {a['es']} | {a['ls']} | {a['float']} |")
    md.append(t(f"\nクリティカルパス：{' → '.join(critical_path)}（{PERT_DAYS}日）\n",
                f"\nCritical path: {' → '.join(critical_path)} ({PERT_DAYS} days)\n"))
    return "\n".join(md)


for LANG, suffix in (("ja", ""), ("en", ".en")):
    (ROOT / "docs" / f"plan{suffix}.html").write_text(render(), encoding="utf-8")
    (ROOT / "docs" / f"backlog{suffix}.md").write_text(render_md(), encoding="utf-8")

print(f"MVP {mvp_points} SP / total {total_points} SP")
print(f"PERT {PERT_DAYS} d · critical path {' → '.join(critical_path)}")
print(f"solo {SOLO_DAYS} d · MVP {day_to_date(release_day)} · buffer {buffer_days} d")
print("sprint load:", sprint_load)
