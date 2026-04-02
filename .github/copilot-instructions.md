# Copilot Instructions for SparkRTC

SparkRTC is a fork of WebRTC optimized for ultra-low latency research. It adds custom instrumentation for encode/decode/transport logging and a Python experiment framework for measuring per-frame delay, SSIM, and PSNR.

## Build Commands

Requires `depot_tools` on PATH with dependencies synced via `gclient sync`.

```bash
# Generate build files (after cloning or DEPS changes)
gn gen out/Default

# Build all targets
ninja -C out/Default

# Build specific targets
ninja -C out/Default peerconnection_server
ninja -C out/Default peerconnection_localvideo
```

## Running Tests

```bash
# Build tests first
ninja -C out/Default rtc_unittests peerconnection_unittests video_engine_tests

# Run full test suites
./out/Default/rtc_unittests
./out/Default/peerconnection_unittests

# Run a single test
./out/Default/rtc_unittests --gtest_filter="TestSuiteName.TestName"
```

## Running the Example Applications

```bash
# Terminal 1: signaling server
./out/Default/peerconnection_server

# Terminal 2: receiver
./out/Default/peerconnection_localvideo --recon "recon.yuv"

# Terminal 3: sender (start after receiver)
./out/Default/peerconnection_localvideo --file "input.yuv" --height 1080 --width 1920 --fps 24
```

On Windows, use `--recon="recon.yuv"` (equals sign required).

## Architecture Overview

### Custom Instrumentation Points

SparkRTC logs at three video pipeline stages using `RTC_LOG`:

**Sender side:**
- `video/video_stream_encoder.cc` — logs `FRAME_ENCODE_START`/`FRAME_ENCODE_END`
- `pc/rtp_transport.cc` — logs `PACKET_SEND`

**Receiver side:**
- `pc/rtp_transport.cc` — logs `PACKET_RECEIVE`
- `modules/video_coding/generic_decoder.cc` — logs `FRAME_DECODE_START`/`FRAME_DECODE_END`

**Periodic stats (every 1s):**
- `examples/peerconnection/localvideo/conductor.cc` — logs `WEBRTC_STATS` with candidate-pair, inbound-rtp, outbound-rtp, remote-inbound-rtp metrics

### Key WebRTC Modules

- `api/` — public API headers (start here for call setup flow)
- `pc/` — PeerConnection, signaling, transport glue
- `modules/congestion_controller/` — bitrate adaptation (GCC/BBR)
- `modules/rtp_rtcp/` — RTP/RTCP protocol
- `modules/video_coding/` — codec abstraction, jitter buffer, frame management

### Experiment Framework (`my_experiment/`)

Uses `uv` as Python package manager (Python 3.13). From `my_experiment/code/`:

```bash
# Generate QR-coded video
./run.sh -i video_0a86_qrcode.yuv -p gen_send_video

# Run full experiment
./run.sh -i video_0a86_qrcode.yuv -p all
```

Results in `my_experiment/result/<trace_name>/output_N/`.

## Conventions

- Build config lives in `.gn` and `webrtc.gni` (Debug with static libraries by default)
- Use `RTC_LOG` for instrumentation logging, not `printf` or `std::cout`
- YUV420 format for video files
- Experiment paths configured at top of `my_experiment/code/process_video_qrcode.py`
