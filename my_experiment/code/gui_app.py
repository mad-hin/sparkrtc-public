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

from PyQt6.QtCore import Qt, QThread, pyqtSignal
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QApplication,
    QComboBox,
    QFileDialog,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
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
    )
    defaults.update(kwargs)
    return argparse.Namespace(**defaults)


def _log_font() -> QFont:
    f = QFont("Monospace", 9)
    f.setStyleHint(QFont.StyleHint.Monospace)
    return f


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

        layout = QVBoxLayout(self)

        # --- Config ---
        cfg_group = QGroupBox("Experiment Configuration")
        cfg_form = QFormLayout(cfg_group)
        self.data_edit = QLineEdit()
        self.data_edit.setPlaceholderText("e.g. video_0a86_qrcode  (no .yuv extension)")
        self.outdir_edit = QLineEdit()
        self.outdir_edit.setPlaceholderText("e.g. loss_trace/output_1  (relative inside result/)")
        self.width_spin = QSpinBox()
        self.width_spin.setRange(64, 7680)
        self.width_spin.setValue(1920)
        self.height_spin = QSpinBox()
        self.height_spin.setRange(64, 4320)
        self.height_spin.setValue(1080)
        self.fps_spin = QSpinBox()
        self.fps_spin.setRange(1, 120)
        self.fps_spin.setValue(30)
        cfg_form.addRow("Video name:", self.data_edit)
        cfg_form.addRow("Output dir:", self.outdir_edit)
        cfg_form.addRow("Width:", self.width_spin)
        cfg_form.addRow("Height:", self.height_spin)
        cfg_form.addRow("FPS:", self.fps_spin)
        layout.addWidget(cfg_group)

        # --- Buttons ---
        btn_row = QHBoxLayout()
        self.run_btn = QPushButton("Run Experiment")
        self.run_btn.clicked.connect(self._run_experiment)
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

        splitter.addWidget(log_box)
        splitter.addWidget(ts_box)
        splitter.setSizes([300, 200])
        layout.addWidget(splitter)

        self._ts_data: dict[str, dict[str, list]] = {"send": {}, "recv": {}}

    def _append(self, text: str):
        self.log.append(text)

    def _set_busy(self, busy: bool):
        self.run_btn.setEnabled(not busy)

    def _make_cfg(self):
        return _make_cfg(
            data=self.data_edit.text().strip(),
            output_dir=self.outdir_edit.text().strip(),
            width=self.width_spin.value(),
            height=self.height_spin.value(),
        )

    def _run_experiment(self):
        cfg = self._make_cfg()
        if not cfg.data or not cfg.output_dir:
            self._append("[!] Fill in video name and output dir.")
            return
        self._set_busy(True)
        self._worker = Worker(pv.send_and_recv_video, cfg)
        self._worker.log_signal.connect(self._append)
        self._worker.done_signal.connect(self._experiment_done)
        self._worker.start()

    def _experiment_done(self, ok: bool, _):
        self._set_busy(False)
        if ok:
            self._append("✓ Experiment complete.")
            self.fig_btn.setEnabled(True)
            self.load_btn.setEnabled(True)
            self.experiment_done.emit(
                self.outdir_edit.text().strip(),
                self.data_edit.text().strip(),
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
        base = os.path.join(
            os.path.dirname(__file__), "..", "result",
            cfg.output_dir, "res", cfg.data, "timestamps",
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

        layout = QVBoxLayout(self)

        # --- API configuration ---
        cfg_group = QGroupBox("API Configuration")
        cfg_form = QFormLayout(cfg_group)

        self.key_edit = QLineEdit()
        self.key_edit.setEchoMode(QLineEdit.EchoMode.Password)
        self.key_edit.setPlaceholderText("sk-or-…")
        self.key_edit.setText(os.environ.get("OPENROUTER_API_KEY", ""))
        cfg_form.addRow("OpenRouter API Key:", self.key_edit)

        self.model_edit = QLineEdit()
        self.model_edit.setText("anthropic/claude-sonnet-4")
        self.model_edit.setPlaceholderText("e.g. openai/gpt-4o, google/gemini-2.0-flash")
        cfg_form.addRow("Model:", self.model_edit)

        self.outdir_label = QLabel("(set in Experiment tab)")
        self.data_label = QLabel("(set in Experiment tab)")
        cfg_form.addRow("Output dir:", self.outdir_label)
        cfg_form.addRow("Video name:", self.data_label)
        layout.addWidget(cfg_group)

        # --- Buttons ---
        btn_row = QHBoxLayout()
        self.analyze_btn = QPushButton("Analyze Results")
        self.analyze_btn.clicked.connect(self._analyze)
        self.stop_btn = QPushButton("Stop")
        self.stop_btn.clicked.connect(self._stop)
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

    def set_experiment_context(self, output_dir: str, data: str):
        self._output_dir = output_dir
        self._data = data
        self.outdir_label.setText(output_dir or "(not set)")
        self.data_label.setText(data or "(not set)")

    def _analyze(self):
        api_key = self.key_edit.text().strip()
        if not api_key:
            self.status_label.setText("[!] Enter an API key.")
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
        model = self.model_edit.text().strip() or "anthropic/claude-sonnet-4"

        self._worker = StreamWorker(logs, api_key, model)
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
        self.resize(900, 700)

        tabs = QTabWidget()
        self.preprocess_tab = PreprocessTab()
        self.experiment_tab = ExperimentTab()
        self.analysis_tab = AnalysisTab()

        tabs.addTab(self.preprocess_tab, "1 · Pre-processing")
        tabs.addTab(self.experiment_tab, "2 · Experiment & Logs")
        tabs.addTab(self.analysis_tab, "3 · LLM Analysis")

        # Wire experiment completion → analysis tab context
        self.experiment_tab.experiment_done.connect(self.analysis_tab.set_experiment_context)

        self.setCentralWidget(tabs)
        self.setStatusBar(QStatusBar())


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main():
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
