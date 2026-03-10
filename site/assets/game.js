const GRID_SIZE = 18;
const CELL_SIZE = 20;
const LOOP_MS = 140;
const OBSTACLE_SIZE = 2;
const OBSTACLE_SPAWN_MIN_MS = 1_000;
const OBSTACLE_SPAWN_MAX_MS = 30_000;
const OBSTACLE_LIFETIME_MIN_MS = 5_000;
const OBSTACLE_LIFETIME_MAX_MS = 30_000;
const OBSTACLE_MIN_HEAD_DISTANCE = 4;
const MIN_LOOP_MS = 40;
const SPEED_BOOST_FACTOR = 0.9;
const SPEED_SLOWDOWN_FACTOR = 1 / SPEED_BOOST_FACTOR;
const DANGER_FOOD_SPAWN_MIN_MS = 1_000;
const DANGER_FOOD_SPAWN_MAX_MS = 30_000;
const DANGER_FOOD_LIFETIME_MIN_MS = 5_000;
const DANGER_FOOD_LIFETIME_MAX_MS = 30_000;
const SLOW_FOOD_SPAWN_MIN_MS = 1_000;
const SLOW_FOOD_SPAWN_MAX_MS = 30_000;
const SLOW_FOOD_LIFETIME_MS = 5_000;
const PURPLE_FOOD_SPAWN_MIN_MS = 1_000;
const PURPLE_FOOD_SPAWN_MAX_MS = 30_000;
const PURPLE_FOOD_LIFETIME_MS = 5_000;
const PURPLE_FOOD_BLINK_MS = 1_000;
const BASE_FOOD_VALUE = 1;
const DANGER_FOOD_VALUE = 3;
const SLOW_FOOD_VALUE = -1;
const PURPLE_FOOD_VALUE = 2;
const UPDATE_CHECK_MS = 30_000;
const UNKNOWN_VALUE = "unknown";
const NA_VALUE = "n/a";
const BUILD_NOTICE_FALLBACK = "refresh to load latest changes";
const DEFAULT_NICKNAME = "anonymous";
const MAX_NICKNAME_LENGTH = 24;
const NICKNAME_STORAGE_KEY = "crowd-snake:nickname";
const CHALLENGE_SOLVE_MAX_ATTEMPTS = 2_000_000;

const board = document.getElementById("game-board");
const context = board.getContext("2d");
const scoreNode = document.getElementById("score");
const statusNode = document.getElementById("status");
const currentVersionNode = document.getElementById("current-version");
const serverBestNode = document.getElementById("server-best");
const serverBestNicknameNode = document.getElementById("server-best-nickname");
const nicknameInputNode = document.getElementById("nickname-input");
const updateBannerNode = document.getElementById("update-banner");
const updateVersionNode = document.getElementById("update-version");
const restartButton = document.getElementById("restart-button");
const refreshButton = document.getElementById("refresh-button");
const currentVersion = normalizeValue(document.body.dataset.appVersion);
const currentCommitSha = normalizeBuildId(document.body.dataset.appCommitSha);
const textEncoder = new TextEncoder();

