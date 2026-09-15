#!/usr/bin/env python3
"""Convert numbered Automic/UC4 HTML message files into one Markdown file.

Only files in the Content directory whose names start with a digit are
converted (for example 1xx.htm, 10000xx.htm). Index pages and assets such
as uc4msg.htm are skipped.

Each message row's GIF icon is used only to categorize severity (error /
warning / info / …). The GIF itself is never linked or embedded.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path

HTML_PATTERN = re.compile(r"^\d.*\.html?$", re.IGNORECASE)
LEADING_NUMBER = re.compile(r"^(\d+)")
WHITESPACE = re.compile(r"[ \t\r\f\v]+")

# Icon → severity, derived from uc4std.css note_* / UC4note* classes
# and confirmed against the GIF artwork in Content/.
ICON_SEVERITY: dict[str, str] = {
    "x0000005.gif": "Error",  # UC4noteError / note_error
    "x0000009.gif": "Warning",  # UC4noteWarning / note_warning
    "x0000163.gif": "Info",  # note_hint (info bubble)
    "x0000006.gif": "Hint",  # UC4noteHint
    "x0000007.gif": "Info",
    "x0000008.gif": "Warning",
    "x0000003.gif": "Admin",  # UC4noteAdmin
    "x0000162.gif": "Incompatible",  # UC4noteIncomp / note_incomp
    "x0000042.gif": "Privilege",  # UC4notePriv / note_priv
    "x0000058.gif": "Tip",  # UC4noteTip / note_tip
    "x0000037.gif": "UC4",
}


@dataclass
class Message:
    code: str
    severity: str = ""
    paragraphs: list[str] = field(default_factory=list)


@dataclass
class MessagePage:
    heading: str
    messages: list[Message]


class MessagePageParser(HTMLParser):
    """Extract the heading and message table from a MadCap topic page."""

    SKIP_TAGS = frozenset({"script", "style", "head", "link", "meta", "title"})

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.heading = ""
        self.messages: list[Message] = []
        self._skip_depth = 0
        self._in_h1 = False
        self._h1_parts: list[str] = []
        self._in_tr = False
        self._in_td = False
        self._td_index = -1
        self._row_cells: list[list[str]] = []
        self._row_icon = ""
        self._current_blocks: list[str] | None = None
        self._block_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self._skip_depth or tag in self.SKIP_TAGS:
            if tag in self.SKIP_TAGS:
                self._skip_depth += 1
            return

        attr_map = {name: value for name, value in attrs if value is not None}

        if tag == "h1":
            self._in_h1 = True
            self._h1_parts = []
        elif tag == "tr":
            self._in_tr = True
            self._td_index = -1
            self._row_cells = []
            self._row_icon = ""
        elif tag == "td" and self._in_tr:
            self._in_td = True
            self._td_index += 1
            self._current_blocks = []
            self._block_parts = []
        elif tag == "img" and self._in_td:
            src = Path(attr_map.get("src", "")).name
            if self._td_index == 0 and src:
                self._row_icon = src
        elif tag in {"p", "font"} and self._in_td:
            self._flush_block()
        elif tag == "br" and self._in_td:
            self._block_parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if self._skip_depth:
            if tag in self.SKIP_TAGS:
                self._skip_depth = max(0, self._skip_depth - 1)
            return

        if tag == "h1":
            self._in_h1 = False
            heading = _normalize("".join(self._h1_parts))
            if heading:
                self.heading = heading
        elif tag in {"p", "font"} and self._in_td:
            self._flush_block()
        elif tag == "td" and self._in_td:
            self._flush_block()
            self._row_cells.append(self._current_blocks or [])
            self._current_blocks = None
            self._in_td = False
        elif tag == "tr" and self._in_tr:
            self._finish_row()
            self._in_tr = False

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        if self._in_h1:
            self._h1_parts.append(data)
        elif self._in_td:
            self._block_parts.append(data)

    def _flush_block(self) -> None:
        if self._current_blocks is None:
            self._block_parts = []
            return
        text = _normalize("".join(self._block_parts))
        self._block_parts = []
        if text:
            self._current_blocks.append(text)

    def _finish_row(self) -> None:
        if len(self._row_cells) < 2:
            return
        # Column 0 is a severity icon; column 1 is the message code;
        # remaining columns hold the message text and optional explanation.
        code = " ".join(self._row_cells[1]).strip()
        if not code:
            return
        paragraphs: list[str] = []
        for cell in self._row_cells[2:]:
            paragraphs.extend(cell)
        severity = ICON_SEVERITY.get(self._row_icon.lower(), "")
        self.messages.append(
            Message(code=code, severity=severity, paragraphs=paragraphs)
        )


def _normalize(text: str) -> str:
    text = text.replace("\xa0", " ")
    text = WHITESPACE.sub(" ", text)
    text = re.sub(r" *\n *", "\n", text)
    return text.strip()


def parse_html(html: str) -> MessagePage:
    parser = MessagePageParser()
    parser.feed(html)
    parser.close()
    return MessagePage(heading=parser.heading, messages=parser.messages)


def page_to_markdown(page: MessagePage) -> str:
    heading = page.heading or "Untitled"
    lines = [f"## {heading}", ""]
    for message in page.messages:
        lines.append(f"### {message.code}")
        lines.append("")
        content_parts: list[str] = []
        if message.severity:
            content_parts.append(f"Severity: {message.severity}")
        content_parts.extend(message.paragraphs)
        if content_parts:
            lines.append("\n\n".join(content_parts))
            lines.append("")
        else:
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def page_to_severity_rows(page: MessagePage) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    for message in page.messages:
        rows.append((message.code, message.severity or "Unknown"))
    return rows


APP_SEVERITY = {
    "error": "error",
    "warning": "warn",
    "warn": "warn",
    "info": "info",
    "hint": "info",
    "debug": "debug",
}


def canonical_message_id(code: str) -> str:
    trimmed = code.strip().upper()
    if not trimmed:
        return ""
    with_u = trimmed if trimmed.startswith("U") else f"U{trimmed}"
    digits = with_u[1:]
    if digits.isdigit() and 1 <= len(digits) <= 8:
        return f"U{digits.zfill(8)}"
    return with_u


def severity_to_markdown(rows: list[tuple[str, str]]) -> str:
    lines = [
        "# Severty",
        "",
        "| Message | Severity |",
        "| --- | --- |",
    ]
    for code, severity in rows:
        lines.append(f"| {code} | {severity} |")
    lines.append("")
    return "\n".join(lines)


def severity_to_json(rows: list[tuple[str, str]]) -> str:
    catalog: dict[str, str] = {}
    for code, severity in rows:
        key = canonical_message_id(code)
        mapped = APP_SEVERITY.get(severity.strip().lower())
        if key and mapped:
            catalog[key] = mapped
    return json.dumps(catalog, separators=(",", ":"))


def numbered_html_files(content_dir: Path) -> list[Path]:
    files = [
        path
        for path in content_dir.iterdir()
        if path.is_file() and HTML_PATTERN.match(path.name)
    ]

    def sort_key(path: Path) -> tuple[int, str]:
        match = LEADING_NUMBER.match(path.stem)
        number = int(match.group(1)) if match else 0
        return (number, path.name.lower())

    return sorted(files, key=sort_key)


def convert_content(
    content_dir: Path,
    output_path: Path,
    severity_path: Path | None = None,
    severity_json_path: Path | None = None,
) -> int:
    files = numbered_html_files(content_dir)
    if not files:
        raise SystemExit(f"No numbered HTML files found in {content_dir}")

    if severity_path is None:
        severity_path = Path(__file__).resolve().parent / "src" / "data" / "severty.md"
    if severity_json_path is None:
        severity_json_path = severity_path.with_name("message-severity.json")

    message_sections = ["# Meldungen", ""]
    severity_rows: list[tuple[str, str]] = []
    converted = 0
    for path in files:
        html = path.read_text(encoding="utf-8", errors="replace")
        page = parse_html(html)
        if not page.heading and not page.messages:
            continue
        if not page.heading:
            page.heading = path.stem
        message_sections.append(page_to_markdown(page))
        severity_rows.extend(page_to_severity_rows(page))
        converted += 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        "\n".join(message_sections).rstrip() + "\n", encoding="utf-8"
    )
    severity_path.parent.mkdir(parents=True, exist_ok=True)
    severity_path.write_text(severity_to_markdown(severity_rows), encoding="utf-8")
    severity_json_path.parent.mkdir(parents=True, exist_ok=True)
    severity_json_path.write_text(severity_to_json(severity_rows), encoding="utf-8")
    return converted


def default_paths() -> tuple[Path, Path, Path, Path]:
    root = Path(__file__).resolve().parent
    content_dir = root / "Content"
    data_dir = root / "src" / "data"
    return (
        content_dir,
        content_dir / "messages.md",
        data_dir / "severty.md",
        data_dir / "message-severity.json",
    )


def main() -> None:
    content_default, output_default, severity_default, severity_json_default = (
        default_paths()
    )
    parser = argparse.ArgumentParser(
        description=(
            "Convert Content/*.htm files whose names start with a digit "
            "into Markdown. GIF icons are mapped to severity text only; "
            "images are not included. Also writes src/data/severty.md and "
            "src/data/message-severity.json with message codes and severity."
        )
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=content_default,
        help=f"Directory containing HTML files (default: {content_default})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=output_default,
        help=f"Full messages Markdown path (default: {output_default})",
    )
    parser.add_argument(
        "--severity-output",
        type=Path,
        default=severity_default,
        help=f"Severity-only Markdown path (default: {severity_default})",
    )
    parser.add_argument(
        "--severity-json-output",
        type=Path,
        default=severity_json_default,
        help=f"App severity JSON path (default: {severity_json_default})",
    )
    args = parser.parse_args()

    converted = convert_content(
        args.input,
        args.output,
        args.severity_output,
        args.severity_json_output,
    )
    print(f"Converted {converted} file(s) -> {args.output}")
    print(f"Severity index -> {args.severity_output}")
    print(f"Severity JSON -> {args.severity_json_output}")


if __name__ == "__main__":
    main()
