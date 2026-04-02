# SparkRTC Experiment Testbed

Electron + React desktop dashboard for running SparkRTC WebRTC experiments, analyzing results with LLM, and testing AI-suggested code changes.

## Prerequisites

- **Node.js** >= 18
- **uv** (Python package manager)
- **Python** >= 3.13
- WebRTC binaries built in `out/Default/` (see main repo for build instructions)

## Setup

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd backend && uv sync && cd ..
```

## Running

```bash
npm run dev
```

This starts:
1. The Electron window (React frontend)
2. A FastAPI Python backend (auto-spawned on a random port)

## Pages

| Page | Description |
|------|-------------|
| **Dashboard** | Overview metrics (delay, SSIM, PSNR, bitrate) from the last experiment |
| **Pre-process** | Convert video to YUV and overlay QR codes for frame tracking |
| **Experiment** | Run WebRTC experiments with live terminal output (server/sender/receiver) |
| **Analysis** | Stream LLM analysis of experiment results, rendered as markdown |
| **Code Agent** | AI suggests C++ code changes as diffs; accept/reject, then build & test |
| **Compare** | Side-by-side before/after metrics when testing code changes |
| **Settings** | OpenRouter API key, model selection, theme |

## Configuration

Set your OpenRouter API key in **Settings** before using Analysis or Code Agent pages. The key is persisted in local storage.

## Building for Production

```bash
npm run build
```

Output goes to `out/`.
