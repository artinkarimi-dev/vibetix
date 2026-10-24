const $ = (id) => document.getElementById(id);
const displayNumber = new Intl.NumberFormat('en-US');
const totalRequests = 1000;
const totalSeats = 10;
const cells = [];
const seats = [...document.querySelectorAll('.seat-box')];
let busy = false;
let stream = null;
let countdownTimer = null;
let cancelled = false;
let shownWinners = 0;
let newestRows = [];
let generation = 0;

function initMatrix() {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < totalRequests; i++) {
    const item = document.createElement('span');
    item.className = 'matrix-cell';
    item.setAttribute('aria-hidden', 'true');
    cells.push(item);
    fragment.append(item);
  }
  $('request-matrix').append(fragment);
}
function updateNumbers(processed, passed, failed) {
  $('processed-value').textContent = displayNumber.format(processed);
  $('success-value').textContent = displayNumber.format(passed);
  $('failed-value').textContent = displayNumber.format(failed);
  $('matrix-count').textContent = `${String(processed).padStart(4, '0')} / 1000`;
  $('progress-fill').style.width = `${Math.min(100, Math.max(0, processed / totalRequests * 100))}%`;
  $('orbit-remaining').textContent = String(totalSeats - passed);
  document.querySelector('.orbit-center')?.classList.toggle('sold-out', passed === totalSeats);
}
function addLog(category, id, label) {
  newestRows.unshift({ category, id, label });
  newestRows = newestRows.slice(0, 3);
  const root = $('activity-log');
  root.replaceChildren();
  newestRows.forEach(({ category, id, label }) => {
    const row = document.createElement('div');
    row.className = 'log-entry';
    const kind = document.createElement('span');
    kind.className = `log-label ${category === 'success' ? 'log-success' : category === 'fail' ? 'log-fail' : 'log-neutral'}`;
    kind.textContent = category === 'success' ? 'PASS ✓' : category === 'fail' ? 'DENY ×' : 'SYSTEM';
    const info = document.createElement('span');
    info.textContent = id;
    const meta = document.createElement('span');
    meta.className = 'log-meta';
    meta.textContent = label;
    row.append(kind, info, meta);
    root.append(row);
  });
}
function showError(message) {
  const element = $('toast');
  element.textContent = message;
  element.hidden = false;
}
function clearError() { $('toast').hidden = true; }
function cleanup() {
  cancelled = true;
  generation++;
  if (stream) { stream.close(); stream = null; }
  // A pending countdown tick is allowed to resolve so cancellation can be checked.
  countdownTimer = null;
  $('countdown-overlay').hidden = true;
  busy = false;
  $('start-button').disabled = false;
  $('reset-button').disabled = false;
}
function reset() {
  cleanup();
  cancelled = false;
  cells.forEach((cell) => { cell.className = 'matrix-cell'; cell.removeAttribute('title'); });
  seats.forEach((seat) => { seat.classList.remove('taken'); seat.removeAttribute('title'); });
  shownWinners = 0;
  newestRows = [];
  updateNumbers(0, 0, 0);
  $('start-button').disabled = false;
  $('button-label').textContent = 'شروع رقابت ۱۰۰۰ نفره';
  $('reset-button').disabled = true;
  $('phase-label').textContent = 'آماده شروع';
  $('final-banner').hidden = true;
  $('invariant').classList.remove('complete');
  $('invariant-text').textContent = 'سرور آمادهٔ بررسی موجودی است';
  $('success-caption').textContent = 'فقط ۱۰ بلیت موجود';
  addLog('neutral', 'منتظر شروع آزمایش...', 'READY');
  clearError();
}
async function pause(ms) {
  await new Promise((resolve) => { countdownTimer = setTimeout(resolve, ms); });
}
async function countdown(myGeneration) {
  $('countdown-overlay').hidden = false;
  for (const number of ['۳', '۲', '۱']) {
    if (cancelled || myGeneration !== generation) return false;
    const node = $('countdown-number');
    node.textContent = number;
    node.style.animation = 'none';
    void node.offsetWidth;
    node.style.animation = '';
    await pause(380);
  }
  if (myGeneration === generation) $('countdown-overlay').hidden = true;
  return !cancelled && myGeneration === generation;
}
async function checkServer() {
  try {
    const response = await fetch('/api/demo/health', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Server offline');
    $('connection-pill').classList.remove('offline');
    $('connection-label').textContent = 'API متصل';
    $('start-button').disabled = busy;
    return true;
  } catch {
    $('connection-pill').classList.add('offline');
    $('connection-label').textContent = 'API قطع است';
    $('start-button').disabled = true;
    $('phase-label').textContent = 'اتصال به API برقرار نیست';
    return false;
  }
}
async function start() {
  if (busy) return;
  busy = true;
  $('start-button').disabled = true;
  if (!(await checkServer())) { busy = false; return; }
  reset();
  busy = true;
  cancelled = false;
  const myGeneration = ++generation;
  $('start-button').disabled = true;
  $('reset-button').disabled = false;
  $('button-label').textContent = 'رقابت در حال اجرا...';
  $('phase-label').textContent = 'ترافیک در حال ورود';
  if (!(await countdown(myGeneration)) || myGeneration !== generation) return;
  try {
    const response = await fetch('/api/demo/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(9000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'درخواست ناموفق بود');
    if (cancelled || myGeneration !== generation) return;
    $('phase-label').textContent = 'در حال پردازش ۱٬۰۰۰ درخواست';
    addLog('neutral', '۱٬۰۰۰ درخواست به موتور رزرو رسید', 'START');
    stream = new EventSource(data.streamUrl);
    stream.addEventListener('batch', (event) => {
      if (cancelled || myGeneration !== generation) return;
      const batch = JSON.parse(event.data);
      updateNumbers(batch.processed, batch.passed, batch.failed);
      for (let i = 0; i < batch.decisions.length; i++) {
        const entry = batch.decisions[i];
        const cell = cells[batch.from + i];
        if (!cell) continue;
        cell.className = `matrix-cell ${entry.accepted ? 'accepted' : 'rejected'}`;
        if (entry.accepted) {
          const seat = seats[shownWinners++];
          if (seat) { seat.classList.add('taken'); seat.title = `Reserved by ${entry.id}`; }
          addLog('success', entry.id, 'RESERVED');
        } else if (batch.from + i === 0 || (batch.from + i) % 175 === 0) {
          addLog('fail', entry.id, 'SOLD OUT');
        }
      }
      $('success-caption').textContent = `${displayNumber.format(totalSeats - batch.passed)} بلیت باقی‌مانده`;
    });
    stream.addEventListener('complete', async (event) => {
      const result = JSON.parse(event.data);
      stream?.close();
      stream = null;
      if (cancelled || myGeneration !== generation) return;
      try {
      // Verify against independently fetched server-side aggregate.
      const reportResponse = await fetch(`/api/demo/runs/${data.id}`, { cache: 'no-store' });
      const report = await reportResponse.json();
      if (!reportResponse.ok || !result.invariant || report.passed !== 10 || report.failed !== 990 || report.remaining !== 0 || report.uniqueRequests !== 1000) {
        throw new Error('نتیجهٔ سرور با کنترل موجودی مطابقت ندارد');
      }
      $('final-banner').hidden = false;
      $('phase-label').textContent = 'پردازش کامل شد';
      $('invariant').classList.add('complete');
      $('invariant-text').textContent = '۱۰ رزرو، ۰ فروشِ بیشتر از موجودی ✓';
      $('button-label').textContent = 'اجرای دوباره آزمایش';
      addLog('success', 'NO OVERSELL — stock 0 / 10', 'VERIFIED');
      busy = false;
      $('start-button').disabled = false;
      $('reset-button').disabled = false;
      } catch (error) {
        if (myGeneration !== generation) return;
        cleanup();
        $('phase-label').textContent = 'تأیید نتیجه ناموفق بود';
        showError(error instanceof Error ? error.message : 'بررسی نتیجه ناموفق بود');
      }
    });
    stream.onerror = () => {
      if (cancelled || myGeneration !== generation) return;
      cleanup();
      $('phase-label').textContent = 'اتصال جریان داده قطع شد';
      $('button-label').textContent = 'اجرای دوباره آزمایش';
      showError('جریان زنده قطع شد؛ دوباره امتحان کن.');
    };
  } catch (error) {
    if (cancelled || myGeneration !== generation) return;
    cleanup();
    $('phase-label').textContent = 'اجرای آزمایش ناموفق بود';
    $('button-label').textContent = 'تلاش دوباره';
    showError(error instanceof Error ? error.message : 'خطای غیرمنتظره');
  }
}
$('focus-button').addEventListener('click', () => {
  const active = document.body.classList.toggle('focus-mode');
  $('focus-button').setAttribute('aria-pressed', String(active));
  $('focus-label').textContent = active ? 'نمای معمولی' : 'حالت ضبط';
});
$('start-button').addEventListener('click', start);
$('reset-button').addEventListener('click', reset);
initMatrix();
updateNumbers(0, 0, 0);
checkServer();
