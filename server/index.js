import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH']
  }
});

const PORT = process.env.PORT || 5001;

app.use(cors({ origin: '*' }));
app.use(express.json());

let tokenSeq = 1;
let patients = [];
let completedDurations = [7, 8, 6, 9, 7];

let doctors = [
  { id: 'd1', name: 'Dr. Priya Raman', room: 'Room 01', specialist: 'General Physician', available: true, currentPatientId: null },
  { id: 'd2', name: 'Dr. Arjun Kumar', room: 'Room 02', specialist: 'Orthopedics', available: true, currentPatientId: null },
  { id: 'd3', name: 'Dr. Sarah Joseph', room: 'Room 03', specialist: 'Pediatrics', available: true, currentPatientId: null }
];

let clinicSettings = {
  voiceLang: 'en',
  privacyMode: false,
  silentMode: false
};

const AUTO_SKIP_MS = 45 * 1000;
const autoSkipTimers = new Map();

const reasonMap = {
  Fever: 'General Physician',
  Cold: 'General Physician',
  Headache: 'General Physician',
  'General Checkup': 'General Physician',
  'Follow Up': 'General Physician',
  'Back Pain': 'Orthopedics',
  'Joint Pain': 'Orthopedics',
  Fracture: 'Orthopedics',
  'Child Consultation': 'Pediatrics',
  Vaccination: 'Pediatrics',
  'Skin Allergy': 'Dermatology',
  Rash: 'Dermatology',
  Emergency: 'General Physician'
};

function now() {
  return new Date().toISOString();
}

function id(prefix = 'id') {
  return prefix + Math.random().toString(36).slice(2, 9);
}

function token() {
  return `T-${String(tokenSeq++).padStart(3, '0')}`;
}

function avgConsult() {
  return Math.max(
    5,
    Math.round(completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length)
  );
}

function getPatient(pid) {
  return patients.find(p => p.id === pid);
}

function priorityRank(u) {
  return u === 'Emergency' ? 0 : u === 'Urgent' ? 1 : 2;
}

function sortQueue(a, b) {
  const pa = priorityRank(a.urgency);
  const pb = priorityRank(b.urgency);
  if (pa !== pb) return pa - pb;
  return a.createdAt.localeCompare(b.createdAt);
}

function doctorQueue(did) {
  return patients.filter(
    p => p.doctorId === did && ['waiting', 'called', 'arrived', 'skipped'].includes(p.status)
  );
}

function waitingForDoctor(did) {
  return patients.filter(p => p.doctorId === did && p.status === 'waiting').sort(sortQueue);
}

function activeForDoctor(did) {
  return patients.find(p => p.doctorId === did && ['called', 'arrived'].includes(p.status));
}

function elapsedMinutes(start) {
  return start ? Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 60000)) : 0;
}

function clearAutoSkip(pid) {
  if (autoSkipTimers.has(pid)) {
    clearTimeout(autoSkipTimers.get(pid));
    autoSkipTimers.delete(pid);
  }
}

function emitVoice(kind, payload = {}) {
  io.emit('voice_announce', { kind, ...payload });
}

function doctorDelay(d) {
  const p = activeForDoctor(d.id);
  if (!p) return 0;
  const base = avgConsult();
  return Math.max(0, elapsedMinutes(p.arrivedAt || p.calledAt) - base);
}

function chooseDoctor(reason, urgency = 'Normal') {
  const desired =
    urgency === 'Urgent' || urgency === 'Emergency'
      ? 'General Physician'
      : reasonMap[reason] || 'General Physician';

  const candidates = doctors.filter(d => d.available && d.specialist === desired);
  const fallback = doctors.filter(d => d.available);
  const pool = candidates.length ? candidates : fallback;

  if (!pool.length) return null;

  return pool.sort((a, b) => doctorQueue(a.id).length - doctorQueue(b.id).length)[0];
}

function estimateWait(patient) {
  const d = doctors.find(x => x.id === patient.doctorId);
  if (!d) return { minutes: avgConsult(), reason: 'No doctor assigned yet.' };

  const q = waitingForDoctor(d.id);
  const ahead = q.findIndex(p => p.id === patient.id);
  const position = ahead < 0 ? 0 : ahead;
  const delay = doctorDelay(d);

  const priorityAdj =
    patient.urgency === 'Emergency' ? -avgConsult() : patient.urgency === 'Urgent' ? -2 : 0;

  const mins = Math.max(0, position * avgConsult() + delay + priorityAdj);

  return {
    minutes: mins,
    reason: `${position} patient${position === 1 ? '' : 's'} ahead • avg ${avgConsult()}m • doctor delay +${delay}m${
      patient.urgency === 'Emergency'
        ? ' • emergency fast-track applied'
        : patient.urgency === 'Urgent'
          ? ' • urgent priority applied'
          : ''
    }`
  };
}

