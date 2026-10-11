"use client";

import { MenuPanel } from "@/components/ui/MenuPanel";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export type ThemeMode = "auto" | "light" | "dark";
type Sky = "morning" | "afternoon" | "evening" | "night";

type Resolved = { m: ThemeMode; s: Sky; dm: boolean };

declare global {
  interface Window {
    /** Work out mode, sky phase and day-moon for a chosen mode (reads the sun's position and any ?sky= override). */
    __crResolve?: (mode: ThemeMode | null) => Resolved;
    /** Write a state onto <html>. dir: 1 also turns the sky wheel forward, -1 backward, 0 leaves it, omitted jumps. */
    __crSet?: (mode: ThemeMode, sky: Sky, dayMoon: boolean, dir?: 1 | -1 | 0) => void;
    /** Turn the sun and moon to where they sit in a phase (dir as above). */
    __crTurn?: (sky: Sky, dayMoon: boolean, dir?: 1 | -1) => void;
  }
}

/**
 * Runs before first paint (inlined in app/layout.tsx), so the first frame already has the right sky. It defines
 * window.__crResolve / __crSet / __crTurn, the one place theme logic lives; the menu below animates with them.
 *  - auto:  follows the real sun where the visitor is. The sun's elevation is computed from the date and an approximate
 *           location taken from the timezone (no permission prompt). Night below -8 deg (end of the blue hour), evening
 *           (dusk) from 3 deg above the horizon down to -8, late afternoon (faint moon) below 25 deg, morning before the
 *           sun is 40 deg up. Evening and night use the dark UI tokens.
 *  - light: afternoon sky, light UI.   dark: night sky, dark UI.
 * `?sky=morning|afternoon|late|evening|night` forces a phase for previews and demos (not saved; `late` = afternoon + faint moon).
 */
export const THEME_SCRIPT = `(function(){
var K='cliprail-sky-mode',P=['morning','afternoon','evening','night'],d=document.documentElement,R=Math.PI/180;
var Z={'Africa/Lagos':[6.5,3.4],'Africa/Accra':[5.6,-.2],'Africa/Nairobi':[-1.3,36.8],'Africa/Johannesburg':[-26.2,28],'Africa/Cairo':[30,31.2],
'Europe/London':[51.5,-.1],'Europe/Paris':[48.9,2.4],'Europe/Berlin':[52.5,13.4],'Europe/Madrid':[40.4,-3.7],'Europe/Moscow':[55.8,37.6],
'America/New_York':[40.7,-74],'America/Toronto':[43.7,-79.4],'America/Chicago':[41.9,-87.6],'America/Denver':[39.7,-105],
'America/Los_Angeles':[34,-118.2],'America/Mexico_City':[19.4,-99.1],'America/Sao_Paulo':[-23.5,-46.6],
'Asia/Dubai':[25.2,55.3],'Asia/Kolkata':[19,72.9],'Asia/Singapore':[1.35,103.8],'Asia/Jakarta':[-6.2,106.8],'Asia/Manila':[14.6,121],
'Asia/Shanghai':[31.2,121.5],'Asia/Hong_Kong':[22.3,114.2],'Asia/Seoul':[37.6,127],'Asia/Tokyo':[35.7,139.7],'Australia/Sydney':[-33.9,151.2]};
function where(){var z='',o=new Date().getTimezoneOffset();try{z=Intl.DateTimeFormat().resolvedOptions().timeZone||''}catch(e){}
  if(Z[z])return Z[z];
  var lat={Europe:50,America:30,Asia:25,Africa:5,Australia:-30,Pacific:-15}[z.split('/')[0]]||0;
  return [lat,-o/4];}
function sun(t,lat,lon){var n=t/864e5-10957.5,g=(357.529+.98560028*n)*R,q=280.459+.98564736*n,
  L=(q+1.915*Math.sin(g)+.02*Math.sin(2*g))*R,e=(23.439-3.6e-7*n)*R,dec=Math.asin(Math.sin(e)*Math.sin(L)),
  ra=Math.atan2(Math.cos(e)*Math.sin(L),Math.cos(L)),h=((18.697374558+24.06570982441908*n)%24)*15*R+lon*R-ra;
  return {el:Math.asin(Math.sin(lat*R)*Math.sin(dec)+Math.cos(lat*R)*Math.cos(dec)*Math.cos(h))/R,pm:Math.sin(h)>0};}
function auto(){var w=where(),p=sun(Date.now(),w[0],w[1]);
  if(p.el<-8)return ['night',0];
  if(!p.pm)return [p.el<40?'morning':'afternoon',0];
  return p.el<3?['evening',0]:p.el<25?['afternoon',1]:['afternoon',0];}
function resolve(m){
  var f=null,s,dm=0;
  try{f=new URLSearchParams(location.search).get('sky')}catch(e){}
  if(m!=='light'&&m!=='dark')m='auto';
  if(f==='late'){s='afternoon';dm=1}else if(P.indexOf(f)>=0)s=f;else if(m==='light')s='afternoon';else if(m==='dark')s='night';
  else{var a=auto();s=a[0];dm=a[1]}
  return {m:m,s:s,dm:!!dm};
}
var A={morning:-55,afternoon:35,evening:100,night:195},M={morning:120,afternoon:-110,evening:-45,night:45};
function turn(v,t,dir){var c=parseFloat(d.style.getPropertyValue(v));
  if(dir&&!isNaN(c))t=dir>0?c+(((t-c)%360)+360)%360:c-(((c-t)%360)+360)%360;
  d.style.setProperty(v,String(t));}
function turnTo(s,dm,dir){turn('--sky-turn',dm?70:A[s],dir);turn('--moon-turn',dm?-50:M[s],dir);}
function set(m,s,dm,dir){
  d.dataset.mode=m;d.dataset.sky=s;d.dataset.theme=(s==='evening'||s==='night')?'dark':'light';
  if(dm)d.dataset.daymoon='';else delete d.dataset.daymoon;
  if(dir!==0)turnTo(s,dm,dir);
}
window.__crResolve=resolve;window.__crSet=set;window.__crTurn=turnTo;
var m=null;try{m=localStorage.getItem(K)}catch(e){}
var r=resolve(m);set(r.m,r.s,r.dm);
})();`;

