import json
import os
import secrets
import socket
import subprocess
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse


STATE_KEY = os.environ.get("DEMO_STATE_KEY", "crowd-snake:best-score")
DATABASE_URL = os.environ.get(
    "DEMO_DATABASE_URL",
    "postgresql://crowd_snake:crowd_snake@db:5433/crowd_snake?sslmode=disable",
)
REDIS_URL = os.environ.get("DEMO_REDIS_URL", "redis://redis:6380/0")
API_HOST = os.environ.get("DEMO_API_HOST", "0.0.0.0")
API_PORT = int(os.environ.get("DEMO_API_PORT", "9001"))
DEFAULT_NICKNAME = "anonymous"
MAX_NICKNAME_LENGTH = 24
CHALLENGE_TTL_SECONDS = 30
CHALLENGE_DIFFICULTY = 4
CHALLENGE_MAX_PROOF_NONCE = 2_000_000


def parse_redis_url(url):
    parsed = urlparse(url)
    if parsed.scheme != "redis":
        raise ValueError("DEMO_REDIS_URL must use redis://")

    host = parsed.hostname or "redis"
    port = parsed.port or 6380
    database = 0

    if parsed.path and parsed.path != "/":
        database = int(parsed.path.lstrip("/"))

    return host, port, database


def normalize_nickname(raw_value):
    if raw_value is None:
        return DEFAULT_NICKNAME

    if not isinstance(raw_value, str):
        raise ValueError("nickname must be a string")

    normalized = " ".join(raw_value.strip().split())
    if not normalized:
        return DEFAULT_NICKNAME

    return normalized[:MAX_NICKNAME_LENGTH]


def fnv1a_32(text):
    result = 2166136261

    for chunk in text.encode("utf-8"):
        result ^= chunk
        result = (result * 16777619) & 0xFFFFFFFF

    return f"{result:08x}"


class RedisClient:
    def __init__(self, url):
        self.host, self.port, self.database = parse_redis_url(url)

    def _write_command(self, connection, *parts):
        chunks = [f"*{len(parts)}\r\n".encode("utf-8")]

        for part in parts:
            encoded = str(part).encode("utf-8")
            chunks.append(f"${len(encoded)}\r\n".encode("utf-8"))
            chunks.append(encoded + b"\r\n")

        connection.sendall(b"".join(chunks))

    def _readline(self, connection):
        data = bytearray()

        while True:
            char = connection.recv(1)
            if not char:
                raise ConnectionError("unexpected EOF from redis")
            data.extend(char)
            if data.endswith(b"\r\n"):
                return bytes(data[:-2])

    def _read_response(self, connection):
        prefix = connection.recv(1)
        if not prefix:
            raise ConnectionError("unexpected EOF from redis")

        if prefix == b"+":
            return self._readline(connection).decode("utf-8")

        if prefix == b":":
            return int(self._readline(connection))

        if prefix == b"$":
            length = int(self._readline(connection))
            if length == -1:
                return None

            payload = bytearray()
            while len(payload) < length:
                chunk = connection.recv(length - len(payload))
                if not chunk:
                    raise ConnectionError("unexpected EOF from redis")
                payload.extend(chunk)

            trailer = connection.recv(2)
            if trailer != b"\r\n":
                raise ConnectionError("malformed bulk string from redis")

            return payload.decode("utf-8")

        if prefix == b"-":
            message = self._readline(connection).decode("utf-8")
            raise RuntimeError(message)

        if prefix == b"*":
            length = int(self._readline(connection))
            return [self._read_response(connection) for _ in range(length)]

        raise RuntimeError(f"unsupported redis response prefix: {prefix!r}")

    def _call(self, *parts):
        with socket.create_connection((self.host, self.port), timeout=2) as connection:
            if self.database:
                self._write_command(connection, "SELECT", self.database)
                self._read_response(connection)

            self._write_command(connection, *parts)
            return self._read_response(connection)

    def ping(self):
        return self._call("PING") == "PONG"

    def get_best_state(self):
        payload = self._call("GET", STATE_KEY)
        if payload is None:
            return None

        try:
            parsed = json.loads(payload)
            best_score = max(int(parsed.get("bestScore", 0)), 0)
            best_nickname = normalize_nickname(parsed.get("bestNickname"))
            return {"bestScore": best_score, "bestNickname": best_nickname}
        except Exception:
            return {
                "bestScore": max(int(payload), 0),
                "bestNickname": DEFAULT_NICKNAME,
            }

    def cache_best_state(self, state):
        payload = json.dumps(
            {
                "bestScore": max(int(state.get("bestScore", 0)), 0),
                "bestNickname": normalize_nickname(state.get("bestNickname")),
            },
            ensure_ascii=False,
        )
        self._call("SET", STATE_KEY, payload)


