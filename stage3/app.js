const byId = (id) => document.getElementById(id);
const matrix = byId('request-matrix');
const cells = [];
const fragment = document.createDocumentFragment();
for (let index = 0; index < 1000; index++) {
  const cell = document.createElement('span');
  cell.className = 'request-cell';
  cell.dataset.result = 'waiting';
  fragment.append(cell);
  cells.push(cell);
}
matrix.append(fragment);

const format = (number) => Number(number).toLocaleString('en-US');
const milliseconds = (value) => value === null || value === undefined ? '—' : `${format(Math.round(value))} ms`;
const stageNames = {
  idle: 'آماده برای تست', preparing: 'در حال آماده‌سازی', racing: 'رقابت در جریان',
  checkout: 'ثبت سفارش برندگان', verifying: 'بررسی دیتابیس',
  passed: 'آزمون تأیید شد', failed: 'آزمون ناموفق',
};
let lastState = null;
const setText = (id, value) => { byId(id).textContent = String(value); };

function render(state) {
  if (!state || !Array.isArray(state.seats) || state.seats.length !== 1000) return;
  lastState = state;
  document.body.dataset.phase = state.phase;
  setText('run-state-label', stageNames[state.phase] ?? 'وضعیت نامشخص');
  setText('step-message', state.phase === 'failed' && state.error ? state.error : state.message);
  setText('run-reference', state.runId ? `RUN ${state.runId.slice(0, 8).toUpperCase()}` : 'STANDBY MODE');
  setText('won-number', format(state.won));
  setText('lost-number', format(state.lost));
  setText('done-number', format(state.completed));
  setText('done-percent', `${(state.completed / 10).toFixed(1).replace(/\.0$/, '')}%`);
  setText('matrix-progress', format(state.completed));
  setText('won-detail', state.phase === 'passed' ? 'تأیید دیتابیس ✓' : 'تا زمان تأیید، موقت');
  byId('progress-fill').style.width = `${state.completed / 10}%`;
  setText('rps-value', state.rps === null ? '—' : format(Math.round(state.rps)));
  setText('latency-p50', milliseconds(state.p50));
  setText('latency-p95', milliseconds(state.p95));
  setText('latency-p99', milliseconds(state.p99));
  setText('peak-value', state.peakInFlight === null ? '—' : String(state.peakInFlight));
  if (state.concurrency !== null) setText('config-concurrency', state.concurrency);
  for (let i = 0; i < 1000; i++) {
    if (cells[i].dataset.result !== state.seats[i]) cells[i].dataset.result = state.seats[i];
  }
  const running = ['preparing', 'racing', 'checkout', 'verifying'].includes(state.phase);
  byId('run-button').disabled = running;
  byId('focus-run-button').disabled = running;
  setText('run-button-label', running ? 'آزمون در حال اجراست...' : state.phase === 'idle' ? 'شروع آزمون واقعی' : 'اجرای آزمون جدید');
  setText('control-footnote', running ? 'پیشرفت زنده است؛ لطفاً پنجره ترمینال را نبندید.' : state.phase === 'failed' ? 'تست ناموفق قابل تکرار است؛ Docker و لاگ‌ها را بررسی کنید.' : 'فقط localhost · دیتابیس آزمایشی مستقل');
  const card = byId('verification-card');
  card.dataset.status = state.phase;
  if (state.phase === 'passed') {
    setText('verification-title', '۱۰ سفارش. ۱۰ بلیت. صفر فروش اضافه.');
    setText('verification-description', 'رکوردهای رزرو، سفارش، بلیت و پرداخت شبیه‌سازی‌شده مستقیماً در PostgreSQL تطبیق داده شدند.');
    setText('verification-status', 'DATABASE VERIFIED');
    setText('record-reference', state.result?.reportFile ?? 'POSTGRESQL CHECK PASSED');
  } else if (state.phase === 'failed') {
    setText('verification-title', 'این اجرای آزمایشی تأیید نشد');
    setText('verification-description', 'یک خطا رخ داده یا بررسی نهایی کامل نشده است. هیچ نتیجه موفقی ادعا نمی‌شود.');
    setText('verification-status', 'VERIFICATION FAILED');
    setText('record-reference', 'NO VALID REPORT');
  } else {
    setText('verification-title', 'منتظر تأیید دیتابیس');
    setText('verification-description', 'تا تأیید نهایی PostgreSQL، هیچ نتیجه‌ای به‌عنوان فروش موفق قطعی اعلام نمی‌شود.');
    setText('verification-status', 'NOT VERIFIED');
    setText('record-reference', '—');
  }
}

const focusButton = byId('focus-button');
function setFocus(enabled) {
  document.body.classList.toggle('focus-mode', enabled);
  focusButton.setAttribute('aria-pressed', String(enabled));
  focusButton.lastChild.textContent = enabled ? ' نمای کامل' : ' حالت ضبط';
}
focusButton.addEventListener('click', () => setFocus(!document.body.classList.contains('focus-mode')));
if (new URLSearchParams(location.search).get('focus') === '1') setFocus(true);

const startRace = async () => {
  const button = byId('run-button');
  button.disabled = true;
  byId('focus-run-button').disabled = true;
  try {
    const response = await fetch('/api/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.error ?? `HTTP ${response.status}`);
    }
  } catch (error) {
    setText('step-message', `شروع آزمون انجام نشد: ${error.message}`);
  } finally {
    if (!lastState || !['preparing', 'racing', 'checkout', 'verifying'].includes(lastState.phase)) {
      button.disabled = false;
      byId('focus-run-button').disabled = false;
    }
  }
};
byId('run-button').addEventListener('click', startRace);
byId('focus-run-button').addEventListener('click', startRace);

const connection = byId('connection-pill');
const events = new EventSource('/api/events');
events.addEventListener('open', () => {
  connection.dataset.connection = 'online';
  setText('connection-label', 'اتصال زنده');
});
events.addEventListener('snapshot', (event) => {
  try { render(JSON.parse(event.data)); }
  catch { setText('connection-label', 'داده نامعتبر'); }
});
events.addEventListener('error', () => {
  connection.dataset.connection = 'offline';
  setText('connection-label', 'اتصال قطع شد');
});