function queueHealth() {
  const waiting = patients.filter(p => p.status === 'waiting').length;
  const skipped = patients.filter(p => p.status === 'skipped').length;
  const urgent = patients.filter(
    p => p.status === 'waiting' && (p.urgency === 'Urgent' || p.urgency === 'Emergency')
  ).length;

  const totalDelay = doctors.reduce((sum, d) => sum + doctorDelay(d), 0);

  let score = 100 - waiting * 4 - totalDelay * 3 - skipped * 5 - urgent * 2;
  score = Math.max(35, Math.min(100, Math.round(score)));

  const label = score > 80 ? 'Smooth' : score > 55 ? 'Delayed' : 'Overloaded';

  const msg =
    label === 'Smooth'
      ? 'Clinic flow is stable. Keep calling tokens consistently.'
      : label === 'Delayed'
        ? 'Waiting time is increasing. Use load balancing and recall skipped tokens.'
        : 'Queue congestion detected. Add a doctor or fast-track urgent cases.';

  return {
    score,
    label,
    msg,
    waiting,
    skipped,
    urgent,
    avg: avgConsult(),
    totalDelay
  };
}

function loadBalancer() {
  const available = doctors.filter(d => d.available);
  if (available.length < 2) {
    return { needed: false, text: 'Need at least two available doctors for balancing.' };
  }

  const loads = available.map(d => ({ ...d, load: doctorQueue(d.id).length }));
  loads.sort((a, b) => b.load - a.load);

  const busiest = loads[0];
  const lightest = loads[loads.length - 1];

  if (busiest.load - lightest.load >= 3) {
    const reduce = Math.min(20, (busiest.load - lightest.load) * avgConsult());
    return {
      needed: true,
      text: `Move one non-urgent follow-up from ${busiest.name} to ${lightest.name}. Expected wait reduction ~${reduce} mins.`
    };
  }

  return { needed: false, text: 'No reallocation needed right now.' };
}

function dashboard() {
  const enriched = patients.map(p => {
    const wait = estimateWait(p);
    return {
      ...p,
      doctor: doctors.find(d => d.id === p.doctorId) || null,
      estimatedWait: wait.minutes,
      waitReason: wait.reason,
      consultElapsed: elapsedMinutes(p.arrivedAt)
    };
  });

  return {
    doctors: doctors.map(d => ({
      ...d,
      current: getPatient(d.currentPatientId),
      queue: enriched.filter(
        p => p.doctorId === d.id && ['waiting', 'called', 'arrived', 'skipped'].includes(p.status)
      ),
      delay: doctorDelay(d),
      expectedFree: activeForDoctor(d.id)
        ? Math.max(1, avgConsult() - elapsedMinutes(activeForDoctor(d.id).arrivedAt || activeForDoctor(d.id).calledAt))
        : 0
    })),
    patients: enriched,
    waiting: enriched.filter(p => p.status === 'waiting').sort(sortQueue),
    called: enriched.filter(p => ['called', 'arrived'].includes(p.status)),
    skipped: enriched.filter(p => p.status === 'skipped'),
    completed: enriched.filter(p => p.status === 'completed'),
    stats: {
      health: queueHealth(),
      completed: patients.filter(p => p.status === 'completed').length,
      doctorsFree: doctors.filter(d => d.available && !activeForDoctor(d.id)).length,
      doctorsAvailable: doctors.filter(d => d.available).length,
      avg: avgConsult(),
      balancer: loadBalancer()
    },
    settings: clinicSettings
  };
}

function broadcast(event = 'queue_update') {
  const state = dashboard();
  io.emit(event, state);
  io.emit('queue_update', state);
}

function scheduleAutoSkip(patient) {
  clearAutoSkip(patient.id);

  patient.autoSkipAt = new Date(Date.now() + AUTO_SKIP_MS).toISOString();

  const timer = setTimeout(() => {
    const latest = patients.find(p => p.id === patient.id);
    if (!latest || latest.status !== 'called') return;

    latest.status = 'skipped';
    latest.notArrivedAt = now();
    latest.events.push('Auto skipped after arrival countdown expired');

    const d = doctors.find(x => x.currentPatientId === latest.id);
    if (d) d.currentPatientId = null;

    broadcast();

    emitVoice('autoSkip', {
      tokenNumber: latest.tokenNumber,
      name: latest.name,
      room: d?.room,
      doctorName: d?.name
    });
  }, AUTO_SKIP_MS);

  autoSkipTimers.set(patient.id, timer);
}