function normalizeValue(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeBuildId(value) {
  return normalizeValue(value).toLowerCase();
}

function hasKnownValue(value) {
  if (value.length === 0) {
    return false;
  }

  const normalizedValue = value.toLowerCase();
  return normalizedValue !== UNKNOWN_VALUE && normalizedValue !== NA_VALUE;
}

function hasKnownVersion(value) {
  return hasKnownValue(value);
}

function hasKnownBuildId(value) {
  return hasKnownValue(value);
}

function formatUpdateLabel(nextVersion) {
  const normalizedVersion = normalizeValue(nextVersion);

  if (hasKnownVersion(normalizedVersion) && normalizedVersion !== currentVersion) {
    return normalizedVersion;
  }

  return BUILD_NOTICE_FALLBACK;
}

function normalizeNickname(value) {
  if (typeof value !== "string") {
    return DEFAULT_NICKNAME;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) {
    return DEFAULT_NICKNAME;
  }

  return normalized.slice(0, MAX_NICKNAME_LENGTH);
}

function loadStoredNickname() {
  try {
    const savedNickname = window.localStorage.getItem(NICKNAME_STORAGE_KEY);
    return normalizeNickname(savedNickname);
  } catch (error) {
    return DEFAULT_NICKNAME;
  }
}

function saveNickname(nickname) {
  try {
    window.localStorage.setItem(NICKNAME_STORAGE_KEY, nickname);
  } catch (error) {
    // Ignore localStorage failures in private mode.
  }
}

function setNickname(nextNickname) {
  const normalizedNickname = normalizeNickname(nextNickname);
  state.nickname = normalizedNickname;
  nicknameInputNode.value = normalizedNickname;
  saveNickname(normalizedNickname);
}

function fnv1a32(text) {
  let hash = 0x811c9dc5;
  const bytes = textEncoder.encode(text);

  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

const state = {
  snake: [],
  direction: { x: 1, y: 0 },
  nextDirection: { x: 1, y: 0 },
  food: { x: 0, y: 0 },
  obstacleCells: [],
  dangerFood: null,
  slowFood: null,
  purpleFood: null,
  purpleFoodSpawnedAt: 0,
  score: 0,
  loopMs: LOOP_MS,
  tickHandle: null,
  obstacleSpawnHandle: null,
  obstacleDespawnHandle: null,
  dangerFoodSpawnHandle: null,
  dangerFoodDespawnHandle: null,
  slowFoodSpawnHandle: null,
  slowFoodDespawnHandle: null,
  purpleFoodSpawnHandle: null,
  purpleFoodDespawnHandle: null,
  isGameOver: false,
  hasUpdateNotice: false,
  remoteBestScore: null,
  remoteBestNickname: null,
  nickname: loadStoredNickname(),
  isSyncInFlight: false,
  statusText: "Running",
};

function sameCell(left, right) {
  return left.x === right.x && left.y === right.y;
}

function updateHud(statusText) {
  if (statusText) {
    state.statusText = statusText;
  }

  scoreNode.textContent = String(state.score);
  statusNode.textContent = state.statusText;
  currentVersionNode.textContent = hasKnownVersion(currentVersion)
    ? currentVersion
    : "--";
  serverBestNode.textContent =
    state.remoteBestScore === null ? "--" : String(state.remoteBestScore);
  serverBestNicknameNode.textContent =
    state.remoteBestNickname === null ? "--" : state.remoteBestNickname;
}

function randomCell() {
  return {
    x: Math.floor(Math.random() * GRID_SIZE),
    y: Math.floor(Math.random() * GRID_SIZE),
  };
}

function randomIntInclusive(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function obstacleCellsFromOrigin(origin) {
  const cells = [];

  for (let yOffset = 0; yOffset < OBSTACLE_SIZE; yOffset += 1) {
    for (let xOffset = 0; xOffset < OBSTACLE_SIZE; xOffset += 1) {
      cells.push({ x: origin.x + xOffset, y: origin.y + yOffset });
    }
  }

  return cells;
}

function obstacleContainsCell(candidate) {
  return state.obstacleCells.some((cell) => sameCell(cell, candidate));
}

function hasDangerFood() {
  return state.dangerFood !== null;
}

function hasSlowFood() {
  return state.slowFood !== null;
}

function hasPurpleFood() {
  return state.purpleFood !== null;
}

function isPurpleFoodVisible(now = Date.now()) {
  if (!hasPurpleFood()) {
    return false;
  }

  const elapsed = Math.max(0, now - state.purpleFoodSpawnedAt);
  return Math.floor(elapsed / PURPLE_FOOD_BLINK_MS) % 2 === 0;
}

function spawnFood() {
  let candidate = randomCell();

  while (
    state.snake.some((segment) => sameCell(segment, candidate)) ||
    obstacleContainsCell(candidate) ||
    (hasDangerFood() && sameCell(state.dangerFood, candidate)) ||
    (hasSlowFood() && sameCell(state.slowFood, candidate)) ||
    (hasPurpleFood() && sameCell(state.purpleFood, candidate))
  ) {
    candidate = randomCell();
  }

  state.food = candidate;
}

function clearObstacleTimers() {
  if (state.obstacleSpawnHandle !== null) {
    window.clearTimeout(state.obstacleSpawnHandle);
    state.obstacleSpawnHandle = null;
  }

  if (state.obstacleDespawnHandle !== null) {
    window.clearTimeout(state.obstacleDespawnHandle);
    state.obstacleDespawnHandle = null;
  }
}

function scheduleNextObstacleSpawn() {
  if (state.isGameOver) {
    return;
  }

  const nextSpawnDelay = randomIntInclusive(
    OBSTACLE_SPAWN_MIN_MS,
    OBSTACLE_SPAWN_MAX_MS,
  );

  state.obstacleSpawnHandle = window.setTimeout(() => {
    state.obstacleSpawnHandle = null;
    spawnObstacle();
  }, nextSpawnDelay);
}

function isObstacleCandidateValid(candidateCells) {
  const head = state.snake[0];

  if (!head) {
    return false;
  }

  return candidateCells.every((cell) => {
    const distanceFromHead =
      Math.abs(cell.x - head.x) + Math.abs(cell.y - head.y);

    return (
      cell.x >= 0 &&
      cell.x < GRID_SIZE &&
      cell.y >= 0 &&
      cell.y < GRID_SIZE &&
      distanceFromHead >= OBSTACLE_MIN_HEAD_DISTANCE &&
      !state.snake.some((segment) => sameCell(segment, cell)) &&
      !sameCell(state.food, cell) &&
      (!hasDangerFood() || !sameCell(state.dangerFood, cell)) &&
      (!hasSlowFood() || !sameCell(state.slowFood, cell)) &&
      (!hasPurpleFood() || !sameCell(state.purpleFood, cell))
    );
  });
}

function scheduleObstacleDespawn() {
  const obstacleLifetime = randomIntInclusive(
    OBSTACLE_LIFETIME_MIN_MS,
    OBSTACLE_LIFETIME_MAX_MS,
  );

  state.obstacleDespawnHandle = window.setTimeout(() => {
    state.obstacleDespawnHandle = null;
    despawnObstacle();
  }, obstacleLifetime);
}

function spawnObstacle() {
  if (state.isGameOver) {
    return;
  }

  const maxOrigin = GRID_SIZE - OBSTACLE_SIZE;
  const maxAttempts = 200;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const origin = {
      x: randomIntInclusive(0, maxOrigin),
      y: randomIntInclusive(0, maxOrigin),
    };
    const candidateCells = obstacleCellsFromOrigin(origin);

    if (!isObstacleCandidateValid(candidateCells)) {
      continue;
    }

    state.obstacleCells = candidateCells;
    draw();
    scheduleObstacleDespawn();
    return;
  }

  state.obstacleCells = [];
  scheduleNextObstacleSpawn();
}

function despawnObstacle() {
  if (state.isGameOver) {
    return;
  }

  state.obstacleCells = [];
  draw();
  scheduleNextObstacleSpawn();
}

function clearDangerFoodTimers() {
  if (state.dangerFoodSpawnHandle !== null) {
    window.clearTimeout(state.dangerFoodSpawnHandle);
    state.dangerFoodSpawnHandle = null;
  }

  if (state.dangerFoodDespawnHandle !== null) {
    window.clearTimeout(state.dangerFoodDespawnHandle);
    state.dangerFoodDespawnHandle = null;
  }
}

function clearSlowFoodTimers() {
  if (state.slowFoodSpawnHandle !== null) {
    window.clearTimeout(state.slowFoodSpawnHandle);
    state.slowFoodSpawnHandle = null;
  }

  if (state.slowFoodDespawnHandle !== null) {
    window.clearTimeout(state.slowFoodDespawnHandle);
    state.slowFoodDespawnHandle = null;
  }
}

function clearPurpleFoodTimers() {
  if (state.purpleFoodSpawnHandle !== null) {
    window.clearTimeout(state.purpleFoodSpawnHandle);
    state.purpleFoodSpawnHandle = null;
  }

  if (state.purpleFoodDespawnHandle !== null) {
    window.clearTimeout(state.purpleFoodDespawnHandle);
    state.purpleFoodDespawnHandle = null;
  }
}

function scheduleDangerFoodDespawn() {
  if (state.isGameOver || !hasDangerFood()) {
    return;
  }

  const delay = randomIntInclusive(
    DANGER_FOOD_LIFETIME_MIN_MS,
    DANGER_FOOD_LIFETIME_MAX_MS,
  );

  state.dangerFoodDespawnHandle = window.setTimeout(() => {
    state.dangerFoodDespawnHandle = null;
    despawnDangerFood();
  }, delay);
}

function scheduleNextDangerFoodSpawn() {
  if (state.isGameOver || hasDangerFood()) {
    return;
  }

  const delay = randomIntInclusive(
    DANGER_FOOD_SPAWN_MIN_MS,
    DANGER_FOOD_SPAWN_MAX_MS,
  );

  state.dangerFoodSpawnHandle = window.setTimeout(() => {
    state.dangerFoodSpawnHandle = null;
    spawnDangerFood();
  }, delay);
}

function spawnDangerFood() {
  if (state.isGameOver || hasDangerFood()) {
    return;
  }

  const maxAttempts = 200;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = randomCell();

    if (state.snake.some((segment) => sameCell(segment, candidate))) {
      continue;
    }

    if (sameCell(state.food, candidate)) {
      continue;
    }

    if (obstacleContainsCell(candidate)) {
      continue;
    }

    if (hasSlowFood() && sameCell(state.slowFood, candidate)) {
      continue;
    }

    state.dangerFood = candidate;
    draw();
    scheduleDangerFoodDespawn();
    return;
  }

  scheduleNextDangerFoodSpawn();
}

function despawnDangerFood() {
  if (state.isGameOver || !hasDangerFood()) {
    return;
  }

  state.dangerFood = null;
  draw();
  scheduleNextDangerFoodSpawn();
}

function scheduleSlowFoodDespawn() {
  if (state.isGameOver || !hasSlowFood()) {
    return;
  }

  state.slowFoodDespawnHandle = window.setTimeout(() => {
    state.slowFoodDespawnHandle = null;
    despawnSlowFood();
  }, SLOW_FOOD_LIFETIME_MS);
}

function scheduleNextSlowFoodSpawn() {
  if (state.isGameOver || hasSlowFood()) {
    return;
  }

  const delay = randomIntInclusive(
    SLOW_FOOD_SPAWN_MIN_MS,
    SLOW_FOOD_SPAWN_MAX_MS,
  );

  state.slowFoodSpawnHandle = window.setTimeout(() => {
    state.slowFoodSpawnHandle = null;
    spawnSlowFood();
  }, delay);
}

function spawnSlowFood() {
  if (state.isGameOver || hasSlowFood()) {
    return;
  }

  const maxAttempts = 200;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = randomCell();

    if (state.snake.some((segment) => sameCell(segment, candidate))) {
      continue;
    }

    if (sameCell(state.food, candidate)) {
      continue;
    }

    if (obstacleContainsCell(candidate)) {
      continue;
    }

    if (hasDangerFood() && sameCell(state.dangerFood, candidate)) {
      continue;
    }

    state.slowFood = candidate;
    draw();
    scheduleSlowFoodDespawn();
    return;
  }

  scheduleNextSlowFoodSpawn();
}

