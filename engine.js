/* BA Marathon v2 — ENGINE: pure functions only. No DOM, no localStorage.
   Everything here is (data in → data out) and testable from the console:
   e.g. ENGINE.shiftPattern("2026-07-13") === "W1".
   Date math is UTC day-index based (DST-safe), ported from the v1 app. */
"use strict";
const ENGINE = (() => {

  /* ============ date math ============ */
  function pad(n){ return (n<10?"0":"")+n; }
  function iso(y,m,d){ return y+"-"+pad(m)+"-"+pad(d); }
  function parseISO(s){ const p=String(s==null?"":s).split("-").map(Number); return {y:p[0]||0, m:p[1]||1, d:p[2]||1}; }
  function isISO(s){ return typeof s==="string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
  function idxOf(y,m,d){ return Math.floor(Date.UTC(y,m-1,d)/86400000); }
  function idxISO(s){ const p=parseISO(s); return idxOf(p.y,p.m,p.d); }
  function dowISO(s){ const p=parseISO(s); return new Date(Date.UTC(p.y,p.m-1,p.d)).getUTCDay(); } // 0=Sun..6=Sat
  function addDaysISO(s,n){ const p=parseISO(s); const dt=new Date(Date.UTC(p.y,p.m-1,p.d)+n*86400000);
    return iso(dt.getUTCFullYear(), dt.getUTCMonth()+1, dt.getUTCDate()); }
  const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const WDAYS=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const WDAYS_S=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  function fmtNice(s){ const p=parseISO(s); return WDAYS[dowISO(s)]+", "+MONTHS[p.m-1]+" "+p.d; }
  function fmtShort(s){ if(!isISO(s)) return "—"; const p=parseISO(s); return MONTHS[p.m-1]+" "+p.d; }
  function fmtWD(s){ return WDAYS_S[dowISO(s)]; }

  const START_IDX = idxISO(DATA.PLAN_START_ISO);
  const RACE_IDX  = idxISO(DATA.RACE_ISO);
  const PLAN_LEN  = DATA.PLAN_WEEKS*7;                       // 70 days, Mon Jul 13 .. Sun Sep 20

  // training week number for a date (1..10), or 0 pre-plan / 11 post-plan
  function weekOfISO(s){ const di=idxISO(s)-START_IDX;
    if(di<0) return 0; if(di>=PLAN_LEN) return DATA.PLAN_WEEKS+1;
    return Math.floor(di/7)+1; }
  // Mon..Sun window of the training-week containing date (aligned to plan grid)
  function weekWindow(s){ const di=idxISO(s)-START_IDX;
    const w0=Math.floor(di/7)*7;
    return { startISO:addDaysISO(DATA.PLAN_START_ISO,w0), endISO:addDaysISO(DATA.PLAN_START_ISO,w0+6) }; }

  /* ============ text/parse helpers ============ */
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function parseTime(s){ s=(s||"").trim(); if(!s) return null;
    const seg=s.split(":");
    if(seg.length<1||seg.length>3||!seg.every(x=>/^\d+$/.test(x))) return null;
    const p=seg.map(Number);
    if(p.length===3) return p[0]*3600+p[1]*60+p[2];
    if(p.length===2) return p[0]*60+p[1];
    return p[0]*60; }
  function fmtPace(sec){ const s=Math.round(sec); return Math.floor(s/60)+":"+pad(s%60); }
  function fmtDur(sec){ const s=Math.round(sec), h=Math.floor(s/3600), m=Math.floor((s%3600)/60);
    return h>0 ? h+"h "+pad(m)+"m" : m+" min"; }
  function r10(n){ return Math.round(n/10)*10; }

  /* ============ shift-aware briefing ============ */
  function shiftPattern(dateISO){
    const w=Math.floor((idxISO(dateISO)-idxISO(DATA.SHIFT_ANCHOR_ISO))/7);
    return (((w%2)+2)%2)===0 ? "W1" : "W2";
  }
  function briefingFor(dateISO){
    const dow=dowISO(dateISO), pat=shiftPattern(dateISO);
    const shift=DATA.SHIFT_TABLE[pat][dow];      // early | late | sat | off
    return {
      pattern: pat, shift,
      work: shift==="off" ? null : { start:DATA.SHIFT_HOURS[shift][0], end:DATA.SHIFT_HOURS[shift][1] },
      window: dow===0 ? { label:"anytime — day off", start:null, end:null }
            : shift==="sat" ? null                  // Saturday = rest day
            : DATA.TRAIN_WINDOW[shift],
    };
  }

  /* ============ base sessions ============ */
  // one session per day, id === baseDate (stable identity; moves never change ids)
  const BASE_SESSIONS = [];
  const BASE_BY_ID = {};
  (function build(){
    for(let w=0; w<DATA.PLAN_WEEKS; w++){
      for(let d=0; d<7; d++){                              // d: 0=Mon .. 6=Sun
        const cell=DATA.WEEKS[w].sched[d];
        const baseDate=addDaysISO(DATA.PLAN_START_ISO, w*7+d);
        const s={ id:baseDate, baseDate, week:w+1, kind:cell.kind, km:cell.km,
                  optKm:cell.optKm, mp:cell.mp, pace:cell.pace, t:cell.t, note:cell.note,
                  anchor:cell.anchor, carbLoad:cell.carbLoad,
                  quality: cell.kind==="longrun"||cell.kind==="race21"||cell.kind==="race42"||cell.pace==="mix"||cell.pace==="mp" };
        BASE_SESSIONS.push(s); BASE_BY_ID[s.id]=s;
      }
    }
  })();

  // boot-time structural asserts — returns [] when the plan data is sound
  function validatePlanData(){
    const bad=[];
    if(BASE_SESSIONS.length!==70) bad.push("expected 70 sessions, got "+BASE_SESSIONS.length);
    for(let w=0; w<DATA.PLAN_WEEKS; w++){
      if(DATA.WEEKS[w].sched.length!==7) bad.push("week "+(w+1)+" doesn't have 7 days");
      if(DATA.WEEKS[w].sched[5].kind!=="rest") bad.push("week "+(w+1)+" Saturday is not rest");
      const sun=DATA.WEEKS[w].sched[6].kind;
      if(!["longrun","race21","race42"].includes(sun)) bad.push("week "+(w+1)+" Sunday is not a long run/race");
    }
    const a1=BASE_BY_ID["2026-08-23"], a2=BASE_BY_ID["2026-09-06"], a3=BASE_BY_ID["2026-09-20"];
    if(!a1||a1.kind!=="race21"||!a1.anchor) bad.push("Aug 23 is not the anchored 21k rehearsal");
    if(!a2||a2.kind!=="longrun"||a2.km!==30||!a2.anchor) bad.push("Sep 6 is not the anchored 30k peak");
    if(!a3||a3.kind!=="race42"||!a3.anchor) bad.push("Sep 20 is not the anchored race");
    if(dowISO(DATA.PLAN_START_ISO)!==1) bad.push("plan start is not a Monday");
    if(dowISO(DATA.RACE_ISO)!==0) bad.push("race day is not a Sunday");
    return bad;
  }

  /* ============ adaptive engine ============ */
  // read side: dumb, total, deterministic merge — renders whatever the overrides say
  function effectiveSchedule(ovr, todayISO){
    ovr = ovr || {status:{}, moved:{}};
    const sessions = BASE_SESSIONS.map(s=>{
      const date = ovr.moved[s.id] || s.baseDate;
      const status = ovr.status[s.id] ||
        (date < todayISO ? (s.kind==="rest" ? "done" : "unresolved") : "planned"); // rest days auto-complete
      return Object.assign({}, s, { date, status, isMoved: date!==s.baseDate });
    });
    sessions.sort((a,b)=> a.date<b.date?-1 : a.date>b.date?1 : (b.quality?1:0)-(a.quality?1:0));
    const byDate={}, byWeek={};
    sessions.forEach(s=>{
      (byDate[s.date]=byDate[s.date]||[]).push(s);
      const w=weekOfISO(s.date);
      (byWeek[w]=byWeek[w]||[]).push(s);
    });
    return { sessions, byDate, byWeek };
  }

  const RUN_KINDS=["run","longrun","race21","race42"];
  function isRunKind(k){ return RUN_KINDS.includes(k); }

  // write-time rules. errors block; warnings need explicit confirmation
  function validateMove(sessionId, newDate, ovr, todayISO){
    const s=BASE_BY_ID[sessionId], errors=[], warnings=[];
    if(!s){ return {errors:["Unknown session"], warnings}; }
    if(s.anchor) errors.push("This session is race-anchored — it doesn't move.");
    if(ovr.status[sessionId]==="done") errors.push("Already done — can't move it.");
    if(!isISO(newDate)) errors.push("Bad date.");
    else {
      const delta=idxISO(newDate)-idxISO(s.baseDate);
      if(Math.abs(delta)>3) errors.push("Max ±3 days from the planned day.");
      if(idxISO(newDate)<START_IDX || idxISO(newDate)>RACE_IDX) errors.push("Outside the plan window.");
      if(s.kind==="longrun" && ![0,1,6].includes(dowISO(newDate)))
        errors.push("Long runs stay on or next to Sunday (Sat / Sun / Mon).");
      if(newDate===s.baseDate) errors.push("That's already its day.");
    }
    if(errors.length) return {errors, warnings};

    // simulate
    const ovr2={ status:ovr.status, moved:Object.assign({}, ovr.moved) };
    ovr2.moved[sessionId]=newDate;
    if(newDate===s.baseDate) delete ovr2.moved[sessionId];
    const sched2=effectiveSchedule(ovr2, todayISO);

    const clash=(sched2.byDate[newDate]||[]).filter(x=>x.id!==sessionId && x.kind!=="rest" && x.status!=="skipped" && x.status!=="missed");
    if(clash.length) warnings.push("That day already has: "+clash.map(x=>x.t).join(", ")+". Consider a swap instead.");

    if(dowISO(newDate)===6) warnings.push("That's a Saturday — your 11-hour shift and designated rest day.");

    const qs=sched2.sessions.filter(x=>x.quality && x.status!=="skipped" && x.status!=="missed").map(x=>idxISO(x.date)).sort((a,b)=>a-b);
    for(let i=1;i<qs.length;i++) if(qs[i]-qs[i-1]===1){ warnings.push("This creates back-to-back hard days."); break; }

    const w=weekOfISO(newDate);
    if(w>=1 && w<=DATA.PLAN_WEEKS){
      const plannedKm=(sched2.byWeek[w]||[]).filter(x=>isRunKind(x.kind)&&x.status!=="skipped"&&x.status!=="missed").reduce((t,x)=>t+x.km,0);
      // base = the base plan's own run-km for that week (self-consistent — includes race km)
      const baseKm=BASE_SESSIONS.filter(x=>x.week===w && isRunKind(x.kind)).reduce((t,x)=>t+x.km,0);
      if(plannedKm > baseKm*1.10)
        warnings.push("Week "+w+" grows to "+Math.round(plannedKm)+" km (plan says "+Math.round(baseKm)+") — that's above the safe growth cap.");
    }
    return {errors, warnings};
  }

  function validateSwap(idA, idB, ovr, todayISO){
    const a=BASE_BY_ID[idA], b=BASE_BY_ID[idB], errors=[], warnings=[];
    if(!a||!b) return {errors:["Unknown session"], warnings};
    if(a.anchor||b.anchor) errors.push("Race-anchored sessions don't move.");
    if(ovr.status[idA]==="done"||ovr.status[idB]==="done") errors.push("Completed sessions can't be swapped.");
    const dA=ovr.moved[idA]||a.baseDate, dB=ovr.moved[idB]||b.baseDate;
    if(weekOfISO(dA)!==weekOfISO(dB)) errors.push("Swaps stay inside one week.");
    if(a.kind==="longrun" && ![0,1,6].includes(dowISO(dB))) errors.push("The long run stays on or next to Sunday.");
    if(b.kind==="longrun" && ![0,1,6].includes(dowISO(dA))) errors.push("The long run stays on or next to Sunday.");
    if(errors.length) return {errors, warnings};

    const ovr2={ status:ovr.status, moved:Object.assign({}, ovr.moved) };
    if(dB===a.baseDate) delete ovr2.moved[idA]; else ovr2.moved[idA]=dB;
    if(dA===b.baseDate) delete ovr2.moved[idB]; else ovr2.moved[idB]=dA;
    const sched2=effectiveSchedule(ovr2, todayISO);
    const qs=sched2.sessions.filter(x=>x.quality && x.status!=="skipped" && x.status!=="missed").map(x=>idxISO(x.date)).sort((x,y)=>x-y);
    for(let i=1;i<qs.length;i++) if(qs[i]-qs[i-1]===1){ warnings.push("This creates back-to-back hard days."); break; }
    return {errors, warnings};
  }

  // decision table — returns choices, the user picks, nothing auto-applies
  function suggestFix(session, ovr, todayISO){
    const choices=[];
    const kind=session.kind;
    if(session.anchor){
      choices.push({type:"miss", label:"Mark missed", note: kind==="race42"
        ? "If the race itself was missed, the plan is over — but the fitness isn't."
        : "This one is race-anchored and can't move. One missed key session doesn't sink the plan — the next long run matters more."});
      return choices;
    }
    if(kind==="longrun"){
      const mon=addDaysISO(session.baseDate,1);
      const v=validateMove(session.id, mon, ovr, todayISO);
      if(!v.errors.length && mon<=todayISO)
        choices.push({type:"move", date:mon, label:"Move to Mon "+fmtShort(mon), note:"Do it a day late — the long run is the week's priority.", warnings:v.warnings});
      choices.push({type:"miss", label:"Drop it", note:"Do NOT combine it with next Sunday's long run — that one matters more."});
      return choices;
    }
    if(session.pace==="mix"||session.pace==="mp"){
      for(let d=1; d<=2; d++){
        const cand=addDaysISO(session.baseDate,d);
        if(cand>todayISO) break;
        const v=validateMove(session.id, cand, ovr, todayISO);
        if(!v.errors.length && !v.warnings.length)
          choices.push({type:"move", date:cand, label:"Move to "+fmtWD(cand)+" "+fmtShort(cand), note:"The quality session is worth saving.", warnings:[]});
      }
      choices.push({type:"miss", label:"Drop it", note:"Missed volume gets dropped, never stacked."});
      return choices;
    }
    choices.push({type:"miss", label:"Drop it — don't stack it", note:"Missed easy sessions are dropped. Stacking is how injuries happen."});
    return choices;
  }

  /* ============ nutrition ============ */
  function nutritionFor(day){
    const k=day.kind, km=day.km;
    if(k==="race42") return {label:"Race day", race:true};
    if(day.carbLoad) return {label:"Carb-load day", loadDay:true,
      carb:{gkg:"10–12 g/kg", g:"900–1,080 g"}};
    if(k==="rest"||k==="core"){
      const n={label:"Rest / core-mobility", kcal:"2,700–2,800", carb:DATA.CARB.light};
      if(day.optKm) n.opt="If you run the optional "+day.optKm+" km: add ~"+r10(day.optKm*90)+" kcal and fuel like an easy-run day.";
      return n;
    }
    if(k==="strength"||k==="strengthLight") return {label:"Strength day", kcal:"3,000–3,100", carb:DATA.CARB.mod};
    const lo=r10(2700+90*km), hi=r10(2800+90*km);
    const kcal="~"+lo.toLocaleString("en-US")+"–"+hi.toLocaleString("en-US");
    if(k==="run") return {label: day.pace==="mix"?"Quality run day":"Easy run day", kcal, carb:DATA.CARB.mod, derived:true, km};
    if(k==="longrun") return {label:"Long-run day", kcal, carb: km>=15?DATA.CARB.high:DATA.CARB.mod, derived:true, km};
    if(k==="race21") return {label:"21 km rehearsal day", kcal, carb:DATA.CARB.high, derived:true, km};
    return {label:"—", kcal:"—", carb:DATA.CARB.mod};
  }

  /* ============ verdicts ============ */
  function paceBounds(pace){ return DATA.PACE_BOUNDS[pace]||null; }
  // derived at render time against the EFFECTIVE session on that date
  function verdictFor(run, sched){
    if(!run.timeSec || !run.dist) return null;
    const secKm=run.timeSec/run.dist;
    const onDate=(sched.byDate[run.date]||[]).filter(s=>isRunKind(s.kind));
    if(!onDate.length) return {cls:"", label:"unplanned run", plan:null, pace:fmtPace(secKm)};
    const s=onDate[0];
    const b=paceBounds(s.pace);
    if(!b) return {cls:"", label:null, plan:s.t, pace:fmtPace(secKm)};
    if(secKm < b[0]-3) return {cls:"warn", label:"faster than planned", plan:DATA.PACE[s.pace], pace:fmtPace(secKm)};
    if(secKm > b[1]+3) return {cls:"", label:"slower than planned", plan:DATA.PACE[s.pace], pace:fmtPace(secKm)};
    return {cls:"good", label:"in zone ✓", plan:DATA.PACE[s.pace], pace:fmtPace(secKm)};
  }

  /* ============ gamification (all derived) ============ */
  function deriveRing(sched, runs, todayISO){
    const w=weekOfISO(todayISO);
    if(w<1||w>DATA.PLAN_WEEKS) return null;
    const win=weekWindow(todayISO);
    const target=(sched.byWeek[w]||[])
      .filter(s=>isRunKind(s.kind) && s.status!=="skipped" && s.status!=="missed")
      .reduce((t,s)=>t+s.km,0);
    const done=runs.filter(r=>r.date>=win.startISO && r.date<=win.endISO)
      .reduce((t,r)=>t+(+r.dist||0),0);
    return { week:w, target:Math.round(target*10)/10, done:Math.round(done*10)/10,
             pct: target>0 ? Math.min(1, done/target) : 0, startISO:win.startISO, endISO:win.endISO };
  }

  function deriveStreak(sched, todayISO){
    const past=sched.sessions
      .filter(s=>s.kind!=="rest" && s.date<=todayISO)
      .sort((a,b)=> a.date<b.date?1:-1);
    let count=0, lastDate=null;
    for(const s of past){
      if(s.date===todayISO && s.status==="planned") continue;   // today pending doesn't break it
      if(s.status==="done"){ count++; lastDate=lastDate||s.date; continue; }
      break;
    }
    return {count, lastDate};
  }

  function deriveMilestones(runs, sched){
    const sorted=runs.slice().sort((a,b)=> a.date<b.date?-1:1);
    const out={};
    DATA.MILESTONES.forEach(m=>out[m.id]={id:m.id, achieved:false, date:null, progress:null});
    let cum=0;
    for(const r of sorted){
      const d=+r.dist||0;
      cum+=d;
      if(!out.first_5k.achieved  && d>=5   && !r.rw){ out.first_5k ={id:"first_5k",achieved:true,date:r.date}; }
      if(!out.first_10k.achieved && d>=10  && !r.rw){ out.first_10k={id:"first_10k",achieved:true,date:r.date}; }
      if(!out.half_dist.achieved && d>=21.1){ out.half_dist={id:"half_dist",achieved:true,date:r.date}; }
      if(!out.peak_30k.achieved  && d>=30){ out.peak_30k ={id:"peak_30k",achieved:true,date:r.date}; }
      if(!out.cum_100.achieved && cum>=100){ out.cum_100={id:"cum_100",achieved:true,date:r.date}; }
      if(!out.cum_200.achieved && cum>=200){ out.cum_200={id:"cum_200",achieved:true,date:r.date}; }
      if(!out.cum_300.achieved && cum>=300){ out.cum_300={id:"cum_300",achieved:true,date:r.date}; }
    }
    ["cum_100","cum_200","cum_300"].forEach(id=>{ if(!out[id].achieved) out[id].progress=cum/(+id.split("_")[1]); });
    const raceS=(sched.byDate[DATA.RACE_ISO]||[]).find(s=>s.kind==="race42");
    if((raceS && raceS.status==="done") || sorted.some(r=>+r.dist>=42.1 && r.date>=DATA.RACE_ISO))
      out.race={id:"race",achieved:true,date:DATA.RACE_ISO};
    out._cum=Math.round(cum*10)/10;
    return out;
  }

  return { pad, iso, parseISO, isISO, idxISO, dowISO, addDaysISO, fmtNice, fmtShort, fmtWD,
           weekOfISO, weekWindow, esc, parseTime, fmtPace, fmtDur, r10,
           shiftPattern, briefingFor, BASE_SESSIONS, BASE_BY_ID, validatePlanData,
           effectiveSchedule, isRunKind, validateMove, validateSwap, suggestFix,
           nutritionFor, paceBounds, verdictFor, deriveRing, deriveStreak, deriveMilestones,
           START_IDX, RACE_IDX, PLAN_LEN };
})();