/* HEALTH ROUTES */
app.get('/', (_, res) => {
  res.send('QueueCure API running');
});

app.get('/api/queue', (_, res) => {
  res.json(dashboard());
});

app.get('/api/state', (_, res) => {
  res.json(dashboard());
});

/* SETTINGS */
app.patch('/api/settings', (req, res) => {
  const { voiceLang, privacyMode, silentMode } = req.body;

  if (voiceLang) clinicSettings.voiceLang = voiceLang;
  if (typeof privacyMode === 'boolean') clinicSettings.privacyMode = privacyMode;
  if (typeof silentMode === 'boolean') clinicSettings.silentMode = silentMode;

  broadcast();
  res.json(dashboard());
});

/* RESET */
app.post('/api/reset', (_, res) => {
  autoSkipTimers.forEach(t => clearTimeout(t));
  autoSkipTimers.clear();

  tokenSeq = 1;
  patients = [];
  doctors.forEach(d => (d.currentPatientId = null));
  completedDurations = [7, 8, 6, 9, 7];

  broadcast();
  res.json(dashboard());
});

/* DEMO DATA */
app.post('/api/demo', (_, res) => {
  patients = [];
  tokenSeq = 1;
  doctors.forEach(d => (d.currentPatientId = null));

  [
    'Priya|General Checkup|Normal',
    'Ramya|Back Pain|Normal',
    'Anita|Child Consultation|Normal',
    'Lava|Joint Pain|Urgent',
    'Meena|Skin Allergy|Normal',
    'Karthik|Follow Up|Normal'
  ].forEach(row => {
    const [name, reason, urgency] = row.split('|');
    const d = chooseDoctor(reason, urgency);

    if (d) {
      patients.push({
        id: id('p'),
        tokenNumber: token(),
        name,
        familyCount: 1,
        reason,
        urgency,
        doctorId: d.id,
        status: 'waiting',
        createdAt: now(),
        events: [`Added and routed to ${d.name}`]
      });
    }
  });

  broadcast();
  res.json(dashboard());
});

/* DOCTORS */
app.post('/api/doctors', (req, res) => {
  const { name, room, specialist } = req.body;

  if (!name || !room || !specialist) {
    return res.status(400).json({ error: 'Doctor name, room and specialist required' });
  }

  doctors.push({
    id: id('d'),
    name,
    room,
    specialist,
    available: true,
    currentPatientId: null
  });

  broadcast();
  res.json(dashboard());
});

app.patch('/api/doctors/:id/toggle', (req, res) => {
  const d = doctors.find(x => x.id === req.params.id);
  if (!d) return res.status(404).json({ error: 'Doctor not found' });

  d.available = !d.available;

  let reassigned = 0;

  if (!d.available) {
    patients
      .filter(p => p.doctorId === d.id && p.status === 'waiting')
      .sort(sortQueue)
      .forEach(p => {
        const nextDoctor = chooseDoctor(p.reason, p.urgency);

        if (nextDoctor && nextDoctor.id !== d.id) {
          p.doctorId = nextDoctor.id;
          p.events.push(`Auto-reassigned from ${d.name} to ${nextDoctor.name} because doctor became unavailable`);
          reassigned++;
        }
      });
  }

  broadcast();

  if (reassigned) {
    emitVoice('reassigned', { count: reassigned, doctorName: d.name });
  }

  res.json({ ...dashboard(), reassigned });
});

/* PATIENTS */
app.post('/api/patients', (req, res) => {
  const { name, reason = 'General Checkup', urgency = 'Normal', avg = 7, familyCount = 1 } = req.body;

  if (!name) return res.status(400).json({ error: 'Patient name required' });

  const d = chooseDoctor(reason, urgency);
  if (!d) return res.status(400).json({ error: 'No available doctors' });

  const p = {
    id: id('p'),
    tokenNumber: token(),
    name,
    familyCount: Number(familyCount) || 1,
    reason,
    urgency,
    doctorId: d.id,
    status: 'waiting',
    createdAt: now(),
    avgInput: Number(avg) || 7,
    events: [`AI routed to ${d.name} (${d.specialist})`]
  };

  patients.push(p);
  broadcast();

  res.json({ ok: true, patient: p, state: dashboard() });
});