function despawnSlowFood() {
  if (state.isGameOver || !hasSlowFood()) {
    return;
  }

  state.slowFood = null;
  draw();
  scheduleNextSlowFoodSpawn();
}

function schedulePurpleFoodDespawn() {
  if (state.isGameOver || !hasPurpleFood()) {
    return;
  }

  state.purpleFoodDespawnHandle = window.setTimeout(() => {
    state.purpleFoodDespawnHandle = null;
    despawnPurpleFood();
  }, PURPLE_FOOD_LIFETIME_MS);
}

function scheduleNextPurpleFoodSpawn() {
  if (state.isGameOver || hasPurpleFood()) {
    return;
  }

  const delay = randomIntInclusive(
    PURPLE_FOOD_SPAWN_MIN_MS,
    PURPLE_FOOD_SPAWN_MAX_MS,
  );

  state.purpleFoodSpawnHandle = window.setTimeout(() => {
    state.purpleFoodSpawnHandle = null;
    spawnPurpleFood();
  }, delay);
}

function spawnPurpleFood() {
  if (state.isGameOver || hasPurpleFood()) {
    return;
  }

  const maxAttempts = 200;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = randomCell();

    if (state.snake.some((segment) => sameCell(segment, candidate))) {
      continue;
    }

    if (sameCell(state.food, candidate)) {
      continue;
    }

    if (obstacleContainsCell(candidate)) {
      continue;
    }

    if (hasDangerFood() && sameCell(state.dangerFood, candidate)) {
      continue;
    }

    if (hasSlowFood() && sameCell(state.slowFood, candidate)) {
      continue;
    }

    state.purpleFood = candidate;
    state.purpleFoodSpawnedAt = Date.now();
    draw();
    schedulePurpleFoodDespawn();
    return;
  }

  scheduleNextPurpleFoodSpawn();
}

