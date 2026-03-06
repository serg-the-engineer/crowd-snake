const authHeaders = {};

const bestScoreNode = document.getElementById("best-score");
const scoreSourceNode = document.getElementById("score-source");
const requestStatusNode = document.getElementById("request-status");
const scoreForm = document.getElementById("score-form");
const scoreInput = document.getElementById("bestScore");
const refreshButton = document.getElementById("refresh-button");

function setStatus(message, tone = "idle") {
  requestStatusNode.textContent = message;
  requestStatusNode.dataset.tone = tone;
}

async function readState() {
  setStatus("Loading score...", "busy");

  const response = await fetch("/api/state", {
    headers: authHeaders,
  });

  if (!response.ok) {
    throw new Error(`GET /api/state returned ${response.status}`);
  }

  const payload = await response.json();
  bestScoreNode.textContent = String(payload.bestScore ?? 0);
  scoreSourceNode.textContent = `Source: ${payload.source ?? "unknown"}`;
  setStatus("State synchronized", "ok");
}

async function submitState(event) {
  event.preventDefault();
  const candidate = Number.parseInt(scoreInput.value, 10);

  if (!Number.isFinite(candidate) || candidate < 0) {
    setStatus("Enter a non-negative number", "error");
    return;
  }

  setStatus("Submitting score...", "busy");

  const response = await fetch("/api/state", {
    method: "POST",
    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ bestScore: candidate }),
  });

  if (!response.ok) {
    throw new Error(`POST /api/state returned ${response.status}`);
  }

  const payload = await response.json();
  bestScoreNode.textContent = String(payload.bestScore ?? candidate);
  scoreSourceNode.textContent = payload.stored
    ? "Source: postgres"
    : "Source: postgres (existing record kept)";
  setStatus(payload.stored ? "New record stored" : "Record stays unchanged", "ok");
}

async function refreshState() {
  try {
    await readState();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

scoreForm.addEventListener("submit", async (event) => {
  try {
    await submitState(event);
  } catch (error) {
    setStatus(error.message, "error");
  }
});

refreshButton.addEventListener("click", () => {
  void refreshState();
});

void refreshState();
