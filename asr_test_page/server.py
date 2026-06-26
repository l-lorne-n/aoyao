from __future__ import annotations

import argparse
import base64
import datetime as dt
import hashlib
import hmac
import importlib.util
import io
import json
import mimetypes
import os
import socketserver
import sqlite3
import sys
import time
import urllib.error
import urllib.request
import urllib.parse
import uuid
import wave
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler
from pathlib import Path
from typing import Any


APP_DIR = Path(__file__).resolve().parent
ROOT_DIR = APP_DIR.parent
STATIC_DIR = APP_DIR / "static"
DATA_DIR = ROOT_DIR / "data"
DB_PATH = DATA_DIR / "aoyao_records.sqlite3"

TENCENT_ENDPOINT = "https://asr.tencentcloudapi.com"
TENCENT_HOST = "asr.tencentcloudapi.com"
TENCENT_SERVICE = "asr"
TENCENT_ACTION = "SentenceRecognition"
TENCENT_VERSION = "2019-06-14"

MAX_JSON_BYTES = 8 * 1024 * 1024
MAX_AUDIO_BYTES = 5 * 1024 * 1024
MAX_AUDIO_SECONDS = 60.5
MAX_RECORD_JSON_BYTES = 2 * 1024 * 1024


def load_dotenv() -> None:
    for env_path in (ROOT_DIR / ".env", APP_DIR / ".env"):
        if not env_path.exists():
            continue
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def load_tencent_key_file() -> None:
    for key_path in (
        ROOT_DIR / "tecent_api_key.txt",
        ROOT_DIR / "tencent_api_key.txt",
        APP_DIR / "tecent_api_key.txt",
        APP_DIR / "tencent_api_key.txt",
    ):
        if not key_path.exists():
            continue

        parsed: dict[str, str] = {}
        for raw_line in key_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or ":" not in line:
                continue
            key, value = line.split(":", 1)
            parsed[key.strip().lower()] = value.strip()

        if parsed.get("secretid") and "TENCENT_SECRET_ID" not in os.environ:
            os.environ["TENCENT_SECRET_ID"] = parsed["secretid"]
        if parsed.get("secretkey") and "TENCENT_SECRET_KEY" not in os.environ:
            os.environ["TENCENT_SECRET_KEY"] = parsed["secretkey"]
        return


def json_response(
    handler: SimpleHTTPRequestHandler,
    status: int,
    payload: dict[str, Any],
) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def read_json_body(handler: SimpleHTTPRequestHandler, max_bytes: int = MAX_JSON_BYTES) -> dict[str, Any]:
    content_length = int(handler.headers.get("Content-Length", "0"))
    if content_length <= 0 or content_length > max_bytes:
        raise ValueError("请求体为空或过大。")
    body = handler.rfile.read(content_length)
    parsed = json.loads(body.decode("utf-8"))
    if not isinstance(parsed, dict):
        raise ValueError("请求体必须是 JSON 对象。")
    return parsed