function despawnPurpleFood() {
  if (state.isGameOver || !hasPurpleFood()) {
    return;
  }

  state.purpleFood = null;
  state.purpleFoodSpawnedAt = 0;
  draw();
  scheduleNextPurpleFoodSpawn();
}

function drawGrid() {
  context.strokeStyle = "rgba(153, 255, 153, 0.08)";
  context.lineWidth = 1;

  for (let i = 1; i < GRID_SIZE; i += 1) {
    const lineOffset = i * CELL_SIZE;

    context.beginPath();
    context.moveTo(lineOffset, 0);
    context.lineTo(lineOffset, board.height);
    context.stroke();

    context.beginPath();
    context.moveTo(0, lineOffset);
    context.lineTo(board.width, lineOffset);
    context.stroke();
  }
}

function drawCell(cell, fillStyle) {
  const x = cell.x * CELL_SIZE;
  const y = cell.y * CELL_SIZE;
  const inset = 2;

  context.fillStyle = fillStyle;
  context.fillRect(
    x + inset,
    y + inset,
    CELL_SIZE - inset * 2,
    CELL_SIZE - inset * 2,
  );
}

function drawLabeledCell(cell, fillStyle, label, textColor = "#061022") {
  drawCell(cell, fillStyle);

  context.save();
  context.fillStyle = textColor;
  context.font = 'bold 10px "Cascadia Mono", "SFMono-Regular", monospace';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(
    label,
    cell.x * CELL_SIZE + CELL_SIZE / 2,
    cell.y * CELL_SIZE + CELL_SIZE / 2 + 0.5,
  );
  context.restore();
}

