const INITIAL_BOARD_WIDTH = 18;
const INITIAL_BOARD_HEIGHT = 18;
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
const HUMMERHEAD_FOOD_LIFETIME_MIN_MS = 1_000;
const HUMMERHEAD_FOOD_LIFETIME_MAX_MS = 8_000;
const HUMMERHEAD_SPEED_FACTOR = 0.45;
const HUMMERHEAD_HEAD_SCALE = 1.15;
const WALL_EXPANSION_PAUSE_MS = 1_000;
const WALL_EXPANSION_ANIMATION_MS = 260;
const SLOW_FOOD_SPAWN_MIN_MS = 1_000;
const SLOW_FOOD_SPAWN_MAX_MS = 30_000;
const SLOW_FOOD_LIFETIME_MS = 5_000;
const POISON_FOOD_SPAWN_MIN_MS = 1_000;
const POISON_FOOD_SPAWN_MAX_MS = 30_000;
const POISON_FOOD_LIFETIME_MS = 5_000;
const PURPLE_FOOD_SPAWN_MIN_MS = 1_000;
const PURPLE_FOOD_SPAWN_MAX_MS = 30_000;
const PURPLE_FOOD_LIFETIME_MS = 5_000;
const PURPLE_FOOD_BLINK_MS = 1_000;
const BASE_FOOD_VALUE = 1;
const DANGER_FOOD_VALUE = 3;
const HUMMERHEAD_FOOD_LABEL = ">>";
const SLOW_FOOD_VALUE = -1;
const POISON_FOOD_VALUE = -3;
const PURPLE_FOOD_VALUE = 2;
const POISON_TAIL_CELLS = 4;
const UPDATE_CHECK_MS = 30_000;
const UNKNOWN_VALUE = "unknown";
const NA_VALUE = "n/a";
const BUILD_NOTICE_FALLBACK = "refresh to load latest changes";
const DEFAULT_NICKNAME = "anonymous";
const MAX_NICKNAME_LENGTH = 24;
const NICKNAME_STORAGE_KEY = "crowd-snake:nickname";
const BGCOLOR_STORAGE_KEY = "crowd-snake:bgcolor";
const CHALLENGE_SOLVE_MAX_ATTEMPTS = 2_000_000;

const board = document.getElementById("game-board");
const context = board.getContext("2d");
const scoreNode = document.getElementById("score");
const statusNode = document.getElementById("status");
const currentVersionNode = document.getElementById("current-version");
const serverBestNode = document.getElementById("server-best");
const serverBestNicknameNode = document.getElementById("server-best-nickname");
const nicknameInputNode = document.getElementById("nickname-input");
const bgColorSelectNode = document.getElementById("bgcolor-select");
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

function loadStoredBgColor() {
  try {
    const saved = window.localStorage.getItem(BGCOLOR_STORAGE_KEY);
    return saved || "gray-mid";
  } catch (error) {
    return "gray-mid";
  }
}

function saveBgColor(val) {
  try {
    window.localStorage.setItem(BGCOLOR_STORAGE_KEY, val);
  } catch (error) {}
}

function applyBgColor(val) {
  const cfg = BG_COLOR_MAP[val] || BG_COLOR_MAP["gray-mid"];
  currentBgColor = cfg.bg;
  currentGridColor = cfg.grid;
}

function setBgColor(val) {
  const nextBgColor = BG_COLOR_MAP[val] ? val : "gray-mid";
  applyBgColor(nextBgColor);
  bgColorSelectNode.value = nextBgColor;
  saveBgColor(nextBgColor);
}

const BG_COLOR_MAP = {
  black: { bg: "#050505", grid: "rgba(255, 255, 255, 0.16)" },
  white: { bg: "#fafafa", grid: "rgba(0, 0, 0, 0.18)" },
  "gray-light": { bg: "#c8c8c8", grid: "rgba(0, 0, 0, 0.14)" },
  "gray-mid": { bg: "#7e7e7e", grid: "rgba(255, 255, 255, 0.14)" },
  "gray-dark": { bg: "#464646", grid: "rgba(255, 255, 255, 0.12)" },
};

let currentBgColor = BG_COLOR_MAP["gray-mid"].bg;
let currentGridColor = BG_COLOR_MAP["gray-mid"].grid;

bgColorSelectNode.addEventListener("change", (e) => {
  setBgColor(e.target.value);
});

