"""
SparkRTC Experiment GUI
Run with:  uv run gui_app.py
"""

import argparse
import csv
import io
import json
import os
import subprocess
import sys

from PyQt6.QtCore import Qt, QThread, pyqtSignal, QSettings
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QApplication,
    QComboBox,
    QFileDialog,
    QFrame,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QSplitter,
    QStatusBar,
    QTabWidget,
    QTableWidget,
    QTableWidgetItem,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

# ---------------------------------------------------------------------------
# Make process_video_qrcode and send_webhook importable from the same dir
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.dirname(__file__))
import process_video_qrcode as pv
import send_webhook as sw
import llm_analysis

# App settings key
SETTINGS_ORG = "SparkRTC"
SETTINGS_APP = "ExperimentGUI"
SETTING_OPENROUTER_API_KEY = "openrouter_api_key"
SETTING_UI_THEME = "ui_theme"

DEFAULT_MODELS = [
    "anthropic/claude-sonnet-4",
    "openai/gpt-4.1",
    "google/gemini-2.5-pro",
    "meta-llama/llama-3.3-70b-instruct",
]
THEME_DARK = "dark"
THEME_LIGHT = "light"
THEME_CHOICES = [
    ("Dark (Recommended)", THEME_DARK),
    ("Light", THEME_LIGHT),
]


# ---------------------------------------------------------------------------
# Worker thread – runs a callable, captures stdout/stderr, emits lines
# ---------------------------------------------------------------------------
class Worker(QThread):
    log_signal = pyqtSignal(str)
    done_signal = pyqtSignal(bool, object)  # success, result-value

    def __init__(self, fn, *args, **kwargs):
        super().__init__()
        self._fn = fn
        self._args = args
        self._kwargs = kwargs

    def run(self):
        buf = io.StringIO()
        old_out, old_err = sys.stdout, sys.stderr

        class _Tee:
            def __init__(self, signal, stream):
                self._sig = signal
                self._stream = stream

            def write(self, text):
                self._stream.write(text)
                if text.strip():
                    self._sig.emit(text.rstrip())

            def flush(self):
                self._stream.flush()

        sys.stdout = _Tee(self.log_signal, old_out)
        sys.stderr = _Tee(self.log_signal, old_err)
        try:
            result = self._fn(*self._args, **self._kwargs)
            self.done_signal.emit(True, result)
        except Exception as exc:
            self.log_signal.emit(f"[ERROR] {exc}")
            self.done_signal.emit(False, None)
        finally:
            sys.stdout = old_out
            sys.stderr = old_err


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _make_cfg(**kwargs) -> argparse.Namespace:
    defaults = dict(
        data="", width=1920, height=1080, output_dir="",
        loss_rate=0, method_val=40, method_type=2, burst_length=2,
        yuv_path="",  # Full path to YUV file
    )
    defaults.update(kwargs)
    return argparse.Namespace(**defaults)


def _log_font() -> QFont:
    f = QFont("Monospace", 9)
    f.setStyleHint(QFont.StyleHint.Monospace)
    return f


def _get_settings() -> QSettings:
    return QSettings(SETTINGS_ORG, SETTINGS_APP)


def _normalize_theme(theme: str) -> str:
    normalized = str(theme or "").strip().lower()
    if normalized in (THEME_DARK, THEME_LIGHT):
        return normalized
    return THEME_DARK


def _get_saved_theme() -> str:
    settings = _get_settings()
    return _normalize_theme(settings.value(SETTING_UI_THEME, THEME_DARK))


def _app_stylesheet(theme: str) -> str:
    theme = _normalize_theme(theme)
    if theme == THEME_LIGHT:
        return """
QMainWindow, QWidget {
    background: #f8fafc;
    color: #0f172a;
    font-size: 13px;
}
QFrame#AppHeader {
    background: #ffffff;
    border: 1px solid #dbe7ff;
    border-radius: 12px;
}
QLabel#HeaderTitle {
    font-size: 19px;
    font-weight: 700;
    color: #0f172a;
}
QLabel#HeaderSubtitle {
    color: #475569;
}
QLabel#HeaderChip {
    color: #1d4ed8;
    background: #dbeafe;
    border: 1px solid #bfdbfe;
    border-radius: 9px;
    padding: 4px 8px;
    font-weight: 600;
}
QTabWidget::pane {
    border: 1px solid #dbe3ee;
    border-radius: 10px;
    background: #ffffff;
}
QTabBar::tab {
    background: #e5e7eb;
    color: #334155;
    border: 1px solid #d1d5db;
    border-bottom: none;
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
    padding: 8px 14px;
    margin-right: 4px;
}
QTabBar::tab:selected {
    background: #ffffff;
    color: #0f172a;
    border-color: #cbd5e1;
}
QGroupBox {
    background: #ffffff;
    border: 1px solid #dbe3ee;
    border-radius: 10px;
    margin-top: 12px;
    padding-top: 8px;
    font-weight: 600;
}
QGroupBox::title {
    subcontrol-origin: margin;
    left: 10px;
    padding: 0 4px;
    color: #334155;
}
QLineEdit, QComboBox, QSpinBox, QTextEdit, QTableWidget {
    background: #f8fafc;
    color: #0f172a;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 6px;
}
QComboBox QAbstractItemView {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    selection-background-color: #dbeafe;
    selection-color: #0f172a;
}
QPushButton {
    background: #e2e8f0;
    color: #0f172a;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 7px 12px;
    font-weight: 600;
}
QPushButton:hover {
    background: #dbeafe;
    border-color: #bfdbfe;
}
QPushButton[variant="primary"] {
    background: #2563eb;
    border-color: #1d4ed8;
    color: #ffffff;
}
QPushButton[variant="primary"]:hover {
    background: #1d4ed8;
}
QPushButton[variant="danger"] {
    background: #ef4444;
    border-color: #dc2626;
    color: #ffffff;
}
QPushButton[variant="danger"]:hover {
    background: #dc2626;
}
QPushButton:disabled {
    background: #f1f5f9;
    color: #94a3b8;
    border-color: #e2e8f0;
}
QStatusBar {
    background: #ffffff;
    border-top: 1px solid #dbe3ee;
    color: #475569;
}
"""

    return """
QMainWindow, QWidget {
    background: #0f172a;
    color: #e2e8f0;
    font-size: 13px;
}
QFrame#AppHeader {
    background: #111827;
    border: 1px solid #1f2937;
    border-radius: 12px;
}
QLabel#HeaderTitle {
    font-size: 19px;
    font-weight: 700;
    color: #f8fafc;
}
QLabel#HeaderSubtitle {
    color: #94a3b8;
}
QLabel#HeaderChip {
    color: #bfdbfe;
    background: #1e3a8a;
    border: 1px solid #1d4ed8;
    border-radius: 9px;
    padding: 4px 8px;
    font-weight: 600;
}
QTabWidget::pane {
    border: 1px solid #1f2937;
    border-radius: 10px;
    background: #0b1220;
}
QTabBar::tab {
    background: #1f2937;
    color: #cbd5e1;
    border: 1px solid #334155;
    border-bottom: none;
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
    padding: 8px 14px;
    margin-right: 4px;
}
QTabBar::tab:selected {
    background: #0b1220;
    color: #f8fafc;
    border-color: #334155;
}
QGroupBox {
    background: #111827;
    border: 1px solid #273449;
    border-radius: 10px;
    margin-top: 12px;
    padding-top: 8px;
    font-weight: 600;
}
QGroupBox::title {
    subcontrol-origin: margin;
    left: 10px;
    padding: 0 4px;
    color: #cbd5e1;
}
QLineEdit, QComboBox, QSpinBox, QTextEdit, QTableWidget {
    background: #0b1220;
    color: #e2e8f0;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 6px;
}
QComboBox QAbstractItemView {
    background: #111827;
    border: 1px solid #334155;
    selection-background-color: #1d4ed8;
    selection-color: #ffffff;
}
QPushButton {
    background: #1f2937;
    color: #e2e8f0;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 7px 12px;
    font-weight: 600;
}
QPushButton:hover {
    background: #263244;
    border-color: #3b4f69;
}
QPushButton[variant="primary"] {
    background: #2563eb;
    border-color: #1d4ed8;
    color: #ffffff;
}
QPushButton[variant="primary"]:hover {
    background: #1d4ed8;
}
QPushButton[variant="danger"] {
    background: #b91c1c;
    border-color: #991b1b;
    color: #ffffff;
}
QPushButton[variant="danger"]:hover {
    background: #991b1b;
}
QPushButton:disabled {
    background: #1f2937;
    color: #64748b;
    border-color: #334155;
}
QStatusBar {
    background: #111827;
    border-top: 1px solid #1f2937;
    color: #94a3b8;
}
"""