function drawGameOver() {
  context.fillStyle = "rgba(4, 11, 20, 0.74)";
  context.fillRect(0, board.height / 2 - 38, board.width, 76);

  context.fillStyle = "#eef7f2";
  context.font = 'bold 18px "Avenir Next Condensed", "Trebuchet MS", sans-serif';
  context.textAlign = "center";
  context.fillText("Crash detected", board.width / 2, board.height / 2 - 4);

  context.fillStyle = "#9db1ab";
  context.font = '14px "Cascadia Mono", "SFMono-Regular", monospace';
  context.fillText("Press restart or space", board.width / 2, board.height / 2 + 20);
}

function draw() {
  context.clearRect(0, 0, board.width, board.height);

  context.fillStyle = "rgba(6, 12, 22, 0.94)";
  context.fillRect(0, 0, board.width, board.height);

  drawGrid();
  state.obstacleCells.forEach((cell) => drawCell(cell, "#868d94"));
  if (hasDangerFood()) {
    drawLabeledCell(state.dangerFood, "#ff4f4f", String(DANGER_FOOD_VALUE), "#fff5f5");
  }
  if (hasSlowFood()) {
    drawLabeledCell(state.slowFood, "#4f93ff", String(SLOW_FOOD_VALUE), "#f7fbff");
  }
  if (hasPurpleFood() && isPurpleFoodVisible()) {
    drawLabeledCell(
      state.purpleFood,
      "#b14dff",
      String(PURPLE_FOOD_VALUE),
      "#fbf5ff",
    );
  }
  drawLabeledCell(state.food, "#ffd36a", String(BASE_FOOD_VALUE));

  state.snake.forEach((segment, index) => {
    const color = index === 0 ? "#c7ff7b" : "#6df04e";
    drawCell(segment, color);
  });

  if (state.isGameOver) {
    drawGameOver();
  }
}

function stopMovementLoop() {
  if (state.tickHandle !== null) {
    window.clearInterval(state.tickHandle);
    state.tickHandle = null;
  }
}

function startMovementLoop() {
  stopMovementLoop();
  state.tickHandle = window.setInterval(step, state.loopMs);
}

