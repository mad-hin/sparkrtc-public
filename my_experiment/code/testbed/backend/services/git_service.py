"""Git service: temp branch management and patch application."""

import re
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from services.config import get_repo_path


class GitService:
    def __init__(self):
        self.original_branch: str | None = None
        self.current_branch: str | None = None

    def _run(self, *args: str, check: bool = True) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["git"] + list(args),
            cwd=str(Path(get_repo_path())),
            capture_output=True,
            text=True,
            check=check,
        )

    def _next_branch_name(self) -> str:
        """Generate branch name in format test-DDMMYY-vN with auto-increment."""
        date_str = datetime.now().strftime("%d%m%y")
        prefix = f"test-{date_str}-v"

        # List existing branches matching today's date
        result = self._run("branch", "--list", f"test-{date_str}-v*", check=False)
        existing = result.stdout.strip().splitlines()

        max_version = 0
        for branch in existing:
            branch = branch.strip().lstrip("* ")
            match = re.search(rf"test-{date_str}-v(\d+)$", branch)
            if match:
                max_version = max(max_version, int(match.group(1)))

        return f"{prefix}{max_version + 1}"

    def preview_branch_name(self) -> str:
        """Return what the next branch name would be without creating it."""
        return self._next_branch_name()

    def create_branch(self) -> str:
        """Create a temp branch from HEAD."""
        result = self._run("rev-parse", "--abbrev-ref", "HEAD")
        self.original_branch = result.stdout.strip()

        branch_name = self._next_branch_name()
        self._run("checkout", "-b", branch_name)
        self.current_branch = branch_name
        return branch_name

    def apply_patch(self, file_path: str, diff_content: str) -> bool:
        """Apply a unified diff to a file. Returns True on success."""
        # Write diff to temp file
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".patch", delete=False
        ) as f:
            f.write(diff_content)
            patch_file = f.name

        # Validate first
        result = self._run("apply", "--check", patch_file, check=False)
        if result.returncode != 0:
            # Try with --3way for fuzzy matching
            result = self._run("apply", "--3way", patch_file, check=False)
            if result.returncode != 0:
                # Last resort: try directly writing the file
                return self._fuzzy_apply(file_path, diff_content)

        # Apply for real
        result = self._run("apply", patch_file, check=False)
        Path(patch_file).unlink(missing_ok=True)
        return result.returncode == 0

    def _fuzzy_apply(self, file_path: str, diff_content: str) -> bool:
        """Attempt to apply diff by matching context lines."""
        full_path = Path(get_repo_path()) / file_path
        if not full_path.exists():
            return False

        original = full_path.read_text()
        lines = original.splitlines()

        # Parse the diff to find old/new blocks
        old_lines = []
        new_lines = []
        for line in diff_content.split("\n"):
            if line.startswith("---") or line.startswith("+++") or line.startswith("@@"):
                continue
            if line.startswith("-"):
                old_lines.append(line[1:])
            elif line.startswith("+"):
                new_lines.append(line[1:])
            elif line.startswith(" "):
                old_lines.append(line[1:])
                new_lines.append(line[1:])

        if not old_lines:
            return False

        # Find the old block in the file
        old_text = "\n".join(old_lines)
        if old_text in original:
            new_text = "\n".join(new_lines)
            result = original.replace(old_text, new_text, 1)
            full_path.write_text(result)
            return True

        return False

    def commit(self, message: str):
        """Stage and commit all changes."""
        self._run("add", "-A")
        self._run("commit", "-m", message)

    def cleanup(self):
        """Switch back to original branch and delete temp branch."""
        if self.original_branch and self.current_branch:
            self._run("checkout", self.original_branch, check=False)
            self._run("branch", "-D", self.current_branch, check=False)
            self.current_branch = None
