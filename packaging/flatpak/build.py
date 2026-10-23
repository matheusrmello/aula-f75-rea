#!/usr/bin/env python3
"""Bundle the prebuilt Electron app using Flatpak's low-level build commands.

Only Electron2.BaseApp is downloaded, into this checkout's .build directory.
No SDK or flatpak-builder is needed because native sources are not compiled.
"""
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
APP_ID = "com.aula.f75controller"
RUNTIME = "26.08"
BASE = f"org.electronjs.Electron2.BaseApp//{RUNTIME}"
STATE = ROOT / ".build" / "flatpak"
STAGE = STATE / "stage"
REPO = STATE / "repo"
ENV = dict(os.environ, FLATPAK_USER_DIR=str(STATE / "dependencies"),
           XDG_CACHE_HOME=str(STATE / "cache"))


def run(*args, capture=False, env=None):
    print("+", " ".join(map(str, args)), flush=True)
    return subprocess.run(list(map(str, args)), check=True, text=True,
                          stdout=subprocess.PIPE if capture else None,
                          env=env).stdout


def install_file(source, destination, executable=False):
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    if executable:
        destination.chmod(0o755)


def main():
    if platform.machine() not in ("x86_64", "AMD64"):
        raise SystemExit("This package currently targets x86_64 only.")
    app_dir = ROOT / "dist" / "linux-unpacked"
    if not (app_dir / "resources" / "app.asar").is_file():
        raise SystemExit("Build the Electron directory first: npm run dist:flatpak")
    STATE.mkdir(parents=True, exist_ok=True)
    run("flatpak", "remote-add", "--user", "--if-not-exists", "flathub",
        "https://dl.flathub.org/repo/flathub.flatpakrepo", env=ENV)
    run("flatpak", "install", "--user", "--assumeyes", "--noninteractive",
        "--no-deps", "--no-related", "flathub", BASE, env=ENV)
    base_path = Path(run("flatpak", "info", "--user", "--show-location", BASE,
                         capture=True, env=ENV).strip())
    base_commit = run("flatpak", "info", "--user", "--show-commit", BASE,
                      capture=True, env=ENV).strip()
    for required in ("zypak-wrapper.sh", "zypak-helper", "zypak-sandbox"):
        if not (base_path / "files" / "bin" / required).is_file():
            raise SystemExit(f"Electron BaseApp is missing {required}")

    if STAGE.exists():
        shutil.rmtree(STAGE)
    files = STAGE / "files"
    shutil.copytree(base_path / "files", files, symlinks=True)
    shutil.copytree(app_dir, files / "lib" / "aula-f75", symlinks=True)
    install_file(HERE / "aula-f75-controller", files / "bin" / "aula-f75-controller", True)
    install_file(HERE / f"{APP_ID}.desktop", files / "share" / "applications" / f"{APP_ID}.desktop")
    install_file(HERE / f"{APP_ID}.metainfo.xml", files / "share" / "metainfo" / f"{APP_ID}.metainfo.xml")
    install_file(HERE / f"{APP_ID}.svg", files / "share" / "icons" / "hicolor" / "scalable" / "apps" / f"{APP_ID}.svg")
    (STAGE / "metadata").write_text(
        f"[Application]\nname={APP_ID}\nruntime=org.freedesktop.Platform/x86_64/{RUNTIME}\n",
        encoding="utf-8")
    run("flatpak", "build-finish", "--command=aula-f75-controller",
        "--share=ipc", "--share=network", "--socket=wayland", "--socket=fallback-x11",
        "--device=all", "--filesystem=/run/udev:ro",
        "--env=ELECTRON_TRASH=gio", STAGE)
    run("flatpak", "build-export", REPO, STAGE, "stable")
    version = json.loads((ROOT / "package.json").read_text())["version"]
    output = ROOT / "dist" / f"AULA-F75-Controller-{version}-x86_64.flatpak"
    output.unlink(missing_ok=True)
    run("flatpak", "build-bundle", "--arch=x86_64",
        "--runtime-repo=https://dl.flathub.org/repo/flathub.flatpakrepo",
        REPO, output, APP_ID, "stable")
    (ROOT / "dist" / "flatpak-build-info.json").write_text(json.dumps({
        "appId": APP_ID, "version": version, "runtime": f"org.freedesktop.Platform//{RUNTIME}",
        "baseApp": BASE, "baseCommit": base_commit,
        "permissions": ["ipc", "network", "wayland", "fallback-x11", "all devices", "/run/udev:ro"],
    }, indent=2) + "\n", encoding="utf-8")
    print(f"Built {output}")


if __name__ == "__main__":
    main()