function stopLoop() {
  stopMovementLoop();
  clearObstacleTimers();
  clearDangerFoodTimers();
  clearSlowFoodTimers();
  clearPurpleFoodTimers();
}

function applyDangerFoodSpeedBoost() {
  state.loopMs = Math.max(MIN_LOOP_MS, Math.round(state.loopMs * SPEED_BOOST_FACTOR));
  startMovementLoop();
}

function applySlowFoodSpeedReduction() {
  state.loopMs = Math.round(state.loopMs * SPEED_SLOWDOWN_FACTOR);
  startMovementLoop();
}

function endGame() {
  stopLoop();
  state.isGameOver = true;
  updateHud("Crashed");
  draw();
  void syncRemoteBestScore();
}

function step() {
  const now = Date.now();
  state.direction = { ...state.nextDirection };

  const head = state.snake[0];
  const nextHead = {
    x: head.x + state.direction.x,
    y: head.y + state.direction.y,
  };
  const ateFood = sameCell(nextHead, state.food);
  const ateDangerFood = hasDangerFood() && sameCell(nextHead, state.dangerFood);
  const ateSlowFood = hasSlowFood() && sameCell(nextHead, state.slowFood);
  const touchedPurpleFood = hasPurpleFood() && sameCell(nextHead, state.purpleFood);
  const atePurpleFood = touchedPurpleFood && isPurpleFoodVisible(now);
  const hidPurpleFood = touchedPurpleFood && !atePurpleFood;
  const willGrow = ateFood || ateDangerFood || ateSlowFood || atePurpleFood;
  const occupiedCells = willGrow ? state.snake : state.snake.slice(0, -1);

  const crashed =
    nextHead.x < 0 ||
    nextHead.x >= GRID_SIZE ||
    nextHead.y < 0 ||
    nextHead.y >= GRID_SIZE ||
    occupiedCells.some((segment) => sameCell(segment, nextHead)) ||
    obstacleContainsCell(nextHead);

  if (crashed) {
    endGame();
    return;
  }

  state.snake.unshift(nextHead);

  if (willGrow) {
    let scoreDelta = 0;

    if (ateFood) {
      scoreDelta += BASE_FOOD_VALUE;
    }

    if (ateDangerFood) {
      scoreDelta += DANGER_FOOD_VALUE;
    }

    if (ateSlowFood) {
      scoreDelta += SLOW_FOOD_VALUE;
    }

    if (atePurpleFood) {
      scoreDelta += PURPLE_FOOD_VALUE;
    }

    state.score += scoreDelta;
    updateHud("Running");

    if (ateFood) {
      spawnFood();
    }

    if (ateDangerFood) {
      state.dangerFood = null;
      clearDangerFoodTimers();
      scheduleNextDangerFoodSpawn();
      applyDangerFoodSpeedBoost();
    }

    if (ateSlowFood) {
      state.slowFood = null;
      clearSlowFoodTimers();
      scheduleNextSlowFoodSpawn();
      applySlowFoodSpeedReduction();
    }

    if (atePurpleFood) {
      state.purpleFood = null;
      state.purpleFoodSpawnedAt = 0;
      clearPurpleFoodTimers();
      scheduleNextPurpleFoodSpawn();
    }
  } else {
    state.snake.pop();
  }

  if (hidPurpleFood) {
    state.purpleFood = null;
    state.purpleFoodSpawnedAt = 0;
    clearPurpleFoodTimers();
    scheduleNextPurpleFoodSpawn();
  }

  draw();
}

function startGame() {
  stopLoop();

  const center = Math.floor(GRID_SIZE / 2);

  state.snake = [
    { x: center, y: center },
    { x: center - 1, y: center },
    { x: center - 2, y: center },
  ];
  state.direction = { x: 1, y: 0 };
  state.nextDirection = { x: 1, y: 0 };
  state.score = 0;
  state.obstacleCells = [];
  state.loopMs = LOOP_MS;
  state.dangerFood = null;
  state.slowFood = null;
  state.purpleFood = null;
  state.purpleFoodSpawnedAt = 0;
  state.isGameOver = false;

  spawnFood();
  scheduleNextDangerFoodSpawn();
  scheduleNextSlowFoodSpawn();
  scheduleNextPurpleFoodSpawn();
  updateHud("Running");
  draw();
  scheduleNextObstacleSpawn();

  startMovementLoop();
}

