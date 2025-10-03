import express from "express";

const router = express.Router();
const ENV = process.env;

function dbg(...a) {
  if (ENV.DEBUG_CYCLES === "true") {
    const t = new Date();
    const ts =
      t.toLocaleTimeString("de-DE", { hour12: false }) +
      "." +
      String(t.getMilliseconds()).padStart(3, "0");
    console.log("[CYCLES-DBG " + ts + "]", ...a);
  }
}

/* ─────────────────────────────
   Cycle-Definition
   Mittwoch 08:00  ->  Mittwoch 05:00 (nächste Woche)
   = 6 Tage + 21 Stunden
   ───────────────────────────── */
const CYCLE_LEN_MS = (6 * 24 + 21) * 60 * 60 * 1000; // 6d 21h

function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
function toISO(d) {
  return d.toISOString();
}
function labelRange({ start, end }) {
  const fmt = (x) => x.toLocaleString("de-DE", { hour12: false });
  return `${fmt(start)} – ${fmt(end)}`;
}
function cycleFromStart(start) {
  const s = new Date(start);
  const e = new Date(s.getTime() + CYCLE_LEN_MS);
  return { start: s, end: e };
}
function getPrevWednesday0800(base = new Date()) {
  const n = new Date(base);
  const dow = n.getDay(); // So=0, Mo=1, Di=2, Mi=3, ...
  const diffToWed = (dow - 3 + 7) % 7;
  const wed = new Date(n);
  wed.setDate(n.getDate() - diffToWed);
  wed.setHours(8, 0, 0, 0); // 08:00
  // Falls wir zeitlich vor Mi 08:00 sind, gehört der gültige Start zu letzter Woche
  if (n < wed) wed.setDate(wed.getDate() - 7);
  return wed;
}
function getCurrentCycle(now = new Date()) {
  const start = getPrevWednesday0800(now);
  const cur = cycleFromStart(start);
  // Sicherheitsnetz: Wenn „now“ > Ende, schiebe um 7 Tage
  if (now > cur.end) {
    return {
      start: addDays(cur.start, 7),
      end: addDays(cur.end, 7),
    };
  }
  return cur;
}
function getNextCycle(now = new Date()) {
  const cur = getCurrentCycle(now);
  return { start: addDays(cur.start, 7), end: addDays(cur.end, 7) };
}
function within(range, d) {
  return d >= range.start && d <= range.end;
}

/* ─────────────────────────────
   GET /api/cycles
   ───────────────────────────── */
router.get("/", (req, res) => {
  const at = req.query.at ? new Date(String(req.query.at)) : new Date();
  if (Number.isNaN(at.getTime())) {
    return res
      .status(400)
      .json({ ok: false, error: "BAD_AT_PARAM", message: "Ungültiges Datum in ?at=" });
  }

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
  const current = getCurrentCycle(at);
  const next = getNextCycle(at);
  const previous = {
    start: addDays(current.start, -7),
    end: addDays(current.end, -7),
  };

  const pack = (r) => ({
    start: toISO(r.start),
    end: toISO(r.end),
    label: labelRange(r),
  });

  return res.json({
    ok: true,
    now: toISO(new Date()),
    tz,
    current: pack(current),
    next: pack(next),
    previous: pack(previous),
    // bequem fürs Frontend:
    allowedWindow: {
      start: toISO(current.start),
      end: toISO(next.end),
      label: `${labelRange(current)}  ∪  ${labelRange(next)}`,
    },
  });
});

/* ─────────────────────────────
   GET /api/cycles/validate?date=ISO
   → erlaubt: in Vergangenheit? nein
     → und (im current ODER im next Cycle)? ja
   ───────────────────────────── */
router.get("/validate", (req, res) => {
  const q = String(req.query.date || "");
  const d = new Date(q);

  if (!q || Number.isNaN(d.getTime())) {
    return res.status(400).json({
      ok: false,
      error: "BAD_DATE",
      message: "Bitte ?date= als gültiges ISO-Datum angeben.",
    });
  }

  const now = new Date();
  const current = getCurrentCycle(now);
  const next = getNextCycle(now);

  const inPast = d < now;
  const inCurrent = within(current, d);
  const inNext = within(next, d);
  const allowed = !inPast && (inCurrent || inNext);

  return res.json({
    ok: true,
    date: toISO(d),
    allowed,
    reasons: {
      inPast,
      inCurrent,
      inNext,
    },
    windows: {
      current: { start: toISO(current.start), end: toISO(current.end), label: labelRange(current) },
      next: { start: toISO(next.start), end: toISO(next.end), label: labelRange(next) },
    },
  });
});

export default router;
