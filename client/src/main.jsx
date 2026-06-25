import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
const makeIcon = (emoji) => ({ size = 18 }) => <span className="iconEmoji" style={{fontSize:size, lineHeight:1}}>{emoji}</span>;
const Activity = makeIcon('📈');
const Bell = makeIcon('🔔');
const Bot = makeIcon('🤖');
const Check = makeIcon('✓');
const Clock = makeIcon('⏱️');
const Eye = makeIcon('👁️');
const EyeOff = makeIcon('🙈');
const HeartPulse = makeIcon('💓');
const Hospital = makeIcon('🏥');
const Languages = makeIcon('🌐');
const MoveRight = makeIcon('➡️');
const Plus = makeIcon('+');
const Stethoscope = makeIcon('🩺');
const Timer = makeIcon('⏲️');
const UserCheck = makeIcon('✅');
const UserRoundX = makeIcon('❌');
const Users = makeIcon('👥');
const Volume2 = makeIcon('🔊');
import './style.css';
const API =
  import.meta.env.VITE_API_URL ||
  "https://queue-cure-backend-sy87.onrender.com";
  

const socket = io(API, {
  transports: ["websocket", "polling"]
});
const REASONS = ['Checkup','Fever','Cold','Headache','Follow Up','Back Pain','Joint Pain','Fracture','Child Consultation','Vaccination','Skin Allergy','Rash','Emergency'];
const SPECS = ['General Doc','Orthopedics','Pediatrics','Dermatology','ENT','Cardiology'];
const LANGUAGES = {
  en: { label: 'English', speech: 'en-IN' },
  ta: { label: 'தமிழ்', speech: 'ta-IN' },
  hi: { label: 'हिन्दी', speech: 'hi-IN' },
  te: { label: 'తెలుగు', speech: 'te-IN' },
  kn: { label: 'ಕನ್ನಡ', speech: 'kn-IN' },
  ml: { label: 'മലയാളം', speech: 'ml-IN' }
};

