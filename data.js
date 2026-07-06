/* BA Marathon v2 — DATA: immutable source of truth.
   Transcribed from "Plan/Marathon Plan Summary.md" (10-week plan, rewritten 6 Jul 2026).
   Numbers are NOT invented — every figure traces to that document.
   DEPLOY RITUAL: bump APP_VERSION here + ?v= stamps in index.html + CACHE in sw.js. */
"use strict";
const DATA = (() => {

  const APP_VERSION = "v16";

  /* ---- plan window ---- */
  const PLAN_START_ISO = "2026-07-13";   // Monday, training week 1 day 1
  const RACE_ISO       = "2026-09-20";   // Sunday, end of week 10
  const PLAN_WEEKS     = 10;

  /* ---- shift rotation (user-confirmed anchor: week of Jul 13 = W1 shifts) ---- */
  const SHIFT_ANCHOR_ISO = "2026-07-13";
  // keyed by getUTCDay(): 0=Sun 1=Mon ... 6=Sat
  const SHIFT_TABLE = {
    W1: {1:"early", 2:"late",  3:"early", 4:"late",  5:"early", 6:"sat", 0:"off"},
    W2: {1:"late",  2:"early", 3:"late",  4:"early", 5:"late",  6:"sat", 0:"off"},
  };
  const SHIFT_HOURS = { early:["7:30","15:30"], late:["11:30","20:30"], sat:["8:30","19:30"] };
  const TRAIN_WINDOW = {
    early: { label:"after work",  start:"16:00", end:"18:00" },
    late:  { label:"before work", start:"8:00",  end:"10:30" },
  };

  /* ---- paces ---- */
  const PACE = {
    easy:"6:30–7:00/km",
    mp:"6:00–6:15/km (target 6:10)",
    mix:"easy + MP segment",
    race:"6:00–6:10/km",
  };
  // seconds/km [lo,hi] for verdicts
  const PACE_BOUNDS = { easy:[390,420], mp:[360,375], mix:[365,415], race:[360,370] };

  /* ---- session cell factory ----
     kinds: run | longrun | strength | strengthLight | core | rest | race21 | race42
     optKm: optional extra easy km (Friday runs W5–7) — never counted in ring targets */
  function D(t, kind, opts){ opts = opts || {};
    return { t, kind, km: opts.km||0, pace: opts.pace||null, note: opts.note||"",
             mp: opts.mp||0, optKm: opts.optKm||0, anchor: !!opts.anchor, carbLoad: !!opts.carbLoad };
  }
  const S = {
    str:   D("Strength — lower body","strength",{note:"Gym: squats, reverse lunges, single-leg RDLs, hip thrusts, calf raises, band walks — 3×8–12"}),
    strL:  D("Strength — lower body (light, 2 sets)","strengthLight",{note:"Lighter while running volume ramps in"}),
    core:  D("Core & mobility","core",{note:"20–30 min: planks, dead bugs, glute bridges, hip-flexor work, clamshells"}),
    coreR: D("Core & mobility + optional run","core",{optKm:4, note:"20–30 min core · optional 4 km easy jog first — skip it any week the body complains"}),
    rest:  D("Full rest","rest"),
    coreOnly: D("Core only","core",{note:"20–30 min, keep it light"}),
  };

  /* ---- the 10 weeks — sched arrays are Mon..Sun (index 0=Mon … 6=Sun) ---- */
  const WEEKS = [
   {n:1, dl:"Jul 13 – 19", shifts:"W1", phase:"Base", long:8, total:15,
    note:"Run-walk intervals (~4 min run / 1 min walk) — matched to your real current fitness. Ease in; nothing is banked by going harder.",
    sched:[S.str, D("Easy run","run",{km:3,pace:"easy",note:"run-walk ~4:1"}), S.strL,
           D("Easy run","run",{km:4,pace:"easy",note:"run-walk ~4:1"}), S.core, S.rest,
           D("Long run","longrun",{km:8,pace:"easy",note:"run-walk ~4:1"})]},
   {n:2, dl:"Jul 20 – 26", shifts:"W2", phase:"Base", long:10, total:19,
    note:"Run-walk ratio improves (~6 min run / 1 min walk).",
    sched:[S.str, D("Easy run","run",{km:4,pace:"easy",note:"run-walk ~6:1"}), S.strL,
           D("Easy run","run",{km:5,pace:"easy",note:"run-walk ~6:1"}), S.core, S.rest,
           D("Long run","longrun",{km:10,pace:"easy",note:"run-walk ~6:1"})]},
   {n:3, dl:"Jul 27 – Aug 2", shifts:"W1", phase:"Base", long:13, total:24,
    note:"Shift toward continuous running as it feels comfortable.",
    sched:[S.str, D("Easy run","run",{km:5,pace:"easy"}), S.strL,
           D("Easy run","run",{km:6,pace:"easy"}), S.core, S.rest,
           D("Long run","longrun",{km:13,pace:"easy",note:"walk breaks optional"})]},
   {n:4, dl:"Aug 3 – 9", shifts:"W2", phase:"Base", long:16, total:29,
    note:"Continuous running; full strength volume resumes both days.",
    sched:[S.str, D("Easy run","run",{km:6,pace:"easy"}), S.str,
           D("Easy run","run",{km:7,pace:"easy"}), S.core, S.rest,
           D("Long run","longrun",{km:16,pace:"easy",note:"continuous"})]},
   {n:5, dl:"Aug 10 – 16", shifts:"W1", phase:"Build", long:19, total:33,
    note:"Marathon-pace work begins on Thursday (3 km inside the run). Optional 4 km Friday jog from this week.",
    sched:[S.str, D("Easy run","run",{km:6,pace:"easy"}), S.str,
           D("Quality run","run",{km:8,pace:"mix",mp:3,note:"3 km @ 6:10 mid-run"}), S.coreR, S.rest,
           D("Long run","longrun",{km:19,pace:"easy",note:"final all-easy long run"})]},
   {n:6, dl:"Aug 17 – 23", shifts:"W2", phase:"Rehearsal", long:21, total:35,
    note:"Sunday: 21 km marathon-pace rehearsal with FULL race fueling — the honest checkpoint. Controlled and strong → sub-4:15 stands. A struggle → we recalibrate, no shame.",
    sched:[S.str, D("Easy run","run",{km:6,pace:"easy"}), S.str,
           D("Quality run","run",{km:8,pace:"mix",mp:4,note:"4 km @ 6:10 mid-run"}), S.coreR, S.rest,
           D("21 km MP Rehearsal","race21",{km:21,pace:"mix",mp:15,anchor:true,note:"~15 km @ 6:10 · rehearse gels, drinks, kit. Race it with a bib if you register for the Medio — same session either way."})]},
   {n:7, dl:"Aug 24 – 30", shifts:"W1", phase:"Build", long:26, total:43,
    note:"Biggest build week. Rehearse race fueling again on Sunday.",
    sched:[S.str, D("Easy run","run",{km:7,pace:"easy"}), S.str,
           D("Quality run","run",{km:10,pace:"mix",mp:6,note:"6 km @ 6:10 mid-run"}), S.coreR, S.rest,
           D("Long run","longrun",{km:26,pace:"mix",mp:6,note:"easy pace, last 6 km @ 6:10 · fueling rehearsal #2"})]},
   {n:8, dl:"Aug 31 – Sep 6", shifts:"W2", phase:"Peak", long:30, total:46,
    note:"THE defining session: 30 km Sunday. Complete it and the marathon is a known quantity. Wednesday drops to core only — arrive fresh.",
    sched:[S.str, D("Easy run","run",{km:7,pace:"easy"}), S.coreOnly,
           D("Quality run","run",{km:9,pace:"mix",mp:5,note:"5 km @ 6:10 mid-run"}), S.core, S.rest,
           D("Peak long run","longrun",{km:30,pace:"mix",mp:10,anchor:true,note:"easy pace, middle 10 km @ 6:10 · fueling rehearsal #3 at race rate"})]},
   {n:9, dl:"Sep 7 – 13", shifts:"W1", phase:"Taper", long:16, total:30,
    note:"Taper — volume drops, legs recharge. Monday is the final (light) strength session.",
    sched:[D("Strength — lower body (light, final)","strengthLight",{note:"Last strength session of the plan — light, 2 sets"}),
           D("Easy run","run",{km:6,pace:"easy"}), S.coreOnly,
           D("Quality run","run",{km:8,pace:"mix",mp:4,note:"4 km @ 6:10 mid-run"}), S.core, S.rest,
           D("Long run","longrun",{km:16,pace:"mix",mp:5,note:"easy, last 5 km @ 6:10"})]},
   {n:10, dl:"Sep 14 – 20", shifts:"W2", phase:"Race Week", long:null, total:9,
    note:"Race week. Thursday is the last real run. Carb-load Fri–Sat (10–12 g/kg — both workdays, meal-prep Thursday evening). Saturday is an 11-h shift the day before the race: request it off or light duties; otherwise minimize standing, compression, early night.",
    sched:[D("Core & mobility (20 min)","core",{note:"Light — nothing heavy this week"}),
           D("Easy run","run",{km:5,pace:"easy"}), S.rest,
           D("Easy run + strides","run",{km:4,pace:"easy",note:"finish with 4×100 m strides — last real run"}),
           D("Rest · carb-load begins","rest",{carbLoad:true,note:"10–12 g/kg carbs today and tomorrow"}),
           D("Rest · carb-load (work day)","rest",{carbLoad:true,note:"Packed carb snacks through the shift · off your feet when possible"}),
           D("MARATHON — 42.195 km","race42",{km:42.195,pace:"race",anchor:true,note:"Race day!"})]},
  ];

  /* ---- nutrition (framework unchanged from original plan) ---- */
  const CARB = {
    light:{gkg:"3–5 g/kg", g:"270–450 g"},
    mod:  {gkg:"5–7 g/kg", g:"450–630 g"},
    high: {gkg:"6–10 g/kg", g:"540–900 g"},
  };
  const PROTEIN = "160–180 g", FAT = "75–90 g";
  const DAYTYPES = [
    {t:"Rest / core-mobility", ex:"Saturday; race-week rest", kcal:"2,700–2,800", carb:"light"},
    {t:"Strength only", ex:"Monday, Wednesday", kcal:"3,000–3,100", carb:"mod"},
    {t:"Easy mid-week run", ex:"Tuesday ~6 km", kcal:"~3,300–3,400", carb:"mod"},
    {t:"Quality / MP run", ex:"Thursday 8–10 km", kcal:"~3,500–3,700", carb:"mod"},
    {t:"Long run (build)", ex:"Sunday 19–26 km", kcal:"~4,400–5,000", carb:"high"},
    {t:"Peak long run", ex:"Sunday 30 km", kcal:"~5,400", carb:"high"},
  ];
  const RECIPES = [
    {m:"Breakfast", n:"Eggs & Oats Bowl", ing:"3 whole eggs + 3 egg whites · 60–80 g oats · 1 banana · coffee", mac:"≈ 640 kcal · 39 g P · 20 g F · 76 g C", up:"Run days: oats → 100 g, add 1 tbsp honey on long-run mornings (+~175 kcal, +37 g C)"},
    {m:"Lunch", n:"Chicken & Rice Bowl", ing:"150–200 g chicken or lean beef · 150–200 g rice or potatoes · vegetables · 1 tbsp olive oil", mac:"≈ 675 kcal · 58 g P · 21 g F · 59 g C", up:"Run days: rice/potatoes → 250–300 g (+~130 kcal, +28 g C)"},
    {m:"Snack", n:"Greek Yogurt & Whey", ing:"200 g Greek yogurt · 30 g whey · handful of berries", mac:"≈ 290 kcal · 44 g P · 6 g F · 20 g C", up:"Run days: add a bagel or rice cakes pre-run (+~250 kcal, +49 g C)"},
    {m:"Dinner", n:"Steak & Potatoes", ing:"150–200 g steak / fish / chicken · 150–200 g rice or potatoes · big salad · 1 tbsp olive oil", mac:"≈ 630 kcal · 55 g P · 28 g F · 42 g C", up:"Long-run days: add a second carb side (+~195 kcal, +42 g C)"},
    {m:"Post-run · within 1 hr", n:"Recovery Smoothie", ing:"1 banana · 30 g whey · 40 g oats · 300 ml milk  (or a rice + chicken bowl)", mac:"≈ 530 kcal · 39 g P · 10 g F · 72 g C", up:"Target 1.0–1.2 g/kg carbs in this window (≈ 90–108 g). Only on run days."},
  ];
  const RACEFUEL = {
    load:"Carb-load Fri 18 – Sat 19 Sep: 10–12 g/kg/day ≈ 900–1,080 g carbs, spread over 5–6 meals/snacks. Easy starches; reduce fibre in the final 36 h; nothing new. Both are workdays — meal-prep Thursday evening.",
    during:"Start: 1 gel every 40–45 min ≈ 30–40 g carb/hr. Build toward 60–90 g/hr (gel + isotonic from km 10) — but only at the rate rehearsed on the 21 / 26 / 30 km runs. Never a new rate on race day.",
    hydra:"400–800 mL/hr. Sodium 500–700 mg per litre (or 1–2 g salt/hr). September in Buenos Aires is spring — dial in your sweat rate on the long runs.",
  };
  const SUPPS = [
    {n:"Creatine monohydrate", d:"5 g/day", note:"Well-supported; compatible with running volume."},
    {n:"Whey protein", d:"as needed", note:"Easiest way to hit 160–180 g/day protein."},
    {n:"Vitamin D3 / K2", d:"continue", note:"Get 25-OH vitamin D tested — never measured."},
    {n:"Iron", d:"do NOT supplement blindly", note:"Test ferritin first — marathon volume causes iron loss via foot-strike hemolysis."},
  ];
  const RACE_STRATEGY = [
    ["Corral","Last or second-to-last. Declare a 4:15 finish at registration."],
    ["Km 0–15","6:10/km. It will feel too slow — that is exactly right. Don't chase the crowd."],
    ["Km 15–30","Hold 6:10/km. Save the legs."],
    ["Aid stations","Walk every one (30–45 s). Water + isotonic from km 10. Gels at the rehearsed rate."],
    ["Km 30–35","This is where the race starts. Shorten your stride, not your pace."],
    ["Km 35–42","If the first half was honest, push from km 38."],
    ["Target","4:13–4:22 hrs — sub-4:15 is a strong first marathon from your base."],
  ];
  const WARMUP = "Before every run (5 min): leg swings, hip circles, high knees, walking lunges, ankle rotations. Never skip it.";
  const COOLDOWN = "After every run (10 min): hip flexors, quads, hamstrings, calves/Achilles, IT band — 30–45 s each. Foam-roll calves + IT band after long runs.";
  const STRENGTH_DESC = "Squats, reverse lunges, single-leg RDLs, hip thrusts, calf raises, lateral band walks — 3×8–12. Glutes & hip stability protect the knees at km 30+.";
  const CORE_DESC = "Planks, dead bugs, glute bridges, hip-flexor stretches, banded clamshells — 20–30 min. No heavy leg work.";
  const REDS_SIGNS = "Persistent fatigue · poor sleep · mood dips · getting sick more often · low libido · performance decline. If these appear, the fix is more food, not less.";
  const REDS_Q = [
    {k:"fatigue", q:"Energy / fatigue", good:"Fresh", bad:"Wiped out"},
    {k:"sleep",   q:"Sleep quality",    good:"Good",  bad:"Poor"},
    {k:"mood",    q:"Mood",             good:"Good",  bad:"Low / irritable"},
    {k:"illness", q:"Illness",          good:"Healthy", bad:"Getting sick"},
    {k:"motivation", q:"Motivation to train", good:"High", bad:"Low"},
  ];

  /* ---- milestones ---- */
  const MILESTONES = [
    {id:"first_5k",  icon:"🏃", name:"First continuous 5K",  desc:"5 km, no walk breaks"},
    {id:"first_10k", icon:"🔥", name:"First continuous 10K", desc:"10 km, no walk breaks"},
    {id:"half_dist", icon:"🌗", name:"Half distance",        desc:"21.1 km in one run"},
    {id:"peak_30k",  icon:"⛰️", name:"The 30K",              desc:"The defining session"},
    {id:"cum_100",   icon:"💯", name:"100 km club",          desc:"100 km logged total"},
    {id:"cum_200",   icon:"🚀", name:"200 km club",          desc:"200 km logged total"},
    {id:"cum_300",   icon:"⚡", name:"300 km club",          desc:"300 km logged total"},
    {id:"race",      icon:"🏅", name:"MARATHONER",           desc:"Buenos Aires 42.195 km"},
  ];

  return { APP_VERSION, PLAN_START_ISO, RACE_ISO, PLAN_WEEKS,
           SHIFT_ANCHOR_ISO, SHIFT_TABLE, SHIFT_HOURS, TRAIN_WINDOW,
           PACE, PACE_BOUNDS, WEEKS, CARB, PROTEIN, FAT, DAYTYPES, RECIPES,
           RACEFUEL, SUPPS, RACE_STRATEGY, WARMUP, COOLDOWN, STRENGTH_DESC,
           CORE_DESC, REDS_SIGNS, REDS_Q, MILESTONES };
})();
