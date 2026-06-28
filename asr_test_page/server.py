from __future__ import annotations

import argparse
import base64
import ctypes
import datetime as dt
import hashlib
import html
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
from ctypes import wintypes
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler
from pathlib import Path
from typing import Any


if getattr(sys, "frozen", False):
    RUNTIME_DIR = Path(sys.executable).resolve().parent
    RESOURCE_DIR = Path(getattr(sys, "_MEIPASS", RUNTIME_DIR))
    APP_DIR = RESOURCE_DIR / "asr_test_page"
    if not (APP_DIR / "static").exists():
        APP_DIR = RESOURCE_DIR
else:
    APP_DIR = Path(__file__).resolve().parent
    RUNTIME_DIR = APP_DIR.parent

ROOT_DIR = RUNTIME_DIR
STATIC_DIR = APP_DIR / "static"
DATA_DIR = RUNTIME_DIR / "data"
PDF_OUTPUT_DIR = RUNTIME_DIR / "output" / "pdf"
DB_PATH = DATA_DIR / "aoyao_records.sqlite3"
BUNDLED_SITE_PACKAGES = (
    Path.home()
    / ".cache"
    / "codex-runtimes"
    / "codex-primary-runtime"
    / "dependencies"
    / "python"
    / "Lib"
    / "site-packages"
)

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
                address TEXT,
                record_no TEXT,
                record_date TEXT,
                name TEXT,
                gender TEXT,
                age TEXT,
                phone TEXT,
                chief_complaint TEXT,
                past_history TEXT,
                allergy_history TEXT,
                tongue_pulse TEXT,
                deleted_at TEXT,
                data_json TEXT NOT NULL
            )
            """
        )
        columns = {
            row[1]
            for row in conn.execute("PRAGMA table_info(records)").fetchall()
        }
        if "address" not in columns:
            conn.execute("ALTER TABLE records ADD COLUMN address TEXT")
        if "record_no" not in columns:
            conn.execute("ALTER TABLE records ADD COLUMN record_no TEXT")
        if "deleted_at" not in columns:
            conn.execute("ALTER TABLE records ADD COLUMN deleted_at TEXT")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_records_updated ON records(updated_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_records_address ON records(address)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_records_name ON records(name)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_records_no ON records(record_no)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_records_deleted ON records(deleted_at)")
        backfill_record_addresses(conn)
        conn.execute("DROP INDEX IF EXISTS idx_records_no_unique")
        conn.execute("DROP INDEX IF EXISTS idx_records_address_no_unique")
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_records_active_address_no_unique
            ON records(COALESCE(address, ''), record_no)
            WHERE deleted_at IS NULL AND record_no IS NOT NULL AND record_no != ''
            """
        )
        conn.commit()


def backfill_record_addresses(conn: sqlite3.Connection) -> None:
    rows = conn.execute(
        """
        SELECT id, data_json
        FROM records
        WHERE (address IS NULL OR address = '') AND data_json IS NOT NULL AND data_json != ''
        """
    ).fetchall()
    for record_id, data_json in rows:
        try:
            data = json.loads(data_json)
        except json.JSONDecodeError:
            continue
        patient = data.get("patient") if isinstance(data.get("patient"), dict) else {}
        address = str(patient.get("address", "")).strip()
        if address:
            conn.execute("UPDATE records SET address = ? WHERE id = ?", (address, record_id))


