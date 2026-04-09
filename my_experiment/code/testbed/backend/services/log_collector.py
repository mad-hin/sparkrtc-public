"""Log collection and comparison data loading."""

import csv
from pathlib import Path

# __file__ = .../my_experiment/code/testbed/backend/services/log_collector.py
# We need .../my_experiment/result
RESULT_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent / "result"


def load_timestamp_logs(output_dir: str, data_name: str) -> list[dict]:
    """Load timestamp CSV files from result directory."""
    logs = []
    base = RESULT_DIR / output_dir / "res" / data_name / "timestamps"

    for source in ["send", "recv"]:
        source_dir = base / source
        if not source_dir.exists():
            continue
        for csv_file in sorted(source_dir.glob("*.csv")):
            events = []
            try:
                with open(csv_file) as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        events.append(dict(row))
            except Exception:
                continue
            logs.append({
                "event_type": csv_file.stem,
                "source": source,
                "events": events,
            })

    return logs


def _to_relative(output_dir: str) -> str:
    """Convert an absolute output_dir back to a path relative to RESULT_DIR."""
    p = Path(output_dir)
    if p.is_absolute():
        try:
            return str(p.relative_to(RESULT_DIR))
        except ValueError:
            return output_dir
    return output_dir


def get_figure_paths(output_dir: str, data_name: str) -> list[str]:
    """Return list of figure paths relative to result dir."""
    fig_dir = RESULT_DIR / output_dir / "res" / data_name / "fig"
    if not fig_dir.exists():
        return []
    rel = _to_relative(output_dir)
    return [
        f"/static/results/{rel}/res/{data_name}/fig/{f.name}"
        for f in sorted(fig_dir.glob("*.png"))
    ]


def _read_log_values(path: Path, col: int = 1) -> list[float]:
    """Read numeric values from a log file (CSV-like, col index)."""
    values = []
    if not path.exists():
        return values
    for line in path.read_text(errors="replace").splitlines():
        parts = line.strip().split(",")
        if len(parts) > col:
            try:
                values.append(float(parts[col].strip()))
            except ValueError:
                continue
    return values


def load_comparison_data(baseline_dir: str, compare_dir: str) -> dict:
    """Load before/after metrics for comparison."""
    metrics = []

    for name, filename, subdir, col, higher_is_better in [
        ("Delay (ms)", "delay.log", "", 3, False),
        ("SSIM", "ssim.log", "ssim", 1, True),
        ("PSNR (dB)", "psnr.log", "psnr", 1, True),
    ]:
        base_res = RESULT_DIR / baseline_dir / "res"
        comp_res = RESULT_DIR / compare_dir / "res"

        base_vals = []
        comp_vals = []

        # Find first data_name directory and read the log file
        for d, is_base in [(base_res, True), (comp_res, False)]:
            if not d.exists():
                continue
            for data_dir in d.iterdir():
                if not data_dir.is_dir():
                    continue
                # Log files live at: res/<data_name>/<subdir>/<filename>
                # e.g., res/test/ssim/ssim.log or res/test/delay.log
                if subdir:
                    log_path = data_dir / subdir / filename
                else:
                    log_path = data_dir / filename
                vals = _read_log_values(log_path, col)
                if is_base:
                    base_vals = vals
                else:
                    comp_vals = vals
                break

        if base_vals and comp_vals:
            base_mean = sum(base_vals) / len(base_vals)
            comp_mean = sum(comp_vals) / len(comp_vals)
            delta = comp_mean - base_mean
            improved = (delta < 0) if not higher_is_better else (delta > 0)
        else:
            base_mean = 0
            comp_mean = 0
            delta = 0
            improved = False

        metrics.append({
            "name": name,
            "baseline": base_mean,
            "modified": comp_mean,
            "delta": delta,
            "improved": improved,
        })

    return {"metrics": metrics}


def load_comparison_charts(baseline_dir: str, compare_dir: str) -> list[dict]:
    """Load chart data for overlay comparison."""
    charts = []

    for title, filename, subdir, col in [
        ("Delay per Frame", "delay.log", "", 3),
        ("SSIM per Frame", "ssim.log", "ssim", 1),
        ("PSNR per Frame", "psnr.log", "psnr", 1),
    ]:
        base_res = RESULT_DIR / baseline_dir / "res"
        comp_res = RESULT_DIR / compare_dir / "res"

        base_vals = []
        comp_vals = []

        for d, is_base in [(base_res, True), (comp_res, False)]:
            if not d.exists():
                continue
            for data_dir in d.iterdir():
                if not data_dir.is_dir():
                    continue
                if subdir:
                    log_path = data_dir / subdir / filename
                else:
                    log_path = data_dir / filename
                vals = _read_log_values(log_path, col)
                if is_base:
                    base_vals = vals
                else:
                    comp_vals = vals
                break

        max_len = max(len(base_vals), len(comp_vals))
        data = []
        for i in range(min(max_len, 500)):  # Limit to 500 points for performance
            point = {"frame": i + 1}
            if i < len(base_vals):
                point["baseline"] = round(base_vals[i], 3)
            if i < len(comp_vals):
                point["modified"] = round(comp_vals[i], 3)
            data.append(point)

        if data:
            charts.append({"title": title, "data": data})

    return charts
