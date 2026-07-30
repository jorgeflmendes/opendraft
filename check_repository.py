#!/usr/bin/env python3
from pathlib import Path
import sys

IGNORED_DIRS = {".git", "coverage", "dist", "node_modules"}
BANNED_DIRS = {".ai", ".claude", ".copilot", ".cursor"}
BANNED_FILENAMES = {".DS_Store"}
BANNED_SUFFIXES = {".db", ".dump", ".env", ".key", ".log", ".pcap", ".pem", ".sql", ".sqlite"}
BANNED_STRINGS = ["ghp" + "_", "xoxb" + "-", r"C:\Users" + r"\Jorge"]
TEXT_SUFFIXES = {
    ".css",
    ".html",
    ".js",
    ".json",
    ".jsx",
    ".md",
    ".mjs",
    ".py",
    ".ts",
    ".tsx",
    ".yaml",
    ".yml",
}


def repository_files(root: Path):
    for path in root.rglob("*"):
        if any(part in IGNORED_DIRS for part in path.parts):
            continue
        yield path


def main() -> int:
    errors: list[str] = []

    for path in repository_files(Path.cwd()):
        relative_path = path.relative_to(Path.cwd())
        if path.is_dir():
            if path.name in BANNED_DIRS:
                errors.append(f"Banned directory found: {relative_path}")
            continue

        if path.name in BANNED_FILENAMES or path.suffix.lower() in BANNED_SUFFIXES:
            errors.append(f"Banned file found: {relative_path}")
            continue

        if path.suffix.lower() not in TEXT_SUFFIXES:
            continue

        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            errors.append(f"Text file is not valid UTF-8: {relative_path}")
            continue
        except OSError as error:
            errors.append(f"Could not inspect {relative_path}: {error}")
            continue

        for banned in BANNED_STRINGS:
            if banned in content:
                errors.append(f"Banned string {banned!r} found in {relative_path}")

    if errors:
        print("Repository hygiene check failed:")
        for error in errors:
            print(f" - {error}")
        return 1

    print("Repository hygiene check passed. No banned artefacts or clear-text secrets found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