const storedBg = loadStoredBgColor();
setBgColor(storedBg);

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
  boardMinX: 0,
  boardMaxX: INITIAL_BOARD_WIDTH - 1,
  boardMinY: 0,
  boardMaxY: INITIAL_BOARD_HEIGHT - 1,
  food: { x: 0, y: 0 },
  obstacleCells: [],
  poisonObstacleCells: [],
  dangerFood: null,
  hummerFood: null,
  slowFood: null,
  poisonFood: null,
  purpleFood: null,
  purpleFoodSpawnedAt: 0,
  hummerEffectActive: false,
  hummerEffectBaseLoopMs: LOOP_MS,
  isExpansionPaused: false,
  expansionPauseHandle: null,
  expansionAnimation: null,
  expansionAnimationFrameHandle: null,
  score: 0,
  loopMs: LOOP_MS,
  tickHandle: null,
  obstacleSpawnHandle: null,
  obstacleDespawnHandle: null,
  dangerFoodSpawnHandle: null,
  dangerFoodDespawnHandle: null,
  slowFoodSpawnHandle: null,
  slowFoodDespawnHandle: null,
  poisonFoodSpawnHandle: null,
  poisonFoodDespawnHandle: null,
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
    x: randomIntInclusive(state.boardMinX, state.boardMaxX),
    y: randomIntInclusive(state.boardMinY, state.boardMaxY),
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
  return (
    state.obstacleCells.some((cell) => sameCell(cell, candidate)) ||
    state.poisonObstacleCells.some((cell) => sameCell(cell, candidate))
  );
}

function boardWidth() {
  return state.boardMaxX - state.boardMinX + 1;
}

function boardHeight() {
  return state.boardMaxY - state.boardMinY + 1;
}

function canvasX(cell) {
  return (cell.x - state.boardMinX) * CELL_SIZE;
}

function canvasY(cell) {
  return (cell.y - state.boardMinY) * CELL_SIZE;
}

function resizeBoardCanvas() {
  board.width = boardWidth() * CELL_SIZE;
  board.height = boardHeight() * CELL_SIZE;
}

function hasDangerFood() {
  return state.dangerFood !== null;
}

function hasHummerFood() {
  return state.hummerFood !== null;
}

function hasSlowFood() {
  return state.slowFood !== null;
}