async function api(path, options = {}) {
  const res = await fetch(API + path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function speak(text, lang='en') {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const targetLang = LANGUAGES[lang]?.speech || 'en-IN';
  const voices = window.speechSynthesis.getVoices?.() || [];
  const exact = voices.find(v => v.lang === targetLang);
  const family = voices.find(v => v.lang?.toLowerCase().startsWith(targetLang.split('-')[0].toLowerCase()));
  const fallback = voices.find(v => v.lang === 'en-IN') || voices.find(v => v.lang?.startsWith('en'));
  const msg = new SpeechSynthesisUtterance(text);
  msg.lang = (exact || family || fallback)?.lang || targetLang;
  if (exact || family || fallback) msg.voice = exact || family || fallback;
  msg.rate = lang === 'en' ? 0.92 : 0.86;
  msg.pitch = 1;
  window.speechSynthesis.speak(msg);
}
function tokenWords(token) {
  const n = Number(String(token || '').replace(/\D/g, '')) || 0;
  return String(n); // avoids browser spelling T-001 as T dash zero zero one
}
function beep(type='ok') { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const o=ctx.createOscillator(); const g=ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value = type==='warn'?420:720; g.gain.value=.05; o.start(); setTimeout(()=>{o.stop(); ctx.close();}, 180); }
function maskName(name='') {
  const clean = String(name).trim();
  if (!clean) return 'Patient';
  if (clean.length <= 2) return clean[0] + '*';
  return clean[0] + '•'.repeat(Math.min(4, clean.length - 1)) + clean.slice(-1);
}
function patientName(name, privacy) { return privacy ? maskName(name) : name; }
function voiceMessage(payload={}, lang='en') {
  const token = tokenWords(payload.tokenNumber || '0');
  const name = payload.name || payload.patientName || 'patient';
  const room = payload.room || 'doctor room';
  const doctor = payload.doctorName || 'doctor';
  const count = payload.count || 0;
  const messages = {
 call: {
  en: `Token number ${token},  please proceed to ${room}.`,
  ta: `டோக்கன் எண் ${token},தயவுசெய்து ${room} அறைக்கு செல்லவும்.`,
  hi: `टोकन नंबर ${token}, कृपया ${room} कक्ष में जाएँ।`,
  te: `టోకెన్ నంబర్ ${token},  దయచేసి ${room} గదికి వెళ్లండి.`,
  kn: `ಟೋಕನ್ ಸಂಖ್ಯೆ ${token}, ದಯವಿಟ್ಟು ${room} ಕೊಠಡಿಗೆ ಹೋಗಿ.`,
  ml: `ടോക്കൺ നമ്പർ ${token}, ദയവായി ${room} മുറിയിലേക്ക് പോകുക.`
},

arrived: {
  en: `Token number ${token} has arrived at ${room}.`,
  ta: `டோக்கன் எண் ${token} ${room} அறைக்கு வந்துள்ளார்.`,
  hi: `टोकन नंबर ${token} ${room} कक्ष में पहुँच चुके हैं।`,
  te: `టోకెన్ నంబర్ ${token} ${room} గదికి చేరుకున్నారు.`,
  kn: `ಟೋಕನ್ ಸಂಖ್ಯೆ ${token} ${room} ಕೊಠಡಿಗೆ ಬಂದಿದ್ದಾರೆ.`,
  ml: `ടോക്കൺ നമ്പർ ${token} ${room} മുറിയിൽ എത്തിയിരിക്കുന്നു.`
},

notArrived: {
  en: `Token number ${token} is not available. Please wait for recall.`,
  ta: `டோக்கன் எண் ${token} வரவில்லை. மீண்டும் அழைக்கும் வரை காத்திருக்கவும்.`,
  hi: `टोकन नंबर ${token} उपस्थित नहीं हैं। कृपया पुनः बुलाए जाने तक प्रतीक्षा करें।`,
  te: `టోకెన్ నంబర్ ${token} అందుబాటులో లేరు. దయచేసి మళ్లీ పిలిచే వరకు వేచి ఉండండి.`,
  kn: `ಟೋಕನ್ ಸಂಖ್ಯೆ ${token} ಲಭ್ಯವಿಲ್ಲ. ದಯವಿಟ್ಟು ಮರು ಕರೆಯುವವರೆಗೆ ಕಾಯಿರಿ.`,
  ml: `ടോക്കൺ നമ്പർ ${token} ലഭ്യമല്ല. ദയവായി വീണ്ടും വിളിക്കുന്നതുവരെ കാത്തിരിക്കുക.`
},

complete: {
  en: `Consultation completed for token number ${token}.`,
  ta: `டோக்கன் எண் ${token} அவர்களின் ஆலோசனை முடிவடைந்தது.`,
  hi: `टोकन नंबर ${token} का परामर्श पूर्ण हो गया है।`,
  te: `టోకెన్ నంబర్ ${token} యొక్క సంప్రదింపు పూర్తయింది.`,
  kn: `ಟೋಕನ್ ಸಂಖ್ಯೆ ${token} ಅವರ ಸಲಹೆ ಪೂರ್ಣಗೊಂಡಿದೆ.`,
  ml: `ടോക്കൺ നമ്പർ ${token}യുടെ ചികിത്സ പൂർത്തിയായി.`
},

autoSkip: {
  en: `Token number ${token} did not arrive in time and has been moved to recall.`,
  ta: `டோக்கன் எண் ${token} நேரத்தில் வராததால் மீண்டும் அழைக்கும் பட்டியலில் சேர்க்கப்பட்டுள்ளது.`,
  hi: `टोकन नंबर ${token} समय पर नहीं पहुँचे, इसलिए उन्हें पुनः बुलाने की सूची में जोड़ा गया है।`,
  te: `టోకెన్ నంబర్ ${token} సమయానికి రాలేదు. అందువల్ల రీకాల్ జాబితాలో చేర్చబడింది.`,
  kn: `ಟೋಕನ್ ಸಂಖ್ಯೆ ${token} ಸಮಯಕ್ಕೆ ಬರದ ಕಾರಣ ಮರು ಕರೆ ಪಟ್ಟಿಗೆ ಸೇರಿಸಲಾಗಿದೆ.`,
  ml: `ടോക്കൺ നമ്പർ ${token} സമയത്ത് എത്താത്തതിനാൽ റീകോൾ പട്ടികയിൽ ചേർത്തിരിക്കുന്നു.`
},

reassigned: {
  en: `${count} waiting patients reassigned because ${doctor} is unavailable.`,
  ta: `${doctor} கிடைக்காததால் ${count} நோயாளிகள் மற்றொரு மருத்துவரிடம் மாற்றப்பட்டுள்ளனர்.`,
  hi: `${doctor} उपलब्ध नहीं होने के कारण ${count} मरीजों को अन्य डॉक्टरों के पास भेजा गया है।`,
  te: `${doctor} అందుబాటులో లేనందున ${count} మంది రోగులను ఇతర వైద్యులకు మళ్లించాం.`,
  kn: `${doctor} ಲಭ್ಯವಿಲ್ಲದ ಕಾರಣ ${count} ರೋಗಿಗಳನ್ನು ಇತರ ವೈದ್ಯರಿಗೆ ವರ್ಗಾಯಿಸಲಾಗಿದೆ.`,
  ml: `${doctor} ലഭ്യമല്ലാത്തതിനാൽ ${count} രോഗികളെ മറ്റ് ഡോക്ടർമാർക്ക് മാറ്റിയിരിക്കുന്നു.`
}
  };
  return messages[payload.kind]?.[lang] || payload.text || messages[payload.kind]?.en || '';
}
function clsStatus(s){ return `pill ${s || 'waiting'}`; }
function statusLabel(status){
  if(status==='called') return 'Called';
  if(status==='arrived') return 'Serving';
  if(status==='skipped') return 'Not Arrived';
  if(status==='completed') return 'Completed';
  return status || 'Waiting';
}
function isWaitingScreen(){ return window.location.pathname.startsWith('/waiting'); }

function App(){
  const [state,setState] = useState(null);
  const [toast,setToast] = useState('');
  const settingsRef = useRef({ voiceLang: 'en', privacyMode: false, silentMode: false });
  const path = window.location.pathname;
  useEffect(() => {
    if (path !== '/reception' && path !== '/waiting') {
      window.history.replaceState({}, '', '/reception');
    }
  }, [path]);
  useEffect(() => {
    if (state?.settings) settingsRef.current = state.settings;
  }, [state?.settings]);
  const waitingMode = isWaitingScreen();
  useEffect(()=>{
    api('/api/state').then(setState);
    socket.on('queue_update', setState);
    socket.on('voice_announce', (payload)=>{
      const settings = settingsRef.current;
      const lang = settings.voiceLang || 'en';
      const text = voiceMessage(payload, lang);
      beep(payload.kind === 'autoSkip' || payload.kind === 'notArrived' ? 'warn' : 'ok');
      if (!settings.silentMode) speak(text, lang);
      setToast(text);
      setTimeout(()=>setToast(''),3600);
    });
    return ()=>{ socket.off('queue_update'); socket.off('voice_announce'); };
  },[]);
  if(!state) return <div className="loading">Loading QueueCure AI...</div>;
  return <><Toast text={toast}/>{waitingMode ? <Waiting state={state}/> : <Reception state={state}/>}</>;
}
function Toast({text}){ return text ? <div className="toast"><Bell size={18}/>{text}</div> : null; }

function Reception({state}){
  return <main className="page receptionPage">
    <Header title="QueueCure AI Reception Command Center"badge={`${state.stats.health.label} · ${state.stats.health.score}%`}/>
    <div className="statGrid">
      <Stat icon={<Users/>} label="Waiting" value={state.stats.health.waiting}/>
      <Stat icon={<Stethoscope/>} label="Doctors Free" value={`${state.stats.doctorsFree}/${state.stats.doctorsAvailable}`}/>
      <Stat icon={<Clock/>} label="AI Avg Wait" value={`${state.stats.avg}m`}/>
      <Stat icon={<Check/>} label="Seen Today" value={state.stats.completed}/>
    </div>
    <div className="receptionGrid">
      <section className="stack">
        <AddPatient/>
        <ClinicSettings state={state}/>
        <DoctorManager state={state}/>
      </section>
      <section className="stack">
        <CallNext state={state}/>
        <LiveQueue state={state}/>
        <Copilot state={state}/>
      </section>
    </div>
  </main>
}
function Header({title,subtitle,badge}){ const waiting=isWaitingScreen(); return <header className="topbar"><div className="brandIcon"><HeartPulse/></div><div><h1>{title}</h1><p>{subtitle}</p></div><a className="navBtn" href={waiting?'/reception':'/waiting'}>{waiting?'Open Reception':'Open Waiting TV'}</a><span className="healthMini"><Activity size={14}/>{badge}</span></header> }
function Stat({icon,label,value}){ return <div className="stat"><div className="statIcon">{React.cloneElement(icon,{size:18})}</div><span>{label}</span><b>{value}</b></div> }
function AddPatient(){
  const [form,setForm]=useState({name:'',reason:'General Checkup',urgency:'Normal',avg:7,familyCount:1}); const [err,setErr]=useState('');
  const update=(k,v)=>setForm({...form,[k]:v});
  const add=async()=>{ try{ setErr(''); await api('/api/patients',{method:'POST',body:JSON.stringify(form)}); setForm({...form,name:'',familyCount:1}); }catch(e){setErr(e.message)} };
  return <section className="card"><h2>Add Patient</h2><div className="form2"><label>Patient / Family Name<input value={form.name} onChange={e=>update('name',e.target.value)} placeholder="e.g. Priya Sharma"/></label><label>Visit reason<select value={form.reason} onChange={e=>update('reason',e.target.value)}>{REASONS.map(r=><option key={r}>{r}</option>)}</select><small></small></label><label>Priority<select value={form.urgency} onChange={e=>update('urgency',e.target.value)}><option>Normal</option><option>Emergency</option></select></label><label>Family Count<input type="number" min="1" value={form.familyCount} onChange={e=>update('familyCount',e.target.value)}/><small></small></label><label>Avg Consultation<input type="number" min="3" value={form.avg} onChange={e=>update('avg',e.target.value)}/></label></div>{err&&<p className="err">{err}</p>}<button className="primary wide" onClick={add}>Add</button></section>
}

function ClinicSettings({state}){
  const settings = state.settings || { voiceLang:'en', privacyMode:false, silentMode:false };
  const update = async(patch)=>{
    await api('/api/settings', { method:'PATCH', body: JSON.stringify(patch) });
  };
  return <section className="card settingsCard">
    <h2><Languages/> Display & Announcement Control</h2>
    <p className="settingsHint"></p>
    <div className="settingsGrid">
      <label>Announcement Language
        <select value={settings.voiceLang} onChange={e=>update({voiceLang:e.target.value})}>
          {Object.entries(LANGUAGES).map(([code,meta])=><option key={code} value={code}>{meta.label}</option>)}
        </select>
      </label>
      <button className={`privacyToggle ${settings.privacyMode ? 'active' : ''}`} onClick={()=>update({privacyMode: !settings.privacyMode})}>
        {settings.privacyMode ? <EyeOff size={18}/> : <Eye size={18}/>} {settings.privacyMode ? 'Privacy On' : 'Show Names'}
      </button>
      <button className={`privacyToggle ${settings.silentMode ? 'active' : ''}`} onClick={()=>update({silentMode: !settings.silentMode})}>
        <Volume2 size={18}/> {settings.silentMode ? 'Silent Mode On' : 'Voice On'}
      </button>
    </div>
    <small className="voiceNote"></small>
  </section>
}

function DoctorManager({state}){
  const [d,setD]=useState({name:'',room:'',specialist:'General Physician'}); const add=()=>api('/api/doctors',{method:'POST',body:JSON.stringify(d)}).then(()=>setD({name:'',room:'',specialist:'General Physician'})).catch(e=>alert(e.message));
  return <section className="card"><h2><Hospital/> Doctors & Specialists</h2><div className="doctorAdd"><input placeholder="Doctor name" value={d.name} onChange={e=>setD({...d,name:e.target.value})}/><input placeholder="Room" value={d.room} onChange={e=>setD({...d,room:e.target.value})}/><select value={d.specialist} onChange={e=>setD({...d,specialist:e.target.value})}>{SPECS.map(s=><option key={s}>{s}</option>)}</select><button onClick={add}>Add</button></div><div className="docList">{state.doctors.map(doc=><div className="docRow" key={doc.id}><div><b>{doc.name}</b><p>{doc.specialist} · {doc.room}</p><small>Expected free: {doc.expectedFree ? `${doc.expectedFree} mins`:'Now'}</small></div><button className={doc.available?'available':'unavailable'} onClick={()=>api(`/api/doctors/${doc.id}/toggle`,{method:'PATCH'})}>{doc.available?'Available':'Unavailable'}</button></div>)}</div></section>
}
function CallNext({state}){
  return <section className="card"><h2><Bell/> Call Next Patient</h2><div className="doctorCards">{state.doctors.map(d=>{ const active=d.current; const next=d.queue.find(p=>p.status==='waiting'); return <div className="doctorCall" key={d.id}><div><b>{d.name}</b><p>{d.specialist} · {d.room}</p></div>{active ? <div className="activeBox"><span>Now: {active.tokenNumber} · {active.name}</span><span className={clsStatus(active.status)}>{statusLabel(active.status)}</span>{active.status==='called'&&<AutoSkipCountdown until={active.autoSkipAt}/>} {active.status==='arrived'&&<TimerLine started={active.arrivedAt}/>}<button onClick={()=>api(`/api/queue/complete/${active.id}`,{method:'POST'})}>Complete</button></div> : <><p className="waitingText">{next?`Next: ${next.tokenNumber} · ${next.name}`:'0 waiting'}</p><button disabled={!next||!d.available} onClick={()=>api(`/api/queue/call-next/${d.id}`,{method:'POST'}).catch(e=>alert(e.message))}>Call Next</button></>}</div>})}</div></section>
}
function TimerLine({started}){ const [tick,setTick]=useState(0); useEffect(()=>{const t=setInterval(()=>setTick(x=>x+1),1000); return()=>clearInterval(t)},[]); const mins=started?Math.floor((Date.now()-new Date(started).getTime())/60000):0; return <small className="timer"><Timer size={13}/> Consultation running: {mins}m</small> }
function AutoSkipCountdown({until}){
  const [tick,setTick]=useState(0);
  useEffect(()=>{const t=setInterval(()=>setTick(x=>x+1),1000); return()=>clearInterval(t)},[]);
  if(!until) return null;
  const seconds = Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 1000));
  return <small className={`autoSkip ${seconds <= 10 ? 'critical' : ''}`}><Timer size={13}/> Auto not-arrived in {seconds}s</small>;
}
function LiveQueue({state}){
  const activePatients = state.patients.filter(p=>p.status!=='completed');
  return <section className="card liveQueueCard"><h2><Users/> Live Queue</h2>
    <div className="queueTableHeader">
      <span>Token</span>
      <span>Patient Details</span>
      <span>ETA</span>
      <span>Status</span>
      <span>Action</span>
    </div>
    <div className="queueTable">
      {activePatients.map(p=>(
        <div
          className={`queueRowClean ${p.urgency === 'Emergency' ? 'emergencyRow' : p.urgency === 'Urgent' ? 'urgentRow' : ''}`}
          key={p.id}
        >
          <div className="tokenCell">
            <strong>{p.tokenNumber}</strong>
          </div>

          <div className="patientCell">
            <h4>{p.name}</h4>
            <p>{p.reason}</p>
            <span>{p.doctor?.name || 'Unassigned'} {p.doctor?.room ? `• ${p.doctor.room}` : ''}</span>
            <div className="rowBadges cleanBadges">
              <span className={`priorityTag ${(p.urgency || 'Normal').toLowerCase()}`}>
                {p.urgency === 'Emergency' ? '🚨 Emergency' : p.urgency || 'Normal'}
              </span>
              {Number(p.familyCount) > 1 && <span className="familyBadge">Family × {p.familyCount}</span>}
            </div>
          </div>

          <div className="etaCell">
            <strong>{p.estimatedWait || 0}m</strong>
            <span>ETA</span>
          </div>

          <div className="statusCell">
            <span className={clsStatus(p.status)}>{statusLabel(p.status)}</span>
          </div>

          <PatientActions patient={p} doctors={state.doctors}/>
        </div>
      ))}
    </div>
  </section>
}
function PatientActions({patient, doctors}){
  const [doctorId,setDoctorId]=useState('');
  const canShift = ['waiting','skipped'].includes(patient.status);
  const availableDoctors = doctors.filter(d => d.available && d.id !== patient.doctorId);
  const shift=async()=>{
    if(!doctorId || doctorId === patient.doctorId) return alert('Choose another available doctor');
    try{
      await api(`/api/queue/transfer/${patient.id}/${doctorId}`,{method:'POST'});
      setDoctorId('');
    }
    catch(e){ alert(e.message); }
  };
  return <div className="shiftCell">
    {patient.status==='skipped' && <button className="mini" onClick={()=>api(`/api/queue/recall/${patient.id}`,{method:'POST'})}>Recall</button>}
    {canShift && availableDoctors.length > 0 ? <>
      <select value={doctorId} onChange={e=>setDoctorId(e.target.value)}>
        <option value="">Shift to Doc</option>
        {availableDoctors.map(d=><option key={d.id} value={d.id}>{d.name} — {d.specialist}</option>)}
      </select>
      <button className="shiftBtn" onClick={shift} disabled={!doctorId}><MoveRight size={14}/> Shift</button>
    </> : <span className="mutedAction">—</span>}
  </div>
}
function Copilot({state}){ const h=state.stats.health, b=state.stats.balancer; return <section className="copilot"><h2><Bot/> AI Patient Flow Copilot</h2><div className="split"><div><b>Queue Health: {h.label}</b><p>{h.msg}</p><small>Waiting {h.waiting} · Skipped {h.skipped} · Priority cases {h.urgent}</small></div><div><b>{b.needed?'Reallocation Suggested':'Load Balanced'}</b><p>{b.text}</p></div></div></section> }