def utc_now_text() -> str:
    return dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def init_database() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                record_date TEXT,
                name TEXT,
                gender TEXT,
                age TEXT,
                phone TEXT,
                chief_complaint TEXT,
                past_history TEXT,
                allergy_history TEXT,
                tongue_pulse TEXT,
                data_json TEXT NOT NULL
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_records_updated ON records(updated_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_records_name ON records(name)")
        conn.commit()


def normalize_record(payload: dict[str, Any]) -> dict[str, Any]:
    patient = payload.get("patient") if isinstance(payload.get("patient"), dict) else {}
    normalized = {
        "id": payload.get("id"),
        "patient": {
            "name": str(patient.get("name", "")).strip(),
            "gender": str(patient.get("gender", "")).strip(),
            "age": str(patient.get("age", "")).strip(),
            "phone": str(patient.get("phone", "")).strip(),
            "recordDate": str(patient.get("recordDate", "")).strip(),
        },
        "chiefComplaint": str(payload.get("chiefComplaint", "")).strip(),
        "pastHistory": str(payload.get("pastHistory", "")).strip(),
        "allergyHistory": str(payload.get("allergyHistory", "")).strip(),
        "symptoms": payload.get("symptoms") if isinstance(payload.get("symptoms"), list) else [],
        "vitals": payload.get("vitals") if isinstance(payload.get("vitals"), dict) else {},
        "menstrual": payload.get("menstrual") if isinstance(payload.get("menstrual"), dict) else {},
        "tonguePulse": str(payload.get("tonguePulse", "")).strip(),
        "advice": payload.get("advice") if isinstance(payload.get("advice"), dict) else {},
        "visits": payload.get("visits") if isinstance(payload.get("visits"), list) else [],
        "notes": str(payload.get("notes", "")).strip(),
    }
    return normalized


def record_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    data = json.loads(row["data_json"])
    data["id"] = row["id"]
    data["createdAt"] = row["created_at"]
    data["updatedAt"] = row["updated_at"]
    return data


def save_record(payload: dict[str, Any]) -> dict[str, Any]:
    record = normalize_record(payload)
    patient = record["patient"]
    now = utc_now_text()
    data_json = json.dumps(record, ensure_ascii=False, separators=(",", ":"))

    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        record_id = record.get("id")
        if record_id:
            existing = conn.execute("SELECT id FROM records WHERE id = ?", (record_id,)).fetchone()
        else:
            existing = None

        if existing:
            conn.execute(
                """
                UPDATE records
                SET updated_at = ?, record_date = ?, name = ?, gender = ?, age = ?,
                    phone = ?, chief_complaint = ?, past_history = ?, allergy_history = ?,
                    tongue_pulse = ?, data_json = ?
                WHERE id = ?
                """,
                (
                    now,
                    patient["recordDate"],
                    patient["name"],
                    patient["gender"],
                    patient["age"],
                    patient["phone"],
                    record["chiefComplaint"],
                    record["pastHistory"],
                    record["allergyHistory"],
                    record["tonguePulse"],
                    data_json,
                    record_id,
                ),
            )
        else:
            cursor = conn.execute(
                """
                INSERT INTO records (
                    created_at, updated_at, record_date, name, gender, age, phone,
                    chief_complaint, past_history, allergy_history, tongue_pulse, data_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    now,
                    now,
                    patient["recordDate"],
                    patient["name"],
                    patient["gender"],
                    patient["age"],
                    patient["phone"],
                    record["chiefComplaint"],
                    record["pastHistory"],
                    record["allergyHistory"],
                    record["tonguePulse"],
                    data_json,
                ),
            )
            record_id = cursor.lastrowid

        conn.commit()
        row = conn.execute("SELECT * FROM records WHERE id = ?", (record_id,)).fetchone()
        return record_row_to_dict(row)


def list_records(query: str = "") -> list[dict[str, Any]]:
    params: list[Any] = []
    where = ""
    if query:
        like = f"%{query}%"
        where = """
        WHERE name LIKE ? OR phone LIKE ? OR chief_complaint LIKE ?
           OR past_history LIKE ? OR allergy_history LIKE ? OR tongue_pulse LIKE ?
        """
        params = [like, like, like, like, like, like]

    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            f"""
            SELECT id, created_at, updated_at, record_date, name, gender, age, phone,
                   chief_complaint
            FROM records
            {where}
            ORDER BY updated_at DESC
            LIMIT 200
            """,
            params,
        ).fetchall()

    return [
        {
            "id": row["id"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            "recordDate": row["record_date"] or "",
            "name": row["name"] or "",
            "gender": row["gender"] or "",
            "age": row["age"] or "",
            "phone": row["phone"] or "",
            "chiefComplaint": (row["chief_complaint"] or "")[:80],
        }
        for row in rows
    ]


def get_record(record_id: int) -> dict[str, Any] | None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM records WHERE id = ?", (record_id,)).fetchone()
    return record_row_to_dict(row) if row else None


def delete_record(record_id: int) -> bool:
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute("DELETE FROM records WHERE id = ?", (record_id,))
        conn.commit()
        return cursor.rowcount > 0


def public_config() -> dict[str, str]:
    sdk_available = is_tencent_sdk_available()
    transport = os.getenv("TENCENT_ASR_TRANSPORT", "auto").lower()
    if transport == "auto":
        transport = "sdk" if sdk_available else "http"

    return {
        "engine": get_env("TENCENT_ASR_ENGINE", default="16k_zh_medical"),
        "region": tencent_region(),
        "transport": transport,
        "sdkAvailable": str(sdk_available).lower(),
        "hasCredentials": str(bool(tencent_secret_id() and tencent_secret_key())).lower(),
        "hotwordId": "configured" if os.getenv("TENCENT_ASR_HOTWORD_ID") else "",
    }


def get_env(*names: str, default: str = "") -> str:
    for name in names:
        value = os.getenv(name)
        if value:
            return value
    return default


def tencent_secret_id() -> str:
    return get_env("TENCENT_SECRET_ID", "TENCENTCLOUD_SECRET_ID")


def tencent_secret_key() -> str:
    return get_env("TENCENT_SECRET_KEY", "TENCENTCLOUD_SECRET_KEY")


def tencent_token() -> str:
    return get_env("TENCENT_TOKEN", "TENCENTCLOUD_TOKEN")


def tencent_region() -> str:
    return get_env("TENCENT_REGION", "TENCENTCLOUD_REGION", default="ap-guangzhou")


def is_tencent_sdk_available() -> bool:
    return (
        importlib.util.find_spec("tencentcloud") is not None
        and importlib.util.find_spec("tencentcloud.asr") is not None
    )


def hmac_sha256(key: bytes, message: str) -> bytes:
    return hmac.new(key, message.encode("utf-8"), hashlib.sha256).digest()


def sha256_hex(message: bytes | str) -> str:
    if isinstance(message, str):
        message = message.encode("utf-8")
    return hashlib.sha256(message).hexdigest()


def build_tencent_headers(payload: bytes) -> dict[str, str]:
    secret_id = tencent_secret_id()
    secret_key = tencent_secret_key()
    if not secret_id or not secret_key:
        raise RuntimeError(
            "缺少腾讯云密钥，请在 .env 中填写 TENCENT_SECRET_ID/TENCENT_SECRET_KEY "
            "或官方 SDK 常用的 TENCENTCLOUD_SECRET_ID/TENCENTCLOUD_SECRET_KEY。"
        )

    timestamp = int(time.time())
    date = dt.datetime.utcfromtimestamp(timestamp).strftime("%Y-%m-%d")

    canonical_headers = (
        "content-type:application/json; charset=utf-8\n"
        f"host:{TENCENT_HOST}\n"
        f"x-tc-action:{TENCENT_ACTION.lower()}\n"
    )
    signed_headers = "content-type;host;x-tc-action"
    canonical_request = "\n".join(
        [
            "POST",
            "/",
            "",
            canonical_headers,
            signed_headers,
            sha256_hex(payload),
        ]
    )

    credential_scope = f"{date}/{TENCENT_SERVICE}/tc3_request"
    string_to_sign = "\n".join(
        [
            "TC3-HMAC-SHA256",
            str(timestamp),
            credential_scope,
            sha256_hex(canonical_request),
        ]
    )

    secret_date = hmac_sha256(("TC3" + secret_key).encode("utf-8"), date)
    secret_service = hmac_sha256(secret_date, TENCENT_SERVICE)
    secret_signing = hmac_sha256(secret_service, "tc3_request")
    signature = hmac.new(
        secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256
    ).hexdigest()

    authorization = (
        "TC3-HMAC-SHA256 "
        f"Credential={secret_id}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, "
        f"Signature={signature}"
    )

    headers = {
        "Authorization": authorization,
        "Content-Type": "application/json; charset=utf-8",
        "Host": TENCENT_HOST,
        "X-TC-Action": TENCENT_ACTION,
        "X-TC-Timestamp": str(timestamp),
        "X-TC-Version": TENCENT_VERSION,
        "X-TC-Region": tencent_region(),
    }

    token = tencent_token()
    if token:
        headers["X-TC-Token"] = token

    return headers


def wav_duration_seconds(audio_bytes: bytes) -> float:
    with wave.open(io.BytesIO(audio_bytes), "rb") as wav_file:
        frames = wav_file.getnframes()
        frame_rate = wav_file.getframerate()
        if frame_rate <= 0:
            raise ValueError("WAV 采样率无效。")
        return frames / frame_rate


def build_sentence_request_payload(audio_bytes: bytes) -> dict[str, Any]:
    request_payload: dict[str, Any] = {
        "ProjectId": 0,
        "SubServiceType": 2,
        "EngSerViceType": get_env("TENCENT_ASR_ENGINE", default="16k_zh_medical"),
        "SourceType": 1,
        "VoiceFormat": "wav",
        "UsrAudioKey": uuid.uuid4().hex,
        "Data": base64.b64encode(audio_bytes).decode("ascii"),
        "DataLen": len(audio_bytes),
        "FilterDirty": 0,
        "FilterModal": 0,
        "FilterPunc": int(os.getenv("TENCENT_ASR_FILTER_PUNC", "0")),
        "ConvertNumMode": 1,
        "WordInfo": 0,
    }

    hotword_id = os.getenv("TENCENT_ASR_HOTWORD_ID")
    if hotword_id:
        request_payload["HotwordId"] = hotword_id

    return request_payload


def should_use_tencent_sdk() -> bool:
    transport = os.getenv("TENCENT_ASR_TRANSPORT", "auto").lower()
    if transport == "http":
        return False
    if transport == "sdk":
        if not is_tencent_sdk_available():
            raise RuntimeError(
                "TENCENT_ASR_TRANSPORT=sdk，但当前 Python 环境未安装腾讯云 ASR SDK。"
            )
        return True
    return is_tencent_sdk_available()


def call_tencent_sdk(request_payload: dict[str, Any]) -> dict[str, Any]:
    secret_id = tencent_secret_id()
    secret_key = tencent_secret_key()
    if not secret_id or not secret_key:
        raise RuntimeError(
            "缺少腾讯云密钥，请先在 .env 中填写 SecretId 和 SecretKey。"
        )

    from tencentcloud.asr.v20190614 import asr_client, models
    from tencentcloud.common import credential
    from tencentcloud.common.profile.client_profile import ClientProfile
    from tencentcloud.common.profile.http_profile import HttpProfile

    token = tencent_token()
    cred = (
        credential.Credential(secret_id, secret_key, token)
        if token
        else credential.Credential(secret_id, secret_key)
    )
    http_profile = HttpProfile()
    http_profile.endpoint = TENCENT_HOST
    client_profile = ClientProfile()
    client_profile.httpProfile = http_profile
    client = asr_client.AsrClient(cred, tencent_region(), client_profile)

    request = models.SentenceRecognitionRequest()
    request.from_json_string(json.dumps(request_payload, ensure_ascii=False))
    response = client.SentenceRecognition(request)
    return json.loads(response.to_json_string())


def call_tencent_http(request_payload: dict[str, Any]) -> dict[str, Any]:
    payload = json.dumps(request_payload, ensure_ascii=False, separators=(",", ":")).encode(
        "utf-8"
    )
    headers = build_tencent_headers(payload)

    request = urllib.request.Request(
        TENCENT_ENDPOINT, data=payload, headers=headers, method="POST"
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            response_body = response.read()
    except urllib.error.HTTPError as exc:
        response_body = exc.read()
        raise RuntimeError(parse_tencent_error(response_body) or f"腾讯云接口返回 HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"无法连接腾讯云接口：{exc.reason}") from exc

    return json.loads(response_body.decode("utf-8"))


def parse_sentence_response(parsed: dict[str, Any]) -> dict[str, Any]:
    response_data = parsed.get("Response", parsed)
    if "Error" in response_data:
        error = response_data["Error"]
        message = error.get("Message") or "腾讯云识别失败。"
        code = error.get("Code")
        raise RuntimeError(f"{code}: {message}" if code else message)
    return response_data


def transcribe_audio(audio_bytes: bytes) -> dict[str, Any]:
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise ValueError("音频文件过大，请录制 60 秒以内的短音频。")

    duration = wav_duration_seconds(audio_bytes)
    if duration > MAX_AUDIO_SECONDS:
        raise ValueError("音频超过 60 秒，请重新录制更短的一段。")

    request_payload = build_sentence_request_payload(audio_bytes)

    started = time.perf_counter()
    if should_use_tencent_sdk():
        parsed = call_tencent_sdk(request_payload)
        transport = "sdk"
    else:
        parsed = call_tencent_http(request_payload)
        transport = "http"

    elapsed_ms = round((time.perf_counter() - started) * 1000)
    response_data = parse_sentence_response(parsed)

    return {
        "text": response_data.get("Result", ""),
        "audioDuration": response_data.get("AudioDuration", duration),
        "latencyMs": elapsed_ms,
        "requestId": response_data.get("RequestId", ""),
        "engine": request_payload["EngSerViceType"],
        "transport": transport,
        "audioBytes": len(audio_bytes),
    }


def parse_tencent_error(response_body: bytes) -> str:
    try:
        parsed = json.loads(response_body.decode("utf-8"))
        error = parsed.get("Response", {}).get("Error", {})
        code = error.get("Code")
        message = error.get("Message")
        if code and message:
            return f"{code}: {message}"
        return message or code or ""
    except Exception:
        return response_body.decode("utf-8", errors="replace")[:500]


class AsrTestHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path: str) -> str:
        clean_path = urllib.parse.urlparse(path).path
        if clean_path in ("/", "/index.html"):
            return str(STATIC_DIR / "index.html")
        if clean_path in ("/records", "/records.html"):
            return str(STATIC_DIR / "records.html")
        return str(STATIC_DIR / clean_path.lstrip("/"))

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:
        parsed_path = urllib.parse.urlparse(self.path)
        if parsed_path.path == "/api/config":
            json_response(self, HTTPStatus.OK, {"ok": True, "config": public_config()})
            return
        if parsed_path.path == "/api/db-info":
            init_database()
            json_response(
                self,
                HTTPStatus.OK,
                {"ok": True, "dbPath": str(DB_PATH), "recordCount": len(list_records())},
            )
            return
        if parsed_path.path == "/api/records":
            init_database()
            query = urllib.parse.parse_qs(parsed_path.query).get("query", [""])[0].strip()
            json_response(self, HTTPStatus.OK, {"ok": True, "records": list_records(query)})
            return
        if parsed_path.path.startswith("/api/records/"):
            init_database()
            try:
                record_id = int(parsed_path.path.rsplit("/", 1)[1])
            except ValueError:
                json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "病历 ID 无效。"})
                return
            record = get_record(record_id)
            if not record:
                json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "病历不存在。"})
                return
            json_response(self, HTTPStatus.OK, {"ok": True, "record": record})
            return
        return super().do_GET()

    def do_POST(self) -> None:
        parsed_path = urllib.parse.urlparse(self.path)
        if parsed_path.path == "/api/records":
            try:
                init_database()
                request_json = read_json_body(self, MAX_RECORD_JSON_BYTES)
                saved = save_record(request_json)
                json_response(self, HTTPStatus.OK, {"ok": True, "record": saved})
            except Exception as exc:
                json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})
            return

        if parsed_path.path != "/api/transcribe":
            json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "接口不存在。"})
            return

        try:
            request_json = read_json_body(self)
            audio_base64 = str(request_json.get("audioBase64", ""))
            if "," in audio_base64:
                audio_base64 = audio_base64.split(",", 1)[1]
            if not audio_base64:
                raise ValueError("没有收到录音数据。")

            audio_bytes = base64.b64decode(audio_base64, validate=True)
            result = transcribe_audio(audio_bytes)
            json_response(self, HTTPStatus.OK, {"ok": True, **result})
        except Exception as exc:
            json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})

    def do_DELETE(self) -> None:
        parsed_path = urllib.parse.urlparse(self.path)
        if not parsed_path.path.startswith("/api/records/"):
            json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "接口不存在。"})
            return
        try:
            init_database()
            record_id = int(parsed_path.path.rsplit("/", 1)[1])
            if not delete_record(record_id):
                json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "病历不存在。"})
                return
            json_response(self, HTTPStatus.OK, {"ok": True})
        except Exception as exc:
            json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})

    def guess_type(self, path: str) -> str:
        if path.endswith(".js"):
            return "text/javascript"
        if path.endswith(".css"):
            return "text/css"
        return mimetypes.guess_type(path)[0] or "application/octet-stream"

    def log_message(self, format: str, *args: Any) -> None:
        message = format % args
        sys.stderr.write(f"[asr-test] {self.address_string()} {message}\n")


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def run_server(host: str, port: int) -> None:
    load_dotenv()
    load_tencent_key_file()
    init_database()
    with ThreadedTCPServer((host, port), AsrTestHandler) as server:
        url = f"http://{host}:{port}"
        print(f"ASR test page: {url}", flush=True)
        print("Press Ctrl+C to stop.", flush=True)
        server.serve_forever()


def main() -> None:
    parser = argparse.ArgumentParser(description="Local Tencent ASR test page.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    run_server(args.host, args.port)


if __name__ == "__main__":
    main()
