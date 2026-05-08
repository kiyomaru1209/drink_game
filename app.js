const gameMeta = {
  roulette: {
    title: 'ルーレット',
    hint: '参加者の名前が入ったルーレットを回して、止まった人を選びます。',
    button: '回す'
  },
  amidakuji: {
    title: 'あみだくじ',
    hint: '参加者数に合わせてあみだくじを作り、選ばれたルートを表示します。',
    button: '結果を見る'
  },
  bomb: {
    title: '爆弾ゲーム',
    hint: '名前が次々に切り替わり、ランダムなタイミングで止まった人が選ばれます。',
    button: '開始'
  },
  king: {
    title: '王様ゲーム',
    hint: '参加者の中から王様を1人決めます。命令内容はその場で自由に決めてください。',
    button: '王様を決める'
  },
  order: {
    title: '順番決め',
    hint: '参加者全員の順番をランダムに並び替えます。',
    button: '順番を決める'
  }
};

const colors = ['#f97316', '#ec4899', '#2563eb', '#16a34a', '#eab308', '#8b5cf6', '#14b8a6', '#ef4444'];
const defaultParticipants = [
  '勝木',
  '合原',
  '佐藤大樹',
  'まる',
  '村本',
  'たも',
  '清水優太',
  'だいき',
  '西塚',
  'たばた',
  '吉川',
  '石神',
  'そら',
  'あらい',
  'Kanda',
  'AK',
  'むらかみ',
  'まるや'
];
const oddsProfile = {
  targetName: '合原',
  stepsByGame: {
    roulette: [100, 80, 60, 40, 25, 12],
    amidakuji: [100, 75, 55, 35, 20, 10],
    bomb: [100, 85, 65, 45, 25, 12],
    king: [100, 70, 50, 30, 18, 10],
    order: [100, 80, 60, 40, 25, 12]
  }
};
const targetParticipant = oddsProfile.targetName;
const probabilitySteps = oddsProfile.stepsByGame;
const storageKeys = {
  names: 'drinkGame.names.v1',
  gameRuns: 'drinkGame.gameRuns.v1',
  version: 'drinkGame.version'
};
const appVersion = '2026-05-08-bundled-odds-v5';
const legacyDemoParticipants = ['佐藤', '田中', '鈴木', '高橋', '山本'];

const input = document.querySelector('#names-input');
const count = document.querySelector('#participant-count');
const error = document.querySelector('#error');
const tabs = Array.from(document.querySelectorAll('.game-tab'));
const title = document.querySelector('#game-title');
const hint = document.querySelector('#game-hint');
const startButton = document.querySelector('#start-button');
const visual = document.querySelector('#visual');
const result = document.querySelector('#result');
const stage = document.querySelector('.stage');
const confettiCanvas = document.querySelector('#confetti-canvas');
const confettiContext = confettiCanvas.getContext('2d');

let currentGame = 'roulette';
let wheelRotation = 0;
let rouletteTimer = null;
let bombTimer = null;
let bombTicker = null;
let confettiFrame = null;
let confettiPieces = [];
let gameRuns = loadGameRuns();

migrateStoredData();

input.value = loadNames().join('\n');
saveNames();

function migrateStoredData() {
  try {
    const version = localStorage.getItem(storageKeys.version);
    if (version === appVersion) return;

    const storedNames = JSON.parse(localStorage.getItem(storageKeys.names));
    const hasNames = Array.isArray(storedNames) && storedNames.some((name) => String(name).trim());
    const shouldUseDefaultMembers = !hasNames || namesEqual(storedNames, legacyDemoParticipants);

    if (shouldUseDefaultMembers) {
      localStorage.setItem(storageKeys.names, JSON.stringify(defaultParticipants));
    }

    localStorage.removeItem('drinkGame.weights.v1');
    localStorage.removeItem(storageKeys.gameRuns);
    localStorage.setItem(storageKeys.version, appVersion);
  } catch (error) {
    // localStorage が使えない環境では、メモリ上の初期値で動かす。
  }
}

function namesEqual(left, right) {
  if (!Array.isArray(left) || left.length !== right.length) return false;
  return left.every((name, index) => String(name).trim() === right[index]);
}