function Waiting({state}){
  const settings = state.settings || { voiceLang:'en', privacyMode:false, silentMode:false };
  const privacyMode = settings.privacyMode;
  const voiceLang = settings.voiceLang || 'en';
  const current = state.called[0];
  const heroLabel = current ? statusLabel(current.status).toUpperCase() : 'WAITING ROOM';
  return <main className="page waitingPage">
    <Header title="QueueCure AI Patient Waiting Room" badge="Voice enabled"/>
    <section className="waitingSettingsBar"><Languages size={18}/> Announcement: <b>{LANGUAGES[voiceLang]?.label || 'English'}</b> · Privacy: <b>{privacyMode ? 'On' : 'Off'}</b></section>
    <section className={`tvHero ${current?.status || ''}`}>
      <p>{heroLabel}</p>
      <h1>{current?.tokenNumber || '—'}</h1>
      <h2>{current ? patientName(current.name, privacyMode) : 'Please wait'}</h2>
      <span>{current?.doctor?.name || 'No active token'} {current?.doctor ? `· ${current.doctor.specialist} · ${current.doctor.room}`:''}</span>
    </section>
    <div className="waitingGrid">
      <section className="doctorBoard">
        {state.doctors.map(d=>{
          const waitingPatients = d.queue.filter(p=>p.status==='waiting');
          return <div className="roomCard" key={d.id}>
            <div className="roomHead"><div><b>{d.name}</b><p>{d.specialist} · {d.room}</p></div><span className={d.available?'open':'closed'}>{d.available?'Open':'Closed'}</span></div>
            {d.current && <div className="currentMini"><small>Current</small><b>{d.current.tokenNumber}</b><p>{patientName(d.current.name, privacyMode)}</p><span className={clsStatus(d.current.status)}>{statusLabel(d.current.status)}</span></div>}
            <div className="assigned"><b>Assigned Patients</b>{waitingPatients.length===0 ? <small>No waiting patients</small> : waitingPatients.slice(0,5).map(p=><p key={p.id}>{p.tokenNumber} · {patientName(p.name, privacyMode)} <span>~{p.estimatedWait}m</span></p>)}</div>
          </div>
        })}
      </section>
      <ScanPanel state={state} privacyMode={privacyMode}/>
      <section className="waitList"><h2><Clock/> Estimated Waiting Time</h2>{state.waiting.length===0?<p className="muted">No waiting patients. Thank you for your patience.</p>:state.waiting.map(p=><div className="waitLine" key={p.id}><b>{p.tokenNumber}</b><span>{patientName(p.name, privacyMode)}</span><small>{p.doctor?.room}</small><strong>~{p.estimatedWait} min</strong></div>)}</section>
    </div>
  </main>
}