function hasPoisonFood() {
  return state.poisonFood !== null;
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
    (hasHummerFood() && sameCell(state.hummerFood, candidate)) ||
    (hasSlowFood() && sameCell(state.slowFood, candidate)) ||
    (hasPoisonFood() && sameCell(state.poisonFood, candidate)) ||
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
      cell.x >= state.boardMinX &&
      cell.x <= state.boardMaxX &&
      cell.y >= state.boardMinY &&
      cell.y <= state.boardMaxY &&
      distanceFromHead >= OBSTACLE_MIN_HEAD_DISTANCE &&
      !state.snake.some((segment) => sameCell(segment, cell)) &&
      !sameCell(state.food, cell) &&
      (!hasDangerFood() || !sameCell(state.dangerFood, cell)) &&
      (!hasHummerFood() || !sameCell(state.hummerFood, cell)) &&
      (!hasSlowFood() || !sameCell(state.slowFood, cell)) &&
      (!hasPoisonFood() || !sameCell(state.poisonFood, cell)) &&
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

  const maxOriginX = state.boardMaxX - (OBSTACLE_SIZE - 1);
  const maxOriginY = state.boardMaxY - (OBSTACLE_SIZE - 1);
  const maxAttempts = 200;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const origin = {
      x: randomIntInclusive(state.boardMinX, maxOriginX),
      y: randomIntInclusive(state.boardMinY, maxOriginY),
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

function clearExpansionPause() {
  if (state.expansionPauseHandle !== null) {
    window.clearTimeout(state.expansionPauseHandle);
    state.expansionPauseHandle = null;
  }
}

function clearExpansionAnimationFrame() {
  if (state.expansionAnimationFrameHandle === null) {
    return;
  }

  if (typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(state.expansionAnimationFrameHandle);
  } else {
    window.clearTimeout(state.expansionAnimationFrameHandle);
  }

  state.expansionAnimationFrameHandle = null;
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

function clearPoisonFoodTimers() {
  if (state.poisonFoodSpawnHandle !== null) {
    window.clearTimeout(state.poisonFoodSpawnHandle);
    state.poisonFoodSpawnHandle = null;
  }

  if (state.poisonFoodDespawnHandle !== null) {
    window.clearTimeout(state.poisonFoodDespawnHandle);
    state.poisonFoodDespawnHandle = null;
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
  if (state.isGameOver || (!hasDangerFood() && !hasHummerFood())) {
    return;
  }

  const delay = hasHummerFood()
    ? randomIntInclusive(
        HUMMERHEAD_FOOD_LIFETIME_MIN_MS,
        HUMMERHEAD_FOOD_LIFETIME_MAX_MS,
      )
    : randomIntInclusive(
        DANGER_FOOD_LIFETIME_MIN_MS,
        DANGER_FOOD_LIFETIME_MAX_MS,
      );

  state.dangerFoodDespawnHandle = window.setTimeout(() => {
    state.dangerFoodDespawnHandle = null;
    if (hasHummerFood()) {
      despawnHummerFood();
      return;
    }

    despawnDangerFood();
  }, delay);
}

function scheduleNextDangerFoodSpawn() {
  if (state.isGameOver || hasDangerFood() || hasHummerFood()) {
    return;
  }

  const delay = randomIntInclusive(
    DANGER_FOOD_SPAWN_MIN_MS,
    DANGER_FOOD_SPAWN_MAX_MS,
  );

  state.dangerFoodSpawnHandle = window.setTimeout(() => {
    state.dangerFoodSpawnHandle = null;
    if (Math.random() < 0.5) {
      spawnDangerFood();
      return;
    }

    spawnHummerFood();
  }, delay);
}

function spawnDangerFood() {
  if (state.isGameOver || hasDangerFood() || hasHummerFood()) {
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

    if (hasPoisonFood() && sameCell(state.poisonFood, candidate)) {
      continue;
    }

    if (hasPurpleFood() && sameCell(state.purpleFood, candidate)) {
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

function spawnHummerFood() {
  if (state.isGameOver || hasDangerFood() || hasHummerFood()) {
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

    if (hasPoisonFood() && sameCell(state.poisonFood, candidate)) {
      continue;
    }

    if (hasPurpleFood() && sameCell(state.purpleFood, candidate)) {
      continue;
    }

    state.hummerFood = candidate;
    draw();
    scheduleDangerFoodDespawn();
    return;
  }

  scheduleNextDangerFoodSpawn();
}

function despawnHummerFood() {
  if (state.isGameOver || !hasHummerFood()) {
    return;
  }

  state.hummerFood = null;
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

    if (hasHummerFood() && sameCell(state.hummerFood, candidate)) {
      continue;
    }

    if (hasPoisonFood() && sameCell(state.poisonFood, candidate)) {
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

function schedulePoisonFoodDespawn() {
  if (state.isGameOver || !hasPoisonFood()) {
    return;
  }

  state.poisonFoodDespawnHandle = window.setTimeout(() => {
    state.poisonFoodDespawnHandle = null;
    despawnPoisonFood();
  }, POISON_FOOD_LIFETIME_MS);
}

function scheduleNextPoisonFoodSpawn() {
  if (
    state.isGameOver ||
    hasPoisonFood() ||
    state.poisonFoodSpawnHandle !== null ||
    state.snake.length <= POISON_TAIL_CELLS
  ) {
    return;
  }

  const delay = randomIntInclusive(
    POISON_FOOD_SPAWN_MIN_MS,
    POISON_FOOD_SPAWN_MAX_MS,
  );

  state.poisonFoodSpawnHandle = window.setTimeout(() => {
    state.poisonFoodSpawnHandle = null;
    spawnPoisonFood();
  }, delay);
}

function spawnPoisonFood() {
  if (
    state.isGameOver ||
    hasPoisonFood() ||
    state.snake.length <= POISON_TAIL_CELLS
  ) {
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

    if (hasHummerFood() && sameCell(state.hummerFood, candidate)) {
      continue;
    }

    if (hasSlowFood() && sameCell(state.slowFood, candidate)) {
      continue;
    }

    if (hasPurpleFood() && sameCell(state.purpleFood, candidate)) {
      continue;
    }

    state.poisonFood = candidate;
    draw();
    schedulePoisonFoodDespawn();
    return;
  }

  scheduleNextPoisonFoodSpawn();
}

function despawnPoisonFood() {
  if (state.isGameOver || !hasPoisonFood()) {
    return;
  }

  state.poisonFood = null;
  draw();
  scheduleNextPoisonFoodSpawn();
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

    if (hasHummerFood() && sameCell(state.hummerFood, candidate)) {
      continue;
    }

    if (hasSlowFood() && sameCell(state.slowFood, candidate)) {
      continue;
    }

    if (hasPoisonFood() && sameCell(state.poisonFood, candidate)) {
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
  context.strokeStyle = currentGridColor;
  context.lineWidth = 1;

  for (let i = 1; i < boardWidth(); i += 1) {
    const lineOffset = i * CELL_SIZE;

    context.beginPath();
    context.moveTo(lineOffset, 0);
    context.lineTo(lineOffset, board.height);
    context.stroke();
  }

  for (let i = 1; i < boardHeight(); i += 1) {
    const lineOffset = i * CELL_SIZE;
    context.beginPath();
    context.moveTo(0, lineOffset);
    context.lineTo(board.width, lineOffset);
    context.stroke();
  }
}

function drawCell(cell, fillStyle, scale = 1) {
  const x = canvasX(cell);
  const y = canvasY(cell);
  const inset = 2;
  const size = CELL_SIZE - inset * 2;
  const scaledSize = size * scale;
  const offset = (size - scaledSize) / 2;

  context.fillStyle = fillStyle;
  context.fillRect(
    x + inset + offset,
    y + inset + offset,
    scaledSize,
    scaledSize,
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
    canvasX(cell) + CELL_SIZE / 2,
    canvasY(cell) + CELL_SIZE / 2 + 0.5,
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
  context.fillStyle = currentBgColor;
  context.fillRect(0, 0, board.width, board.height);

  drawGrid();
  state.obstacleCells.forEach((cell) => drawCell(cell, "#868d94"));
  state.poisonObstacleCells.forEach((cell) => drawCell(cell, "#4d5359"));
  if (hasDangerFood()) {
    drawLabeledCell(state.dangerFood, "#ff4f4f", String(DANGER_FOOD_VALUE), "#fff5f5");
  }
  if (hasHummerFood()) {
    drawLabeledCell(state.hummerFood, "#7a2136", HUMMERHEAD_FOOD_LABEL, "#ffeef3");
  }
  if (hasSlowFood()) {
    drawLabeledCell(state.slowFood, "#4f93ff", String(SLOW_FOOD_VALUE), "#f7fbff");
  }
  if (hasPoisonFood()) {
    drawLabeledCell(state.poisonFood, "#4d5359", String(POISON_FOOD_VALUE), "#f3f5f7");
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
    const isBoostedHead = index === 0 && state.hummerEffectActive;
    const color = isBoostedHead ? "#ff4f4f" : index === 0 ? "#c7ff7b" : "#6df04e";
    const scale = isBoostedHead ? HUMMERHEAD_HEAD_SCALE : 1;
    drawCell(segment, color, scale);
  });

  if (state.expansionAnimation !== null) {
    const elapsed = Date.now() - state.expansionAnimation.startedAt;
    const progress = Math.min(1, elapsed / WALL_EXPANSION_ANIMATION_MS);
    const alpha = 0.35 * (1 - progress);
    context.save();
    context.fillStyle = `rgba(255, 109, 109, ${alpha})`;

    if (state.expansionAnimation.direction === "left") {
      context.fillRect(0, 0, CELL_SIZE, board.height);
    } else if (state.expansionAnimation.direction === "right") {
      context.fillRect(board.width - CELL_SIZE, 0, CELL_SIZE, board.height);
    } else if (state.expansionAnimation.direction === "up") {
      context.fillRect(0, 0, board.width, CELL_SIZE);
    } else {
      context.fillRect(0, board.height - CELL_SIZE, board.width, CELL_SIZE);
    }

    context.restore();
  }

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
  clearPoisonFoodTimers();
  clearPurpleFoodTimers();
  clearExpansionPause();
  clearExpansionAnimationFrame();
}

function applyDangerFoodSpeedBoost() {
  state.loopMs = Math.max(MIN_LOOP_MS, Math.round(state.loopMs * SPEED_BOOST_FACTOR));
  startMovementLoop();
}

function applySlowFoodSpeedReduction() {
  state.loopMs = Math.round(state.loopMs * SPEED_SLOWDOWN_FACTOR);
  startMovementLoop();
}

function activateHummerEffect() {
  state.hummerEffectActive = true;
  state.hummerEffectBaseLoopMs = state.loopMs;
  state.loopMs = Math.max(MIN_LOOP_MS, Math.round(state.loopMs * HUMMERHEAD_SPEED_FACTOR));
  startMovementLoop();
}

function consumeHummerEffect() {
  if (!state.hummerEffectActive) {
    return;
  }

  state.hummerEffectActive = false;
  state.loopMs = state.hummerEffectBaseLoopMs;

  if (!state.isExpansionPaused) {
    startMovementLoop();
  }
}

function expandBoard(direction) {
  if (direction === "left") {
    state.boardMinX -= 1;
  } else if (direction === "right") {
    state.boardMaxX += 1;
  } else if (direction === "up") {
    state.boardMinY -= 1;
  } else if (direction === "down") {
    state.boardMaxY += 1;
  }

  resizeBoardCanvas();
  state.expansionAnimation = { direction, startedAt: Date.now() };
}

function pauseAfterBoardExpansion() {
  state.isExpansionPaused = true;
  stopMovementLoop();
  updateHud("Wall breached");
  clearExpansionAnimationFrame();

  const animate = () => {
    if (state.expansionAnimation === null) {
      state.expansionAnimationFrameHandle = null;
      return;
    }

    draw();
    const elapsed = Date.now() - state.expansionAnimation.startedAt;

    if (elapsed >= WALL_EXPANSION_ANIMATION_MS) {
      state.expansionAnimationFrameHandle = null;
      return;
    }

    if (typeof window.requestAnimationFrame === "function") {
      state.expansionAnimationFrameHandle = window.requestAnimationFrame(animate);
      return;
    }

    state.expansionAnimationFrameHandle = window.setTimeout(animate, 16);
  };

  animate();
  draw();
  clearExpansionPause();
  state.expansionPauseHandle = window.setTimeout(() => {
    state.expansionPauseHandle = null;
    state.isExpansionPaused = false;
    state.expansionAnimation = null;
    clearExpansionAnimationFrame();
    updateHud("Running");
    draw();
    startMovementLoop();
  }, WALL_EXPANSION_PAUSE_MS);
}

function endGame() {
  stopLoop();
  state.isGameOver = true;
  updateHud("Crashed");
  draw();
  void syncRemoteBestScore();
}

function detachPoisonTail() {
  if (state.snake.length <= POISON_TAIL_CELLS) {
    return;
  }

  const detachedCells = state.snake.splice(-POISON_TAIL_CELLS, POISON_TAIL_CELLS);
  state.poisonObstacleCells.push(...detachedCells);
}

function removePoisonObstacleCell(target) {
  state.poisonObstacleCells = state.poisonObstacleCells.filter(
    (cell) => !sameCell(cell, target),
  );
}

function directionToWall(nextHead) {
  if (nextHead.x < state.boardMinX) {
    return "left";
  }

  if (nextHead.x > state.boardMaxX) {
    return "right";
  }

  if (nextHead.y < state.boardMinY) {
    return "up";
  }

  if (nextHead.y > state.boardMaxY) {
    return "down";
  }

  return null;
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
  const ateHummerFood = hasHummerFood() && sameCell(nextHead, state.hummerFood);
  const ateSlowFood = hasSlowFood() && sameCell(nextHead, state.slowFood);
  const atePoisonFood = hasPoisonFood() && sameCell(nextHead, state.poisonFood);
  const touchedPurpleFood = hasPurpleFood() && sameCell(nextHead, state.purpleFood);
  const atePurpleFood = touchedPurpleFood && isPurpleFoodVisible(now);
  const hidPurpleFood = touchedPurpleFood && !atePurpleFood;
  const willGrow =
    ateFood ||
    ateDangerFood ||
    ateHummerFood ||
    ateSlowFood ||
    atePoisonFood ||
    atePurpleFood;
  const occupiedCells = willGrow ? state.snake : state.snake.slice(0, -1);
  const hitWallDirection = directionToWall(nextHead);
  const hitSelf = occupiedCells.some((segment) => sameCell(segment, nextHead));
  const hitObstacle = obstacleContainsCell(nextHead);

  if (hitSelf) {
    endGame();
    return;
  }

  if (hitObstacle) {
    if (!state.hummerEffectActive) {
      endGame();
      return;
    }

    if (state.obstacleCells.some((cell) => sameCell(cell, nextHead))) {
      state.obstacleCells = [];
      clearObstacleTimers();
      scheduleNextObstacleSpawn();
    } else {
      removePoisonObstacleCell(nextHead);
    }

    consumeHummerEffect();
  }

  if (hitWallDirection !== null) {
    if (!state.hummerEffectActive) {
      endGame();
      return;
    }

    consumeHummerEffect();
    expandBoard(hitWallDirection);
    pauseAfterBoardExpansion();
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

    if (ateHummerFood) {
      scoreDelta += DANGER_FOOD_VALUE;
    }

    if (ateSlowFood) {
      scoreDelta += SLOW_FOOD_VALUE;
    }

    if (atePoisonFood) {
      scoreDelta += POISON_FOOD_VALUE;
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

    if (ateHummerFood) {
      state.hummerFood = null;
      clearDangerFoodTimers();
      scheduleNextDangerFoodSpawn();
      activateHummerEffect();
    }

    if (ateSlowFood) {
      state.slowFood = null;
      clearSlowFoodTimers();
      scheduleNextSlowFoodSpawn();
      applySlowFoodSpeedReduction();
    }

    if (atePoisonFood) {
      state.poisonFood = null;
      clearPoisonFoodTimers();
      detachPoisonTail();
      scheduleNextPoisonFoodSpawn();
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

  scheduleNextPoisonFoodSpawn();
  draw();
}

function startGame() {
  stopLoop();

  state.boardMinX = 0;
  state.boardMaxX = INITIAL_BOARD_WIDTH - 1;
  state.boardMinY = 0;
  state.boardMaxY = INITIAL_BOARD_HEIGHT - 1;
  resizeBoardCanvas();

  const centerX = Math.floor((state.boardMinX + state.boardMaxX) / 2);
  const centerY = Math.floor((state.boardMinY + state.boardMaxY) / 2);

  state.snake = [
    { x: centerX, y: centerY },
    { x: centerX - 1, y: centerY },
    { x: centerX - 2, y: centerY },
  ];
  state.direction = { x: 1, y: 0 };
  state.nextDirection = { x: 1, y: 0 };
  state.score = 0;
  state.obstacleCells = [];
  state.poisonObstacleCells = [];
  state.loopMs = LOOP_MS;
  state.dangerFood = null;
  state.hummerFood = null;
  state.slowFood = null;
  state.poisonFood = null;
  state.purpleFood = null;
  state.purpleFoodSpawnedAt = 0;
  state.hummerEffectActive = false;
  state.hummerEffectBaseLoopMs = LOOP_MS;
  state.isExpansionPaused = false;
  state.expansionAnimation = null;
  state.expansionAnimationFrameHandle = null;
  state.isGameOver = false;

  spawnFood();
  scheduleNextDangerFoodSpawn();
  scheduleNextSlowFoodSpawn();
  scheduleNextPoisonFoodSpawn();
  scheduleNextPurpleFoodSpawn();
  updateHud("Running");
  draw();
  scheduleNextObstacleSpawn();

  startMovementLoop();
}

function queueDirection(nextDirection) {
  if (state.hummerEffectActive && !state.isExpansionPaused) {
    return;
  }

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
// Apply stored background theme or default
function applyStoredBg() {
  const stored = window.localStorage.getItem(BGCOLOR_STORAGE_KEY) || "dark";
  const themeMap = {
    dark: { top: "#08111f", bottom: "#132b27" },
    white: { top: "#ffffff", bottom: "#e0e0e0" },
    black: { top: "#000000", bottom: "#111111" },
    gray1: { top: "#222222", bottom: "#333333" },
    gray2: { top: "#444444", bottom: "#555555" },
  };
  const theme = themeMap[stored] || themeMap.dark;
  document.documentElement.style.setProperty("--bg-top", theme.top);
  document.documentElement.style.setProperty("--bg-bottom", theme.bottom);
  // sync select UI
  if (bgColorSelectNode) {
    bgColorSelectNode.value = stored;
  }
}
applyStoredBg();

// Listener for background selection changes
if (bgColorSelectNode) {
  bgColorSelectNode.addEventListener("change", (e) => {
    const key = e.target.value;
    const themeMap = {
      dark: { top: "#08111f", bottom: "#132b27" },
      white: { top: "#ffffff", bottom: "#e0e0e0" },
      black: { top: "#000000", bottom: "#111111" },
      gray1: { top: "#222222", bottom: "#333333" },
      gray2: { top: "#444444", bottom: "#555555" },
    };
    const theme = themeMap[key] || themeMap.dark;
    document.documentElement.style.setProperty("--bg-top", theme.top);
    document.documentElement.style.setProperty("--bg-bottom", theme.bottom);
    window.localStorage.setItem(BGCOLOR_STORAGE_KEY, key);
  });
}
void loadRemoteState();
window.setTimeout(checkForUpdate, 5_000);
window.setInterval(checkForUpdate, UPDATE_CHECK_MS);
