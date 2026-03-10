const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { TextEncoder } = require("node:util");

function createGameHarness() {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "site", "assets", "game.js"),
    "utf8",
  );
  const timeouts = new Map();
  const intervals = new Map();
  const storage = new Map();
  const drawCalls = [];
  const randomState = {
    fallback: 0,
    sequence: [],
  };
  let nextTimerId = 1;

  const math = Object.create(Math);
  math.random = () => {
    if (randomState.sequence.length > 0) {
      return randomState.sequence.shift();
    }

    return randomState.fallback;
  };

  const context2d = {
    beginPath() {},
    clearRect() {},
    fillRect(x, y, width, height) {
      drawCalls.push({
        fillStyle: context2d.fillStyle,
        type: "fillRect",
        width,
        x,
        y,
      });
    },
    fillText() {},
    lineTo() {},
    moveTo() {},
    stroke() {},
    fillStyle: "",
    font: "",
    lineWidth: 1,
    strokeStyle: "",
    textAlign: "left",
  };

  const nodes = {
    "current-version": makeNode(),
    "game-board": {
      height: 360,
      width: 360,
      getContext() {
        return context2d;
      },
    },
    "nickname-input": makeNode(),
    "refresh-button": makeNode(),
    "restart-button": makeNode(),
    score: makeNode(),
    "server-best": makeNode(),
    "server-best-nickname": makeNode(),
    status: makeNode(),
    "update-banner": makeNode(),
    "update-version": makeNode(),
  };

  const document = {
    body: {
      dataset: {
        appCommitSha: "local-dev",
        appVersion: "0.2.1",
      },
    },
    addEventListener() {},
    getElementById(id) {
      return nodes[id];
    },
  };

  const window = {
    document,
    fetch: async () => ({
      ok: false,
      status: 503,
      async json() {
        return {};
      },
      async text() {
        return "";
      },
    }),
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    },
    location: {
      reload() {},
    },
    setInterval(fn, delay) {
      const id = nextTimerId;
      nextTimerId += 1;
      intervals.set(id, { delay, fn });
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    setTimeout(fn, delay) {
      const id = nextTimerId;
      nextTimerId += 1;
      timeouts.set(id, { delay, fn });
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
  };

  window.window = window;

  const context = {
    Math: math,
    TextEncoder,
    console,
    document,
    window,
  };
  context.fetch = window.fetch;
  context.clearInterval = window.clearInterval.bind(window);
  context.clearTimeout = window.clearTimeout.bind(window);
  context.setInterval = window.setInterval.bind(window);
  context.setTimeout = window.setTimeout.bind(window);
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(
    `${source}
globalThis.__testExports = {
  draw,
  LOOP_MS,
  SPEED_BOOST_FACTOR,
  SPEED_SLOWDOWN_FACTOR,
  SLOW_FOOD_LIFETIME_MS,
  clearDangerFoodTimers,
  clearObstacleTimers,
  clearSlowFoodTimers,
  scheduleNextSlowFoodSpawn,
  spawnSlowFood,
  startGame,
  state,
  step,
  stopLoop,
};`,
    context,
    { filename: "site/assets/game.js" },
  );

  return {
    drawCalls,
    game: context.__testExports,
    intervals,
    timeouts,
    clearScheduledWork() {
      intervals.clear();
      timeouts.clear();
      drawCalls.length = 0;
    },
    runTimeout(id) {
      const pending = timeouts.get(id);
      assert.ok(pending, `missing timeout ${id}`);
      timeouts.delete(id);
      pending.fn();
    },
    setRandomSequence(sequence, fallback = 0) {
      randomState.sequence = sequence.slice();
      randomState.fallback = fallback;
    },
  };
}

function makeNode() {
  return {
    hidden: false,
    textContent: "",
    value: "",
    addEventListener() {},
    blur() {},
  };
}

function randomForCell(cell) {
  return [(cell.x + 0.1) / 18, (cell.y + 0.1) / 18];
}

function setBaseGameState(game) {
  game.stopLoop();
  game.state.isGameOver = false;
  game.state.snake = [
    { x: 5, y: 5 },
    { x: 4, y: 5 },
    { x: 3, y: 5 },
  ];
  game.state.direction = { x: 1, y: 0 };
  game.state.nextDirection = { x: 1, y: 0 };
  game.state.food = { x: 2, y: 2 };
  game.state.obstacleCells = [{ x: 6, y: 6 }];
  game.state.dangerFood = { x: 4, y: 4 };
  game.state.slowFood = null;
  game.state.score = 0;
  game.state.loopMs = game.LOOP_MS;
  game.state.tickHandle = null;
  game.state.statusText = "Running";
}

test("slow food spawn stays independent from red food and despawns after 5 seconds", () => {
  const harness = createGameHarness();
  const { game } = harness;

  harness.clearScheduledWork();
  setBaseGameState(game);

  harness.setRandomSequence([0, ...randomForCell({ x: 7, y: 8 })]);
  game.scheduleNextSlowFoodSpawn();

  assert.notEqual(game.state.slowFoodSpawnHandle, null);
  assert.equal(game.state.dangerFood.x, 4);
  assert.equal(game.state.dangerFood.y, 4);

  const spawnHandle = game.state.slowFoodSpawnHandle;
  harness.runTimeout(spawnHandle);

  assert.equal(game.state.slowFood.x, 7);
  assert.equal(game.state.slowFood.y, 8);
  assert.equal(game.state.dangerFood.x, 4);
  assert.equal(game.state.dangerFood.y, 4);
  assert.notEqual(game.state.slowFoodDespawnHandle, null);
  assert.equal(
    harness.timeouts.get(game.state.slowFoodDespawnHandle).delay,
    game.SLOW_FOOD_LIFETIME_MS,
  );

  const despawnHandle = game.state.slowFoodDespawnHandle;
  harness.runTimeout(despawnHandle);

  assert.equal(game.state.slowFood, null);
  assert.notEqual(game.state.slowFoodSpawnHandle, null);
});

test("eating slow food grows the snake and reduces speed by 10 percent", () => {
  const harness = createGameHarness();
  const { game } = harness;

  harness.clearScheduledWork();
  setBaseGameState(game);
  game.state.food = { x: 10, y: 10 };
  game.state.dangerFood = null;
  game.state.slowFood = { x: 6, y: 5 };

  game.step();

  assert.equal(game.state.score, 1);
  assert.equal(game.state.snake.length, 4);
  assert.equal(game.state.snake[0].x, 6);
  assert.equal(game.state.snake[0].y, 5);
  assert.equal(game.state.slowFood, null);
  assert.equal(
    game.state.loopMs,
    Math.round(game.LOOP_MS * game.SPEED_SLOWDOWN_FACTOR),
  );
  assert.notEqual(game.state.slowFoodSpawnHandle, null);
  assert.equal(
    harness.intervals.get(game.state.tickHandle).delay,
    game.state.loopMs,
  );
});

test("draw renders blue slow food without replacing red danger food", () => {
  const harness = createGameHarness();
  const { game } = harness;

  harness.clearScheduledWork();
  setBaseGameState(game);
  game.state.food = { x: 2, y: 2 };
  game.state.dangerFood = { x: 4, y: 4 };
  game.state.slowFood = { x: 7, y: 8 };

  game.draw();

  const renderedColors = harness.drawCalls
    .filter((entry) => entry.type === "fillRect")
    .map((entry) => entry.fillStyle);

  assert.ok(renderedColors.includes("#ff4f4f"));
  assert.ok(renderedColors.includes("#4f93ff"));
});