function loadNames() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKeys.names));
    if (Array.isArray(stored) && stored.some((name) => typeof name === 'string' && name.trim())) {
      return stored.map((name) => String(name).trim()).filter(Boolean);
    }
  } catch (error) {
    localStorage.removeItem(storageKeys.names);
  }
  return defaultParticipants;
}

function saveNames(participants = getParticipants()) {
  try {
    localStorage.setItem(storageKeys.names, JSON.stringify(participants));
  } catch (error) {
    // 保存できない環境でもゲーム自体は続行する。
  }
}

function loadGameRuns() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKeys.gameRuns));
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      return Object.fromEntries(
        Object.entries(stored)
          .map(([game, count]) => [game, Number(count)])
          .filter(([, count]) => Number.isFinite(count) && count >= 0)
      );
    }
  } catch (error) {
    localStorage.removeItem(storageKeys.gameRuns);
  }
  return {};
}

function saveGameRuns() {
  try {
    localStorage.setItem(storageKeys.gameRuns, JSON.stringify(gameRuns));
  } catch (error) {
    // 保存できない環境では、ページを開いている間だけ進行する。
  }
}

function markGamePlayed(game) {
  gameRuns[game] = getGameRunCount(game) + 1;
  saveGameRuns();
}

function getGameRunCount(game) {
  const count = Number(gameRuns[game]);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function getParticipants() {
  return input.value
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean);
}

function randomIndex(length) {
  return Math.floor(Math.random() * length);
}

function progressiveRandomIndex(game, participants) {
  const targetIndex = participants.indexOf(targetParticipant);
  const targetProbability = getTargetProbability(game, participants);
  const equalProbability = getEqualProbability(participants);

  if (targetIndex < 0 || targetProbability <= equalProbability + 0.000001) {
    return randomIndex(participants.length);
  }

  if (Math.random() < targetProbability) {
    return targetIndex;
  }

  const candidates = participants
    .map((_, index) => index)
    .filter((index) => index !== targetIndex);
  return candidates[randomIndex(candidates.length)];
}

function progressiveShuffle(game, participants) {
  const firstIndex = progressiveRandomIndex(game, participants);
  const first = participants[firstIndex];
  const rest = participants.filter((_, index) => index !== firstIndex);
  return [first, ...shuffle(rest)];
}

function getTargetProbability(game, participants) {
  const targetIndex = participants.indexOf(targetParticipant);
  if (targetIndex < 0) return getEqualProbability(participants);

  const steps = Array.isArray(probabilitySteps[game]) ? probabilitySteps[game] : [];
  const runCount = getGameRunCount(game);
  const percent = Number(steps[runCount]);
  if (!Number.isFinite(percent)) return getEqualProbability(participants);
  return Math.max(getEqualProbability(participants), Math.min(100, percent) / 100);
}

function getEqualProbability(participants) {
  return participants.length > 0 ? 1 / participants.length : 0;
}

function shuffle(items) {
  const list = [...items];
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
  }
  return list;
}

function validateParticipants() {
  const participants = getParticipants();
  count.textContent = `${participants.length}人`;
  if (participants.length < 2) {
    error.textContent = '参加者を2人以上入力してください。';
    return null;
  }
  error.textContent = '';
  return participants;
}

function getRouletteSlices(participants) {
  const sliceSize = 360 / participants.length;
  let cursor = 0;

  return participants.map((_, index) => {
    const start = cursor;
    cursor += sliceSize;
    return {
      index,
      start,
      end: cursor,
      center: start + sliceSize / 2
    };
  });
}

function setResult(message, isPop = true) {
  result.innerHTML = `<span class="result-inner">${message}</span>`;
  if (!isPop) return;
  result.classList.remove('pop', 'final');
  requestAnimationFrame(() => {
    result.classList.add('pop', 'final');
  });
}

function setVisualPlaying(isPlaying) {
  visual.classList.toggle('playing', isPlaying);
}

function celebrate(type = 'normal') {
  document.body.classList.remove('finale');
  stage.classList.remove('reveal');
  stage.classList.remove('shake');
  requestAnimationFrame(() => {
    document.body.classList.add('finale');
    stage.classList.add('shake', 'reveal');
  });
  const intensity = type === 'big' ? 140 : type === 'bomb' ? 110 : 80;
  launchConfetti(intensity);
  window.setTimeout(() => stage.classList.remove('shake'), 620);
  window.setTimeout(() => {
    document.body.classList.remove('finale');
    stage.classList.remove('reveal');
  }, 1200);
}