/** One phase-to-phase step. The sky layers in SkyBackdrop / globals.css use the same 1.4s. */
const SKY_STEP_MS = 1400;
const CYCLE: Sky[] = ["morning", "afternoon", "evening", "night"];

/**
 * Phases to pass through on the way from one sky to another, and which way to turn the sky wheel. Goes forward through
 * the day (afternoon -> evening -> night, night -> morning -> afternoon) so the sun really sets and rises; only steps
 * backwards when that is the shorter way.
 */
function route(from: Sky, to: Sky): { steps: Sky[]; dir: 1 | -1 } {
  const fi = CYCLE.indexOf(from);
  const ti = CYCLE.indexOf(to);
  const fwd = (ti - fi + 4) % 4;
  const back = (fi - ti + 4) % 4;
  if (fwd === 0) return { steps: [], dir: 1 };
  const dir = back < fwd ? -1 : 1;
  const n = dir === 1 ? fwd : back;
  return { steps: Array.from({ length: n }, (_, i) => CYCLE[(fi + dir * (i + 1) + 4) % 4]), dir };
}

let runId = 0;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Animate the page to a mode. The sun and moon make ONE continuous turn to their final spot (eased once, start to end,
 * so they never pause between phases); the sky colours step through the phases in between on the way.
 */
async function animateTo(mode: ThemeMode) {
  const { __crResolve: resolve, __crSet: set, __crTurn: turnTo } = window;
  if (!resolve || !set || !turnTo) return;
  const target = resolve(mode);
  const d = document.documentElement;
  const { steps, dir } = route((d.dataset.sky as Sky) ?? "afternoon", target.s);
  const id = ++runId;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    set(target.m, target.s, target.dm);
    return;
  }
  d.style.setProperty("--sky-dur", `${Math.max(steps.length, 1) * SKY_STEP_MS}ms`);
  if (steps.length === 0) {
    set(target.m, target.s, target.dm, 1); // same phase, but the day-moon may have changed
    return;
  }

  d.dataset.mode = target.m;
  d.classList.add("theme-anim");
  turnTo(target.s, target.dm, dir);
  for (let i = 0; i < steps.length; i++) {
    if (id !== runId) return; // a newer choice took over
    const last = i === steps.length - 1;
    set(target.m, steps[i], last && target.dm, 0);
    await wait(SKY_STEP_MS);
  }
  if (id === runId) d.classList.remove("theme-anim");
}