function WaitingControls({voiceLang,setVoiceLang,privacyMode,setPrivacyMode}){
  const changeLang = (value) => { localStorage.setItem('qc_voice_lang', value); setVoiceLang(value); };
  const togglePrivacy = () => { localStorage.setItem('qc_privacy_mode', String(!privacyMode)); setPrivacyMode(!privacyMode); };
  return <section className="waitingControls">
    <div className="controlBlock">
      <Languages size={18}/>
      <label>Announcement Language</label>
      <select value={voiceLang} onChange={e=>changeLang(e.target.value)}>
        {Object.entries(LANGUAGES).map(([code,meta])=><option key={code} value={code}>{meta.label}</option>)}
      </select>
    </div>
    <button className={`privacyToggle ${privacyMode ? 'active' : ''}`} onClick={togglePrivacy}>
      {privacyMode ? <EyeOff size={18}/> : <Eye size={18}/>} {privacyMode ? 'Privacy On' : 'Show Names'}
    </button>
    <div className="controlNote"><Volume2 size={16}/> Voice announcements support English, Tamil, Hindi, Telugu, Kannada and Malayalam.</div>
  </section>
}

function ScanPanel({state, privacyMode}){
  const [message,setMessage]=useState('');
  const calledPatients = state.called.filter(p => p.status === 'called');
  const activePatient = calledPatients[0] || state.called[0];

  const confirmArrival = async(patient)=>{
    if(!patient) return alert('No called patient available');
    if(patient.status === 'arrived') {
      setMessage(`${patient.tokenNumber} is already Serving.`);
      return;
    }
    if(patient.status !== 'called') {
      setMessage(`${patient.tokenNumber} must be Called before arrival confirmation.`);
      return;
    }
    try{
      await api('/api/queue/arrived', {
        method:'POST',
        body: JSON.stringify({ tokenNumber: patient.tokenNumber })
      });
      setMessage(`${patient.tokenNumber} marked as Serving.`);
    }catch(e){ setMessage(e.message); }
  };

  const markNotArrived = async(patient)=>{
    if(!patient) return alert('No called patient available');
    try{
      await api(`/api/queue/not-arrived/${patient.id}`, {method:'POST'});
      setMessage(`${patient.tokenNumber} marked as Not Arrived.`);
    }catch(e){ alert(e.message); }
  };

  return <section className="scanPanel arrivalPanel">
    <h2><UserCheck/> Arrival Confirmation</h2>
<p></p>

    {activePatient ? <div className="arrivalCard">
      <small>Current Called Token</small>
      <h1>{activePatient.tokenNumber}</h1>
      <h3>{patientName(activePatient.name, privacyMode)}</h3>
      <p>{activePatient.doctor?.name} · {activePatient.doctor?.specialist} · {activePatient.doctor?.room}</p>
      <span className={clsStatus(activePatient.status)}>{statusLabel(activePatient.status)}</span>
      {activePatient.status === 'called' && <AutoSkipCountdown until={activePatient.autoSkipAt}/>}
      <div className="arrivalActions">
        {activePatient.status === 'called' && <button className="success" onClick={()=>confirmArrival(activePatient)}><UserCheck size={16}/> I Have Reached</button>}
        {activePatient.status === 'called' && <button className="danger" onClick={()=>markNotArrived(activePatient)}><UserRoundX size={16}/> Patient Not Arrived</button>}
      </div>
    </div> : <div className="arrivalEmpty">No token is currently called.</div>}

    {calledPatients.length > 1 && <div className="otherCalled">
      <b>Other Called Tokens</b>
      {calledPatients.slice(1).map(p=><div className="otherCalledRow" key={p.id}>
        <span>{p.tokenNumber} · {patientName(p.name, privacyMode)}</span>
        <button onClick={()=>confirmArrival(p)}>Reached</button>
      </div>)}
    </div>}

    {message && <div className="scanMsg">{message}</div>}
    <small className="hint"></small>
  </section>
}

createRoot(document.getElementById('root')).render(<App/>);