function queueDirection(nextDirection) {
  const reversing =
    nextDirection.x === state.direction.x * -1 &&
    nextDirection.y === state.direction.y * -1;

  if (!reversing) {
    state.nextDirection = nextDirection;
  }
}

function revealUpdateNotice(nextVersion) {
  if (state.hasUpdateNotice) {
    return;
  }

  state.hasUpdateNotice = true;
  updateVersionNode.textContent = formatUpdateLabel(nextVersion);
  updateBannerNode.hidden = false;
}

async function checkForUpdate() {
  if (!hasKnownBuildId(currentCommitSha)) {
    return;
  }

  try {
    // Keep default caching so the browser reuses validators and respects nginx TTL.
    const response = await window.fetch("/version.json", {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    const remoteCommitSha = normalizeBuildId(payload.commitSha);

    if (hasKnownBuildId(remoteCommitSha) && remoteCommitSha !== currentCommitSha) {
      revealUpdateNotice(payload.version);
    }
  } catch (error) {
    console.debug("Version check failed", error);
  }
}

async function loadRemoteState() {
  try {
    const response = await window.fetch("/api/state", {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return;
    }

    const payload = await response.json();

    if (typeof payload.bestScore === "number") {
      state.remoteBestScore = payload.bestScore;
      state.remoteBestNickname = normalizeNickname(payload.bestNickname);
      updateHud();
    }
  } catch (error) {
    console.debug("State bootstrap failed", error);
  }
}

async function fetchChallenge() {
  const response = await window.fetch("/api/challenge", {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Challenge request failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (
    typeof payload.challengeId !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.difficulty !== "number"
  ) {
    throw new Error("Challenge payload is malformed");
  }

  return payload;
}

function solveProofNonce(challenge, candidateScore, nickname) {
  const targetPrefix = "0".repeat(Math.max(1, challenge.difficulty));
  const messagePrefix = `${challenge.challengeId}:${challenge.nonce}:${nickname}:${candidateScore}:`;

  for (let proofNonce = 0; proofNonce < CHALLENGE_SOLVE_MAX_ATTEMPTS; proofNonce += 1) {
    const fingerprint = fnv1a32(`${messagePrefix}${proofNonce}`);
    if (fingerprint.startsWith(targetPrefix)) {
      return proofNonce;
    }
  }

  throw new Error("Unable to solve challenge within local attempt limit");
}

async function syncRemoteBestScore() {
  const candidate = state.score;

  if (
    state.isSyncInFlight ||
    (state.remoteBestScore !== null && candidate <= state.remoteBestScore)
  ) {
    return;
  }

  state.isSyncInFlight = true;

  try {
    const challenge = await fetchChallenge();
    const proofNonce = solveProofNonce(challenge, candidate, state.nickname);
    const response = await window.fetch("/api/state", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        bestScore: candidate,
        nickname: state.nickname,
        challengeId: challenge.challengeId,
        proofNonce,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      console.debug("State sync rejected", response.status, details);
      return;
    }

    const payload = await response.json();

    if (typeof payload.bestScore === "number") {
      state.remoteBestScore = payload.bestScore;
      state.remoteBestNickname = normalizeNickname(payload.bestNickname);
      updateHud();
    }
  } catch (error) {
    console.debug("State sync failed", error);
  } finally {
    state.isSyncInFlight = false;
  }
}

document.addEventListener("keydown", (event) => {
  const directionMap = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
  };

  if (event.code === "Space" && state.isGameOver) {
    event.preventDefault();
    startGame();
    return;
  }

  const nextDirection = directionMap[event.key];

  if (!nextDirection) {
    return;
  }

  event.preventDefault();
  queueDirection(nextDirection);
});

restartButton.addEventListener("click", startGame);
refreshButton.addEventListener("click", () => window.location.reload());
nicknameInputNode.addEventListener("change", (event) => {
  setNickname(event.target.value);
});
nicknameInputNode.addEventListener("blur", (event) => {
  setNickname(event.target.value);
});
nicknameInputNode.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    nicknameInputNode.blur();
  }
});

setNickname(state.nickname);
startGame();
void loadRemoteState();
window.setTimeout(checkForUpdate, 5_000);
window.setInterval(checkForUpdate, UPDATE_CHECK_MS);