// New key on purpose: choices saved by the old two-way toggle ("light"/"dark") would otherwise lock people out of auto.
const STORAGE_KEY = "cliprail-sky-mode";

// Read <html data-mode / data-sky> as external state, so the button re-renders whenever the theme changes.
function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode", "data-sky"] });
  return () => obs.disconnect();
}
const getMode = () => (document.documentElement.dataset.mode as ThemeMode) ?? "auto";
const getSky = () => (document.documentElement.dataset.sky as Sky) ?? "afternoon";

const SKY_LABEL: Record<Sky, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", night: "Night" };

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <circle cx="12" cy="12" r="4.5" fill="#f5b83d" />
      <g stroke="#f5b83d" strokeWidth="2" strokeLinecap="round">
        <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
      </g>
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#c9bfff" d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z" />
      <circle cx="17.5" cy="5" r="1" fill="#fff" />
    </svg>
  );
}
/** Auto: half sun, half moon. */
function AutoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path d="M12 4a8 8 0 0 0 0 16Z" fill="#f5b83d" />
      <path d="M12 4a8 8 0 0 1 0 16Z" fill="#8b74ff" />
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.2" />
    </svg>
  );
}

/** The navbar's button: a plain outline sun or moon for the sky on screen (the menu keeps the coloured icons). */
function BarIcon({ night }: { night: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {night ? (
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
      ) : (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
        </>
      )}
    </svg>
  );
}

const OPTIONS: { mode: ThemeMode; label: string; hint: (sky: Sky) => string; Icon: () => React.ReactElement }[] = [
  { mode: "auto", label: "Auto", hint: (sky) => `Follows the sun where you are · ${SKY_LABEL[sky]} now`, Icon: AutoIcon },
  { mode: "light", label: "Day", hint: () => "Always the daytime sky", Icon: SunIcon },
  { mode: "dark", label: "Night", hint: () => "Always the night sky", Icon: MoonIcon },
];

/** Theme menu: Auto (time of day, default), Day, Night. */
export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, getMode, () => "auto" as ThemeMode);
  const sky = useSyncExternalStore(subscribe, getSky, () => "afternoon" as Sky);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // In auto mode, re-check the clock every minute so the sky changes on its own (e.g. afternoon into evening).
  useEffect(() => {
    if (mode !== "auto") return;
    const id = setInterval(() => void animateTo("auto"), 60_000);
    return () => clearInterval(id);
  }, [mode]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (next: ThemeMode) => {
    void animateTo(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage can be blocked; the choice still applies for this visit
    }
    setOpen(false);
  };


  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Theme"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Theme"
        className="grid size-9 place-items-center rounded-full text-fg/70 transition-colors hover:bg-black/[0.04] hover:text-fg dark:text-white/70 dark:hover:bg-white/[0.06] dark:hover:text-white"
      >
        <BarIcon night={sky === "evening" || sky === "night"} />
      </button>
      <MenuPanel open={open} className="absolute top-11 right-0 z-50 w-64 rounded-2xl border border-line bg-surface p-1.5 shadow-[var(--shadow-float)]">
          {OPTIONS.map(({ mode: m, label, hint, Icon }) => (
            <button
              key={m}
              type="button"
              role="menuitemradio"
              aria-checked={mode === m}
              onClick={() => choose(m)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-surface-2 ${mode === m ? "bg-surface-2" : ""}`}
            >
              <Icon />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-fg">{label}</span>
                <span className="block truncate text-xs text-muted">{hint(sky)}</span>
              </span>
              {mode === m && <span className="size-1.5 rounded-full bg-accent" />}
            </button>
          ))}
      </MenuPanel>
    </div>
  );
}