def _apply_theme(app: QApplication, theme: str):
    app.setStyle("Fusion")
    app.setStyleSheet(_app_stylesheet(theme))


def _set_button_variant(button: QPushButton, variant: str):
    button.setProperty("variant", variant)


# ---------------------------------------------------------------------------
# OpenRouter API helpers
# ---------------------------------------------------------------------------
def fetch_openrouter_balance(api_key: str) -> dict:
    """Fetch account balance from OpenRouter API."""
    import urllib.request
    import urllib.error

    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/credits",
        headers={"Authorization": f"Bearer {api_key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}: {e.reason}"}
    except Exception as e:
        return {"error": str(e)}


def fetch_openrouter_models(api_key: str = None) -> list[dict]:
    """Fetch available models from OpenRouter API."""
    import urllib.request
    import urllib.error

    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/models",
        headers=headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            return data.get("data", [])
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Settings Tab
# ---------------------------------------------------------------------------
class SettingsTab(QWidget):
    api_key_changed = pyqtSignal(str)
    models_updated = pyqtSignal(list)
    theme_changed = pyqtSignal(str)

    def __init__(self):
        super().__init__()
        self._models_cache = []

        layout = QVBoxLayout(self)

        # --- API Key ---
        key_group = QGroupBox("OpenRouter API Key")
        key_layout = QVBoxLayout(key_group)

        key_form = QFormLayout()
        self.key_edit = QLineEdit()
        self.key_edit.setEchoMode(QLineEdit.EchoMode.Password)
        self.key_edit.setPlaceholderText("sk-or-…")
        key_form.addRow("API Key:", self.key_edit)
        key_layout.addLayout(key_form)

        key_btn_row = QHBoxLayout()
        self.show_key_btn = QPushButton("Show")
        self.show_key_btn.setCheckable(True)
        self.show_key_btn.toggled.connect(self._toggle_key_visibility)
        self.save_key_btn = QPushButton("Save Key")
        self.save_key_btn.clicked.connect(self._save_key)
        _set_button_variant(self.save_key_btn, "primary")
        self.clear_key_btn = QPushButton("Clear Key")
        self.clear_key_btn.clicked.connect(self._clear_key)
        _set_button_variant(self.clear_key_btn, "danger")
        key_btn_row.addWidget(self.show_key_btn)
        key_btn_row.addWidget(self.save_key_btn)
        key_btn_row.addWidget(self.clear_key_btn)
        key_btn_row.addStretch()
        key_layout.addLayout(key_btn_row)

        layout.addWidget(key_group)

        # --- Balance ---
        balance_group = QGroupBox("Account Balance")
        balance_layout = QVBoxLayout(balance_group)

        balance_form = QFormLayout()
        self.balance_label = QLabel("–")
        self.usage_label = QLabel("–")
        self.limit_label = QLabel("–")
        balance_form.addRow("Credits remaining:", self.balance_label)
        balance_form.addRow("Credits used:", self.usage_label)
        balance_form.addRow("Rate limit:", self.limit_label)
        balance_layout.addLayout(balance_form)

        balance_btn_row = QHBoxLayout()
        self.refresh_balance_btn = QPushButton("Refresh Balance")
        self.refresh_balance_btn.clicked.connect(self._refresh_balance)
        balance_btn_row.addWidget(self.refresh_balance_btn)
        balance_btn_row.addStretch()
        balance_layout.addLayout(balance_btn_row)

        layout.addWidget(balance_group)

        # --- Appearance ---
        appearance_group = QGroupBox("Appearance")
        appearance_layout = QVBoxLayout(appearance_group)
        appearance_row = QHBoxLayout()
        appearance_row.addWidget(QLabel("Theme:"))
        self.theme_combo = QComboBox()
        for label, value in THEME_CHOICES:
            self.theme_combo.addItem(label, value)
        self.theme_combo.currentIndexChanged.connect(self._save_and_emit_theme)
        appearance_row.addWidget(self.theme_combo)
        appearance_row.addStretch()
        appearance_layout.addLayout(appearance_row)
        layout.addWidget(appearance_group)

        # --- Models ---
        models_group = QGroupBox("Available Models")
        models_layout = QVBoxLayout(models_group)

        models_btn_row = QHBoxLayout()
        self.fetch_models_btn = QPushButton("Fetch Models from OpenRouter")
        self.fetch_models_btn.clicked.connect(self._fetch_models)
        self.models_status = QLabel("Models not loaded. Add API key and fetch.")
        models_btn_row.addWidget(self.fetch_models_btn)
        models_btn_row.addWidget(self.models_status)
        models_btn_row.addStretch()
        models_layout.addLayout(models_btn_row)

        self.models_list = QTextEdit()
        self.models_list.setReadOnly(True)
        self.models_list.setMaximumHeight(200)
        self.models_list.setFont(_log_font())
        models_layout.addWidget(self.models_list)

        layout.addWidget(models_group)

        layout.addStretch()

        # Load saved key on startup
        self._load_key()
        self._load_theme()

    def _toggle_key_visibility(self, show: bool):
        if show:
            self.key_edit.setEchoMode(QLineEdit.EchoMode.Normal)
            self.show_key_btn.setText("Hide")
        else:
            self.key_edit.setEchoMode(QLineEdit.EchoMode.Password)
            self.show_key_btn.setText("Show")

    def _load_key(self):
        settings = _get_settings()
        saved_key = settings.value(SETTING_OPENROUTER_API_KEY, "")
        # Prefer environment variable over saved key
        env_key = os.environ.get("OPENROUTER_API_KEY", "")
        key = env_key or saved_key
        if key:
            self.key_edit.setText(key)
            # Note: api_key_changed is emitted via initialize_from_saved_key()
            # after signal connections are established

    def _load_theme(self):
        saved_theme = _get_saved_theme()
        idx = self.theme_combo.findData(saved_theme)
        if idx < 0:
            idx = 0
        self.theme_combo.blockSignals(True)
        self.theme_combo.setCurrentIndex(idx)
        self.theme_combo.blockSignals(False)

    def initialize_from_saved_key(self):
        """Called after signal connections are established to emit initial state."""
        key = self.key_edit.text().strip()
        if key:
            self.api_key_changed.emit(key)
            # Auto-fetch models when API key is available on startup
            self._fetch_models()
        self.theme_changed.emit(self.get_selected_theme())

    def _save_key(self):
        key = self.key_edit.text().strip()
        if not key:
            QMessageBox.warning(self, "Warning", "Please enter an API key first.")
            return
        settings = _get_settings()
        settings.setValue(SETTING_OPENROUTER_API_KEY, key)
        self.api_key_changed.emit(key)
        QMessageBox.information(self, "Saved", "API key saved successfully.")
        # Auto-fetch models when saving a new key
        self._fetch_models()

    def _clear_key(self):
        self.key_edit.clear()
        settings = _get_settings()
        settings.remove(SETTING_OPENROUTER_API_KEY)
        self.api_key_changed.emit("")
        self.balance_label.setText("–")
        self.usage_label.setText("–")
        self.limit_label.setText("–")

    def _save_and_emit_theme(self):
        theme = self.get_selected_theme()
        settings = _get_settings()
        settings.setValue(SETTING_UI_THEME, theme)
        self.theme_changed.emit(theme)

    def _refresh_balance(self):
        key = self.key_edit.text().strip()
        if not key:
            QMessageBox.warning(self, "Warning", "Please enter an API key first.")
            return

        self.refresh_balance_btn.setEnabled(False)
        self.refresh_balance_btn.setText("Loading…")

        # Run in a worker thread to avoid blocking UI
        def _fetch():
            return fetch_openrouter_balance(key)

        worker = Worker(_fetch)
        worker.done_signal.connect(self._on_balance_fetched)
        worker.start()
        self._balance_worker = worker  # prevent gc

    def _on_balance_fetched(self, ok: bool, result):
        self.refresh_balance_btn.setEnabled(True)
        self.refresh_balance_btn.setText("Refresh Balance")

        if not ok or result is None:
            self.balance_label.setText("Error fetching balance")
            return

        if "error" in result:
            self.balance_label.setText(f"Error: {result['error']}")
            return

        # Parse the balance response
        data = result.get("data", result)
        if isinstance(data, dict):
            balance = data.get("balance", data.get("credits", "N/A"))
            usage = data.get("usage", "N/A")
            limit = data.get("limit", data.get("rate_limit", "N/A"))

            # Format currency if numeric
            if isinstance(balance, (int, float)):
                self.balance_label.setText(f"${balance:.4f}")
            else:
                self.balance_label.setText(str(balance))

            if isinstance(usage, (int, float)):
                self.usage_label.setText(f"${usage:.4f}")
            else:
                self.usage_label.setText(str(usage))

            self.limit_label.setText(str(limit))
        else:
            self.balance_label.setText(str(data))

    def _fetch_models(self):
        key = self.key_edit.text().strip()
        if not key:
            self.models_status.setText("Add API key first")
            self.models_list.setPlainText("Set OpenRouter API key, then click 'Fetch Models from OpenRouter'.")
            self.models_updated.emit([])
            return

        self.fetch_models_btn.setEnabled(False)
        self.models_status.setText("Fetching…")

        def _fetch():
            return fetch_openrouter_models(key)

        worker = Worker(_fetch)
        worker.done_signal.connect(self._on_models_fetched)
        worker.start()
        self._models_worker = worker

    def _on_models_fetched(self, ok: bool, result):
        self.fetch_models_btn.setEnabled(True)

        if not ok or not result:
            self.models_status.setText("Failed to fetch models")
            self.models_list.setPlainText("Could not fetch models. Check API key and network, then try again.")
            self.models_updated.emit(DEFAULT_MODELS)
            return

        # Filter to text models suitable for analysis
        text_models = []
        for m in result:
            model_id = m.get("id", "")
            arch = m.get("architecture", {})
            modality = arch.get("modality", "")
            # Include text->text models
            if "text" in modality:
                text_models.append({
                    "id": model_id,
                    "name": m.get("name", model_id),
                    "context_length": m.get("context_length", 0),
                })

        # Sort models by name (alphabetically)
        text_models.sort(key=lambda m: m["name"].lower())

        self._models_cache = text_models
        self.models_status.setText(f"Found {len(text_models)} models")

        # Display in text area (sorted)
        lines = []
        for m in text_models[:100]:  # Show first 100
            lines.append(f"{m['id']}  ({m['context_length']:,} ctx)")
        self.models_list.setPlainText("\n".join(lines))

        # Emit signal with sorted model IDs
        model_ids = [m["id"] for m in text_models]
        self.models_updated.emit(model_ids)

    def get_api_key(self) -> str:
        return self.key_edit.text().strip()

    def get_models(self) -> list[str]:
        if self._models_cache:
            return [m["id"] for m in self._models_cache]
        return DEFAULT_MODELS

    def get_selected_theme(self) -> str:
        return _normalize_theme(self.theme_combo.currentData())