def normalize_record(payload: dict[str, Any]) -> dict[str, Any]:
    patient = payload.get("patient") if isinstance(payload.get("patient"), dict) else {}
    address = str(patient.get("address", payload.get("address", ""))).strip()
    record_no = str(patient.get("recordNo", payload.get("recordNo", ""))).strip()
    normalized = {
        "id": payload.get("id"),
        "patient": {
            "address": address,
            "recordNo": record_no,
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
    data["deletedAt"] = row["deleted_at"] or ""
    data["address"] = row["address"] or ""
    data["recordNo"] = row["record_no"] or ""
    patient = data.get("patient") if isinstance(data.get("patient"), dict) else {}
    patient["address"] = row["address"] or patient.get("address", "")
    data["address"] = patient["address"]
    patient["recordNo"] = row["record_no"] or patient.get("recordNo", "")
    data["patient"] = patient
    return data


def normalize_record_id(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        record_id = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("病历 ID 无效。") from exc
    return record_id if record_id > 0 else None


def duplicate_record_no_message(address: str, record_no: str, row: sqlite3.Row) -> str:
    name = row["name"] or "未填写姓名"
    address_label = address_bucket_label(address)
    return f"{address_label} 的病历编号 {record_no} 已被 {name}（内部ID {row['id']}）使用，请换一个编号。"


def address_bucket_label(address: str) -> str:
    return str(address or "").strip() or "无地址"


def ensure_unique_record_no(
    conn: sqlite3.Connection,
    address: str,
    record_no: str,
    record_id: int | None,
) -> None:
    if not record_no:
        return
    duplicate = conn.execute(
        """
        SELECT id, name, address, record_no
        FROM records
        WHERE deleted_at IS NULL AND COALESCE(address, '') = ? AND record_no = ? AND id != ?
        LIMIT 1
        """,
        (address or "", record_no, record_id or -1),
    ).fetchone()
    if duplicate:
        raise ValueError(duplicate_record_no_message(address, record_no, duplicate))


def save_record(payload: dict[str, Any]) -> dict[str, Any]:
    record = normalize_record(payload)
    patient = record["patient"]
    record_no = patient["recordNo"]
    now = utc_now_text()
    data_json = json.dumps(record, ensure_ascii=False, separators=(",", ":"))

    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        record_id = normalize_record_id(record.get("id"))
        ensure_unique_record_no(conn, patient["address"], record_no, record_id)
        if record_id:
            existing = conn.execute(
                "SELECT id FROM records WHERE id = ? AND deleted_at IS NULL",
                (record_id,),
            ).fetchone()
        else:
            existing = None

        if existing:
            conn.execute(
                """
                UPDATE records
                SET updated_at = ?, address = ?, record_no = ?, record_date = ?, name = ?, gender = ?, age = ?,
                    phone = ?, chief_complaint = ?, past_history = ?, allergy_history = ?,
                    tongue_pulse = ?, data_json = ?
                WHERE id = ?
                """,
                (
                    now,
                    patient["address"],
                    record_no,
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
                    created_at, updated_at, address, record_no, record_date, name, gender, age, phone,
                    chief_complaint, past_history, allergy_history, tongue_pulse, data_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    now,
                    now,
                    patient["address"],
                    record_no,
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


def list_records(
    legacy_query: str = "",
    *,
    address_query: str = "",
    record_no_query: str = "",
    identity_query: str = "",
    text_query: str = "",
) -> list[dict[str, Any]]:
    params: list[Any] = []
    conditions: list[str] = ["deleted_at IS NULL"]
    has_search_filter = False

    if address_query:
        conditions.append("address LIKE ?")
        params.append(f"%{address_query}%")
        has_search_filter = True
    if record_no_query:
        conditions.append("record_no LIKE ?")
        params.append(f"%{record_no_query}%")
        has_search_filter = True
    if identity_query:
        like = f"%{identity_query}%"
        conditions.append("(address LIKE ? OR record_no LIKE ?)")
        params.extend([like, like])
        has_search_filter = True
    if text_query:
        like = f"%{text_query}%"
        conditions.append("(name LIKE ? OR phone LIKE ? OR chief_complaint LIKE ?)")
        params.extend([like, like, like])
        has_search_filter = True

    if legacy_query and not has_search_filter:
        like = f"%{legacy_query}%"
        conditions.append(
            """
            (address LIKE ? OR record_no LIKE ? OR name LIKE ? OR phone LIKE ? OR chief_complaint LIKE ?
             OR past_history LIKE ? OR allergy_history LIKE ? OR tongue_pulse LIKE ?)
            """
        )
        params.extend([like, like, like, like, like, like, like, like])

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            f"""
            SELECT id, created_at, updated_at, address, record_no, record_date, name, gender, age, phone,
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
            "address": row["address"] or "",
            "recordNo": row["record_no"] or "",
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


def normalize_date_filter(value: str) -> str:
    text = str(value or "").strip().replace("/", "-")
    parts = text.split("-")
    if len(parts) != 3 or not all(part.isdigit() for part in parts):
        return text
    year, month, day = parts
    return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"


def history_summary(value: Any) -> str:
    text = " ".join(str(value or "").split())
    return text[:120]


def list_history_events(date_filter: str = "") -> list[dict[str, Any]]:
    filter_date = normalize_date_filter(date_filter)
    events: list[dict[str, Any]] = []
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT id, created_at, updated_at, address, record_no, record_date, name, gender, age,
                   chief_complaint, data_json
            FROM records
            WHERE deleted_at IS NULL
            ORDER BY updated_at DESC
            """
        ).fetchall()

    for row in rows:
        try:
            data = json.loads(row["data_json"])
        except json.JSONDecodeError:
            data = {}
        patient = data.get("patient") if isinstance(data.get("patient"), dict) else {}
        record_id = row["id"]
        address = row["address"] or patient.get("address") or ""
        record_no = row["record_no"] or patient.get("recordNo") or ""
        name = row["name"] or patient.get("name") or ""
        base = {
            "recordId": record_id,
            "address": address,
            "recordNo": record_no,
            "name": name,
            "gender": row["gender"] or patient.get("gender") or "",
            "age": row["age"] or patient.get("age") or "",
            "updatedAt": row["updated_at"],
        }

        record_date = normalize_date_filter(patient.get("recordDate") or row["record_date"] or "")
        if record_date and (not filter_date or record_date == filter_date):
            events.append(
                {
                    **base,
                    "eventId": f"record-{record_id}",
                    "eventType": "record",
                    "eventLabel": "首次建档",
                    "eventDate": record_date,
                    "summaryLabel": "主诉",
                    "summary": history_summary(data.get("chiefComplaint") or row["chief_complaint"]),
                    "sortText": f"{record_date} {row['updated_at']} {record_id:08d} record",
                }
            )

        visits = data.get("visits") if isinstance(data.get("visits"), list) else []
        for index, visit in enumerate(visits):
            if not isinstance(visit, dict):
                continue
            visit_date = normalize_date_filter(visit.get("date", ""))
            if not visit_date or (filter_date and visit_date != filter_date):
                continue
            label = str(visit.get("label") or visit_label(index)).strip()
            events.append(
                {
                    **base,
                    "eventId": f"visit-{record_id}-{index}",
                    "eventType": "visit",
                    "eventLabel": label,
                    "eventDate": visit_date,
                    "summaryLabel": "辨证",
                    "summary": history_summary(visit.get("diagnosis")),
                    "sortText": f"{visit_date} {row['updated_at']} {record_id:08d} visit {index:03d}",
                }
            )

    events.sort(key=lambda event: event["sortText"], reverse=True)
    for event in events:
        event.pop("sortText", None)
    return events[:500]


def get_record(record_id: int, include_deleted: bool = False) -> dict[str, Any] | None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        if include_deleted:
            row = conn.execute("SELECT * FROM records WHERE id = ?", (record_id,)).fetchone()
        else:
            row = conn.execute(
                "SELECT * FROM records WHERE id = ? AND deleted_at IS NULL",
                (record_id,),
            ).fetchone()
    return record_row_to_dict(row) if row else None


def soft_delete_record(record_id: int) -> bool:
    now = utc_now_text()
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute(
            """
            UPDATE records
            SET deleted_at = ?, updated_at = ?
            WHERE id = ? AND deleted_at IS NULL
            """,
            (now, now, record_id),
        )
        conn.commit()
        return cursor.rowcount > 0


def purge_deleted_record(record_id: int) -> bool:
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute(
            "DELETE FROM records WHERE id = ? AND deleted_at IS NOT NULL",
            (record_id,),
        )
        conn.commit()
        return cursor.rowcount > 0


def restore_deleted_record(record_id: int) -> dict[str, Any] | None:
    now = utc_now_text()
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM records WHERE id = ? AND deleted_at IS NOT NULL",
            (record_id,),
        ).fetchone()
        if not row:
            return None

        ensure_unique_record_no(conn, row["address"] or "", row["record_no"] or "", record_id)
        conn.execute(
            """
            UPDATE records
            SET deleted_at = NULL, updated_at = ?
            WHERE id = ?
            """,
            (now, record_id),
        )
        conn.commit()
        restored = conn.execute("SELECT * FROM records WHERE id = ?", (record_id,)).fetchone()
        return record_row_to_dict(restored)


def list_deleted_records() -> list[dict[str, Any]]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT id, created_at, updated_at, deleted_at, address, record_no, record_date, name, gender, age, phone,
                   chief_complaint
            FROM records
            WHERE deleted_at IS NOT NULL
            ORDER BY deleted_at DESC, updated_at DESC
            LIMIT 200
            """
        ).fetchall()

    return [
        {
            "id": row["id"],
            "address": row["address"] or "",
            "recordNo": row["record_no"] or "",
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            "deletedAt": row["deleted_at"] or "",
            "recordDate": row["record_date"] or "",
            "name": row["name"] or "",
            "gender": row["gender"] or "",
            "age": row["age"] or "",
            "phone": row["phone"] or "",
            "chiefComplaint": row["chief_complaint"] or "",
        }
        for row in rows
    ]


def next_record_no() -> str:
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute(
            "SELECT record_no FROM records WHERE deleted_at IS NULL AND record_no IS NOT NULL AND record_no != ''"
        ).fetchall()
    used: set[int] = set()
    for (raw_no,) in rows:
        text = str(raw_no).strip()
        if text.isdigit():
            used.add(int(text))
    candidate = 1
    while candidate in used:
        candidate += 1
    return str(candidate)


PDF_SYMPTOM_OPTIONS = [
    "口干口渴",
    "口淡",
    "口苦",
    "怕冷",
    "怕热",
    "嗜睡",
    "失眠多梦",
    "食欲好",
    "纳呆",
    "大便干硬",
    "大便稀溏",
    "尿急尿频",
    "夜尿",
]

PDF_MENSTRUAL_OPTIONS = [
    "色淡红",
    "色暗红",
    "量多",
    "量少",
    "淋漓不尽",
    "有血块",
    "提前",
    "拖后",
    "周期不规律",
]

PDF_DIET_OPTIONS = [
    "忌生冷寒凉",
    "忌肥甘厚味",
    "忌辛辣煎炸/燥热",
    "忌白萝卜浓茶",
]

PDF_LIFESTYLE_OPTIONS = [
    "作息规律戒熬夜",
    "加强锻炼适度运动",
    "戒房事",
    "戒酒",
]


def ensure_pdf_dependencies() -> None:
    if importlib.util.find_spec("reportlab") is not None:
        return
    if BUNDLED_SITE_PACKAGES.exists():
        sys.path.append(str(BUNDLED_SITE_PACKAGES))


def register_pdf_font() -> str:
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    configured = os.getenv("AOYAO_PDF_FONT", "").strip()
    candidates = [
        Path(configured) if configured else None,
        Path("C:/Windows/Fonts/msyh.ttc"),
        Path("C:/Windows/Fonts/msyh.ttf"),
        Path("C:/Windows/Fonts/simhei.ttf"),
        Path("C:/Windows/Fonts/simsun.ttc"),
        Path("/System/Library/Fonts/PingFang.ttc"),
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
    ]

    for font_path in candidates:
        if not font_path or not font_path.exists():
            continue
        try:
            pdfmetrics.registerFont(TTFont("AoyaoCJK", str(font_path)))
            return "AoyaoCJK"
        except Exception:
            continue
    return "Helvetica"


def pdf_text(value: Any, default: str = "未填写") -> str:
    text = str(value or "").strip()
    return text if text else default


def paragraph(text: Any, style: Any, default: str = "未填写") -> Any:
    escaped = html.escape(pdf_text(text, default)).replace("\n", "<br/>")
    from reportlab.platypus import Paragraph

    return Paragraph(escaped, style)


def box_paragraph(text: Any, style: Any, min_lines: int = 1) -> Any:
    raw_lines = str(text or "").strip().splitlines()
    lines = [html.escape(line.strip()) for line in raw_lines if line.strip()]
    if not lines:
        lines = ["&nbsp;"]
    while len(lines) < min_lines:
        lines.append("&nbsp;")
    from reportlab.platypus import Paragraph

    return Paragraph("<br/>".join(lines), style)


def format_cn_date(value: Any) -> str:
    text = str(value or "").strip()
    parts = text.split("-")
    if len(parts) == 3 and all(part.isdigit() for part in parts):
        year, month, day = parts
        return f"{year} 年 {int(month)} 月 {int(day)} 日"
    return text


def format_visit_date(value: Any) -> str:
    text = str(value or "").strip()
    parts = text.split("-")
    if len(parts) == 3 and all(part.isdigit() for part in parts):
        return f"{int(parts[1])}月{int(parts[2])}日"
    return text or "__月__日"


def underline_value(value: Any, length: int = 8) -> str:
    text = str(value or "").strip()
    return text if text else "_" * length


def checkbox_options(options: list[str], selected: Any) -> str:
    selected_values = {
        str(item).strip()
        for item in selected
        if str(item).strip()
    } if isinstance(selected, list) else set()
    known_values = set(options)
    pieces = [
        f"{'√' if option in selected_values else '□'} {option}"
        for option in options
    ]
    extras = [item for item in selected_values if item not in known_values]
    if extras:
        pieces.append("补充：" + "、".join(sorted(extras)))
    return "    ".join(pieces)


def visit_label(index: int) -> str:
    labels = ["第一次", "第二次", "第三次", "第四次", "第五次", "第六次", "第七次", "第八次", "第九次", "第十次"]
    return labels[index] if index < len(labels) else f"第{index + 1}次"


def build_record_pdf_story(records: list[dict[str, Any]], styles: dict[str, Any]) -> list[Any]:
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import PageBreak, Table, TableStyle

    story: list[Any] = []
    for index, record in enumerate(records):
        if index:
            story.append(PageBreak())

        patient = record.get("patient") if isinstance(record.get("patient"), dict) else {}
        vitals = record.get("vitals") if isinstance(record.get("vitals"), dict) else {}
        menstrual = record.get("menstrual") if isinstance(record.get("menstrual"), dict) else {}
        advice = record.get("advice") if isinstance(record.get("advice"), dict) else {}
        visits = record.get("visits") if isinstance(record.get("visits"), list) else []
        address = patient.get("address") or ""
        record_no = patient.get("recordNo") or record.get("recordNo") or f"内部ID {record.get('id')}"

        rows: list[list[Any]] = [
            [
                box_paragraph("地址", styles["label"]),
                box_paragraph(address, styles["body"]),
                box_paragraph("编号", styles["label"]),
                box_paragraph(record_no, styles["body"]),
                box_paragraph("姓名", styles["label"]),
                box_paragraph(patient.get("name"), styles["body"]),
                box_paragraph("性别", styles["label"]),
                box_paragraph(patient.get("gender"), styles["body"]),
            ],
            [
                box_paragraph("年龄", styles["label"]),
                box_paragraph(patient.get("age"), styles["body"]),
                box_paragraph("建档时间", styles["label"]),
                box_paragraph(format_cn_date(patient.get("recordDate")), styles["body"]),
                box_paragraph("电话", styles["label"]),
                box_paragraph(patient.get("phone"), styles["body"]),
                "",
                "",
            ],
            [
                box_paragraph("主诉", styles["label"]),
                box_paragraph(record.get("chiefComplaint"), styles["body"], min_lines=6),
                "",
                "",
                "",
                "",
                "",
                "",
            ],
            [
                box_paragraph("既往史", styles["label"]),
                box_paragraph(record.get("pastHistory"), styles["body"], min_lines=2),
                "",
                "",
                "",
                box_paragraph("过敏史", styles["label"]),
                box_paragraph(record.get("allergyHistory"), styles["body"], min_lines=2),
                "",
            ],
            [
                box_paragraph("体征表现", styles["label"]),
                box_paragraph(checkbox_options(PDF_SYMPTOM_OPTIONS[:7], record.get("symptoms")), styles["small"]),
                "",
                "",
                "",
                "",
                "",
                "",
            ],
            [
                "",
                box_paragraph(
                    checkbox_options(PDF_SYMPTOM_OPTIONS[7:], record.get("symptoms"))
                    + f"    血压：{underline_value(vitals.get('bloodPressure'))}"
                    + f"    心率：{underline_value(vitals.get('heartRate'))}"
                    + f"    血糖：{underline_value(vitals.get('bloodSugar'))}"
                    + f"    尿酸：{underline_value(vitals.get('uricAcid'))}",
                    styles["small"],
                ),
                "",
                "",
                "",
                "",
                "",
                "",
            ],
            [
                "",
                box_paragraph(
                    "月经："
                    + checkbox_options(PDF_MENSTRUAL_OPTIONS, menstrual.get("selected"))
                    + f"    夜尿：{underline_value(vitals.get('nightUrineCount'), 4)} 次/晚",
                    styles["small"],
                ),
                "",
                "",
                "",
                "",
                "",
                "",
            ],
            [
                "",
                box_paragraph(f"舌脉象：（{pdf_text(record.get('tonguePulse'), '')}）", styles["body"], min_lines=2),
                "",
                "",
                "",
                "",
                "",
                "",
            ],
            [
                box_paragraph("调摄建议", styles["label"]),
                box_paragraph("饮食：" + checkbox_options(PDF_DIET_OPTIONS, advice.get("diet")), styles["small"]),
                "",
                "",
                "",
                "",
                "",
                "",
            ],
            [
                "",
                box_paragraph("生活注意：" + checkbox_options(PDF_LIFESTYLE_OPTIONS, advice.get("lifestyle")), styles["small"]),
                "",
                "",
                "",
                "",
                "",
                "",
            ],
        ]

        spans: list[tuple[str, tuple[int, int], tuple[int, int]]] = [
            ("SPAN", (5, 1), (7, 1)),
            ("SPAN", (1, 2), (7, 2)),
            ("SPAN", (1, 3), (4, 3)),
            ("SPAN", (6, 3), (7, 3)),
            ("SPAN", (0, 4), (0, 7)),
            ("SPAN", (1, 4), (7, 4)),
            ("SPAN", (1, 5), (7, 5)),
            ("SPAN", (1, 6), (7, 6)),
            ("SPAN", (1, 7), (7, 7)),
            ("SPAN", (0, 8), (0, 9)),
            ("SPAN", (1, 8), (7, 8)),
            ("SPAN", (1, 9), (7, 9)),
        ]

        display_visit_count = max(4, len(visits))
        for visit_index in range(display_visit_count):
            visit = visits[visit_index] if visit_index < len(visits) and isinstance(visits[visit_index], dict) else {}
            header_row = len(rows)
            rows.append(
                [
                    box_paragraph(
                        f"{visit.get('label') or visit_label(visit_index)}\n\n时间：\n{format_visit_date(visit.get('date'))}",
                        styles["label"],
                        min_lines=4,
                    ),
                    "",
                    box_paragraph("辨证", styles["label"]),
                    "",
                    box_paragraph("内调方案", styles["label"]),
                    "",
                    box_paragraph("回访情况", styles["label"]),
                    "",
                ]
            )
            rows.append(
                [
                    "",
                    "",
                    box_paragraph(visit.get("diagnosis"), styles["body"], min_lines=5),
                    "",
                    box_paragraph(visit.get("plan"), styles["body"], min_lines=5),
                    "",
                    box_paragraph(visit.get("followup"), styles["body"], min_lines=5),
                    "",
                ]
            )
            spans.extend(
                [
                    ("SPAN", (0, header_row), (1, header_row + 1)),
                    ("SPAN", (2, header_row), (3, header_row)),
                    ("SPAN", (4, header_row), (5, header_row)),
                    ("SPAN", (6, header_row), (7, header_row)),
                    ("SPAN", (2, header_row + 1), (3, header_row + 1)),
                    ("SPAN", (4, header_row + 1), (5, header_row + 1)),
                    ("SPAN", (6, header_row + 1), (7, header_row + 1)),
                ]
            )

        table = Table(
            rows,
            colWidths=[18 * mm, 25 * mm, 15 * mm, 29 * mm, 15 * mm, 28 * mm, 18 * mm, 38 * mm],
            repeatRows=0,
        )
        style_commands: list[tuple[Any, ...]] = [
            ("FONTNAME", (0, 0), (-1, -1), styles["font"]),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("GRID", (0, 0), (-1, -1), 0.55, colors.HexColor("#717171")),
            ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#565656")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("VALIGN", (0, 0), (0, -1), "MIDDLE"),
            ("ALIGN", (0, 0), (-1, 1), "CENTER"),
            ("VALIGN", (0, 0), (-1, 1), "MIDDLE"),
            ("ALIGN", (2, 10), (-1, -1), "CENTER"),
            ("PADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 2), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 2), (-1, -1), 5),
        ]
        style_commands.extend(spans)
        table.setStyle(TableStyle(style_commands))
        story.append(table)

        notes = str(record.get("notes") or "").strip()
        if notes:
            notes_table = Table(
                [[box_paragraph("备注", styles["label"]), box_paragraph(notes, styles["body"], min_lines=2)]],
                colWidths=[18 * mm, 168 * mm],
            )
            notes_table.setStyle(
                TableStyle(
                    [
                        ("FONTNAME", (0, 0), (-1, -1), styles["font"]),
                        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                        ("GRID", (0, 0), (-1, -1), 0.55, colors.HexColor("#717171")),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("ALIGN", (0, 0), (0, 0), "CENTER"),
                        ("PADDING", (0, 0), (-1, -1), 4),
                    ]
                )
            )
            story.append(notes_table)
    return story


def export_records_pdf(record_ids: list[Any]) -> Path:
    ensure_pdf_dependencies()
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.units import mm
        from reportlab.platypus import SimpleDocTemplate
    except ModuleNotFoundError as exc:
        raise RuntimeError("缺少 PDF 生成依赖 reportlab，请先安装后再导出。") from exc

    normalized_ids: list[int] = []
    for value in record_ids:
        record_id = normalize_record_id(value)
        if record_id and record_id not in normalized_ids:
            normalized_ids.append(record_id)
    if not normalized_ids:
        raise ValueError("请至少选择一条已保存的病历。")

    records: list[dict[str, Any]] = []
    for record_id in normalized_ids:
        record = get_record(record_id)
        if record:
            records.append(record)
    if not records:
        raise ValueError("没有找到可导出的病历。")

    font_name = register_pdf_font()
    styles = {
        "font": font_name,
        "title": ParagraphStyle(
            "AoyaoTitle",
            fontName=font_name,
            fontSize=17,
            leading=22,
            spaceAfter=4,
        ),
        "section": ParagraphStyle(
            "AoyaoSection",
            fontName=font_name,
            fontSize=11,
            leading=15,
            spaceBefore=5,
            spaceAfter=2,
        ),
        "label": ParagraphStyle(
            "AoyaoLabel",
            fontName=font_name,
            fontSize=8.5,
            leading=12,
            alignment=1,
            wordWrap="CJK",
        ),
        "body": ParagraphStyle(
            "AoyaoBody",
            fontName=font_name,
            fontSize=8.5,
            leading=12,
            wordWrap="CJK",
        ),
        "small": ParagraphStyle(
            "AoyaoSmall",
            fontName=font_name,
            fontSize=7.4,
            leading=10.5,
            wordWrap="CJK",
        ),
    }

    PDF_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"aoyao_records_{dt.datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    output_path = PDF_OUTPUT_DIR / filename
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        rightMargin=10 * mm,
        leftMargin=10 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm,
        title="傲尧病历导出",
    )
    story = build_record_pdf_story(records, styles)
    doc.build(story)
    return output_path


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


def pov_to_direction(pov: int) -> str:
    if pov < 0 or pov == 65535:
        return ""
    angle = pov % 36000
    if angle >= 31500 or angle < 4500:
        return "up"
    if angle < 13500:
        return "right"
    if angle < 22500:
        return "down"
    return "left"


def normalize_joystick_axis(value: int, axis_min: int, axis_max: int) -> float:
    if 0 <= value <= 65535:
        axis_min = 0
        axis_max = 65535
    elif axis_max <= axis_min:
        return 0.0
    center = (axis_min + axis_max) / 2
    half_range = (axis_max - axis_min) / 2
    normalized = (value - center) / half_range
    return round(max(-1.0, min(1.0, normalized)), 4)


def stick_to_direction(x_axis: float, y_axis: float, deadzone: float = 0.55) -> str:
    if abs(x_axis) < deadzone and abs(y_axis) < deadzone:
        return ""
    if abs(x_axis) > abs(y_axis):
        return "right" if x_axis > 0 else "left"
    return "down" if y_axis > 0 else "up"


def gamepad_buttons_from_mask(buttons_mask: int) -> dict[str, bool]:
    return {
        "a": bool(buttons_mask & 0x1),
        "b": bool(buttons_mask & 0x2),
        "x": bool(buttons_mask & 0x8),
        "y": bool(buttons_mask & 0x10),
    }


def read_windows_gamepad_state() -> dict[str, Any]:
    if os.name != "nt":
        return {"ok": True, "available": False, "error": "only available on Windows"}

    joy_return_all = 0x000000FF
    joyerr_noerror = 0

    class JoyCapsW(ctypes.Structure):
        _fields_ = [
            ("wMid", wintypes.WORD),
            ("wPid", wintypes.WORD),
            ("szPname", wintypes.WCHAR * 32),
            ("wXmin", wintypes.UINT),
            ("wXmax", wintypes.UINT),
            ("wYmin", wintypes.UINT),
            ("wYmax", wintypes.UINT),
            ("wZmin", wintypes.UINT),
            ("wZmax", wintypes.UINT),
            ("wNumButtons", wintypes.UINT),
            ("wPeriodMin", wintypes.UINT),
            ("wPeriodMax", wintypes.UINT),
            ("wRmin", wintypes.UINT),
            ("wRmax", wintypes.UINT),
            ("wUmin", wintypes.UINT),
            ("wUmax", wintypes.UINT),
            ("wVmin", wintypes.UINT),
            ("wVmax", wintypes.UINT),
            ("wCaps", wintypes.UINT),
            ("wMaxAxes", wintypes.UINT),
            ("wNumAxes", wintypes.UINT),
            ("wMaxButtons", wintypes.UINT),
            ("szRegKey", wintypes.WCHAR * 32),
            ("szOEMVxD", wintypes.WCHAR * 260),
        ]

    class JoyInfoEx(ctypes.Structure):
        _fields_ = [
            ("dwSize", wintypes.DWORD),
            ("dwFlags", wintypes.DWORD),
            ("dwXpos", wintypes.DWORD),
            ("dwYpos", wintypes.DWORD),
            ("dwZpos", wintypes.DWORD),
            ("dwRpos", wintypes.DWORD),
            ("dwUpos", wintypes.DWORD),
            ("dwVpos", wintypes.DWORD),
            ("dwButtons", wintypes.DWORD),
            ("dwButtonNumber", wintypes.DWORD),
            ("dwPOV", wintypes.DWORD),
            ("dwReserved1", wintypes.DWORD),
            ("dwReserved2", wintypes.DWORD),
        ]

    try:
        winmm = ctypes.WinDLL("winmm")
        joy_get_num_devs = winmm.joyGetNumDevs
        joy_get_num_devs.restype = wintypes.UINT
        joy_get_dev_caps = winmm.joyGetDevCapsW
        joy_get_dev_caps.argtypes = [wintypes.UINT, ctypes.POINTER(JoyCapsW), wintypes.UINT]
        joy_get_dev_caps.restype = wintypes.UINT
        joy_get_pos = winmm.joyGetPosEx
        joy_get_pos.argtypes = [wintypes.UINT, ctypes.POINTER(JoyInfoEx)]
        joy_get_pos.restype = wintypes.UINT

        for device_id in range(joy_get_num_devs()):
            caps = JoyCapsW()
            if joy_get_dev_caps(device_id, ctypes.byref(caps), ctypes.sizeof(caps)) != joyerr_noerror:
                continue

            info = JoyInfoEx()
            info.dwSize = ctypes.sizeof(JoyInfoEx)
            info.dwFlags = joy_return_all
            if joy_get_pos(device_id, ctypes.byref(info)) != joyerr_noerror:
                continue

            left_x = normalize_joystick_axis(int(info.dwXpos), int(caps.wXmin), int(caps.wXmax))
            left_y = normalize_joystick_axis(int(info.dwYpos), int(caps.wYmin), int(caps.wYmax))
            right_x = normalize_joystick_axis(int(info.dwZpos), int(caps.wZmin), int(caps.wZmax))
            right_y = normalize_joystick_axis(int(info.dwRpos), int(caps.wRmin), int(caps.wRmax))
            fallback_right_x = normalize_joystick_axis(int(info.dwUpos), int(caps.wUmin), int(caps.wUmax))
            fallback_right_y = normalize_joystick_axis(int(info.dwVpos), int(caps.wVmin), int(caps.wVmax))
            if int(caps.wNumAxes) >= 6 and abs(right_x) < 0.08 and abs(right_y) < 0.08 and (
                abs(fallback_right_x) >= 0.08 or abs(fallback_right_y) >= 0.08
            ):
                right_x = fallback_right_x
                right_y = fallback_right_y

            return {
                "ok": True,
                "available": True,
                "source": "winmm",
                "device": {
                    "id": device_id,
                    "name": caps.szPname,
                    "axes": caps.wNumAxes,
                    "buttons": caps.wNumButtons,
                },
                "state": {
                    "direction": pov_to_direction(int(info.dwPOV)),
                    "pov": int(info.dwPOV),
                    "buttonsMask": int(info.dwButtons),
                    "buttons": gamepad_buttons_from_mask(int(info.dwButtons)),
                    "axes": {
                        "x": int(info.dwXpos),
                        "y": int(info.dwYpos),
                        "z": int(info.dwZpos),
                        "r": int(info.dwRpos),
                        "u": int(info.dwUpos),
                        "v": int(info.dwVpos),
                    },
                    "sticks": {
                        "left": {
                            "x": left_x,
                            "y": left_y,
                            "direction": stick_to_direction(left_x, left_y),
                        },
                        "right": {
                            "x": right_x,
                            "y": right_y,
                            "direction": stick_to_direction(right_x, right_y),
                        },
                    },
                },
            }
    except Exception as exc:
        return {"ok": False, "available": False, "error": str(exc)}

    return {"ok": True, "available": False, "source": "winmm"}


class AsrTestHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path: str) -> str:
        clean_path = urllib.parse.urlparse(path).path
        if clean_path in ("/", "/index.html"):
            return str(STATIC_DIR / "index.html")
        if clean_path in ("/records", "/records.html"):
            return str(STATIC_DIR / "records.html")
        if clean_path in ("/history", "/history.html"):
            return str(STATIC_DIR / "history.html")
        return str(STATIC_DIR / clean_path.lstrip("/"))

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_exported_pdf(self, filename: str) -> None:
        safe_name = Path(filename).name
        pdf_path = PDF_OUTPUT_DIR / safe_name
        if not pdf_path.exists() or pdf_path.suffix.lower() != ".pdf":
            json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "导出文件不存在。"})
            return
        body = pdf_path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/pdf")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Disposition", f'attachment; filename="{safe_name}"')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed_path = urllib.parse.urlparse(self.path)
        if parsed_path.path.startswith("/exports/pdf/"):
            self.send_exported_pdf(urllib.parse.unquote(parsed_path.path.rsplit("/", 1)[1]))
            return
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
        if parsed_path.path == "/api/gamepad-state":
            json_response(self, HTTPStatus.OK, read_windows_gamepad_state())
            return
        if parsed_path.path == "/api/trash":
            init_database()
            json_response(self, HTTPStatus.OK, {"ok": True, "records": list_deleted_records()})
            return
        if parsed_path.path == "/api/records":
            init_database()
            query_params = urllib.parse.parse_qs(parsed_path.query)
            json_response(
                self,
                HTTPStatus.OK,
                {
                    "ok": True,
                    "records": list_records(
                        query_params.get("query", [""])[0].strip(),
                        address_query=query_params.get("addressQuery", [""])[0].strip(),
                        record_no_query=query_params.get("recordNoQuery", [""])[0].strip(),
                        identity_query=query_params.get("identityQuery", [""])[0].strip(),
                        text_query=query_params.get("textQuery", [""])[0].strip(),
                    ),
                },
            )
            return
        if parsed_path.path == "/api/history":
            init_database()
            date_filter = urllib.parse.parse_qs(parsed_path.query).get("date", [""])[0].strip()
            json_response(
                self,
                HTTPStatus.OK,
                {
                    "ok": True,
                    "date": normalize_date_filter(date_filter),
                    "events": list_history_events(date_filter),
                },
            )
            return
        if parsed_path.path == "/api/next-record-no":
            init_database()
            json_response(self, HTTPStatus.OK, {"ok": True, "recordNo": next_record_no()})
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

        if parsed_path.path.startswith("/api/records/") and parsed_path.path.endswith("/restore"):
            try:
                init_database()
                record_id = int(parsed_path.path.strip("/").split("/")[-2])
                restored = restore_deleted_record(record_id)
                if not restored:
                    json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "垃圾桶中没有找到该病历。"})
                    return
                json_response(self, HTTPStatus.OK, {"ok": True, "record": restored})
            except Exception as exc:
                json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})
            return

        if parsed_path.path == "/api/export/pdf":
            try:
                init_database()
                request_json = read_json_body(self, MAX_RECORD_JSON_BYTES)
                output_path = export_records_pdf(request_json.get("ids", []))
                download_url = f"/exports/pdf/{urllib.parse.quote(output_path.name)}"
                json_response(
                    self,
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "fileName": output_path.name,
                        "downloadUrl": download_url,
                    },
                )
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
            if parsed_path.path.endswith("/purge"):
                record_id = int(parsed_path.path.strip("/").split("/")[-2])
                if not purge_deleted_record(record_id):
                    json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "垃圾桶中没有找到该病历。"})
                    return
                json_response(self, HTTPStatus.OK, {"ok": True})
                return

            record_id = int(parsed_path.path.rsplit("/", 1)[1])
            if not soft_delete_record(record_id):
                json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "病历不存在或已在垃圾桶中。"})
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
        if getattr(self, "path", "").startswith("/api/gamepad-state"):
            return
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
