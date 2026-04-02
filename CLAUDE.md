# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is This Repo

SparkRTC is a fork of WebRTC optimized for ultra-low latency. On top of the WebRTC stack it adds:
- Custom instrumentation (encode/decode/transport logging) in `modules/video_coding/generic_decoder.cc`, `pc/rtp_transport.cc`, and `video/video_stream_encoder.cc`
- Periodic WebRTC getStats() logging in `examples/peerconnection/localvideo/conductor.cc` (candidate-pair, inbound-rtp, outbound-rtp, remote-inbound-rtp)
- A Python experiment framework in `my_experiment/` for measuring per-frame delay, SSIM, and PSNR using embedded QR codes
- A `peerconnection_localvideo` example that streams YUV files instead of camera input

## Build

Requires `depot_tools` on PATH, with dependencies synced via `gclient sync`.

```bash
# Generate build files (one-time or after DEPS changes)
gn gen out/Default

# Build all targets
ninja -C out/Default

# Build specific targets
ninja -C out/Default peerconnection_server
ninja -C out/Default peerconnection_localvideo
ninja -C out/Default peerconnection_client
```

Build config is in `.gn` and `webrtc.gni`. Default build is Debug with static libraries.

## Running the Example Applications

```bash
# Terminal 1: signaling server
./out/Default/peerconnection_server

# Terminal 2: receiver (saves reconstructed YUV)
./out/Default/peerconnection_localvideo --recon "recon.yuv"

# Terminal 3: sender (starts after receiver)
./out/Default/peerconnection_localvideo --file "input.yuv" --height 1080 --width 1920 --fps 24
```

On Windows, use `--recon="recon.yuv"` (equals sign required).

## Running Tests

```bash
ninja -C out/Default rtc_unittests peerconnection_unittests video_engine_tests
./out/Default/rtc_unittests
./out/Default/peerconnection_unittests
# Run a single test
./out/Default/rtc_unittests --gtest_filter="TestSuiteName.TestName"
```

## Experiment Framework (`my_experiment/`)

Uses `uv` as Python package manager (Python 3.13). Scripts live in `my_experiment/code/`.

**One-time setup:**
1. Configure paths for `ffmpeg` and `mahimahi` at the top of `process_video_qrcode.py`
2. Place input video (`<name>.yuv`) in `my_experiment/data/`
3. Place bandwidth trace logs in `my_experiment/file/trace_logs/`
4. Create `my_experiment/file/loss_trace` (format: `timestamp_ms,loss_rate` per line)
5. Place WeChat QR model files (`detect.*`, `sr.*`) in `my_experiment/code/`

**Running experiments (from `my_experiment/code/`):**

```bash
# Step 1: generate QR-coded send video
./run.sh -i video_0a86_qrcode.yuv -p gen_send_video

# Step 2: run full experiment (send+recv+decode+figures)
./run.sh -i video_0a86_qrcode.yuv -p all

# Or run process_video_qrcode.py directly
uv run process_video_qrcode.py --option=gen_send_video --data=<video_name>
uv run process_video_qrcode.py --option=send_and_recv --data=<video_name> --output_dir=<trace>/output_1
uv run process_video_qrcode.py --option=decode_recv_video --data=<video_name> --output_dir=<trace>/output_1
uv run process_video_qrcode.py --option=show_fig --data=<video_name> --output_dir=<trace>/output_1
```

Results land in `my_experiment/result/<trace_name>/output_N/`.

## Code Architecture

The codebase is standard WebRTC with custom instrumentation at three pipeline stages:

**Video pipeline (sender side):**
- `video/video_stream_encoder.cc` — encodes raw frames; logs `FRAME_ENCODE_START`/`FRAME_ENCODE_END` with dimensions, bitrate, and framerate
- `pc/rtp_transport.cc` — packetizes and sends; logs `PACKET_SEND` with size and timestamp

**Video pipeline (receiver side):**
- `pc/rtp_transport.cc` — receives packets; logs `PACKET_RECEIVE` with size, RTP timestamp, and sequence number
- `modules/video_coding/generic_decoder.cc` — decodes frames; logs `FRAME_DECODE_START`/`FRAME_DECODE_END` with frame ID and decode duration

**Periodic getStats() logging (`examples/peerconnection/localvideo/conductor.cc`):**
- Logs `WEBRTC_STATS` every 1s via `RTC_LOG` with `type=` prefix and key=value pairs
- `candidate-pair`: RTT, bytes/packets sent/received, available bitrate
- `inbound-rtp`: packets lost, jitter, frames decoded/dropped, RTX/FEC/NACK counts, freeze stats
- `outbound-rtp`: retransmissions, target bitrate, encode time, quality limitation reason
- `remote-inbound-rtp`: round-trip time, fraction lost

**Key WebRTC modules:**
- `modules/congestion_controller/` — bitrate adaptation (GCC/BBR)
- `modules/rtp_rtcp/` — RTP/RTCP protocol
- `modules/video_coding/` — codec abstraction, jitter buffer, frame management
- `pc/` — PeerConnection, signaling, transport glue
- `api/` — public API headers (start here when exploring the call setup flow)

**Experiment measurement chain:**
`process_video_qrcode.py` → embeds QR codes with frame timestamps → streams via `peerconnection_localvideo` → decodes received QR codes → computes per-frame delay, SSIM, PSNR → writes logs to `result/`

**LLM analysis (Tab 3 in GUI):**
`llm_analysis.py` summarises experiment logs into compact statistics (~2K tokens) and streams analysis from any LLM via OpenRouter (Claude, GPT, Gemini, Llama, etc.). Select a model from the dropdown or type a custom OpenRouter model ID.

**Settings (Tab 4 in GUI):**
Configure and save OpenRouter API key (persisted via QSettings), view account balance/credits, and fetch available models from the OpenRouter API. The API key can also be set via `OPENROUTER_API_KEY` env var.

**Anomaly taxonomy** (what the LLM analyses):
- Network: latency abnormal, loss abnormal
- Transport: RTX/FEC activity, rate control (late response, insufficient degree)
- Application: capturer frame interval anomaly, codec frame size overshoots, coding queuing, coding blockage