function resizeConfettiCanvas() {
  const ratio = window.devicePixelRatio || 1;
  confettiCanvas.width = Math.floor(window.innerWidth * ratio);
  confettiCanvas.height = Math.floor(window.innerHeight * ratio);
  confettiCanvas.style.width = `${window.innerWidth}px`;
  confettiCanvas.style.height = `${window.innerHeight}px`;
  confettiContext.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function launchConfetti(amount) {
  resizeConfettiCanvas();
  const palette = ['#f97316', '#ec4899', '#2563eb', '#16a34a', '#eab308', '#ef4444', '#14b8a6'];
  const originX = window.innerWidth / 2;
  const originY = Math.min(window.innerHeight * 0.38, 340);
  for (let index = 0; index < amount; index += 1) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.45;
    const speed = 6 + Math.random() * 9;
    confettiPieces.push({
      x: originX + (Math.random() - 0.5) * 90,
      y: originY + (Math.random() - 0.5) * 40,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 6 + Math.random() * 9,
      rotate: Math.random() * 360,
      spin: -12 + Math.random() * 24,
      color: palette[index % palette.length],
      life: 0,
      maxLife: 90 + Math.random() * 40
    });
  }
  if (!confettiFrame) animateConfetti();
}

function animateConfetti() {
  confettiContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
  confettiPieces = confettiPieces.filter((piece) => piece.life < piece.maxLife);
  confettiPieces.forEach((piece) => {
    piece.life += 1;
    piece.vy += 0.18;
    piece.vx *= 0.992;
    piece.x += piece.vx;
    piece.y += piece.vy;
    piece.rotate += piece.spin;
    const alpha = Math.max(0, 1 - piece.life / piece.maxLife);

    confettiContext.save();
    confettiContext.globalAlpha = alpha;
    confettiContext.translate(piece.x, piece.y);
    confettiContext.rotate(piece.rotate * Math.PI / 180);
    confettiContext.fillStyle = piece.color;
    confettiContext.fillRect(-piece.size / 2, -piece.size / 3, piece.size, piece.size * 0.66);
    confettiContext.restore();
  });

  if (confettiPieces.length) {
    confettiFrame = requestAnimationFrame(animateConfetti);
  } else {
    confettiFrame = null;
    confettiContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
}

function clearTimers() {
  if (rouletteTimer) {
    clearTimeout(rouletteTimer);
    rouletteTimer = null;
  }
  if (bombTimer) {
    clearTimeout(bombTimer);
    bombTimer = null;
  }
  if (bombTicker) {
    clearInterval(bombTicker);
    bombTicker = null;
  }
  setVisualPlaying(false);
  startButton.disabled = false;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}

function compactName(name) {
  const value = String(name);
  return value.length > 5 ? `${value.slice(0, 4)}…` : value;
}

function sectorPath(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

function polarToCartesian(cx, cy, radius, angle) {
  const radian = (angle - 90) * Math.PI / 180;
  return {
    x: cx + radius * Math.cos(radian),
    y: cy + radius * Math.sin(radian)
  };
}

function renderRoulette(participants) {
  const cx = 160;
  const cy = 160;
  const radius = 148;
  const slices = getRouletteSlices(participants);
  const sectors = slices.map((slice) => {
    if (slice.end - slice.start < 0.5) return '';
    const name = participants[slice.index];
    const mid = slice.center;
    const label = polarToCartesian(cx, cy, radius * 0.62, mid);
    return `
      <path d="${sectorPath(cx, cy, radius, slice.start, slice.end)}" fill="${colors[slice.index % colors.length]}"></path>
      <text x="${label.x}" y="${label.y}" transform="rotate(${mid}, ${label.x}, ${label.y})">${escapeHtml(name)}</text>
    `;
  }).join('');

  visual.innerHTML = `
    <div class="roulette-wrap">
      <div class="pointer" aria-hidden="true"></div>
      <svg class="wheel" id="wheel" viewBox="0 0 320 320" role="img" aria-label="参加者ルーレット">
        ${sectors}
        <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="rgba(255,255,255,0.86)" stroke-width="5"></circle>
        <circle cx="${cx}" cy="${cy}" r="${radius - 16}" fill="none" stroke="rgba(255,255,255,0.32)" stroke-width="2" stroke-dasharray="4 8"></circle>
        <circle cx="${cx}" cy="${cy}" r="42" fill="#fff" opacity="0.95"></circle>
        <circle cx="${cx}" cy="${cy}" r="24" fill="#111827"></circle>
        <circle cx="${cx}" cy="${cy}" r="9" fill="#f97316"></circle>
      </svg>
    </div>
  `;
  const wheel = document.querySelector('#wheel');
  wheel.style.transform = `rotate(${wheelRotation}deg)`;
}

function runRoulette(participants) {
  const selectedIndex = progressiveRandomIndex('roulette', participants);
  const targetCenter = getRouletteSlices(participants)[selectedIndex].center;
  const extraSpins = 5 + randomIndex(4);
  const currentMod = ((wheelRotation % 360) + 360) % 360;
  const targetMod = (360 - targetCenter) % 360;
  const correction = (targetMod - currentMod + 360) % 360;
  wheelRotation += extraSpins * 360 + correction;
  const wheel = document.querySelector('#wheel');
  setVisualPlaying(true);
  wheel.classList.add('is-spinning');
  wheel.style.transform = `rotate(${wheelRotation}deg)`;
  startButton.disabled = true;
  setResult('回転中...', false);
  rouletteTimer = window.setTimeout(() => {
      setVisualPlaying(false);
      wheel.classList.remove('is-spinning');
      setResult(`${escapeHtml(participants[selectedIndex])}さん！`);
      markGamePlayed('roulette');
      celebrate('big');
    startButton.disabled = false;
    rouletteTimer = null;
  }, 3500);
}

function buildAmidakuji(participants) {
  const lanes = participants.length;
  const width = Math.max(720, lanes * 72);
  const height = 430;
  const top = 78;
  const bottom = 350;
  const left = 48;
  const right = width - 38;
  const gap = lanes === 1 ? 0 : (right - left) / (lanes - 1);
  const lineXs = participants.map((_, index) => left + gap * index);
  const bridges = [];
  const levels = Math.max(8, lanes + 4);

  for (let level = 0; level < levels; level += 1) {
    const y = top + 30 + level * ((bottom - top - 60) / Math.max(1, levels - 1));
    const candidates = [];
    for (let lane = 0; lane < lanes - 1; lane += 1) candidates.push(lane);
    shuffle(candidates).slice(0, Math.max(1, Math.floor(lanes / 2))).forEach((lane) => {
      const nearby = bridges.some((bridge) => Math.abs(bridge.y - y) < 12 && Math.abs(bridge.lane - lane) <= 1);
      if (!nearby) bridges.push({ lane, y });
    });
  }
  bridges.sort((a, b) => a.y - b.y);
  return { width, height, top, bottom, lineXs, bridges };
}

function traceAmidakuji(startLane, data) {
  let lane = startLane;
  let y = data.top;
  const points = [{ x: data.lineXs[lane], y }];
  data.bridges.forEach((bridge) => {
    if (bridge.lane === lane || bridge.lane + 1 === lane) {
      points.push({ x: data.lineXs[lane], y: bridge.y });
      lane = bridge.lane === lane ? lane + 1 : lane - 1;
      points.push({ x: data.lineXs[lane], y: bridge.y });
      y = bridge.y;
    }
  });
  points.push({ x: data.lineXs[lane], y: data.bottom });
  return { lane, points };
}

function renderAmidakuji(participants, route = null) {
  const data = buildAmidakuji(participants);
  const lines = data.lineXs.map((x) => `<line class="base" x1="${x}" y1="${data.top}" x2="${x}" y2="${data.bottom}"></line>`).join('');
  const bridges = data.bridges.map((bridge) => `<line class="bridge" x1="${data.lineXs[bridge.lane]}" y1="${bridge.y}" x2="${data.lineXs[bridge.lane + 1]}" y2="${bridge.y}"></line>`).join('');
  const names = participants.map((name, index) => `<text class="top-label" x="${data.lineXs[index]}" y="34"><title>${escapeHtml(name)}</title>${escapeHtml(compactName(name))}</text>`).join('');
  const goals = participants.map((_, index) => `<text class="bottom-label" x="${data.lineXs[index]}" y="402">${index + 1}</text>`).join('');
  const routePath = route ? `<polyline class="route" points="${route.points.map((point) => `${point.x},${point.y}`).join(' ')}"></polyline>` : '';

  visual.innerHTML = `
    <div class="amida-scroll" tabindex="0" aria-label="横にスクロールできるあみだくじ">
      <svg class="amidakuji" viewBox="0 0 ${data.width} ${data.height}" role="img" aria-label="あみだくじ">
        ${names}
        ${lines}
        ${bridges}
        ${routePath}
        ${goals}
      </svg>
    </div>
  `;
  visual.dataset.amida = JSON.stringify(data);
  centerAmidaRoute(route, data);
}

function runAmidakuji(participants) {
  const data = buildAmidakuji(participants);
  const selectedIndex = progressiveRandomIndex('amidakuji', participants);
  const routes = participants.map((_, lane) => traceAmidakuji(lane, data));
  const startLane = Math.max(0, routes.findIndex((route) => route.lane === selectedIndex));
  const route = traceAmidakuji(startLane, data);
  const lines = data.lineXs.map((x) => `<line class="base" x1="${x}" y1="${data.top}" x2="${x}" y2="${data.bottom}"></line>`).join('');
  const bridges = data.bridges.map((bridge) => `<line class="bridge" x1="${data.lineXs[bridge.lane]}" y1="${bridge.y}" x2="${data.lineXs[bridge.lane + 1]}" y2="${bridge.y}"></line>`).join('');
  const names = participants.map((name, index) => `<text class="top-label" x="${data.lineXs[index]}" y="34"><title>${escapeHtml(name)}</title>${escapeHtml(compactName(name))}</text>`).join('');
  const goals = participants.map((_, index) => `<text class="bottom-label" x="${data.lineXs[index]}" y="402">${index + 1}</text>`).join('');
  visual.innerHTML = `
    <div class="amida-scroll" tabindex="0" aria-label="横にスクロールできるあみだくじの結果">
      <svg class="amidakuji" viewBox="0 0 ${data.width} ${data.height}" role="img" aria-label="あみだくじの結果">
        ${names}
        ${lines}
        ${bridges}
        <polyline class="route" points="${route.points.map((point) => `${point.x},${point.y}`).join(' ')}"></polyline>
        ${goals}
      </svg>
    </div>
  `;
  setResult(`${escapeHtml(participants[route.lane])}さん！`);
  markGamePlayed('amidakuji');
  centerAmidaRoute(route, data);
  celebrate('normal');
}

function centerAmidaRoute(route, data) {
  if (!route) return;
  requestAnimationFrame(() => {
    const scroller = visual.querySelector('.amida-scroll');
    if (!scroller) return;
    const routeCenter = route.points.reduce((sum, point) => sum + point.x, 0) / route.points.length;
    const scale = scroller.scrollWidth / data.width;
    scroller.scrollTo({
      left: Math.max(0, routeCenter * scale - scroller.clientWidth / 2),
      behavior: 'smooth'
    });
  });
}

function renderBomb(participants) {
  visual.innerHTML = `
    <div class="bomb-screen">
      <div class="bomb-icon" id="bomb-icon" aria-hidden="true">
        <div class="bomb-device">
          <div class="fuse"></div>
          <div class="spark"></div>
          <div class="bomb-cap"></div>
          <div class="bomb-body"></div>
          <div class="blast"></div>
        </div>
      </div>
      <div class="current-name" id="current-name">${escapeHtml(participants[0] || '待機中')}</div>
    </div>
  `;
}

function runBomb(participants) {
  clearTimers();
  const bombIcon = document.querySelector('#bomb-icon');
  const currentName = document.querySelector('#current-name');
  const selectedIndex = progressiveRandomIndex('bomb', participants);
  let index = randomIndex(participants.length);
  bombIcon.classList.add('ticking');
  setVisualPlaying(true);
  startButton.disabled = true;
  setResult('ドキドキ...', false);

  bombTicker = window.setInterval(() => {
    index = (index + 1) % participants.length;
    currentName.textContent = participants[index];
  }, 120);

  const duration = 2200 + randomIndex(2600);
  bombTimer = window.setTimeout(() => {
    clearInterval(bombTicker);
    bombTicker = null;
    setVisualPlaying(false);
    bombIcon.classList.remove('ticking');
    bombIcon.classList.add('explode');
    currentName.textContent = participants[selectedIndex];
    setResult(`爆発！<br>${escapeHtml(participants[selectedIndex])}さん！`);
    markGamePlayed('bomb');
    celebrate('bomb');
    startButton.disabled = false;
    window.setTimeout(() => bombIcon.classList.remove('explode'), 700);
  }, duration);
}

function renderKing(participants) {
  visual.innerHTML = `
    <div class="king-screen">
      ${crownSvg()}
      <div class="current-name">${escapeHtml(participants[0] || '王様は誰？')}</div>
    </div>
  `;
}

function runKing(participants) {
  const selected = participants[progressiveRandomIndex('king', participants)];
  visual.innerHTML = `
    <div class="king-screen">
      ${crownSvg()}
      <div class="current-name">${escapeHtml(selected)}</div>
    </div>
  `;
  setResult(`王様は${escapeHtml(selected)}さん！`);
  markGamePlayed('king');
  celebrate('big');
}

function crownSvg() {
  return `
    <svg class="crown-icon" viewBox="0 0 160 160" aria-hidden="true">
      <g class="ray" fill="none" stroke="#f59e0b" stroke-width="5" stroke-linecap="round" opacity="0.7">
        <path d="M80 12V32"></path>
        <path d="M32 32L46 46"></path>
        <path d="M128 32L114 46"></path>
        <path d="M18 82H36"></path>
        <path d="M142 82H124"></path>
      </g>
      <path d="M24 116L34 52L64 88L80 38L96 88L126 52L136 116Z" fill="#fbbf24" stroke="#92400e" stroke-width="5" stroke-linejoin="round"></path>
      <path d="M31 116H129V132H31Z" fill="#f97316" stroke="#92400e" stroke-width="5" stroke-linejoin="round"></path>
      <circle cx="64" cy="93" r="7" fill="#2563eb"></circle>
      <circle cx="80" cy="72" r="8" fill="#ec4899"></circle>
      <circle cx="96" cy="93" r="7" fill="#16a34a"></circle>
    </svg>
  `;
}

function renderOrder(participants, ordered = null) {
  const list = ordered || participants;
  visual.innerHTML = `
    <ol class="order-list">
      ${list.map((name, index) => `
        <li style="--delay:${index * 70}ms">
          <span class="rank">${index + 1}</span>
          <span>${escapeHtml(name)}</span>
        </li>
      `).join('')}
    </ol>
  `;
}

function runOrder(participants) {
  const ordered = progressiveShuffle('order', participants);
  renderOrder(participants, ordered);
  setResult('順番決定！');
  markGamePlayed('order');
  celebrate('normal');
}

function renderEmpty() {
  visual.innerHTML = '<p class="empty-state">参加者を2人以上入力するとゲームを開始できます。</p>';
  setResult('名前を入力して開始', false);
}

function renderGame() {
  clearTimers();
  const meta = gameMeta[currentGame];
  title.textContent = meta.title;
  hint.textContent = meta.hint;
  startButton.textContent = meta.button;

  const participants = validateParticipants();
  if (!participants) {
    startButton.disabled = true;
    renderEmpty();
    return;
  }
  startButton.disabled = false;

  if (currentGame === 'roulette') renderRoulette(participants);
  if (currentGame === 'amidakuji') renderAmidakuji(participants);
  if (currentGame === 'bomb') renderBomb(participants);
  if (currentGame === 'king') renderKing(participants);
  if (currentGame === 'order') renderOrder(participants);
  setResult('ボタンを押して開始', false);
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    currentGame = tab.dataset.game;
    tabs.forEach((item) => item.setAttribute('aria-selected', String(item === tab)));
    renderGame();
  });
});

input.addEventListener('input', () => {
  saveNames();
  renderGame();
});

window.addEventListener('resize', resizeConfettiCanvas);

startButton.addEventListener('click', () => {
  const participants = validateParticipants();
  if (!participants) {
    renderEmpty();
    return;
  }

  if (currentGame === 'roulette') runRoulette(participants);
  if (currentGame === 'amidakuji') runAmidakuji(participants);
  if (currentGame === 'bomb') runBomb(participants);
  if (currentGame === 'king') runKing(participants);
  if (currentGame === 'order') runOrder(participants);
});

renderGame();
