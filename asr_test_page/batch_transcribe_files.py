from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import sys
import time
from pathlib import Path

import server


SUPPORTED_FORMATS = {"wav", "pcm", "ogg-opus", "speex", "silk", "mp3", "m4a", "aac", "amr"}


def voice_format_for(path: Path) -> str:
    suffix = path.suffix.lower().lstrip(".")
    if suffix == "ogg":
        return "ogg-opus"
    if suffix not in SUPPORTED_FORMATS:
        raise ValueError(f"不支持的音频格式：{path.suffix}")
    return suffix


def transcribe_file(path: Path) -> dict[str, object]:
    audio_bytes = path.read_bytes()
    if len(audio_bytes) > 3 * 1024 * 1024:
        raise ValueError(f"{path.name} 超过腾讯云一句话识别本地上传 3MB 限制。")

    payload: dict[str, object] = {
        "ProjectId": 0,
        "SubServiceType": 2,
        "EngSerViceType": server.get_env("TENCENT_ASR_ENGINE", default="16k_zh_medical"),
        "SourceType": 1,
        "VoiceFormat": voice_format_for(path),
        "UsrAudioKey": path.stem,
        "Data": base64.b64encode(audio_bytes).decode("ascii"),
        "DataLen": len(audio_bytes),
        "FilterDirty": 0,
        "FilterModal": 0,
        "FilterPunc": int(server.get_env("TENCENT_ASR_FILTER_PUNC", default="0")),
        "ConvertNumMode": 1,
        "WordInfo": 0,
    }

    hotword_id = server.get_env("TENCENT_ASR_HOTWORD_ID")
    if hotword_id:
        payload["HotwordId"] = hotword_id

    started = time.perf_counter()
    if server.should_use_tencent_sdk():
        raw_response = server.call_tencent_sdk(payload)
        transport = "sdk"
    else:
        raw_response = server.call_tencent_http(payload)
        transport = "http"
    latency_ms = round((time.perf_counter() - started) * 1000)

    response = server.parse_sentence_response(raw_response)
    return {
        "file": path.name,
        "size": len(audio_bytes),
        "format": payload["VoiceFormat"],
        "engine": payload["EngSerViceType"],
        "transport": transport,
        "latency_ms": latency_ms,
        "audio_duration_ms": response.get("AudioDuration"),
        "request_id": response.get("RequestId", ""),
        "text": response.get("Result", ""),
    }


def format_bytes(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    return f"{size / 1024 / 1024:.2f} MB"


def format_duration(value: object) -> str:
    if not isinstance(value, (int, float)):
        return "-"
    # Tencent returns AudioDuration in ms for this API.
    seconds = value / 1000
    return f"{seconds:.1f} 秒"


def write_markdown(results: list[dict[str, object]], output_path: Path) -> None:
    now = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines: list[str] = [
        "# 妈妈医学录音识别结果",
        "",
        f"- 生成时间：{now}",
        "- 识别服务：腾讯云一句话识别",
        f"- 识别引擎：{server.get_env('TENCENT_ASR_ENGINE', default='16k_zh_medical')}",
        "",
        "> 说明：以下内容为语音识别原始结果，医学内容请由医生人工核对后再使用。",
        "",
        "| 文件 | 音频时长 | 文件大小 | 接口耗时 | 请求编号 |",
        "|---|---:|---:|---:|---|",
    ]

    for item in results:
        lines.append(
            "| "
            f"{item['file']} | "
            f"{format_duration(item.get('audio_duration_ms'))} | "
            f"{format_bytes(int(item['size']))} | "
            f"{item['latency_ms']} ms | "
            f"{item.get('request_id') or '-'} |"
        )

    lines.extend(["", "## 分段结果", ""])
    for index, item in enumerate(results, start=1):
        lines.extend(
            [
                f"### {index}. {item['file']}",
                "",
                f"- 音频时长：{format_duration(item.get('audio_duration_ms'))}",
                f"- 文件大小：{format_bytes(int(item['size']))}",
                f"- 音频格式：{item['format']}",
                f"- 调用方式：{item['transport']}",
                f"- 接口耗时：{item['latency_ms']} ms",
                f"- 请求编号：{item.get('request_id') or '-'}",
                "",
                "```text",
                str(item.get("text") or "").strip(),
                "```",
                "",
            ]
        )

    output_path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch transcribe audio files by Tencent ASR.")
    parser.add_argument("output", type=Path)
    parser.add_argument("audio_files", nargs="+", type=Path)
    args = parser.parse_args()

    server.load_dotenv()
    server.load_tencent_key_file()

    results: list[dict[str, object]] = []
    failures: list[str] = []
    for audio_path in args.audio_files:
        try:
            results.append(transcribe_file(audio_path))
            print(f"OK {audio_path.name}")
        except Exception as exc:
            failures.append(f"{audio_path.name}: {exc}")
            print(f"FAIL {audio_path.name}: {exc}", file=sys.stderr)

    if results:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        write_markdown(results, args.output)
        print(f"WROTE {args.output}")

    if failures:
        print("\n".join(failures), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