/* QUEUE */
app.post('/api/queue/call-next/:doctorId', (req, res) => {
  const d = doctors.find(x => x.id === req.params.doctorId);

  if (!d) return res.status(404).json({ error: 'Doctor not found' });
  if (!d.available) return res.status(400).json({ error: 'Doctor unavailable' });
  if (activeForDoctor(d.id)) return res.status(400).json({ error: 'Doctor already serving patient' });

  const next = waitingForDoctor(d.id)[0];
  if (!next) return res.status(400).json({ error: 'No patients waiting for this doctor' });

  next.status = 'called';
  next.calledAt = now();
  d.currentPatientId = next.id;
  next.events.push('Called to doctor room');

  scheduleAutoSkip(next);
  broadcast();

  emitVoice('call', {
    tokenNumber: next.tokenNumber,
    name: next.name,
    doctorName: d.name,
    room: d.room
  });

  res.json(dashboard());
});

app.post('/api/queue/arrived', (req, res) => {
  const { tokenNumber } = req.body;

  if (!tokenNumber) return res.status(400).json({ error: 'Token number required' });

  const p = patients.find(x => x.tokenNumber.toLowerCase() === String(tokenNumber).toLowerCase());

  if (!p) return res.status(404).json({ error: 'Patient not found' });
  if (p.status !== 'called') return res.status(400).json({ error: 'Patient must be called before arrival confirmation' });

  clearAutoSkip(p.id);

  p.status = 'arrived';
  p.autoSkipAt = null;
  p.arrivedAt = now();
  p.events.push('Patient arrival confirmed from waiting room');

  const d = doctors.find(x => x.id === p.doctorId);
  if (d) d.currentPatientId = p.id;

  broadcast();

  emitVoice('arrived', {
    tokenNumber: p.tokenNumber,
    name: p.name,
    doctorName: d?.name,
    room: d?.room || 'doctor room'
  });

  res.json(dashboard());
});

app.post('/api/queue/not-arrived/:id', (req, res) => {
  const p = patients.find(
    x => x.id === req.params.id || x.tokenNumber.toLowerCase() === req.params.id.toLowerCase()
  );

  if (!p) return res.status(404).json({ error: 'Patient not found' });

  clearAutoSkip(p.id);

  p.status = 'skipped';
  p.autoSkipAt = null;
  p.notArrivedAt = now();
  p.events.push('Marked not arrived from waiting room arrival panel');

  const d = doctors.find(x => x.currentPatientId === p.id);
  if (d) d.currentPatientId = null;

  broadcast();

  emitVoice('notArrived', {
    tokenNumber: p.tokenNumber,
    name: p.name
  });

  res.json(dashboard());
});

app.post('/api/queue/recall/:id', (req, res) => {
  const p = patients.find(x => x.id === req.params.id);

  if (!p) return res.status(404).json({ error: 'Patient not found' });

  clearAutoSkip(p.id);

  p.autoSkipAt = null;
  p.status = 'waiting';
  p.createdAt = now();
  p.events.push('Recalled into queue');

  broadcast();
  res.json(dashboard());
});

app.post('/api/queue/complete/:id', (req, res) => {
  const p = patients.find(x => x.id === req.params.id);

  if (!p) return res.status(404).json({ error: 'Patient not found' });

  clearAutoSkip(p.id);

  const duration = Math.max(1, elapsedMinutes(p.arrivedAt || p.calledAt) || Number(p.avgInput) || avgConsult());

  p.autoSkipAt = null;
  p.status = 'completed';
  p.completedAt = now();
  p.consultationDuration = duration;
  p.events.push(`Completed in ${duration} mins`);

  completedDurations.push(duration);
  if (completedDurations.length > 12) completedDurations.shift();

  const d = doctors.find(x => x.currentPatientId === p.id);
  if (d) d.currentPatientId = null;

  broadcast();

  emitVoice('complete', {
    tokenNumber: p.tokenNumber,
    name: p.name
  });

  res.json(dashboard());
});

app.post('/api/queue/transfer/:patientId/:doctorId', (req, res) => {
  const p = patients.find(x => x.id === req.params.patientId);
  const d = doctors.find(x => x.id === req.params.doctorId);

  if (!p || !d) return res.status(404).json({ error: 'Patient or doctor not found' });
  if (!d.available) return res.status(400).json({ error: 'Doctor unavailable' });

  clearAutoSkip(p.id);

  p.autoSkipAt = null;
  p.doctorId = d.id;
  p.status = 'waiting';
  p.events.push(`Transferred to ${d.name}`);

  broadcast();

  res.json(dashboard());
});

/* SOCKET */
io.on('connection', socket => {
  socket.emit('queue_update', dashboard());
});

server.listen(PORT, () => {
  console.log(`QueueCure API running on port ${PORT}`);
});