# ---------------------------------------------------------------------------
# Tab 1 – Video Pre-processing
# ---------------------------------------------------------------------------
class PreprocessTab(QWidget):
    def __init__(self):
        super().__init__()
        self._worker = None
        self._src_path = ""

        layout = QVBoxLayout(self)

        # --- Source file ---
        src_group = QGroupBox("Source Video")
        src_form = QFormLayout(src_group)
        src_row = QHBoxLayout()
        self.src_edit = QLineEdit()
        self.src_edit.setPlaceholderText("Select any video file…")
        browse_btn = QPushButton("Browse…")
        browse_btn.clicked.connect(self._browse)
        src_row.addWidget(self.src_edit)
        src_row.addWidget(browse_btn)
        src_form.addRow("File:", src_row)
        layout.addWidget(src_group)

        # --- Parameters ---
        param_group = QGroupBox("Parameters")
        param_form = QFormLayout(param_group)
        self.width_spin = QSpinBox()
        self.width_spin.setRange(64, 7680)
        self.width_spin.setValue(1920)
        self.height_spin = QSpinBox()
        self.height_spin.setRange(64, 4320)
        self.height_spin.setValue(1080)
        self.fps_spin = QSpinBox()
        self.fps_spin.setRange(1, 120)
        self.fps_spin.setValue(30)
        param_form.addRow("Width:", self.width_spin)
        param_form.addRow("Height:", self.height_spin)
        param_form.addRow("FPS:", self.fps_spin)
        layout.addWidget(param_group)

        # --- Buttons ---
        btn_row = QHBoxLayout()
        self.conv_btn = QPushButton("Convert to YUV")
        self.conv_btn.clicked.connect(self._convert)
        _set_button_variant(self.conv_btn, "primary")
        self.qr_btn = QPushButton("Add QR Codes")
        self.qr_btn.clicked.connect(self._add_qr)
        self.qr_btn.setEnabled(False)
        btn_row.addWidget(self.conv_btn)
        btn_row.addWidget(self.qr_btn)
        layout.addLayout(btn_row)

        # --- Log ---
        self.log = QTextEdit()
        self.log.setReadOnly(True)
        self.log.setFont(_log_font())
        layout.addWidget(self.log)

    def _browse(self):
        path, _ = QFileDialog.getOpenFileName(self, "Select video file", "",
                                               "Video files (*.mp4 *.mkv *.avi *.mov *.yuv);;All files (*)")
        if path:
            self.src_edit.setText(path)
            self._src_path = path

    def _append(self, text: str):
        self.log.append(text)

    def _set_busy(self, busy: bool):
        self.conv_btn.setEnabled(not busy)
        self.qr_btn.setEnabled(not busy)

    def _convert(self):
        src = self.src_edit.text().strip()
        if not src:
            self._append("[!] Please select a source file first.")
            return
        w = self.width_spin.value()
        h = self.height_spin.value()
        fps = self.fps_spin.value()
        name = os.path.splitext(os.path.basename(src))[0]
        out_dir = os.path.join(os.path.dirname(__file__), "..", "data")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, name + ".yuv")

        def _run():
            cmd = [
                "ffmpeg", "-i", src,
                "-vf", f"scale={w}:{h}",
                "-r", str(fps),
                "-pix_fmt", "yuv420p",
                out_path, "-y",
            ]
            self._append(f"Running: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0:
                self._append(f"✓ Saved: {out_path}")
                self._src_path = out_path
                self.src_edit.setText(out_path)
                self.qr_btn.setEnabled(True)
            else:
                self._append(f"✗ ffmpeg error:\n{result.stderr[-1000:]}")

        self._set_busy(True)
        self._worker = Worker(_run)
        self._worker.done_signal.connect(lambda *_: self._set_busy(False))
        self._worker.start()

    def _add_qr(self):
        src = self.src_edit.text().strip()
        if not src or not src.endswith(".yuv"):
            self._append("[!] Convert to YUV first.")
            return
        name = os.path.splitext(os.path.basename(src))[0]
        # strip _qrcode suffix if already present to avoid double overlay
        if name.endswith("_qrcode"):
            name = name[:-7]
        cfg = _make_cfg(data=name, width=self.width_spin.value(),
                        height=self.height_spin.value())

        self._set_busy(True)
        self._worker = Worker(pv.overlay_qrcode_to_video, cfg)
        self._worker.log_signal.connect(self._append)
        self._worker.done_signal.connect(self._qr_done)
        self._worker.start()

    def _qr_done(self, ok: bool, _):
        self._set_busy(False)
        if ok:
            self._append("✓ QR codes added successfully.")
        else:
            self._append("✗ QR code overlay failed.")


# ---------------------------------------------------------------------------
# Tab 2 – Run Experiment & Timestamp Logs
# ---------------------------------------------------------------------------
class ExperimentTab(QWidget):
    webhook_url_changed = pyqtSignal(str)  # propagate to Tab 3
    experiment_done = pyqtSignal(str, str)  # output_dir, data

    def __init__(self):
        super().__init__()
        self._worker = None
        self._yuv_path = ""

        layout = QVBoxLayout(self)

        # --- YUV File Selection ---
        yuv_group = QGroupBox("Input Video")
        yuv_layout = QVBoxLayout(yuv_group)

        yuv_row = QHBoxLayout()
        self.yuv_edit = QLineEdit()
        self.yuv_edit.setPlaceholderText("Select a YUV video file…")
        self.yuv_edit.textChanged.connect(self._on_yuv_changed)
        yuv_row.addWidget(self.yuv_edit)

        self.yuv_browse_btn = QPushButton("Browse…")
        self.yuv_browse_btn.clicked.connect(self._browse_yuv)
        yuv_row.addWidget(self.yuv_browse_btn)

        self.yuv_downloads_btn = QPushButton("Downloads")
        self.yuv_downloads_btn.setToolTip("Open Downloads folder")
        self.yuv_downloads_btn.clicked.connect(self._browse_yuv_downloads)
        yuv_row.addWidget(self.yuv_downloads_btn)

        yuv_layout.addLayout(yuv_row)

        # Video parameters
        param_row = QHBoxLayout()
        param_row.addWidget(QLabel("Width:"))
        self.width_spin = QSpinBox()
        self.width_spin.setRange(64, 7680)
        self.width_spin.setValue(1920)
        param_row.addWidget(self.width_spin)

        param_row.addWidget(QLabel("Height:"))
        self.height_spin = QSpinBox()
        self.height_spin.setRange(64, 4320)
        self.height_spin.setValue(1080)
        param_row.addWidget(self.height_spin)

        param_row.addWidget(QLabel("FPS:"))
        self.fps_spin = QSpinBox()
        self.fps_spin.setRange(1, 120)
        self.fps_spin.setValue(30)
        param_row.addWidget(self.fps_spin)

        param_row.addStretch()
        yuv_layout.addLayout(param_row)

        layout.addWidget(yuv_group)

        # --- Output Directory Selection ---
        out_group = QGroupBox("Output Directory")
        out_layout = QVBoxLayout(out_group)

        out_row = QHBoxLayout()
        self.outdir_edit = QLineEdit()
        self.outdir_edit.setPlaceholderText("Select output directory for results…")
        out_row.addWidget(self.outdir_edit)

        self.outdir_browse_btn = QPushButton("Browse…")
        self.outdir_browse_btn.clicked.connect(self._browse_outdir)
        out_row.addWidget(self.outdir_browse_btn)

        self.outdir_downloads_btn = QPushButton("Downloads")
        self.outdir_downloads_btn.setToolTip("Use Downloads folder")
        self.outdir_downloads_btn.clicked.connect(self._set_outdir_downloads)
        out_row.addWidget(self.outdir_downloads_btn)

        out_layout.addLayout(out_row)
        layout.addWidget(out_group)

        # --- Buttons ---
        btn_row = QHBoxLayout()
        self.run_btn = QPushButton("Run Experiment")
        self.run_btn.clicked.connect(self._run_experiment)
        _set_button_variant(self.run_btn, "primary")
        self.fig_btn = QPushButton("Show Figures")
        self.fig_btn.clicked.connect(self._show_fig)
        self.fig_btn.setEnabled(False)
        self.load_btn = QPushButton("Load Timestamp Logs")
        self.load_btn.clicked.connect(self._load_ts_logs)
        self.load_btn.setEnabled(False)
        btn_row.addWidget(self.run_btn)
        btn_row.addWidget(self.fig_btn)
        btn_row.addWidget(self.load_btn)
        layout.addLayout(btn_row)

        splitter = QSplitter(Qt.Orientation.Vertical)

        # Terminal output (server, sender, receiver)
        term_box = QGroupBox("Terminal Output")
        term_layout = QVBoxLayout(term_box)

        # Terminal selector
        term_ctrl = QHBoxLayout()
        term_ctrl.addWidget(QLabel("Process:"))
        self.term_combo = QComboBox()
        self.term_combo.addItems(["Server", "Sender", "Receiver"])
        self.term_combo.currentTextChanged.connect(self._refresh_terminal)
        term_ctrl.addWidget(self.term_combo)
        self.clear_term_btn = QPushButton("Clear")
        self.clear_term_btn.clicked.connect(self._clear_terminal)
        term_ctrl.addWidget(self.clear_term_btn)
        term_ctrl.addStretch()
        term_layout.addLayout(term_ctrl)

        self.term_output = QTextEdit()
        self.term_output.setReadOnly(True)
        self.term_output.setFont(_log_font())
        self.term_output.setPlaceholderText("Terminal output will appear here when experiment runs…")
        term_layout.addWidget(self.term_output)

        # Live log
        log_box = QGroupBox("Live Log")
        log_layout = QVBoxLayout(log_box)
        self.log = QTextEdit()
        self.log.setReadOnly(True)
        self.log.setFont(_log_font())
        log_layout.addWidget(self.log)

        # Timestamp viewer
        ts_box = QGroupBox("Timestamp Log Viewer")
        ts_layout = QVBoxLayout(ts_box)
        ts_ctrl = QHBoxLayout()
        self.event_combo = QComboBox()
        self.source_combo = QComboBox()
        self.source_combo.addItems(["send", "recv"])
        ts_ctrl.addWidget(QLabel("Source:"))
        ts_ctrl.addWidget(self.source_combo)
        ts_ctrl.addWidget(QLabel("Event:"))
        ts_ctrl.addWidget(self.event_combo)
        ts_ctrl.addStretch()
        self.event_combo.currentTextChanged.connect(self._refresh_table)
        self.source_combo.currentTextChanged.connect(self._refresh_table)
        ts_layout.addLayout(ts_ctrl)
        self.ts_table = QTableWidget()
        ts_layout.addWidget(self.ts_table)

        splitter.addWidget(term_box)
        splitter.addWidget(log_box)
        splitter.addWidget(ts_box)
        splitter.setSizes([250, 150, 150])
        layout.addWidget(splitter)

        self._ts_data: dict[str, dict[str, list]] = {"send": {}, "recv": {}}
        self._term_buffers: dict[str, str] = {"Server": "", "Sender": "", "Receiver": ""}

    def _refresh_terminal(self):
        """Update terminal display with current process buffer."""
        process = self.term_combo.currentText()
        self.term_output.setPlainText(self._term_buffers.get(process, ""))
        # Scroll to bottom
        cursor = self.term_output.textCursor()
        cursor.movePosition(cursor.MoveOperation.End)
        self.term_output.setTextCursor(cursor)

    def _clear_terminal(self):
        """Clear current terminal buffer."""
        process = self.term_combo.currentText()
        self._term_buffers[process] = ""
        self.term_output.clear()

    def _append_terminal(self, process: str, text: str):
        """Append text to a specific process terminal buffer."""
        self._term_buffers[process] = self._term_buffers.get(process, "") + text + "\n"
        # If this process is currently selected, update display
        if self.term_combo.currentText() == process:
            self.term_output.append(text)

    def _clear_all_terminals(self):
        """Clear all terminal buffers."""
        for key in self._term_buffers:
            self._term_buffers[key] = ""
        self.term_output.clear()

    def _get_downloads_folder(self) -> str:
        """Get the user's Downloads folder path."""
        # Try XDG first (Linux), then common locations
        xdg_download = os.environ.get("XDG_DOWNLOAD_DIR")
        if xdg_download and os.path.isdir(xdg_download):
            return xdg_download
        home = os.path.expanduser("~")
        downloads = os.path.join(home, "Downloads")
        if os.path.isdir(downloads):
            return downloads
        # Fallback to home directory
        return home

    def _browse_yuv(self):
        """Open file dialog to select YUV file."""
        start_dir = os.path.dirname(self.yuv_edit.text()) if self.yuv_edit.text() else ""
        if not start_dir:
            start_dir = os.path.join(os.path.dirname(__file__), "..", "data")
        path, _ = QFileDialog.getOpenFileName(
            self, "Select YUV Video File", start_dir,
            "YUV files (*.yuv);;All files (*)"
        )
        if path:
            self.yuv_edit.setText(path)

    def _browse_yuv_downloads(self):
        """Open file dialog starting from Downloads folder."""
        downloads = self._get_downloads_folder()
        path, _ = QFileDialog.getOpenFileName(
            self, "Select YUV Video File", downloads,
            "YUV files (*.yuv);;All files (*)"
        )
        if path:
            self.yuv_edit.setText(path)

    def _on_yuv_changed(self, path: str):
        """Update internal state when YUV path changes."""
        self._yuv_path = path

    def _browse_outdir(self):
        """Open folder dialog to select output directory."""
        start_dir = self.outdir_edit.text() if self.outdir_edit.text() else ""
        if not start_dir:
            start_dir = os.path.join(os.path.dirname(__file__), "..", "result")
        path = QFileDialog.getExistingDirectory(
            self, "Select Output Directory", start_dir
        )
        if path:
            self.outdir_edit.setText(path)

    def _set_outdir_downloads(self):
        """Set output directory to Downloads folder."""
        downloads = self._get_downloads_folder()
        # Create a subfolder for SparkRTC results
        result_dir = os.path.join(downloads, "sparkrtc_results")
        os.makedirs(result_dir, exist_ok=True)
        self.outdir_edit.setText(result_dir)
        self._append(f"Output directory set to: {result_dir}")

    def _append(self, text: str):
        self.log.append(text)

    def _set_busy(self, busy: bool):
        self.run_btn.setEnabled(not busy)

    def _get_video_name(self) -> str:
        """Extract video name from YUV path (without extension)."""
        yuv_path = self.yuv_edit.text().strip()
        if not yuv_path:
            return ""
        basename = os.path.basename(yuv_path)
        name, _ = os.path.splitext(basename)
        return name

    def _make_cfg(self):
        video_name = self._get_video_name()
        output_dir = self.outdir_edit.text().strip()

        # If output_dir is absolute, we need to handle it specially
        # For now, store the full paths
        return _make_cfg(
            data=video_name,
            output_dir=output_dir,
            width=self.width_spin.value(),
            height=self.height_spin.value(),
            yuv_path=self.yuv_edit.text().strip(),  # Pass full path
        )

    def _run_experiment(self):
        yuv_path = self.yuv_edit.text().strip()
        output_dir = self.outdir_edit.text().strip()

        if not yuv_path:
            self._append("[!] Please select a YUV video file.")
            return
        if not os.path.isfile(yuv_path):
            self._append(f"[!] YUV file not found: {yuv_path}")
            return
        if not output_dir:
            self._append("[!] Please select an output directory.")
            return

        # Create output directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)

        cfg = self._make_cfg()
        self._append(f"Starting experiment…")
        self._append(f"  Input: {yuv_path}")
        self._append(f"  Output: {output_dir}")
        self._append(f"  Resolution: {cfg.width}x{cfg.height} @ {self.fps_spin.value()} fps")

        # Clear terminal buffers for new experiment
        self._clear_all_terminals()

        self._set_busy(True)
        self._worker = Worker(pv.send_and_recv_video, cfg)
        self._worker.log_signal.connect(self._on_experiment_log)
        self._worker.done_signal.connect(self._experiment_done)
        self._worker.start()

    def _on_experiment_log(self, text: str):
        """Route experiment log output to appropriate terminal and live log."""
        self._append(text)

        # Route to specific terminal based on content
        text_lower = text.lower()
        if "server" in text_lower or "listening" in text_lower:
            self._append_terminal("Server", text)
        elif "sender" in text_lower or "sending" in text_lower or "encode" in text_lower:
            self._append_terminal("Sender", text)
        elif "receiver" in text_lower or "receiving" in text_lower or "decode" in text_lower or "recon" in text_lower:
            self._append_terminal("Receiver", text)
        else:
            # Default: show in all terminals or based on context
            # Check for process-specific markers
            if "[SERVER]" in text:
                self._append_terminal("Server", text)
            elif "[SENDER]" in text:
                self._append_terminal("Sender", text)
            elif "[RECEIVER]" in text:
                self._append_terminal("Receiver", text)

    def _experiment_done(self, ok: bool, _):
        self._set_busy(False)
        if ok:
            self._append("✓ Experiment complete.")
            self.fig_btn.setEnabled(True)
            self.load_btn.setEnabled(True)
            self.experiment_done.emit(
                self.outdir_edit.text().strip(),
                self._get_video_name(),
            )
        else:
            self._append("✗ Experiment failed.")

    def _show_fig(self):
        cfg = self._make_cfg()
        self._worker = Worker(pv.show_fig, cfg)
        self._worker.log_signal.connect(self._append)
        self._worker.done_signal.connect(lambda ok, _: self._append(
            "✓ Figures saved." if ok else "✗ show_fig failed."
        ))
        self._worker.start()

    def _load_ts_logs(self):
        cfg = self._make_cfg()
        output_dir = self.outdir_edit.text().strip()
        video_name = self._get_video_name()

        # Try absolute path first, then relative path
        if os.path.isabs(output_dir):
            base = os.path.join(output_dir, "res", video_name, "timestamps")
        else:
            base = os.path.join(
                os.path.dirname(__file__), "..", "result",
                output_dir, "res", video_name, "timestamps",
            )

        self._ts_data = {"send": {}, "recv": {}}
        for src in ("send", "recv"):
            src_dir = os.path.join(base, src)
            if not os.path.isdir(src_dir):
                self._append(f"[!] Timestamp dir not found: {src_dir}")
                continue
            for fname in os.listdir(src_dir):
                if not fname.endswith(".csv"):
                    continue
                event_type = fname[:-4].upper()
                rows = []
                with open(os.path.join(src_dir, fname), newline="") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        rows.append(row)
                self._ts_data[src][event_type] = rows

        # Populate combo boxes
        all_events = sorted(
            set(list(self._ts_data["send"].keys()) + list(self._ts_data["recv"].keys()))
        )
        self.event_combo.blockSignals(True)
        self.event_combo.clear()
        self.event_combo.addItems(all_events)
        self.event_combo.blockSignals(False)
        self._refresh_table()
        self._append(f"✓ Timestamp logs loaded.")

    def _refresh_table(self):
        src = self.source_combo.currentText()
        event = self.event_combo.currentText()
        rows = self._ts_data.get(src, {}).get(event, [])
        if not rows:
            self.ts_table.clear()
            self.ts_table.setRowCount(0)
            self.ts_table.setColumnCount(0)
            return
        cols = list(rows[0].keys())
        self.ts_table.setColumnCount(len(cols))
        self.ts_table.setRowCount(len(rows))
        self.ts_table.setHorizontalHeaderLabels(cols)
        for r, row in enumerate(rows):
            for c, col in enumerate(cols):
                self.ts_table.setItem(r, c, QTableWidgetItem(row.get(col, "")))
        self.ts_table.resizeColumnsToContents()


# ---------------------------------------------------------------------------
# Stream worker – calls LLM, emits text chunks via signal
# ---------------------------------------------------------------------------
class StreamWorker(QThread):
    chunk_signal = pyqtSignal(str)
    done_signal = pyqtSignal(bool, object)  # success, (summary_text, full_response)

    def __init__(self, logs, api_key, model):
        super().__init__()
        self._logs = logs
        self._api_key = api_key
        self._model = model
        self._cancelled = False

    def cancel(self):
        self._cancelled = True

    def run(self):
        try:
            def _on_chunk(text):
                if self._cancelled:
                    raise InterruptedError("cancelled")
                self.chunk_signal.emit(text)

            result = llm_analysis.analyze_experiment(
                self._logs, self._api_key, self._model, on_chunk=_on_chunk,
            )
            self.done_signal.emit(True, result)
        except InterruptedError:
            self.done_signal.emit(False, None)
        except Exception as exc:
            self.chunk_signal.emit(f"\n\n[ERROR] {exc}")
            self.done_signal.emit(False, None)


# ---------------------------------------------------------------------------
# Tab 3 – LLM Analysis (via OpenRouter)
# ---------------------------------------------------------------------------
class AnalysisTab(QWidget):
    def __init__(self):
        super().__init__()
        self._worker = None
        self._output_dir = ""
        self._data = ""
        self._api_key = ""

        layout = QVBoxLayout(self)

        # --- Model selection ---
        cfg_group = QGroupBox("Model Configuration")
        cfg_form = QFormLayout(cfg_group)

        model_row = QHBoxLayout()
        self.model_combo = QComboBox()
        self.model_combo.setEditable(True)  # Allow custom model entry
        self.model_combo.setMinimumWidth(300)
        self.model_combo.addItems(DEFAULT_MODELS)
        self.model_combo.setCurrentText("anthropic/claude-sonnet-4")
        model_edit = self.model_combo.lineEdit()
        if model_edit:
            model_edit.setPlaceholderText("Fetch models in Settings tab (API key required)")
        model_row.addWidget(self.model_combo)
        model_row.addStretch()
        cfg_form.addRow("Model:", model_row)

        self.outdir_label = QLabel("(set in Experiment tab)")
        self.data_label = QLabel("(set in Experiment tab)")
        cfg_form.addRow("Output dir:", self.outdir_label)
        cfg_form.addRow("Video name:", self.data_label)

        # API key status
        self.key_status_label = QLabel("API key: not set (configure in Settings tab)")
        cfg_form.addRow("", self.key_status_label)

        layout.addWidget(cfg_group)

        # --- Buttons ---
        btn_row = QHBoxLayout()
        self.analyze_btn = QPushButton("Analyze Results")
        self.analyze_btn.clicked.connect(self._analyze)
        _set_button_variant(self.analyze_btn, "primary")
        self.stop_btn = QPushButton("Stop")
        self.stop_btn.clicked.connect(self._stop)
        _set_button_variant(self.stop_btn, "danger")
        self.stop_btn.setEnabled(False)
        self.status_label = QLabel("–")
        btn_row.addWidget(self.analyze_btn)
        btn_row.addWidget(self.stop_btn)
        btn_row.addWidget(self.status_label)
        btn_row.addStretch()
        layout.addLayout(btn_row)

        splitter = QSplitter(Qt.Orientation.Vertical)

        # --- Analysis response ---
        resp_group = QGroupBox("LLM Analysis  (editable)")
        resp_layout = QVBoxLayout(resp_group)
        self.response_edit = QTextEdit()
        self.response_edit.setPlaceholderText(
            "LLM analysis will stream here.\n"
            "You can edit, annotate, and copy freely."
        )
        resp_layout.addWidget(self.response_edit)

        # --- Summary sent to LLM ---
        sum_group = QGroupBox("Summary Statistics (sent to LLM)")
        sum_layout = QVBoxLayout(sum_group)
        self.summary_edit = QTextEdit()
        self.summary_edit.setReadOnly(True)
        self.summary_edit.setFont(_log_font())
        sum_layout.addWidget(self.summary_edit)

        splitter.addWidget(resp_group)
        splitter.addWidget(sum_group)
        splitter.setSizes([400, 200])
        layout.addWidget(splitter)

    def set_api_key(self, key: str):
        """Called from Settings tab when API key changes."""
        self._api_key = key
        if key:
            # Mask the key for display
            masked = key[:8] + "…" + key[-4:] if len(key) > 12 else "***"
            self.key_status_label.setText(f"API key: {masked}")
        else:
            self.key_status_label.setText("API key: not set (configure in Settings tab)")

    def update_models(self, models: list[str]):
        """Update model dropdown with fetched models."""
        current = self.model_combo.currentText()
        effective_models = models or DEFAULT_MODELS
        self.model_combo.clear()
        self.model_combo.addItems(effective_models)
        # Restore previous selection if it exists
        idx = self.model_combo.findText(current)
        if idx >= 0:
            self.model_combo.setCurrentIndex(idx)
        elif effective_models:
            self.model_combo.setCurrentIndex(0)

    def set_experiment_context(self, output_dir: str, data: str):
        self._output_dir = output_dir
        self._data = data
        self.outdir_label.setText(output_dir or "(not set)")
        self.data_label.setText(data or "(not set)")

    def _analyze(self):
        if not self._api_key:
            self.status_label.setText("[!] Set API key in Settings tab.")
            return
        if not self._output_dir or not self._data:
            self.status_label.setText("[!] Run an experiment first.")
            return

        self.analyze_btn.setEnabled(False)
        self.stop_btn.setEnabled(True)
        self.status_label.setText("Collecting logs…")
        self.response_edit.clear()
        self.summary_edit.clear()

        # Collect logs (fast, synchronous)
        orig_dir = os.getcwd()
        os.chdir(os.path.dirname(__file__))
        logs = sw.collect_logs(self._output_dir, self._data)
        os.chdir(orig_dir)

        # Show summary
        summary = llm_analysis.summarize_logs(logs)
        summary_text = llm_analysis.format_summary(logs, summary)
        self.summary_edit.setPlainText(summary_text)

        self.status_label.setText("Streaming…")
        model = self.model_combo.currentText().strip()
        if not model:
            self.status_label.setText("[!] Fetch models first in Settings tab.")
            self.analyze_btn.setEnabled(True)
            self.stop_btn.setEnabled(False)
            return

        self._worker = StreamWorker(logs, self._api_key, model)
        self._worker.chunk_signal.connect(self._on_chunk)
        self._worker.done_signal.connect(self._on_done)
        self._worker.start()

    def _on_chunk(self, text: str):
        cursor = self.response_edit.textCursor()
        cursor.movePosition(cursor.MoveOperation.End)
        cursor.insertText(text)
        self.response_edit.setTextCursor(cursor)

    def _stop(self):
        if self._worker:
            self._worker.cancel()
        self.status_label.setText("Cancelled")
        self.analyze_btn.setEnabled(True)
        self.stop_btn.setEnabled(False)

    def _on_done(self, ok: bool, result):
        self.analyze_btn.setEnabled(True)
        self.stop_btn.setEnabled(False)
        if ok:
            self.status_label.setText("Done")
        elif self.status_label.text() != "Cancelled":
            self.status_label.setText("Failed")


# ---------------------------------------------------------------------------
# Main Window
# ---------------------------------------------------------------------------
class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("SparkRTC Experiment GUI")
        self.resize(1100, 780)

        root = QWidget()
        root_layout = QVBoxLayout(root)
        root_layout.setContentsMargins(12, 12, 12, 8)
        root_layout.setSpacing(10)

        header = QFrame()
        header.setObjectName("AppHeader")
        header_layout = QVBoxLayout(header)
        header_layout.setContentsMargins(14, 12, 14, 12)
        header_layout.setSpacing(4)

        title_label = QLabel("SparkRTC Experiment Studio")
        title_label.setObjectName("HeaderTitle")
        subtitle_label = QLabel("Modernized workflow for pre-processing, experiments, and LLM analysis")
        subtitle_label.setObjectName("HeaderSubtitle")

        chips_row = QHBoxLayout()
        chips_row.setSpacing(8)
        for chip_text in ("PyQt6", "OpenRouter", "Low-latency analysis"):
            chip = QLabel(chip_text)
            chip.setObjectName("HeaderChip")
            chips_row.addWidget(chip)
        chips_row.addStretch()

        header_layout.addWidget(title_label)
        header_layout.addWidget(subtitle_label)
        header_layout.addLayout(chips_row)
        root_layout.addWidget(header)

        tabs = QTabWidget()
        self.preprocess_tab = PreprocessTab()
        self.experiment_tab = ExperimentTab()
        self.analysis_tab = AnalysisTab()
        self.settings_tab = SettingsTab()

        tabs.addTab(self.preprocess_tab, "1 · Pre-processing")
        tabs.addTab(self.experiment_tab, "2 · Experiment & Logs")
        tabs.addTab(self.analysis_tab, "3 · LLM Analysis")
        tabs.addTab(self.settings_tab, "4 · Settings")

        # Wire experiment completion → analysis tab context
        self.experiment_tab.experiment_done.connect(self.analysis_tab.set_experiment_context)

        # Wire settings → analysis tab
        self.settings_tab.api_key_changed.connect(self.analysis_tab.set_api_key)
        self.settings_tab.models_updated.connect(self.analysis_tab.update_models)
        self.settings_tab.theme_changed.connect(self.apply_theme)

        # Initialize from saved API key after connections are established
        self.settings_tab.initialize_from_saved_key()

        root_layout.addWidget(tabs)
        self.setCentralWidget(root)
        self.setStatusBar(QStatusBar())
        self.statusBar().showMessage("Ready")

    def apply_theme(self, theme: str):
        app = QApplication.instance()
        if app:
            _apply_theme(app, theme)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main():
    app = QApplication(sys.argv)
    _apply_theme(app, _get_saved_theme())
    window = MainWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