class PostgresClient:
    def __init__(self, database_url):
        self.database_url = database_url
        self._schema_ready = False
        self._schema_lock = threading.Lock()

    def _run_sql(self, statement):
        result = subprocess.run(
            [
                "psql",
                self.database_url,
                "-v",
                "ON_ERROR_STOP=1",
                "-q",
                "-t",
                "-A",
                "-c",
                statement,
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip()

    def _sql_literal(self, value):
        return "'" + str(value).replace("'", "''") + "'"

    def ensure_schema(self):
        if self._schema_ready:
            return

        with self._schema_lock:
            if self._schema_ready:
                return

            self._run_sql(
                """
                CREATE TABLE IF NOT EXISTS demo_state (
                    id SMALLINT PRIMARY KEY,
                    best_score INTEGER NOT NULL CHECK (best_score >= 0),
                    best_nickname TEXT NOT NULL DEFAULT 'anonymous',
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                ALTER TABLE demo_state
                ADD COLUMN IF NOT EXISTS best_nickname TEXT NOT NULL DEFAULT 'anonymous';
                """
            )
            self._schema_ready = True

    def ping(self):
        return self._run_sql("SELECT 1;") == "1"

    def get_best_state(self):
        self.ensure_schema()
        payload = self._run_sql(
            """
            SELECT COALESCE(
                (
                    SELECT json_build_object(
                        'bestScore', best_score,
                        'bestNickname', best_nickname
                    )::text
                    FROM demo_state
                    WHERE id = 1
                ),
                '{"bestScore":0,"bestNickname":"anonymous"}'
            );
            """
        )
        parsed = json.loads(payload)
        return {
            "bestScore": max(int(parsed.get("bestScore", 0)), 0),
            "bestNickname": normalize_nickname(parsed.get("bestNickname")),
        }

    def save_best_state(self, score, nickname):
        self.ensure_schema()
        candidate_score = max(int(score), 0)
        candidate_nickname = normalize_nickname(nickname)
        nickname_sql = self._sql_literal(candidate_nickname)

        payload = self._run_sql(
            (
                "INSERT INTO demo_state (id, best_score, best_nickname) "
                "VALUES (1, {candidate_score}, {candidate_nickname}) "
                "ON CONFLICT (id) DO UPDATE SET "
                "best_score = GREATEST(demo_state.best_score, EXCLUDED.best_score), "
                "best_nickname = CASE "
                "  WHEN EXCLUDED.best_score > demo_state.best_score THEN EXCLUDED.best_nickname "
                "  ELSE demo_state.best_nickname "
                "END, "
                "updated_at = CASE "
                "  WHEN EXCLUDED.best_score > demo_state.best_score THEN NOW() "
                "  ELSE demo_state.updated_at "
                "END "
                "RETURNING json_build_object("
                "  'bestScore', best_score, "
                "  'bestNickname', best_nickname, "
                "  'stored', best_score = {candidate_score} AND best_nickname = {candidate_nickname}"
                ")::text;"
            ).format(candidate_score=candidate_score, candidate_nickname=nickname_sql)
        )

        parsed = json.loads(payload)
        return {
            "bestScore": max(int(parsed.get("bestScore", 0)), 0),
            "bestNickname": normalize_nickname(parsed.get("bestNickname")),
            "stored": bool(parsed.get("stored", False)),
        }


class ChallengeStore:
    def __init__(self, ttl_seconds, difficulty):
        self.ttl_seconds = max(int(ttl_seconds), 5)
        self.difficulty = max(int(difficulty), 1)
        self._lock = threading.Lock()
        self._pending = {}

    def _prune_expired(self, now):
        expired = [
            challenge_id
            for challenge_id, challenge in self._pending.items()
            if challenge["expiresAt"] <= now
        ]
        for challenge_id in expired:
            self._pending.pop(challenge_id, None)

    def create(self):
        now = time.time()
        challenge = {
            "challengeId": secrets.token_hex(16),
            "nonce": secrets.token_hex(8),
            "difficulty": self.difficulty,
            "expiresAt": int(now + self.ttl_seconds),
        }

        with self._lock:
            self._prune_expired(now)
            self._pending[challenge["challengeId"]] = {
                "nonce": challenge["nonce"],
                "expiresAt": challenge["expiresAt"],
            }

        return challenge

    def verify_and_consume(self, challenge_id, nickname, score, proof_nonce):
        now = time.time()

        with self._lock:
            self._prune_expired(now)
            challenge = self._pending.get(challenge_id)

        if challenge is None:
            return False, "challenge missing or expired"

        nonce_value = int(proof_nonce)
        if nonce_value < 0 or nonce_value > CHALLENGE_MAX_PROOF_NONCE:
            return False, "proofNonce is out of accepted range"

        token = fnv1a_32(
            f"{challenge_id}:{challenge['nonce']}:{nickname}:{score}:{nonce_value}"
        )
        if not token.startswith("0" * self.difficulty):
            return False, "proof check failed"

        with self._lock:
            if challenge_id not in self._pending:
                return False, "challenge already used"
            self._pending.pop(challenge_id, None)

        return True, None


class DemoStateHandler(BaseHTTPRequestHandler):
    postgres = PostgresClient(DATABASE_URL)
    redis = RedisClient(REDIS_URL)
    challenges = ChallengeStore(CHALLENGE_TTL_SECONDS, CHALLENGE_DIFFICULTY)

    def log_message(self, format, *args):
        return

    def _send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length) if length else b"{}"
        if not raw_body:
            return {}
        return json.loads(raw_body.decode("utf-8"))

    def _load_best_state(self):
        try:
            cached_state = self.redis.get_best_state()
            if cached_state is not None:
                return cached_state, "redis"
        except Exception:
            pass

        best_state = self.postgres.get_best_state()

        try:
            self.redis.cache_best_state(best_state)
        except Exception:
            pass

        return best_state, "postgres"

    def do_GET(self):
        parsed_path = urlparse(self.path)

        if parsed_path.path == "/healthz":
            redis_ok = False

            try:
                self.postgres.ping()
            except Exception as error:
                self._send_json(
                    HTTPStatus.SERVICE_UNAVAILABLE,
                    {"ok": False, "postgres": False, "redis": False, "error": str(error)},
                )
                return

            try:
                redis_ok = self.redis.ping()
            except Exception:
                redis_ok = False

            self._send_json(
                HTTPStatus.OK,
                {"ok": True, "postgres": True, "redis": redis_ok},
            )
            return

        if parsed_path.path == "/api/challenge":
            challenge = self.challenges.create()
            self._send_json(HTTPStatus.OK, challenge)
            return

        if parsed_path.path == "/api/state":
            try:
                best_state, source = self._load_best_state()
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "bestScore": best_state["bestScore"],
                        "bestNickname": best_state["bestNickname"],
                        "source": source,
                    },
                )
            except Exception as error:
                self._send_json(
                    HTTPStatus.SERVICE_UNAVAILABLE,
                    {"error": "backend unavailable", "details": str(error)},
                )
            return

        self._send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})

    def do_POST(self):
        parsed_path = urlparse(self.path)

        if parsed_path.path != "/api/state":
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
            return

        try:
            payload = self._read_json()
            candidate_score = max(int(payload.get("bestScore", 0)), 0)
            candidate_nickname = normalize_nickname(payload.get("nickname"))
            challenge_id = payload.get("challengeId")
            proof_nonce = int(payload.get("proofNonce"))

            if not isinstance(challenge_id, str) or not challenge_id:
                raise ValueError("challengeId must be a non-empty string")

            challenge_ok, challenge_error = self.challenges.verify_and_consume(
                challenge_id,
                candidate_nickname,
                candidate_score,
                proof_nonce,
            )
            if not challenge_ok:
                self._send_json(
                    HTTPStatus.BAD_REQUEST,
                    {"error": challenge_error},
                )
                return

            result = self.postgres.save_best_state(candidate_score, candidate_nickname)

            cache_updated = True
            try:
                self.redis.cache_best_state(result)
            except Exception:
                cache_updated = False

            self._send_json(
                HTTPStatus.OK,
                {
                    "bestScore": result["bestScore"],
                    "bestNickname": result["bestNickname"],
                    "stored": result["stored"],
                    "cacheUpdated": cache_updated,
                },
            )
        except (TypeError, ValueError, json.JSONDecodeError) as error:
            self._send_json(
                HTTPStatus.BAD_REQUEST,
                {
                    "error": (
                        "bestScore must be a non-negative integer; nickname must be text; "
                        "challengeId must be provided; proofNonce must be a non-negative integer"
                    ),
                    "details": str(error),
                },
            )
        except Exception as error:
            self._send_json(
                HTTPStatus.SERVICE_UNAVAILABLE,
                {"error": "backend unavailable", "details": str(error)},
            )


if __name__ == "__main__":
    server = ThreadingHTTPServer((API_HOST, API_PORT), DemoStateHandler)
    server.serve_forever()
