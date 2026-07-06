/* BA Marathon v2 — APP: the impure layer. Storage, views, events, init.
   All dynamic text goes through ENGINE.esc(). No inline onclick — one delegated
   [data-action] listener dispatches to ACTIONS. */
"use strict";
const APP = (() => {

  const E = ENGINE, D = DATA;

  /* ============ date (honors ?today=YYYY-MM-DD for testing) ============ */
  const _q = new URLSearchParams(location.search);
  const DEBUG_TODAY = E.isISO(_q.get("today")) ? _q.get("today") : null;
  function todayISO(){
    if (DEBUG_TODAY) return DEBUG_TODAY;
    const d = new Date();
    return E.iso(d.getFullYear(), d.getMonth()+1, d.getDate());
  }

  /* ============ storage ============ */
  const K = { runs:"bam2_runs", wt:"bam2_weights", chk:"bam2_checkins",
              plan:"bam2_plan", ui:"bam2_ui", meta:"bam2_meta" };
  function load(k, fb){ try{ const v=JSON.parse(localStorage.getItem(k)); return v==null?fb:v; }catch(e){ return fb; } }
  function save(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch(e){ toast("Storage full — export a backup"); return false; } }
  function loadPlan(){ const p=load(K.plan, null); return (p && typeof p==="object") ?
    { status:p.status||{}, moved:p.moved||{} } : { status:{}, moved:{} }; }
  function savePlan(p){ save(K.plan, {v:1, status:p.status, moved:p.moved}); }
  function uid(){ try{ return crypto.randomUUID(); }
    catch(e){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); } }

  // one-time migration from the v1 app's keys (validated; v1 data left untouched)
  function migrate(){
    if (load(K.meta, null)) return;
    const isDate=E.isISO;
    try{
      const r1=load("ba_runs",[]), w1=load("ba_weights",[]), c1=load("ba_checkins",[]);
      const runs=(Array.isArray(r1)?r1:[]).filter(r=>r&&isDate(r.date)&&isFinite(+r.dist)&&+r.dist>0&&+r.dist<=100)
        .map(r=>({id:uid(), date:r.date, dist:+r.dist,
                  timeSec:(typeof r.timeSec==="number"&&isFinite(r.timeSec)&&r.timeSec>0)?Math.round(r.timeSec):null,
                  rpe:(typeof r.rpe==="string"||typeof r.rpe==="number")?String(r.rpe).slice(0,4):"",
                  notes:typeof r.notes==="string"?r.notes.slice(0,2000):"", rw:false}));
      const wts=(Array.isArray(w1)?w1:[]).filter(w=>w&&isDate(w.date)&&isFinite(+w.kg)&&+w.kg>0)
        .map(w=>({date:w.date, kg:+w.kg}));
      const chk=(Array.isArray(c1)?c1:[]).filter(c=>c&&isDate(c.date));
      if(runs.length) save(K.runs, runs);
      if(wts.length)  save(K.wt, wts);
      if(chk.length)  save(K.chk, chk);
    }catch(e){}
    save(K.meta, {v:1, migrated:true, created:todayISO()});
  }

  /* ============ toast ============ */
  function toast(msg){ const t=document.getElementById("toast");
    t.textContent=msg; t.classList.add("show");
    clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove("show"), 2000); }

  /* ============ drawer (ported from v1 — settled iOS behavior) ============ */
  function drawerOpen(){ return document.getElementById("drawer").classList.contains("open"); }
  let _scrollY=0;
  function openDrawer(){
    const d=document.getElementById("drawer"); if(d.classList.contains("open")) return;
    _scrollY=window.scrollY;
    document.body.style.top=(-_scrollY)+"px"; document.body.classList.add("drawer-open");
    d.classList.add("open"); document.getElementById("scrim").classList.add("open");
    const h=document.getElementById("hamburger"); if(h) h.setAttribute("aria-expanded","true");
    try{ history.pushState({drawer:1},""); }catch(e){}
    const first=d.querySelector(".drawer-item"); if(first) first.focus();
  }
  function closeDrawer(fromPop){
    const d=document.getElementById("drawer"); if(!d.classList.contains("open")) return;
    d.classList.remove("open"); document.getElementById("scrim").classList.remove("open");
    document.body.classList.remove("drawer-open"); document.body.style.top="";
    window.scrollTo(0,_scrollY);
    const h=document.querySelector(".hamburger"); if(h){ h.setAttribute("aria-expanded","false"); h.focus(); }
    if(!fromPop && history.state && history.state.drawer){ try{ history.back(); }catch(e){} }
  }

  /* ============ view registry ============ */
  const TABS=[
    {id:"today",    label:"Today",    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M3.5 9h17M8 3v3M16 3v3"/><circle cx="12" cy="14.5" r="2" fill="currentColor" stroke="none"/></svg>'},
    {id:"schedule", label:"Schedule", icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 6h12M8 12h12M8 18h12" stroke-linecap="round"/><circle cx="4" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.4" fill="currentColor" stroke="none"/></svg>'},
    {id:"nutrition",label:"Nutrition",icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 3v7a2 2 0 004 0V3M9 3v18M17 3c-1.6 0-2.5 2-2.5 5.5S15.4 14 17 14v7" stroke-linecap="round" stroke-linejoin="round"/></svg>'},
    {id:"progress", label:"Progress", icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V5M4 19h16" stroke-linecap="round"/><path d="M7 15l3.5-4 3 2.5L20 7" stroke-linecap="round" stroke-linejoin="round"/></svg>'},
  ];
  let CURRENT="today", _lastRenderDate=null, _dirty=false;
  const UI={ openDay:null, mode:null, pending:null, redsDraft:{},
             runDraft:{date:"",dist:"",time:"",rpe:"",notes:"",rw:false}, wtDraft:{date:"",kg:""} };

  function renderNav(){
    document.getElementById("drawerNav").innerHTML = TABS.map(t=>
      `<button type="button" class="drawer-item" data-action="nav" data-tab="${t.id}">${t.icon}<span>${t.label}</span></button>`).join("");
  }
  function setActiveNav(id){ document.querySelectorAll("#drawerNav [data-tab]").forEach(b=>{
    const on=b.dataset.tab===id;
    b.classList.toggle("active", on);
    if(on) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current");
  }); }

  const VIEWS={ today:renderToday, schedule:renderSchedule, nutrition:renderNutrition, progress:renderProgress };
  function go(id){
    CURRENT=id; setActiveNav(id); closeDrawer();
    document.getElementById("tb-title").textContent = TABS.find(t=>t.id===id).label;
    window.scrollTo(0,0);
    rerender();
    const ui=load(K.ui,{}); ui.lastTab=id; save(K.ui,ui);
  }
  function rerender(){ _dirty=false; _lastRenderDate=todayISO(); VIEWS[CURRENT](); }

  /* ============ shared render bits ============ */
  const esc=E.esc;
  function sched(){ return E.effectiveSchedule(loadPlan(), todayISO()); }

  function shiftBadge(dateISO){
    const b=E.briefingFor(dateISO);
    if(b.shift==="off") return `<span class="shiftbadge">day off</span>`;
    if(b.shift==="sat") return `<span class="shiftbadge">work ${b.work.start}–${b.work.end}</span>`;
    return `<span class="shiftbadge">work ${b.work.start}–${b.work.end} · train ${b.window.start}</span>`;
  }
  function stchip(s){
    if(s.status==="done") return `<span class="stchip done">done</span>`;
    if(s.status==="missed") return `<span class="stchip missed">missed</span>`;
    if(s.status==="skipped") return `<span class="stchip skipped">skipped</span>`;
    if(s.status==="unresolved") return `<span class="stchip unresolved">pending</span>`;
    if(s.isMoved) return `<span class="stchip moved">moved</span>`;
    return "";
  }
  function paceLabel(s){
    if(!s.pace) return "";
    if(s.pace==="mix") return "easy 6:30–7:00 · "+s.mp+" km @ 6:10";
    if(s.pace==="mp") return "marathon pace 6:00–6:15";
    if(s.pace==="race") return "race pace 6:00–6:10";
    return "easy 6:30–7:00";
  }
  function sessionLine(s){
    let v=esc(s.t);
    if(s.km && s.kind!=="race42") v=s.km+" km · "+v;
    return v;
  }
  function ringSVG(r){
    const C=2*Math.PI*52;
    const off=C*(1-(r?r.pct:0));
    return `<div class="ringbox" role="progressbar" aria-valuemin="0" aria-valuemax="${r?r.target:0}" aria-valuenow="${r?r.done:0}" aria-label="Weekly kilometres">
      <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="var(--ring-track)" stroke-width="11"/>
      <circle class="ring-prog" cx="60" cy="60" r="52" fill="none" stroke="var(--accent)" stroke-width="11" stroke-linecap="round"
        stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg>
      <div class="rc"><div class="rv display">${r?r.done:0}</div><div class="rl">of ${r?r.target:0} km</div></div></div>`;
  }

  /* ============ TODAY ============ */
  function renderToday(){
    const t=todayISO(), v=document.getElementById("view");
    document.getElementById("tb-sub").textContent=E.fmtShort(t);
    const S=sched();
    const toRace=E.idxISO(D.RACE_ISO)-E.idxISO(t);
    const toStart=E.idxISO(D.PLAN_START_ISO)-E.idxISO(t);
    let html="";

    // hero
    html+=`<div class="hero"><div class="cd display">${toRace>0?toRace:toRace===0?"🏁":"✓"}</div>
      <div class="cdl">${toRace>1?"days to race day":toRace===1?"day to race — tomorrow!":toRace===0?"RACE DAY — 42.195 km":"race complete"}</div>
      <div class="meta"><span>${E.fmtShort(D.RACE_ISO)} · Buenos Aires</span><span>Goal sub-4:15</span><span>10-week plan</span></div></div>`;

    if(toStart>0){
      html+=`<div class="card"><h2>Before the plan</h2><h3>Training starts in ${toStart} day${toStart>1?"s":""}</h3>
        <p class="big muted">Week 1 begins Monday ${E.fmtShort(D.PLAN_START_ISO)} with lower-body strength; first run Tuesday (3 km run-walk), first long run Sunday (8 km). Easy does it — the plan meets you where you are.</p></div>`;
      html+=`<div class="card"><h2>While you wait</h2><p class="big">Sort the gym plan, test your running shoes, and stock the kitchen — the fueling starts with the training.</p></div>`;
      html+=`<div class="footer">BA Marathon · build ${D.APP_VERSION}</div>`;
      v.innerHTML=html; return;
    }
    if(toRace<0){
      html+=`<div class="card"><h2>After the race</h2><h3>🎉 Buenos Aires Marathon — done.</h3>
        <p class="big muted">The 10-week plan is complete. Recover well: easy walking, food, sleep. Your logs live on in Progress.</p></div>`;
      html+=`<div class="footer">BA Marathon · build ${D.APP_VERSION}</div>`;
      v.innerHTML=html; return;
    }

    // briefing strip
    const b=E.briefingFor(t);
    const bIcon=b.shift==="off"?"🌤️":b.shift==="sat"?"🧱":b.shift==="early"?"🌅":"🌆";
    const bT1=b.shift==="off"?"Day off":b.shift==="sat"?"Saturday shift":(b.shift==="early"?"Early shift":"Late shift");
    const bT2=b.work?`work ${b.work.start}–${b.work.end} · ${b.pattern} week`:`${b.pattern} week`;
    let winHtml="";
    if(b.window && b.window.start) winHtml=`<div class="win"><div class="w1">${b.window.start}–${b.window.end}</div><div class="w2">train ${esc(b.window.label)}</div></div>`;
    else if(b.window) winHtml=`<div class="win"><div class="w1">anytime</div><div class="w2">day off</div></div>`;
    else winHtml=`<div class="win"><div class="w1">rest</div><div class="w2">recovery day</div></div>`;
    html+=`<div class="brief"><div class="ic">${bIcon}</div><div><div class="t1">${bT1}</div><div class="t2">${esc(bT2)}</div></div>${winHtml}</div>`;

    // unresolved fix card (most recent 2)
    const unresolved=S.sessions.filter(s=>s.status==="unresolved").sort((a,b2)=>a.date<b2.date?1:-1).slice(0,2);
    if(unresolved.length){
      html+=`<div class="card fix"><h2>Needs a decision</h2>`;
      unresolved.forEach(s=>{
        const choices=E.suggestFix(s, loadPlan(), t);
        html+=`<div style="margin-bottom:10px"><h3 style="font-size:14px">${sessionLine(s)} — ${E.fmtWD(s.date)} ${E.fmtShort(s.date)}</h3>
          <div class="choices">
          <button class="abtn grn" data-action="fixDone" data-id="${s.id}">✓ I did it — mark done</button>`;
        choices.forEach(c=>{
          if(c.type==="move"){
            const warn=(c.warnings&&c.warnings.length)?`<span class="tiny" style="display:block;font-weight:600;color:var(--warn-ink)">⚠︎ ${esc(c.warnings[0])}</span>`:"";
            html+=`<button class="abtn" data-action="fixMove" data-id="${s.id}" data-date="${c.date}">↪ ${esc(c.label)}<span class="tiny" style="display:block;font-weight:600">${esc(c.note)}</span>${warn}</button>`;
          } else {
            html+=`<button class="abtn" data-action="fixMiss" data-id="${s.id}">✕ ${esc(c.label)}<span class="tiny" style="display:block;font-weight:600">${esc(c.note)}</span></button>`;
          }
        });
        html+=`</div>`;
        if(UI.pending && UI.pending.sessionId===s.id){
          html+=`<div class="warnbox">${UI.pending.warnings.map(esc).join("<br>")}</div>
            <div class="actrow" style="margin-top:9px">
            <button class="abtn pri" data-action="confirmPending">Do it anyway</button>
            <button class="abtn" data-action="cancelPending">Cancel</button></div>`;
        }
        html+=`</div>`;
      });
      html+=`<div class="tiny">Life happens — deciding keeps the plan honest. Missed easy volume is dropped, never stacked.</div></div>`;
    }

    // today's session(s)
    const todays=(S.byDate[t]||[]);
    const wNum=E.weekOfISO(t), wk=D.WEEKS[wNum-1];
    if(!todays.length){
      html+=`<div class="card"><h2>Today</h2><p class="big">Nothing scheduled — today's session was moved.</p>
        <div class="actrow" style="margin-top:10px"><button class="abtn" data-action="nav" data-tab="schedule">Open Schedule</button></div></div>`;
    }
    todays.forEach(s=>{
      html+=`<div class="card"><div class="row"><h3>${esc(s.t)}</h3><span class="phase ${esc((s.status==='planned'?wk.phase:wk.phase).replace(/\W/g,''))}">${esc(wk.phase)}</span></div>
        <div class="tiny" style="margin:2px 0 10px">Week ${wNum} · ${E.fmtNice(t)} ${s.isMoved?'· <b>moved from '+E.fmtShort(s.baseDate)+'</b>':''} ${s.status==="done"?'· <b style="color:var(--good-ink)">done ✓</b>':''}</div>`;
      if(s.kind==="rest"){
        html+=`<p class="big">Full rest. Walk if you want — no running, no lifting.</p>${s.note?`<div class="note" style="margin-top:8px">${esc(s.note)}</div>`:""}`;
      } else if(s.kind==="core"){
        html+=`<p class="big">${esc(D.CORE_DESC)}</p>${s.optKm?`<div class="note" style="margin-top:8px">Optional: ${s.optKm} km easy jog first — skip it any week the body complains.</div>`:""}`;
      } else if(s.kind==="strength"||s.kind==="strengthLight"){
        html+=`<p class="big">${esc(D.STRENGTH_DESC)}</p>${s.kind==="strengthLight"?`<div class="note" style="margin-top:8px">${esc(s.note||"Lighter session (2 sets).")}</div>`:""}`;
      } else if(s.kind==="race42"){
        html+=`<p class="big"><b>MARATHON — 42.195 km.</b> Everything you trained for.</p><div class="divider"></div>`+
          D.RACE_STRATEGY.map(x=>`<div style="display:flex;gap:10px;padding:7px 0;border-bottom:.5px solid var(--hair);font-size:14px"><div style="width:76px;flex:0 0 auto;font-weight:800;color:var(--dim)">${esc(x[0])}</div><div style="flex:1">${esc(x[1])}</div></div>`).join("");
      } else {
        html+=`<div class="mgrid"><div class="metric"><div class="v display">${s.km} km</div><div class="l">distance</div></div>
          <div class="metric"><div class="v" style="font-size:14px;line-height:1.35;padding-top:3px">${esc(paceLabel(s))}</div><div class="l">pace</div></div></div>`;
        if(s.note) html+=`<div class="note" style="margin-top:10px">${esc(s.note)}</div>`;
        html+=`<div class="tiny" style="margin-top:10px">🔥 ${esc(D.WARMUP)}</div><div class="tiny" style="margin-top:6px">🧊 ${esc(D.COOLDOWN)}</div>`;
      }
      // quick status actions for today's session
      if(s.status!=="done" && s.kind!=="rest"){
        html+=`<div class="actrow" style="margin-top:12px">
          <button class="abtn grn" data-action="markDone" data-id="${s.id}">✓ Mark done</button>
          ${E.isRunKind(s.kind)?`<button class="abtn pri" data-action="quickLog" data-focus="run-dist">＋ Log the run</button>`:""}
        </div>`;
      }
      html+=`</div>`;
    });

    // fuel
    const primary=todays.find(s=>E.isRunKind(s.kind)) || todays[0];
    if(primary){
      const N=E.nutritionFor(primary);
      if(N.race){
        html+=`<div class="card"><h2>Race-day fuelling</h2>
          <p class="big"><b>In-race:</b> ${esc(D.RACEFUEL.during)}</p>
          <div class="divider"></div><p class="big"><b>Hydration:</b> ${esc(D.RACEFUEL.hydra)}</p>
          <div class="note" style="margin-top:10px">Carb-load was Fri–Sat. Race morning: familiar breakfast 3 h before, nothing new.</div></div>`;
      } else if(N.loadDay){
        html+=`<div class="card" style="border-color:rgba(255,90,31,.5)"><h2 style="color:var(--acc-ink)">Today's fuel · Carb-load</h2>
          <div class="metric" style="margin-bottom:10px"><div class="v display">${esc(N.carb.g)}</div><div class="l">carbs today</div>
            <div class="k">${esc(N.carb.gkg)} — carbs lead today, calories follow</div></div>
          <div class="mgrid"><div class="metric"><div class="v" style="font-size:17px">${D.PROTEIN}</div><div class="l">protein</div><div class="k">stays flat</div></div>
            <div class="metric"><div class="v" style="font-size:17px">low fibre</div><div class="l">final 36 h</div><div class="k">easy starches, nothing new</div></div></div>
          <div class="note" style="margin-top:10px">${esc(D.RACEFUEL.load)}</div></div>`;
      } else {
        html+=`<div class="card"><h2>Today's fuel · ${esc(N.label)}</h2>
          <div class="metric" style="margin-bottom:10px"><div class="v display">${esc(N.kcal)} kcal</div><div class="l">energy target</div>
            ${N.derived?`<div class="k">plan formula: 2,700–2,800 baseline + 90 kcal/km × ${N.km} km</div>`:""}</div>
          <div class="mgrid"><div class="metric"><div class="v" style="font-size:17px">${esc(N.carb.g)}</div><div class="l">carbs</div><div class="k">${esc(N.carb.gkg)}</div></div>
            <div class="metric"><div class="v" style="font-size:17px">${D.PROTEIN}</div><div class="l">protein</div><div class="k">1.8–2.0 g/kg</div></div>
            <div class="metric"><div class="v" style="font-size:17px">${D.FAT}</div><div class="l">fat</div><div class="k">keep ≥ 70 g</div></div>
            <div class="metric"><div class="v" style="font-size:14px;padding-top:3px">${primary.km>0?"+ recovery":"base plate"}</div><div class="l">${primary.km>0?"post-run carb+protein":"whole-food template"}</div><div class="k">${primary.km>0?"1.0–1.2 g/kg carbs in 1 h":"see Nutrition tab"}</div></div></div>
          ${N.opt?`<div class="tiny" style="margin-top:10px">${esc(N.opt)}</div>`:""}</div>`;
      }
    }

    // ring + streak
    const runs=load(K.runs,[]);
    const ring=E.deriveRing(S, runs, t);
    const streak=E.deriveStreak(S, t);
    const ms=E.deriveMilestones(runs, S);
    if(ring){
      html+=`<div class="card"><h2>Week ${ring.week} · ${esc(D.WEEKS[ring.week-1].phase)}</h2>
        <div class="ringrow">${ringSVG(ring)}
        <div class="statcol">
          <div class="stat"><div class="v display">${streak.count}</div><div class="l">session streak</div></div>
          <div class="stat"><div class="v display">${ms._cum} km</div><div class="l">total logged</div></div>
          <div class="stat"><div class="v display">${D.WEEKS[ring.week-1].long!=null?D.WEEKS[ring.week-1].long+" km":"—"}</div><div class="l">Sunday long run</div></div>
        </div></div>
        ${D.WEEKS[ring.week-1].note?`<div class="tiny" style="margin-top:10px">${esc(D.WEEKS[ring.week-1].note)}</div>`:""}</div>`;
    }

    html+=`<div class="card"><h2>Quick log</h2><div class="frow">
      <button class="btn mini" data-action="quickLog" data-focus="run-dist">＋ Log run</button>
      <button class="btn mini sec" data-action="quickLog" data-focus="wt-kg">＋ Weigh-in</button></div></div>`;
    html+=`<div class="footer">BA Marathon · build ${D.APP_VERSION}${DEBUG_TODAY?" · ⚠︎ date override "+DEBUG_TODAY:""}</div>`;
    v.innerHTML=html;
  }

  /* ============ SCHEDULE ============ */
  function renderSchedule(){
    const t=todayISO(), v=document.getElementById("view"), S=sched();
    document.getElementById("tb-sub").textContent="10 weeks";
    const curWeek=E.weekOfISO(t);
    const ui=load(K.ui,{}); const openSet=new Set(ui.weeksOpen||[]);
    let html=`<div class="card" style="padding:13px 16px"><div class="tiny">Mon 13 Jul → race Sun 20 Sep. Weeks run Mon→Sun; Saturday = rest (11-h shift), Sunday = long run. Tap a week, then tap any session to mark it done / move / swap.</div></div>`;
    D.WEEKS.forEach(wk=>{
      const isCur=wk.n===curWeek, open=openSet.has(wk.n)||isCur;
      const longTxt=wk.long!=null?wk.long+" km":"—";
      const wkSessions=(S.byWeek[wk.n]||[]);
      html+=`<div class="wk ${isCur?"cur":""} ${open?"open":""}" data-wk="${wk.n}">
        <button type="button" class="hd" data-action="toggleWeek" data-wk="${wk.n}" aria-expanded="${open}">
          <div class="num">${wk.n}</div>
          <div><div class="t1">${esc(wk.dl)}</div><div class="t2"><span class="phase ${esc(wk.phase.replace(/\W/g,""))}">${esc(wk.phase)}</span><span class="shiftbadge">${esc(wk.shifts)} shifts</span>${isCur?"· this week":""}</div></div>
          <div class="rt"><b>${longTxt}</b> long<br>${wk.total} km total</div>
        </button>
        <div class="body">`;
      // day rows in effective order for this week
      const dates=[]; for(let d2=0; d2<7; d2++) dates.push(E.addDaysISO(D.PLAN_START_ISO,(wk.n-1)*7+d2));
      dates.forEach(dateISO=>{
        const list=(S.byDate[dateISO]||[]).filter(s=>E.weekOfISO(s.date)===wk.n);
        const isToday=dateISO===t;
        if(!list.length){
          html+=`<div class="drow ${isToday?"today":""}"><div class="top"><div class="dd">${E.fmtWD(dateISO)}<br>${esc(E.fmtShort(dateISO))}</div>
            <div class="dv"><span class="muted">— freed up</span><div class="dk">${shiftBadge(dateISO)}</div></div></div></div>`;
          return;
        }
        list.forEach(s=>{
          const openRow=UI.openDay===s.id;
          html+=`<div class="drow ${isToday?"today":""} ${openRow?"open":""}" data-row="${s.id}">
            <div class="top" data-action="expandDay" data-id="${s.id}" role="button" tabindex="0" aria-expanded="${openRow}">
              <div class="dd">${E.fmtWD(dateISO)}<br>${esc(E.fmtShort(dateISO))}</div>
              <div class="dv">${sessionLine(s)}
                <div class="dk">${esc(paceLabel(s))}${s.optKm?` · optional +${s.optKm} km easy`:""}</div>
                <div class="dk">${shiftBadge(dateISO)}</div></div>
              <div class="st">${stchip(s)}</div></div>`;
          if(openRow) html+=dayPanel(s, t);
          html+=`</div>`;
        });
      });
      html+=`${wk.note?`<div class="note" style="margin-top:8px">${esc(wk.note)}</div>`:""}</div></div>`;
    });
    v.innerHTML=html;
  }

  function dayPanel(s, t){
    const plan=loadPlan();
    let html=`<div class="expand">`;
    if(s.note) html+=`<div class="tiny" style="margin-bottom:9px">${esc(s.note)}</div>`;
    html+=`<div class="actrow">`;
    if(s.kind!=="rest"){
      if(s.status!=="done") html+=`<button class="abtn grn" data-action="markDone" data-id="${s.id}">✓ Done</button>`;
      if(s.status!=="missed"&&s.date<=t) html+=`<button class="abtn red" data-action="markMissed" data-id="${s.id}">✕ Missed</button>`;
      if(s.status!=="skipped") html+=`<button class="abtn" data-action="markSkipped" data-id="${s.id}">Skip</button>`;
      if(!s.anchor && s.status!=="done") html+=`<button class="abtn" data-action="showMove" data-id="${s.id}">Move…</button>
        <button class="abtn" data-action="showSwap" data-id="${s.id}">Swap…</button>`;
    }
    if(plan.status[s.id]||plan.moved[s.id]) html+=`<button class="abtn" data-action="resetSession" data-id="${s.id}">Reset</button>`;
    html+=`</div>`;
    if(s.anchor) html+=`<div class="tiny" style="margin-top:8px">⚓ Race-anchored — this one doesn't move.</div>`;

    if(UI.mode==="move" && UI.openDay===s.id){
      html+=`<div class="tiny" style="margin-top:10px;font-weight:700">Move to:</div><div class="movegrid">`;
      for(let d=-3; d<=3; d++){
        if(d===0) continue;
        const cand=E.addDaysISO(s.baseDate,d);
        const val=E.validateMove(s.id, cand, plan, t);
        if(val.errors.length) continue;
        html+=`<button class="abtn ${val.warnings.length?"":"pri"}" data-action="doMove" data-id="${s.id}" data-date="${cand}">${E.fmtWD(cand)} ${esc(E.fmtShort(cand))}${val.warnings.length?" ⚠︎":""}</button>`;
      }
      html+=`</div><div class="tiny" style="margin-top:7px">±3 days max · long runs stay Sat–Mon · ⚠︎ = has a warning</div>`;
    }
    if(UI.mode==="swap" && UI.openDay===s.id){
      const S=sched();
      const wkNum=E.weekOfISO(s.date);
      const cands=(S.byWeek[wkNum]||[]).filter(x=>x.id!==s.id && x.kind!=="rest" && !x.anchor && x.status!=="done");
      html+=`<div class="tiny" style="margin-top:10px;font-weight:700">Swap days with:</div><div class="movegrid">`;
      let any=false;
      cands.forEach(x=>{
        const val=E.validateSwap(s.id, x.id, plan, t);
        if(val.errors.length) return;
        any=true;
        html+=`<button class="abtn ${val.warnings.length?"":"pri"}" data-action="doSwap" data-id="${s.id}" data-other="${x.id}">${E.fmtWD(x.date)} · ${esc(x.t)}${val.warnings.length?" ⚠︎":""}</button>`;
      });
      if(!any) html+=`<span class="tiny">No valid swap partners this week.</span>`;
      html+=`</div>`;
    }
    if(UI.pending && UI.pending.sessionId===s.id){
      html+=`<div class="warnbox">${UI.pending.warnings.map(esc).join("<br>")}</div>
        <div class="actrow" style="margin-top:9px">
          <button class="abtn pri" data-action="confirmPending">Do it anyway</button>
          <button class="abtn" data-action="cancelPending">Cancel</button></div>`;
    }
    html+=`</div>`;
    return html;
  }

  /* ============ NUTRITION ============ */
  function renderNutrition(){
    const v=document.getElementById("view");
    document.getElementById("tb-sub").textContent="fuel-first";
    let html=`<div class="card"><h2>The idea</h2><p class="big">Fuel the training, not a calorie target. No deficit — intake scales with the day's session. Protein is flat; carbs are periodized to the load.</p></div>`;
    html+=`<div class="card"><h2>Calories by day type</h2>`;
    D.DAYTYPES.forEach(d=>{ html+=`<div style="display:flex;gap:10px;padding:9px 0;border-bottom:.5px solid var(--hair)"><div style="flex:1"><b>${esc(d.t)}</b><div class="dk tiny">e.g. ${esc(d.ex)} · carbs ${D.CARB[d.carb].gkg}</div></div><div style="font-weight:800;white-space:nowrap;font-variant-numeric:tabular-nums">${esc(d.kcal)}</div></div>`; });
    html+=`<div class="tiny" style="margin-top:8px">Baseline (BMR + steps, no training) ≈ 2,700–2,800 kcal. Running ≈ 90 kcal/km; a 45-min lower-body session ≈ 250–350 kcal.</div></div>`;
    html+=`<div class="card"><h2>Macros</h2>
      <h3 style="font-size:14px">Carbs — periodized (89.9 kg)</h3>
      <div class="row" style="padding:6px 0"><div>Rest / light day</div><div><span class="pill">${D.CARB.light.gkg}</span><b>${D.CARB.light.g}</b></div></div>
      <div class="row" style="padding:6px 0"><div>Easy run / strength day</div><div><span class="pill">${D.CARB.mod.gkg}</span><b>${D.CARB.mod.g}</b></div></div>
      <div class="row" style="padding:6px 0"><div>Long-run / high-volume day</div><div><span class="pill">${D.CARB.high.gkg}</span><b>${D.CARB.high.g}</b></div></div>
      <div class="divider"></div>
      <div class="row"><div><b>Protein</b> <span class="muted">— flat every day</span></div><b>${D.PROTEIN}</b></div>
      <div class="tiny">1.8–2.0 g/kg</div>
      <div class="row" style="margin-top:8px"><div><b>Fat</b> <span class="muted">— fills the remainder</span></div><b>${D.FAT}</b></div>
      <div class="tiny">Keep ≥ 70 g/day. Favour unsaturated — olive oil, nuts, fish (borderline LDL).</div></div>`;
    html+=`<div class="card"><h2>Shift-practical fueling</h2><p class="big">Morning-training days (late shifts): the post-run meal doubles as pre-work lunch. After-work-training days (early shifts): pre-run snack ~15:00 at work, dinner = recovery meal. Saturday's 11-h shift: <b>pack food</b> — 2,700+ kcal with 160 g protein doesn't come from vending machines.</p></div>`;
    html+=`<div class="card"><h2>Meal ideas · whole-food base</h2>
      <div class="tiny" style="margin-bottom:10px">Base portions ≈ a 2,200 kcal framework — scale up (bigger carb portions, extra snacks) to the day's target. Macros are approximate.</div>`;
    D.RECIPES.forEach(rc=>{ html+=`<div class="rec"><div class="m">${esc(rc.m)}</div><div class="n">${esc(rc.n)}</div><div class="ing">${esc(rc.ing)}</div><div class="mac">${esc(rc.mac)}</div><div class="up">▲ ${esc(rc.up)}</div></div>`; });
    html+=`</div>`;
    html+=`<div class="card" style="border-color:rgba(255,90,31,.5)"><h2 style="color:var(--acc-ink)">🏁 Race-week fuelling</h2>
      <h3 style="font-size:14px">Carb-load (Fri 18 – Sat 19 Sep)</h3><p class="big">${esc(D.RACEFUEL.load)}</p>
      <div class="divider"></div><h3 style="font-size:14px">During the race</h3><p class="big">${esc(D.RACEFUEL.during)}</p>
      <div class="divider"></div><h3 style="font-size:14px">Hydration</h3><p class="big">${esc(D.RACEFUEL.hydra)}</p></div>`;
    html+=`<div class="card"><h2>Supplements</h2>`;
    D.SUPPS.forEach(s=>{ html+=`<div style="display:flex;gap:10px;padding:9px 0;border-bottom:.5px solid var(--hair)"><div style="flex:1"><b>${esc(s.n)}</b><div class="dk tiny">${esc(s.note)}</div></div><div style="font-weight:800;text-align:right;max-width:130px;font-size:13px">${esc(s.d)}</div></div>`; });
    html+=`</div>`;
    html+=`<div class="card"><h2>Watch instead of the scale</h2><p class="big">${esc(D.REDS_SIGNS)}</p></div>`;
    v.innerHTML=html;
  }

  /* ============ PROGRESS ============ */
  function renderProgress(){
    const t=todayISO(), v=document.getElementById("view"), S=sched();
    document.getElementById("tb-sub").textContent="log & track";
    const runs=load(K.runs,[]), wts=load(K.wt,[]), chks=load(K.chk,[]);
    // snapshot in-progress form input so re-renders never wipe a half-entered form
    const snap=id=>{ const el=document.getElementById(id); return el?el.value:null; };
    if(snap("run-dist")!=null){ UI.runDraft={date:snap("run-date"), dist:snap("run-dist"), time:snap("run-time"),
      rpe:snap("run-rpe"), notes:snap("run-notes"), rw:UI.runDraft.rw}; }
    if(snap("wt-kg")!=null){ UI.wtDraft={date:snap("wt-date"), kg:snap("wt-kg")}; }
    const rd=UI.runDraft, wd=UI.wtDraft;
    let html="";

    // plan line for today
    const todays=(S.byDate[t]||[]).filter(s=>E.isRunKind(s.kind));
    let planLine="No run planned today.";
    if(todays.length){
      const s=todays[0];
      planLine = s.kind==="race42" ? "Today is <b>RACE DAY</b> 🏁" :
        `Today's plan: <b>${s.km} km · ${esc(paceLabel(s))}</b>`;
    }

    html+=`<div class="card"><h2>Log a run</h2><div class="tiny" style="margin-bottom:6px">${planLine}</div>
      <div class="frow"><div><label class="fl" for="run-date">Date</label><input type="date" id="run-date" value="${esc(rd.date||t)}"></div>
        <div><label class="fl" for="run-dist">Distance (km)</label><input type="number" id="run-dist" inputmode="decimal" step="0.1" min="0" placeholder="e.g. 8" value="${esc(rd.dist||"")}"></div></div>
      <div class="frow"><div><label class="fl" for="run-time">Time (h:mm:ss or mm:ss)</label><input type="text" id="run-time" placeholder="52:30" value="${esc(rd.time||"")}"></div>
        <div><label class="fl" for="run-rpe">RPE (1–10)</label><input type="number" id="run-rpe" inputmode="numeric" min="1" max="10" placeholder="6" value="${esc(rd.rpe||"")}"></div></div>
      <label class="fl" id="rw-lbl">Type</label><div class="seg" id="rw-seg" role="group" aria-labelledby="rw-lbl">
        <button type="button" class="${rd.rw?"":"on"}" aria-pressed="${!rd.rw}" data-action="setRw" data-rw="0">Continuous</button>
        <button type="button" class="${rd.rw?"on":""}" aria-pressed="${!!rd.rw}" data-action="setRw" data-rw="1">Run-walk</button></div>
      <label class="fl" for="run-notes">Notes</label><textarea id="run-notes" placeholder="how it felt, weather, fuelling…">${esc(rd.notes||"")}</textarea>
      <button class="btn" data-action="saveRun">Save run</button></div>`;

    // recent runs (verdicts derived)
    html+=`<div class="card"><h2>Recent runs</h2>`;
    if(!runs.length) html+=`<div class="empty">No runs logged yet.</div>`;
    else runs.slice().reverse().slice(0,12).forEach(rn=>{
      const vd=E.verdictFor(rn,S);
      html+=`<div class="logitem"><div class="li-d">${esc(E.fmtShort(rn.date))}</div><div class="li-b">
        <b>${esc(rn.dist)} km</b>${vd&&vd.pace?` · ${esc(vd.pace)}/km`:""}${rn.rpe?` · RPE ${esc(rn.rpe)}`:""}${rn.rw?` · <span class="pill" style="margin:0">run-walk</span>`:""}
        ${vd&&vd.label?`<span class="pill ${vd.cls==="good"?"good":vd.cls==="warn"?"warn":""}" style="margin-left:4px">${esc(vd.label)}</span>`:""}
        ${rn.notes?`<div class="dk tiny">${esc(rn.notes)}</div>`:""}
        ${vd&&vd.plan?`<div class="dk tiny">planned ${esc(vd.plan)}</div>`:""}</div>
        <button class="abtn" style="width:44px;min-height:44px;padding:0;flex:0 0 auto;align-self:center" data-action="delRun" data-id="${esc(rn.id)}" aria-label="Delete run">✕</button></div>`;
    });
    html+=`</div>`;

    // weigh-in
    html+=`<div class="card"><h2>Weigh-in</h2>
      <div class="frow"><div><label class="fl" for="wt-date">Date</label><input type="date" id="wt-date" value="${esc(wd.date||t)}"></div>
        <div><label class="fl" for="wt-kg">Weight (kg)</label><input type="number" id="wt-kg" inputmode="decimal" step="0.1" min="0" placeholder="89.9" value="${esc(wd.kg||"")}"></div></div>
      <button class="btn" data-action="saveWeight">Save weigh-in</button>
      <div class="tiny" style="margin-top:12px">Trend = 7-day rolling average. Weigh-ins confirm you're not sliding into a deficit — not to chase one.</div>
      ${weightChart(wts)}</div>`;

    // RED-S
    html+=redsCard(chks);

    // milestones
    const ms=E.deriveMilestones(runs,S);
    const ui=load(K.ui,{}); const seen=new Set(ui.seenBadges||[]);
    html+=`<div class="card"><h2>Milestones · ${ms._cum} km total</h2><div class="bgrid">`;
    D.MILESTONES.forEach(m=>{
      const st=ms[m.id];
      html+=`<div class="badge ${st.achieved?"on":""}"><div class="bi">${m.icon}</div><div class="bn">${esc(m.name)}</div>
        <div class="bd">${st.achieved?esc(E.fmtShort(st.date)):st.progress!=null?Math.round(st.progress*100)+"%":esc(m.desc)}</div></div>`;
      if(st.achieved) seen.add(m.id);
    });
    html+=`</div></div>`;
    ui.seenBadges=[...seen]; save(K.ui,ui);

    // heatmap
    html+=historyCard(runs,wts,chks,t);

    // backup
    html+=`<div class="card"><h2>Backup</h2><div class="tiny" style="margin-bottom:8px">All data lives on this device only. Export a copy now and then — before reinstalling or clearing Safari, always.</div>
      <div class="frow"><button class="btn mini sec" data-action="exportData">Export</button>
      <button class="btn mini sec" data-action="importClick">Import</button></div>
      <input type="file" id="imp" accept="application/json" style="display:none">
      <div class="divider"></div>
      <button class="btn mini sec" data-action="resetPlan">Reset all schedule changes</button>
      <div class="tiny" style="margin-top:6px">Clears every done/missed/moved mark and restores the base plan. Runs, weights and check-ins are kept.</div></div>`;
    html+=`<div class="footer">BA Marathon · build ${D.APP_VERSION}</div>`;
    v.innerHTML=html;
  }

  function weightChart(wts){
    if(wts.length<2) return `<div class="empty">Log at least 2 weigh-ins to see the trend.</div>`;
    const pts=wts.map(w=>({i:E.idxISO(w.date),kg:w.kg,date:w.date})).sort((a,b)=>a.i-b.i);
    const roll=pts.map(p=>{ const win=pts.filter(q=>q.i<=p.i&&q.i>p.i-7);
      return {i:p.i, kg:win.reduce((s,q)=>s+q.kg,0)/win.length, date:p.date}; });
    const W=320,H=150,PADL=34,PADR=8,PADT=10,PADB=20;
    const xs=pts.map(p=>p.i), ys=pts.map(p=>p.kg).concat(roll.map(p=>p.kg));
    let minI=Math.min(...xs),maxI=Math.max(...xs); if(maxI===minI)maxI=minI+1;
    let minY=Math.min(...ys),maxY=Math.max(...ys); const padY=Math.max(.4,(maxY-minY)*.15); minY-=padY; maxY+=padY;
    const X=i=>PADL+(i-minI)/(maxI-minI)*(W-PADL-PADR);
    const Y=k=>PADT+(maxY-k)/(maxY-minY)*(H-PADT-PADB);
    const raw=pts.map(p=>`<circle cx="${X(p.i).toFixed(1)}" cy="${Y(p.kg).toFixed(1)}" r="2" fill="var(--dim)" opacity=".45"/>`).join("");
    const line=roll.map((p,i)=>(i?"L":"M")+X(p.i).toFixed(1)+" "+Y(p.kg).toFixed(1)).join(" ");
    const grid=[maxY,(maxY+minY)/2,minY].map(g=>`<line x1="${PADL}" y1="${Y(g).toFixed(1)}" x2="${W-PADR}" y2="${Y(g).toFixed(1)}" stroke="var(--hair)" stroke-width="1"/><text x="2" y="${(Y(g)+3).toFixed(1)}" font-size="9" fill="var(--dim)">${g.toFixed(1)}</text>`).join("");
    const first=roll[0], last=roll[roll.length-1], delta=last.kg-first.kg;
    return `<div style="margin-top:10px"><svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="Weight trend">
      ${grid}${raw}<path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="${PADL}" y="${H-6}" font-size="9" fill="var(--dim)">${esc(E.fmtShort(first.date))}</text>
      <text x="${W-PADR}" y="${H-6}" font-size="9" fill="var(--dim)" text-anchor="end">${esc(E.fmtShort(last.date))}</text></svg>
      <div class="tiny" style="text-align:center">7-day avg: <b>${last.kg.toFixed(1)} kg</b> · ${delta>=0?"+":""}${delta.toFixed(1)} kg since ${esc(E.fmtShort(first.date))}</div></div>`;
  }

  function redsCard(chks){
    const last=chks.length?chks[chks.length-1]:null;
    let html=`<div class="card"><h2>Weekly under-fuelling check-in</h2>
      <div class="tiny" style="margin-bottom:8px">A quick RED-S scan. Answer honestly; if negatives stack up, the fix is <b>more food, not less</b>.</div>`;
    D.REDS_Q.forEach(q=>{
      const cur=UI.redsDraft[q.k];
      html+=`<label class="fl" id="reds-l-${q.k}">${esc(q.q)}</label><div class="seg bad" role="group" aria-labelledby="reds-l-${q.k}">
        <button type="button" class="${cur==="good"?"on goodon":""}" aria-pressed="${cur==="good"}" data-action="setReds" data-k="${q.k}" data-v="good">${esc(q.good)}</button>
        <button type="button" class="${cur==="bad"?"on":""}" aria-pressed="${cur==="bad"}" data-action="setReds" data-k="${q.k}" data-v="bad">${esc(q.bad)}</button></div>`;
    });
    html+=`<button class="btn" data-action="saveReds">Save check-in</button>`;
    if(last){
      const neg=D.REDS_Q.filter(q=>last[q.k]==="bad");
      let cls="ok", msg=`Last check-in (${E.fmtShort(last.date)}): all clear — keep fuelling.`;
      if(neg.length>=3){ cls="bad"; msg=`⚠️ Last check-in (${E.fmtShort(last.date)}): ${neg.length} warning signs (${neg.map(n=>n.q.toLowerCase()).join(", ")}). Classic under-fuelling stack — eat more, ease off if it persists.`; }
      else if(neg.length>=1){ cls="warn"; msg=`Last check-in (${E.fmtShort(last.date)}): ${neg.length} sign${neg.length>1?"s":""} to watch (${neg.map(n=>n.q.toLowerCase()).join(", ")}). Add carbs; recheck in a few days.`; }
      html+=`<div class="flag ${cls}">${esc(msg)}</div>`;
    }
    html+=`</div>`;
    return html;
  }

  function historyCard(runs,wts,chks,t){
    const runSet=new Set(runs.map(r=>r.date)), wtSet=new Set(wts.map(w=>w.date));
    let html=`<div class="card"><h2>History</h2><div class="tiny" style="margin-bottom:8px">Each column is a plan week (Mon→Sun). <span style="color:var(--accent)">■</span> run logged · <span style="color:var(--good)">■</span> weigh-in.</div><div class="hm">`;
    for(let w=0; w<D.PLAN_WEEKS; w++){
      html+=`<div class="col">`;
      for(let d=0; d<7; d++){
        const dISO=E.addDaysISO(D.PLAN_START_ISO, w*7+d);
        const hasR=runSet.has(dISO), hasW=wtSet.has(dISO), isT=dISO===t;
        let cls="cell"; if(hasR&&hasW)cls+=" rw"; else if(hasR)cls+=" r"; else if(hasW)cls+=" w"; if(isT)cls+=" today";
        const what=hasR&&hasW?"run + weigh-in":hasR?"run logged":hasW?"weigh-in":"";
        const lbl=E.fmtWD(dISO)+" "+E.fmtShort(dISO)+(what?" — "+what:" — no log");
        html+=what
          ? `<div class="${cls}" role="img" aria-label="${esc(lbl)}" data-action="hmCell" data-lbl="${esc(lbl)}"></div>`
          : `<div class="${cls}" aria-hidden="true" data-action="hmCell" data-lbl="${esc(lbl)}"></div>`;
      }
      html+=`</div>`;
    }
    html+=`</div><div class="tiny" style="margin-top:8px">${runs.length} run${runs.length!==1?"s":""} · ${wts.length} weigh-in${wts.length!==1?"s":""} · ${chks.length} check-in${chks.length!==1?"s":""} logged.</div></div>`;
    return html;
  }

  /* ============ actions ============ */
  function focusRow(id){
    const el=document.querySelector('.drow[data-row="'+id+'"] .top');
    if(el) el.focus();
  }
  function setStatus(id, status){
    const p=loadPlan();
    if(status===null) delete p.status[id]; else p.status[id]=status;
    savePlan(p);
  }
  function milestoneDiffToast(before, runs, S2){
    const after=E.deriveMilestones(runs, S2);
    D.MILESTONES.forEach(m=>{
      if(after[m.id].achieved && !before[m.id].achieved) toast(m.icon+" Unlocked: "+m.name+"!");
    });
  }

  const ACTIONS = {
    nav(d){ go(d.tab); },
    toggleWeek(d){
      const el=document.querySelector('.wk[data-wk="'+d.wk+'"]'); if(!el) return;
      el.classList.toggle("open");
      const isOpen=el.classList.contains("open");
      const hd=el.querySelector(".hd"); if(hd) hd.setAttribute("aria-expanded", String(isOpen));
      const ui=load(K.ui,{}); const s=new Set(ui.weeksOpen||[]);
      isOpen?s.add(+d.wk):s.delete(+d.wk);
      ui.weeksOpen=[...s]; save(K.ui,ui);
    },
    expandDay(d){
      UI.openDay = UI.openDay===d.id ? null : d.id;
      UI.mode=null; UI.pending=null;
      renderSchedule();
      const row=document.querySelector('.drow[data-row="'+d.id+'"]');
      if(row&&UI.openDay) row.scrollIntoView({block:"nearest"});
      focusRow(d.id);
    },
    markDone(d){ setStatus(d.id,"done"); UI.pending=null; toast("Marked done ✓"); rerender(); focusRow(d.id); },
    markMissed(d){ setStatus(d.id,"missed"); UI.pending=null; toast("Marked missed"); rerender(); focusRow(d.id); },
    markSkipped(d){ setStatus(d.id,"skipped"); UI.pending=null; toast("Skipped — dropped, not stacked"); rerender(); focusRow(d.id); },
    resetSession(d){
      const p=loadPlan(); delete p.status[d.id]; delete p.moved[d.id]; savePlan(p);
      UI.mode=null; UI.pending=null; toast("Back to plan"); rerender(); focusRow(d.id);
    },
    showMove(d){ UI.openDay=d.id; UI.mode=UI.mode==="move"?null:"move"; UI.pending=null; renderSchedule(); focusRow(d.id); },
    showSwap(d){ UI.openDay=d.id; UI.mode=UI.mode==="swap"?null:"swap"; UI.pending=null; renderSchedule(); focusRow(d.id); },
    doMove(d){
      const val=E.validateMove(d.id, d.date, loadPlan(), todayISO());
      if(val.errors.length){ toast(val.errors[0]); return; }
      if(val.warnings.length){ UI.pending={kind:"move", sessionId:d.id, date:d.date, warnings:val.warnings}; renderSchedule(); return; }
      applyMove(d.id, d.date);
    },
    doSwap(d){
      const val=E.validateSwap(d.id, d.other, loadPlan(), todayISO());
      if(val.errors.length){ toast(val.errors[0]); return; }
      if(val.warnings.length){ UI.pending={kind:"swap", sessionId:d.id, other:d.other, warnings:val.warnings}; renderSchedule(); return; }
      applySwap(d.id, d.other);
    },
    confirmPending(){
      const p=UI.pending; if(!p) return;
      if(p.kind==="move") applyMove(p.sessionId, p.date);
      else applySwap(p.sessionId, p.other);
    },
    cancelPending(){ UI.pending=null; rerender(); },
    fixDone(d){ setStatus(d.id,"done"); toast("Nice — marked done ✓"); rerender(); },
    fixMiss(d){ setStatus(d.id,"missed"); toast("Dropped — the plan moves on"); rerender(); },
    fixMove(d){
      const val=E.validateMove(d.id, d.date, loadPlan(), todayISO());
      if(val.errors.length){ toast(val.errors[0]); return; }
      if(val.warnings.length){ UI.pending={kind:"move", sessionId:d.id, date:d.date, warnings:val.warnings}; rerender(); return; }
      applyMove(d.id, d.date);
    },
    quickLog(d){
      go("progress");
      setTimeout(()=>{ const el=document.getElementById(d.focus); if(el){ el.focus(); el.scrollIntoView({block:"center"}); } },120);
    },
    hmCell(d){ toast(d.lbl); },
    setRw(d, el){
      UI.runDraft.rw = d.rw==="1";
      document.querySelectorAll("#rw-seg button").forEach(b=>{
        const on=b===el;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
      });
    },
    saveRun(){
      const date=document.getElementById("run-date").value||todayISO();
      const dist=parseFloat(document.getElementById("run-dist").value);
      const timeStr=document.getElementById("run-time").value;
      const timeSec=E.parseTime(timeStr);
      const rpe=document.getElementById("run-rpe").value;
      const notes=document.getElementById("run-notes").value.trim();
      if(!E.isISO(date)){ toast("Pick a date"); return; }
      if(!dist||dist<=0){ toast("Enter a distance"); return; }
      if(timeStr.trim() && timeSec==null){ toast("Time looks off — use mm:ss or h:mm:ss"); return; }
      const runs=load(K.runs,[]);
      const S1=sched();
      const before=E.deriveMilestones(runs,S1);
      runs.push({id:uid(), date, dist, timeSec, rpe, notes, rw:!!UI.runDraft.rw});
      runs.sort((a,b)=>a.date<b.date?-1:1);
      if(!save(K.runs,runs)) return;   // storage failed — don't mark done or claim success
      // auto-complete the matching planned session
      const match=(S1.byDate[date]||[]).find(s=>E.isRunKind(s.kind)&&s.status!=="done");
      if(match) setStatus(match.id,"done");
      const S2=sched();
      const vd=E.verdictFor({date,dist,timeSec},S2);
      toast(vd&&vd.label?("Saved · "+vd.label):(match?"Saved · session done ✓":"Run saved"));
      milestoneDiffToast(before, runs, S2);
      UI.runDraft={date:"",dist:"",time:"",rpe:"",notes:"",rw:false};
      // clear the DOM too — the render-time snapshot would otherwise re-capture the old values
      ["run-date","run-dist","run-time","run-rpe","run-notes"].forEach(id=>{const el=document.getElementById(id); if(el) el.value="";});
      rerender();
    },
    delRun(d){
      if(!confirm("Delete this run?")) return;
      const runs=load(K.runs,[]).filter(r=>r.id!==d.id);
      if(save(K.runs,runs)) toast("Deleted");
      rerender();
    },
    saveWeight(){
      const date=document.getElementById("wt-date").value||todayISO();
      const kg=parseFloat(document.getElementById("wt-kg").value);
      if(!E.isISO(date)){ toast("Pick a date"); return; }
      if(!kg||kg<=0){ toast("Enter a weight"); return; }
      const wts=load(K.wt,[]).filter(w=>w.date!==date);
      wts.push({date,kg}); wts.sort((a,b)=>a.date<b.date?-1:1);
      if(!save(K.wt,wts)) return;
      UI.wtDraft={date:"",kg:""};
      ["wt-date","wt-kg"].forEach(id=>{const el=document.getElementById(id); if(el) el.value="";});
      toast("Weigh-in saved"); rerender();
    },
    setReds(d, el){
      UI.redsDraft[d.k]=d.v;
      const grp=el.parentElement;
      grp.querySelectorAll("button").forEach(b=>{ b.classList.remove("on","goodon"); b.setAttribute("aria-pressed","false"); });
      el.classList.add("on"); if(d.v==="good") el.classList.add("goodon");
      el.setAttribute("aria-pressed","true");
    },
    saveReds(){
      if(Object.keys(UI.redsDraft).length<D.REDS_Q.length){ toast("Answer all 5"); return; }
      const chks=load(K.chk,[]);
      chks.push(Object.assign({date:todayISO()}, UI.redsDraft));
      if(!save(K.chk,chks)) return;
      UI.redsDraft={}; toast("Check-in saved"); rerender();
    },
    exportData(){
      const p=loadPlan(); const ui=load(K.ui,{});
      const data={app:"bam2", v:2, exported:todayISO(), runs:load(K.runs,[]), weights:load(K.wt,[]),
                  checkins:load(K.chk,[]), plan:{v:1,status:p.status,moved:p.moved}, ui:{seenBadges:ui.seenBadges||[]}};
      const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
      const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
      a.download="ba-marathon-backup-"+todayISO()+".json"; a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),1000);
      const ui2=load(K.ui,{}); ui2.lastExport=todayISO(); save(K.ui,ui2);
      toast("Exported");
    },
    importClick(){ const el=document.getElementById("imp"); if(el) el.click(); },
    resetPlan(){
      if(!confirm("Reset ALL schedule changes (done/missed/moved marks)? Runs and weigh-ins are kept.")) return;
      savePlan({status:{},moved:{}}); UI.openDay=null; UI.mode=null; UI.pending=null;
      toast("Plan reset to base"); rerender();
    },
  };

  function applyMove(id, date){
    const p=loadPlan(); const s=E.BASE_BY_ID[id];
    if(!s) return;
    if(date===s.baseDate) delete p.moved[id]; else p.moved[id]=date;
    savePlan(p);
    UI.mode=null; UI.pending=null;
    toast("Moved to "+E.fmtWD(date)+" "+E.fmtShort(date));
    rerender();
  }
  function applySwap(idA, idB){
    const p=loadPlan(); const a=E.BASE_BY_ID[idA], b=E.BASE_BY_ID[idB];
    if(!a||!b) return;
    const dA=p.moved[idA]||a.baseDate, dB=p.moved[idB]||b.baseDate;
    if(dB===a.baseDate) delete p.moved[idA]; else p.moved[idA]=dB;
    if(dA===b.baseDate) delete p.moved[idB]; else p.moved[idB]=dA;
    savePlan(p);
    UI.mode=null; UI.pending=null;
    toast("Swapped");
    rerender();
  }

  /* ============ import (validated) ============ */
  function importData(input){
    const f=input.files[0]; if(!f) return;
    const rd=new FileReader();
    rd.onload=()=>{ try{
      const d=JSON.parse(rd.result);
      const isDate=E.isISO;
      const byDate=(a,b)=>a.date<b.date?-1:1;
      const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
      const cRuns=Array.isArray(d.runs)?d.runs.filter(r=>r&&isDate(r.date)&&isFinite(+r.dist)&&+r.dist>0&&+r.dist<=100)
        .map(r=>({id:typeof r.id==="string"?r.id.slice(0,40):uid(), date:r.date, dist:+r.dist,
                  timeSec:(typeof r.timeSec==="number"&&isFinite(r.timeSec)&&r.timeSec>0&&r.timeSec<86400)?Math.round(r.timeSec):null,
                  rpe:(typeof r.rpe==="string"||typeof r.rpe==="number")?String(r.rpe).slice(0,4):"",
                  notes:typeof r.notes==="string"?r.notes.slice(0,2000):"", rw:!!r.rw})):null;
      const cWts=Array.isArray(d.weights)?d.weights.filter(w=>w&&isDate(w.date)&&isFinite(+w.kg)&&+w.kg>0&&+w.kg<500)
        .map(w=>({date:w.date,kg:+w.kg})):null;
      const cChk=Array.isArray(d.checkins)?d.checkins.filter(c=>c&&isDate(c.date))
        .map(c=>{ const o={date:c.date};
          D.REDS_Q.forEach(q=>{ if(c[q.k]==="good"||c[q.k]==="bad") o[q.k]=c[q.k]; });
          return o; }):null;
      let cPlan=null;
      if(d.plan&&typeof d.plan==="object"){
        cPlan={status:{},moved:{}};
        const okStatus=["done","missed","skipped"];
        Object.entries(d.plan.status||{}).forEach(([id,st])=>{
          if(own(E.BASE_BY_ID,id)&&okStatus.includes(st)) cPlan.status[id]=st; });
        // moved entries must satisfy the same structural rules the UI enforces
        Object.entries(d.plan.moved||{}).forEach(([id,dt])=>{
          if(!own(E.BASE_BY_ID,id)||!isDate(dt)) return;
          const s=E.BASE_BY_ID[id];
          if(s.anchor || dt===s.baseDate) return;
          if(Math.abs(E.idxISO(dt)-E.idxISO(s.baseDate))>3) return;
          if(E.idxISO(dt)<E.START_IDX || E.idxISO(dt)>E.RACE_IDX) return;
          if(s.kind==="longrun" && ![0,1,6].includes(E.dowISO(dt))) return;
          cPlan.moved[id]=dt; });
      }
      if(!cRuns&&!cWts&&!cChk&&!cPlan){ toast("Bad file"); return; }
      let allOk=true;
      if(cRuns) allOk=save(K.runs, cRuns.slice().sort(byDate))&&allOk;
      if(cWts)  allOk=save(K.wt,  cWts.slice().sort(byDate))&&allOk;
      if(cChk)  allOk=save(K.chk, cChk.slice().sort(byDate))&&allOk;
      if(cPlan) savePlan(cPlan);
      if(allOk) toast("Imported");
      rerender();
    }catch(e){ toast("Bad file"); } };
    rd.readAsText(f); input.value="";
  }

  /* ============ init ============ */
  function init(){
    migrate();
    const bad=ENGINE.validatePlanData();
    if(bad.length) console.warn("PLAN DATA PROBLEMS:", bad);
    renderNav();

    document.addEventListener("click",(ev)=>{
      const el=ev.target.closest("[data-action]");
      if(!el) return;
      const fn=ACTIONS[el.dataset.action];
      if(fn) fn(el.dataset, el);
    });
    document.addEventListener("keydown",(ev)=>{
      if(ev.key==="Escape"&&drawerOpen()) closeDrawer();
      if((ev.key==="Enter"||ev.key===" ")&&ev.target.matches('[data-action="expandDay"]')){
        ev.preventDefault(); ACTIONS.expandDay(ev.target.dataset);
      }
    });
    window.addEventListener("popstate",()=>{ if(drawerOpen()) closeDrawer(true); });
    document.getElementById("hamburger").addEventListener("click", openDrawer);
    document.getElementById("scrim").addEventListener("click", ()=>closeDrawer());
    document.addEventListener("input",(ev)=>{ if(ev.target.matches("input,textarea,select")) _dirty=true; },true);
    document.addEventListener("change",(ev)=>{ if(ev.target&&ev.target.id==="imp") importData(ev.target); });

    // re-render current view on foreground if the date rolled over and no form is dirty
    document.addEventListener("visibilitychange",()=>{
      if(document.hidden) return;
      if(_lastRenderDate!==todayISO() && !_dirty) rerender();
    });

    const ui=load(K.ui,{});
    go(VIEWS[ui.lastTab]?ui.lastTab:"today");

    if(navigator.storage&&navigator.storage.persist){ navigator.storage.persist(); }
    if("serviceWorker" in navigator){
      window.addEventListener("load",()=>{
        navigator.serviceWorker.register("sw.js",{updateViaCache:"none"})
          .then(reg=>{ reg.update(); }).catch(()=>{});
      });
      // NO auto-reload on SW update — it would discard unsaved form input (settled in v1).
    }
  }

  document.addEventListener("DOMContentLoaded", init);

  return { todayISO, go, rerender, ACTIONS, K, load, save, loadPlan, DEBUG_TODAY };
})();
