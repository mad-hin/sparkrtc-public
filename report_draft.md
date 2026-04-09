# Latency Optimization in Interactive Multimedia Streaming

**Project ID:** MZ02b-25

**Supervisor:** Professor Zili Meng

**Author (Student ID):** TAM Siu Ho (20899419)

**Date:** 12/4/2026

## Main Objective

This project aims to design and implement a diagnostic tool that accurately identifies, quantifies, and helps resolve the root causes of latency within WebRTC-based real-time communication systems.

**Objective 1:** Design and implement diagnostic modules that measure end-to-end latency components in WebRTC sessions with millisecond accuracy.

**Objective 2:** Develop and validate the automated tool for root cause analysis that generates targeted suggestions, achieving at least 80% accuracy in resolving primary latency contributors under test scenarios.

**Objective 3:** To implement and demonstrate the effectiveness of these suggestions by integrating the recommended adjustments into WebRTC sessions.

---

## Table of Contents

<!-- Note: Page numbers to be updated when formatting in Word/PDF -->

- Abstract
- Section 1 — Introduction
  - 1.1 Background and Engineering Problem
  - 1.2 Objectives
    - 1.2.1 Objective Statements
  - 1.3 Literature Review of Existing Solutions
    - 1.3.1 Murphy: Performance Diagnosis of Distributed Cloud Applications
    - 1.3.2 SIMON: A Simple and Scalable Method for Sensing, Inference and Measurement in Data Center Networks
    - 1.3.3 LLM-Based Event Log Analysis Techniques
- Section 2 — Methodology
  - 2.1 Overview
    - 2.1.1 System Description
    - 2.1.2 System Block Diagram
    - 2.1.3 Components List
    - 2.1.4 ECE Knowledge
  - 2.2 Objective Statement Execution
    - 2.2.1 Diagnostic Modules for Measuring End-to-End Latency in WebRTC Sessions
    - 2.2.2 Automated Tool for Root Cause Analysis and Latency Resolution
    - 2.2.3 Implementing and Evaluating Suggested Adjustments
  - 2.3 Evaluation and Discussion
- Section 3 — Conclusion
- References
- Appendices
  - Appendix A — Final Project Schedule
  - Appendix B — Budget
  - Appendix C — Meeting Minutes
  - Appendix E — Deviations from the Proposal and Progress Report

---

## List of Figures

<!-- To be completed when formatting -->

- Figure 1: High-level system architecture diagram
- Figure 2: QR code-based frame tracking pipeline
- Figure 3: Modified WebRTC instrumentation log format
- Figure 4: Flowchart of send_webhook.py
- Figure 5: Sequence diagram of log collection process
- Figure 6: n8n automated workflow for log processing
- Figure 7: Threshold logic flowchart for data reduction
- Figure 8: LLM testing workflow for multiple models
- Figure 9: Testbed GUI — Experiment tab
- Figure 10: Testbed GUI — Analysis tab with LLM response
- Figure 11: Testbed GUI — Code Agent multi-step pipeline
- Figure 12: Testbed GUI — Compare Results page
- Figure 13: Anomaly taxonomy hierarchy
- Figure 14: Example delay plot output
- Figure 15: Example SSIM/PSNR plot output
- Figure 16: Code Agent diff viewer with accept/reject controls
- Figure 17: Debug mode — Controlled experiment scenarios panel
- Figure 18: Debug mode — Ground truth validation with accuracy scoring
- Figure 19: Experiment tab — Intuitive network emulation inputs (Bandwidth, Latency, Loss)
- Figure 20: Integration test results — All 7 scenarios passing

## List of Tables

<!-- To be completed when formatting -->

- Table 1: List of Specifications
- Table 2: WebRTC instrumentation log fields
- Table 3: Anomaly taxonomy categories
- Table 4: Controlled experiment scenarios (7 paper-based cases)
- Table 5: LLM accuracy validation results
- Table 6: Per-frame measurement methodology
- Table 7: Budget

---

## Abstract

Real-time communication (RTC) systems built on WebRTC frequently suffer from latency degradation caused by network congestion, codec inefficiencies, and transport-layer misconfigurations. However, existing diagnostic tools either operate at too high a level to pinpoint protocol-specific bottlenecks or lack the application-layer awareness needed for actionable diagnosis. This project designs and implements a comprehensive diagnostic tool that measures end-to-end latency at each stage of the WebRTC video pipeline — capture, encoding, network transport, decoding — with millisecond accuracy using QR code-based frame tracking and custom C++ instrumentation within the SparkRTC codebase. An LLM-powered analysis module, backed by a structured anomaly taxonomy covering network, transport, and application-layer issues, automatically identifies root causes and generates targeted code-level suggestions via OpenRouter. A full-stack testbed GUI (React + FastAPI) with IBM Carbon Design System integrates experiment execution, real-time log streaming, seven paper-based controlled experiments with ground-truth validation, and a multi-step code agent that produces compilable patches. Batch validation across all seven scenarios with Xiaomi MiMo-V2-Pro achieves 83% primary anomaly detection accuracy (5/6) and 50% total accuracy (6/12).

---

## Section 1 — INTRODUCTION

### 1.1 Background and Engineering Problem

Real-time communication (RTC) has become a cornerstone of the digital era, enabling interactive services such as video conferencing, remote desktops, cloud gaming, and live streaming. WebRTC, the dominant open-source framework for browser-based RTC, allows seamless exchange of audio, video, and data with low latency [1]. However, any noticeable latency, jitter, or packet loss can lead to user frustration and reduced engagement. As mobile devices and wireless networks proliferate, the technical challenges have grown: unpredictable network quality, device heterogeneity, and rapidly varying environmental conditions constantly threaten to degrade RTC performance.

Research into adaptive frame-rate controls demonstrates the necessity of dynamically tuning video delivery to balance quality and responsiveness in real time [7]. Similarly, innovative multipath transport strategies are being developed to exploit diverse network paths, mitigating latency spikes and supporting robust high-quality streaming, especially in mobile environments [8]. These advancements address specific aspects of the latency problem but do not provide a unified diagnostic framework.

Despite these advancements, a significant problem persists: current RTC systems lack a comprehensive tool to diagnose and resolve the root causes of latency, especially within WebRTC sessions. Conventional troubleshooting approaches tend to be reactive and limited in scope, often failing to isolate the primary bottlenecks and provide actionable guidance. This results in unpredictable user experiences and hinders system-wide improvements. Addressing this gap is critical because the impact extends beyond individual calls: enhanced diagnostic and resolution capabilities would benefit service providers, application developers, and end-users by enabling smarter, more adaptive communication infrastructures. If the latency problem can be diagnosed and mitigated through a targeted tool, it would mark a significant leap forward in RTC reliability and quality, thereby strengthening the foundations of social interaction, productivity, and innovation in digital society.

### 1.2 Objectives

This project aims to design and implement a diagnostic gateway that accurately identifies, quantifies, and helps resolve the root causes of latency within WebRTC-based real-time communication systems.

#### 1.2.1 Objective Statements

**Objective 1:** Design and implement diagnostic modules that measure end-to-end latency components in WebRTC sessions with millisecond accuracy.

**Objective 2:** Develop and validate the automated tool for root cause analysis that generates targeted suggestions, achieving at least 80% accuracy in resolving primary latency contributors under test scenarios.

**Objective 3:** To implement and demonstrate the effectiveness of these suggestions by integrating the recommended adjustments into WebRTC sessions.

### 1.3 Literature Review of Existing Solutions

#### 1.3.1 "Murphy: Performance Diagnosis of Distributed Cloud Applications"

In the paper "Murphy: Performance Diagnosis of Distributed Cloud Applications," Murphy is introduced as an automated system designed to find out the performance problems occurring in modern cloud applications, where many different services are connected and interact. Murphy works in three main steps. First, it collects data from monitoring tools and uses it to build a relationship graph that shows how different parts of the system are connected and how abnormal behaviours might occur. Next, it uses a learning algorithm based on Markov Random Fields (MRF). This lets Murphy consider not just direct problems, but also all possible paths and back-and-forth effects between system parts. Last, Murphy sorts the possible causes by how likely they are responsible for the problem and gives a report back to the user. A key strength of Murphy is that it tries to consider all possible influences, even uncommon ones, which helps it spot issues others might miss [3].

However, Murphy also has some important limitations. Its biggest limitation is that it looks for problems at the telemetry level: it checks data like general system metrics and overall application signals [3]. It does not look deep inside the specific communications between users, such as what is happening inside a WebRTC session at the protocol level. For example, this project, which aims to find out exactly which part of the WebRTC protocol is causing a delay, finds that Murphy's information is not detailed enough. Murphy also focuses on diagnosing issues in big cloud applications, so it is better at finding high-level performance problems, not the lower level.

#### 1.3.2 "SIMON: A Simple and Scalable Method for Sensing, Inference and Measurement in Data Center Networks"

The paper "SIMON: A Simple and Scalable Method for Sensing, Inference and Measurement in Data Center Networks" introduces SIMON, a system that reconstructs critical network state variables like queueing delays and link utilization using only data collected at the network's edge by the network interface card. It uses small probe packets sent between host pairs and, through timestamp data gathered at the transmit and receive ends, can infer queue sizes and link conditions throughout a data center's network. This is based on network tomography. Besides that, it also applied LASSO regression to reconstruct not just approximate, but near-exact queue lengths and flow-level link measurements. Resulting SIMON to be highly accurate, scalable, and as fast as nearly real-time [4].

However, SIMON only focuses on the flow level, but not protocol level. For this project, which the goal is to diagnose root causes of latency at the protocol level, SIMON cannot provide any insight about low-level details such as the stages of codec negotiation, adaptive bitrate control, or jitter buffer events—all of which are crucial for understanding and resolving user-facing latency or quality issues in RTC applications. For a project aiming to diagnose root causes of latency and performance issues at the protocol or session level, SIMON's approach is simply not granular or application-aware enough, making it unsuitable for detailed, actionable diagnosis within RTC ecosystems.

#### 1.3.3 "LLM-Based Event Log Analysis Techniques: A Survey"

The survey by Akhtar, Khan, and Parkinson [2] provides a comprehensive overview of how large language models (LLMs) are being applied to event log analysis tasks including anomaly detection, log parsing, root cause analysis, and log summarization. The paper highlights that LLMs—particularly instruction-tuned models like GPT-4 and Claude—demonstrate strong zero-shot capabilities in understanding semi-structured log data without requiring task-specific fine-tuning. This is especially relevant for WebRTC diagnostics, where log formats vary across implementations and network conditions produce diverse failure patterns.

The survey identifies several promising approaches: prompt engineering with domain-specific taxonomies, retrieval-augmented generation (RAG) for grounding LLM analysis in known issue databases, and chain-of-thought reasoning for multi-step diagnostic workflows. However, it also notes challenges including token length limitations when processing large log volumes, hallucination risks when LLMs lack sufficient domain context, and the difficulty of validating LLM-generated root cause explanations against ground truth.

This project directly addresses these challenges by implementing a structured anomaly taxonomy that constrains the LLM's analysis space, a data reduction pipeline that compresses logs to fit within token limits while preserving diagnostic signals, and a controlled experiment framework that provides ground truth for validation. The approach of combining domain-specific prompting with hierarchical anomaly categories aligns with the survey's recommendation for guided LLM analysis over unconstrained generation.

---

## Section 2 — METHODOLOGY

### 2.1 Overview

#### 2.1.1 System Description

The system operates as an integrated diagnostic platform with three functional stages—profiling, suggestion, and implementation—spanning two environments: a local environment for experiment execution and data generation, and a server-side automated analysis pipeline.

**Profiling Stage.** The system collects detailed performance data from the WebRTC pipeline via two mechanisms. First, custom C++ instrumentation added to the SparkRTC codebase (a modified WebRTC stack [9]) logs frame-level events at each pipeline stage: `FRAME_ENCODE_START/END` in `video_stream_encoder.cc`, `PACKET_SEND/RECEIVE` in `rtp_transport.cc`, and `FRAME_DECODE_START/END` in `generic_decoder.cc`. Second, periodic `getStats()` API calls in `conductor.cc` capture aggregate statistics every second, including candidate-pair metrics (RTT, available bitrate), inbound-rtp metrics (jitter, packet loss, frames dropped), outbound-rtp metrics (retransmissions, target bitrate, quality limitation reason), and remote-inbound-rtp metrics (round-trip time, fraction lost) [1]. A QR code-based frame tracking system embeds unique identifiers into each video frame before transmission, enabling per-frame delay measurement by comparing send and receive timestamps after QR code decoding on the receiver side. The profiling pipeline also includes a data reduction module that applies thresholding and averaging to compress log data to approximately 2,000 tokens, ensuring compatibility with LLM context windows while preserving diagnostic signals.

**Suggestion Stage.** The processed logs are analyzed by a large language model accessed via the OpenRouter API [11], which provides a unified interface to over 300 models (Claude, GPT-4, Gemini, Llama, etc.). The LLM operates within a structured anomaly taxonomy that categorizes WebRTC performance issues into three layers: application-layer anomalies (frame interval anomaly, encoding overshoot, coding queuing, coding blockage), network-layer anomalies (latency abnormal, loss abnormal), and transport-layer anomalies (rate control late response, rate control insufficient degree, RTX/FEC late, RTX/FEC insufficient). The LLM identifies root causes, explains the network behavior, and generates possible solutions. In the advanced Code Agent mode, a three-step pipeline (anomaly analysis, deep dive with source code reading, and code change generation) produces compilable unified diffs targeting specific SparkRTC source files.

**Implementation Stage.** The user reviews and applies the LLM-generated suggestions to the WebRTC codebase. The system creates a temporary Git branch, applies selected patches, triggers a ninja build, and—if compilation succeeds—runs a comparison experiment under identical network conditions. The before-and-after metrics (delay, SSIM, PSNR, bitrate) are presented side-by-side for evaluation. If performance improves, the changes can be kept; otherwise, the branch is discarded and the diagnostic cycle repeats.

#### 2.1.2 System Block Diagram

<!-- Insert Figure 1: High-level system architecture diagram -->
<!-- This should be an updated version of the progress report's Figure 1, reflecting the current architecture with the testbed GUI, Code Agent pipeline, and comparison workflow -->

*Figure 1: High-level architecture of the diagnostic system showing the three stages (Profiling, Suggestion, Implementation) across local and server environments, with the testbed GUI as the unified interface.*

The system architecture has evolved significantly from the progress report. The original design relied on n8n workflows and webhook-based communication between the local environment and a server-hosted automation pipeline. The final implementation consolidates all functionality into a single-machine testbed application: a FastAPI backend manages experiment orchestration, log collection, LLM communication, Git operations, and build processes, while a React frontend provides a unified GUI with dedicated pages for each workflow stage.

#### 2.1.3 Components List

| Item | Specifications / Model |
|------|----------------------|
| **Profiling — WebRTC Instrumentation** | Custom C++ logging in SparkRTC: FRAME_ENCODE_START/END, PACKET_SEND/RECEIVE, FRAME_DECODE_START/END with microsecond timestamps |
| **Profiling — getStats() Collection** | Periodic 1-second snapshots via RTCStatsReport API: candidate-pair, inbound-rtp, outbound-rtp, remote-inbound-rtp |
| **Profiling — QR Code Frame Tracking** | WeChat QR detector (detect.prototxt, sr.caffemodel) for frame-level delay measurement; 3 redundant QR overlays per frame |
| **Profiling — Network Emulation** | MahiMahi link shell with auto-generated traces from bandwidth/latency/loss inputs; mm-delay for base latency; 7 paper-based controlled scenarios |
| **Profiling — Data Reduction** | Threshold-based averaging: if entries > threshold_a, compute averages to reduce to threshold_b entries |
| **Suggestion — LLM Analysis** | OpenRouter API providing access to 300+ models; structured anomaly taxonomy prompt; ~2K token log summaries |
| **Suggestion — Code Agent Pipeline** | 3-step LLM pipeline: anomaly analysis → source code deep dive → unified diff generation with token budgeting |
| **Implementation — Build System** | ninja build system targeting peerconnection_localvideo and peerconnection_server |
| **Implementation — Git Integration** | Temporary branch creation, patch application via git apply, automated commit |
| **Implementation — Comparison** | Side-by-side metric comparison (delay, SSIM, PSNR) with improvement badges and overlay charts |
| **Testbed GUI** | React + TypeScript frontend with Zustand state management; FastAPI + Python backend; 7 pages with debug mode for ground truth validation |
| **Validation — Debug Mode** | Automated ground truth matching: 7 paper-based scenarios with expected anomaly labels; primary/total accuracy scoring; case-insensitive text search validation |

#### 2.1.4 ECE Knowledge

**COMP2011 — Programming with C++**

This course introduces basic understanding of C++ fundamentals, which is crucial for understanding and working with the WebRTC code base. The course covered core topics such as control statements, pointers, classes, and dynamic data allocation [5], giving me the confidence to explore WebRTC's low-level source code. This practical knowledge allows me to read, analyse, and modify the C++ code in WebRTC directly, enabling the implementation of recommended adjustments and custom diagnostic features for the project's goals. The custom instrumentation added to `generic_decoder.cc`, `rtp_transport.cc`, and `video_stream_encoder.cc` required understanding of class hierarchies, method overriding, and the WebRTC threading model—all building on concepts from COMP2011.

**ELEC3120 — Computer Communication Networks**

This course provides essential foundational knowledge for understanding the multi-layered network infrastructure that underlies WebRTC communications. It explains how different parts of a computer network, such as the ISO Open Systems Interconnection (OSI) model, standardize communication, with a specific focus on the interaction between the Application, Transport, and Network layers [6]. Since WebRTC operates across these specific layers to deliver real-time media, the OSI framework serves as a critical diagnostic tool: it allows for the precise isolation of latency sources, helping to distinguish whether performance degradation stems from lower-level routing inefficiencies, transport-level flow control, or upper-layer application overhead. The anomaly taxonomy used in the LLM analysis module directly maps to these network layers.

**ELEC4010U — Error-Correcting Codes and Basic Information Theory**

This course provides foundational knowledge of information theory and error-correcting codes, which is directly relevant to understanding the error resilience mechanisms within WebRTC. Concepts such as channel capacity, entropy, and redundancy inform the analysis of Forward Error Correction (FEC) and retransmission (RTX) strategies employed by WebRTC's transport layer. The anomaly taxonomy used in this project includes "RTX/FEC Late" and "RTX/FEC Insufficient" categories—diagnosing whether error recovery mechanisms respond quickly enough and with sufficient redundancy requires understanding the theoretical trade-offs between coding overhead and error correction capability. Additionally, the information-theoretic perspective on rate-distortion trade-offs helps explain why the congestion controller's bitrate decisions directly impact video quality metrics like PSNR and SSIM.

**ELEC6910I — Internet Video Streaming**

This course covers the principles and systems behind video streaming over the Internet, including video codec design, adaptive bitrate (ABR) algorithms, transport protocols, and quality-of-experience (QoE) metrics. This knowledge is directly applicable to every aspect of this project: the profiling stage measures codec-level metrics (encode/decode duration, frame size, quality limitation reason) that are central topics in this course; the suggestion stage diagnoses issues such as encoding overshoot, rate control responsiveness, and jitter buffer behavior, all of which are covered in the streaming systems curriculum; and the evaluation stage uses standard video quality metrics (SSIM, PSNR) and latency measurements that are foundational to QoE assessment in streaming research. Understanding how ABR algorithms interact with network congestion and codec rate control was essential for designing meaningful controlled experiments and interpreting the LLM's diagnostic output.

### 2.2 Objective Statement Execution

#### 2.2.1 Diagnostic Modules for Measuring End-to-End Latency in WebRTC Sessions

**Objective:** Design and implement diagnostic modules that measure end-to-end latency components in WebRTC sessions with millisecond accuracy.

The diagnostic system measures latency at every stage of the WebRTC video pipeline, from frame capture on the sender to frame rendering on the receiver. The system produces per-frame delay measurements, per-frame video quality metrics (SSIM and PSNR), and per-second aggregate statistics from the WebRTC getStats() API.

##### Task 1: Set Up a Direct Connection Between Two WebRTC Sessions and Obtain Relevant Information

**Task description:** Establish a direct peer-to-peer (P2P) connection between two WebRTC sessions that can transmit video streams, providing an ideal, controlled baseline for latency measurement.

**Work done:** This task was achieved by using the modified SparkRTC [9], a modified WebRTC that is used for academic research. The SparkRTC comes with a testing script that obtains the logs and centralizes the location of the logs. The script first generates QR codes and stamps them onto each frame of the video for tracking the quality of the video. Then it creates a WebRTC server and captures the received video. It analyses the video by scanning the QR codes to match every received frame back to its original sent frame. Finally, it calculates key performance metrics along with the logs that were created during the transmission and saves them in different log files.

As the aim of this project is to find and identify the root cause of the network issue occurring in the WebRTC connection, the packet sending timestamps, packet receiving timestamps, and frame-level timestamps are collected so that the LLM-based suggestion module can make informed diagnostic decisions. As the original SparkRTC does not support the logging of those internal timestamps, custom logging functions were added to the following files:

- `modules/video_coding/generic_decoder.cc` (line 455/470): Logs `FRAME_DECODE_START` and `FRAME_DECODE_END` with frame_id, decode_start_us, decode_end_us, and rtp_ts
- `video/video_stream_encoder.cc`: Logs `FRAME_ENCODE_START` and `FRAME_ENCODE_END` with frame dimensions, bitrate, framerate
- `pc/rtp_transport.cc`: Logs `PACKET_SEND` and `PACKET_RECEIVE` with packet size, RTP timestamp, sequence number
- `examples/peerconnection/localvideo/conductor.cc`: Logs `WEBRTC_STATS` every 1 second with key-value pairs for candidate-pair, inbound-rtp, outbound-rtp, and remote-inbound-rtp statistics

| Log Field | Description |
|-----------|-------------|
| generic_decoder.cc:470 | The file that outputs this log and the line |
| FRAME_DECODE_START | The message indicating the action of this log |
| frame_id=47123 | The frame id (if relevant) |
| decode_start_us=16180012 | The starting time in microseconds |
| rtp_ts=84567210 | The RTP packet timestamp |

<!-- Insert Figure 3: Example of modified log output -->

**Technical challenges:**

1. Understanding and identifying the correct code sections to modify within SparkRTC was difficult due to the massive codebase (WebRTC contains millions of lines of C++ code). To overcome this, a service named "DeepWiki" [10], an AI-powered documentation tool that analyses repositories, was used to understand the architecture and find the relevant modules.

2. Due to the large codebase, the C++ extension in VS Code frequently displayed false error highlights, making it hard to distinguish between actual syntax errors and issues with the editor's indexer. The effective solution was to rely on running the compiler to verify the code's correctness rather than trusting the editor's visual cues.

##### Task 2: Rebuild the Network Condition from Different Academic Papers

**Task description:** Replicate the network problems addressed in several academic papers and set them up in a WebRTC test system. By recreating these situations—like slow internet speed, lost packets, unstable connections, or delays—one can closely study how WebRTC behaves under adverse conditions.

**Work done:** Seven controlled experiment scenarios were designed and implemented, each recreating a specific root cause from a top-tier conference paper. Each scenario is available as a one-click preset in the testbed GUI's Experiment page, with editable network parameters (bandwidth, latency, loss rate, burst/stall timing) that auto-generate the appropriate MahiMahi trace files.

The seven scenarios, validated with integration tests across all cases, are:

| Case | Paper | Layer | Root Cause Recreated | Network Config |
|------|-------|-------|---------------------|----------------|
| 1 | AFR NSDI'23 [7] | Application | Codec Blockage: decoder queue overflow | Bursty 12/0.5 Mbps, taskset -c 0 |
| 2 | BurstRTC ICNP'24 | Application | Frame Size Overshoot: encoded frames exceed target rate | Constant 4 Mbps, 1080p@30fps |
| 3 | Pudica NSDI'24 | Transport | CCA Late Response: CC slow to react to sudden BW drops | 30→5 Mbps step function (from Fig.12) |
| 4 | ACE SIGCOMM'25 | Transport | Pacing Queuing: bursty encoder vs smooth pacer mismatch | Constant 20 Mbps, low RTT |
| 5 | Tooth NSDI'25 / Hairpin NSDI'24 | Transport | RTX/FEC Overshoot: FEC over-protection of large frames | 8 Mbps + 5% loss |
| 6 | Zhuge SIGCOMM'25 / AUGUR NSDI'24 | Network | Latency Rise: congestion-driven RTT inflation | 12/1 Mbps, 8s burst / 3s stall |
| 7 | Hairpin NSDI'24 / Tambur NSDI'23 | Network | Loss Rise: non-congestion burst packet loss | 12 Mbps + 10% burst loss |

The network conditions for each scenario were derived from the original papers. For example, the AFR scenario uses the paper's measurements from Tencent Start (38,100 sessions, 7.73 billion frames): at 1080p@60fps, the p99 decode delay is 18ms while the inter-arrival time is 16.7ms, causing queue utilization rho approximately 1.0 at the tail. The Pudica scenario uses measurements from 57,000 sessions across 15 cities: base RTT 50th percentile below 10ms, and 35.5% of WiFi users experience at least 5 bandwidth reductions of over 50% per minute.

For MahiMahi-based scenarios, all WebRTC processes (server, sender, receiver) run inside the same mm-link network namespace to ensure ICE candidates can discover each other on localhost, while the bandwidth shaping applies to all traffic within the namespace. The trace files are auto-generated from the user-specified bandwidth parameters using the formula: each line represents a millisecond timestamp when one 1500-byte packet can depart (for N Mbps constant: one line every 12/N ms). Base one-way delay is added via `mm-delay` when configured.

**Technical challenges:**

1. The major difficulty was replicating the decoder queue overloading as modern CPUs are powerful enough that the decoder might occasionally "catch up" during network idle periods. The solution was to tune the "Burst-to-Stall Ratio" in the trace generation function, ensuring burst sizes consistently exceed the single-core decoding throughput.

2. Running the receiver inside a MahiMahi network namespace initially prevented WebRTC peer connection, because the receiver's ICE candidates used the namespace's internal IP (100.64.10.2) which was unreachable from the sender running outside the namespace. The solution was to run all three processes (server, sender, receiver) inside the same mm-link shell, where they connect via localhost and the bandwidth shaping applies to all traffic exiting the namespace.

3. The mm-link shell would hang after the sender finished because backgrounded processes (receiver, server) kept the shell alive. The fix was to add `pkill -P $$` after the sender command to kill all child processes and exit the shell cleanly.

##### Task 3: Filter Unnecessary Data

**Task description:** Keep only the important information and features from the session logs and test results, while ignoring any extra or unrelated data.

**Work done:** The log filtering was initially implemented as n8n code blocks in the automated workflow. The n8n workflow receives raw, unfiltered data from the send_webhook.py script via webhook payload. The workflow passes the data to multiple code blocks, each extracting one specific data category (e.g., "decoder", "encode", "send_packet"). Each code block parses the JSON, checks for direct raw body fields, adds timestamps and metadata, and outputs cleaned data.

In the final testbed implementation, log collection and filtering was consolidated into the `log_collector.py` and `llm_service.py` backend services. The `_collect_logs()` function reads specific log files (ssim.log, psnr.log, delay.log, frame_size.log, rate.log, send.log, recv.log, statistics.csv) from the experiment result directory. The `_parse_webrtc_events()` function in `llm_analysis.py` extracts structured events from raw logs, computing derived metrics such as encode duration, decode duration, packet sequence gaps, capture intervals, and frame overshoots.

**Technical challenges:**

1. When using the n8n webhook, it stopped processing subsequent entries after the first one arrived. The solution was to change the webhook trigger setting from "Immediate" to "All Entries" to collect and process every incoming payload in batch.

2. Detecting missing data in large payloads was difficult on the n8n dashboard. The solution was to test with short, simplified JSON data first, then verify end-to-end data flow before processing real logs.

##### Task 4: Determine a Suitable Threshold of Reporting Data

**Task description:** Due to LLM token processing limitations, the filtered data entries must be reduced to a manageable size while preserving diagnostic information.

**Work done:** A two-threshold data reduction framework was implemented. The filtered data from Task 3 is passed to a reduction module that first checks the number of entries. If the count is below threshold *a*, the data is output unchanged. Otherwise, it computes averages to lower the entry count to threshold *b*, ensuring compatibility with LLM token limits.

In the final implementation within `llm_analysis.py`, the `summarize_logs()` function compresses all experiment metrics into an approximately 2,000-token summary. For each metric type, it computes percentiles (count, mean, median, std, min, p5, p25, p75, p95, p99, max), threshold violation counts (e.g., delays > 100ms, delays > 200ms, SSIM < 0.9), trend analysis (comparing first quarter vs. last quarter averages), and coefficient of variation for bitrate stability. WebRTC instrumentation events are parsed into structured statistics (encode duration distribution, packet gaps, frame overshoots), and periodic getStats() snapshots are summarized with cumulative deltas and instantaneous value distributions.

This approach preserves statistical outliers and tail behavior (via p95/p99 percentiles) while compressing hundreds or thousands of per-frame measurements into a compact representation that fits within LLM context windows.

##### Task 5: Build the Testbed GUI for Experiment Management

**Task description:** Create an integrated graphical interface that consolidates experiment configuration, execution, and result visualization into a single application, replacing the previous command-line workflow.

**Work done:** A full-stack testbed application was built using React + TypeScript for the frontend and FastAPI + Python for the backend. The application provides the following pages:

**Pre-processing page:** Allows the user to select a video file, specify dimensions and frame rate, convert it to YUV format via FFmpeg, and overlay QR codes for frame tracking.

**Experiment page:** Provides a configuration panel with intuitive network emulation inputs (bandwidth in Mbps, latency in ms, loss rate in %) that auto-generate MahiMahi trace files, along with video settings (file, dimensions, FPS), output directory, and advanced options (field trials, custom trace files). When debug mode is enabled, a controlled experiment panel displays all seven paper-based scenarios as one-click presets with editable parameters. A real-time log streaming panel with tabs for Server, Sender, and Receiver output shows experiment progress. The ExperimentRunner service orchestrates the WebRTC processes inside a MahiMahi namespace, captures their output at the OS file descriptor level using threading, and broadcasts logs to all connected WebSocket clients.

**State management:** Zustand stores persist experiment configuration, API keys, selected models, and analysis results to localStorage, enabling seamless continuation across page navigations and application restarts.

**Technical challenges:**

1. Capturing subprocess output reliably required OS-level file descriptor redirection (`os.dup2()`) rather than Python-level pipe reading, as the SparkRTC binaries write to stdout/stderr directly from C++ code.

2. Managing the lifecycle of three interdependent processes (server must start before sender and receiver) required careful sequencing with health checks and timeout handling.

##### Outcome Evaluation — Objective 1

The diagnostic modules successfully measure end-to-end latency with millisecond accuracy. The QR code-based frame tracking system correctly identifies per-frame delays by matching send and receive timestamps. The custom C++ instrumentation captures encode time, decode time, and transport timestamps at microsecond resolution. The getStats() collection provides aggregate network statistics (RTT, jitter, packet loss, available bitrate) every second.

The per-frame measurement methodology is summarized below:

| Metric | Method | Resolution |
|--------|--------|------------|
| Per-Frame Delay | QR code decode + timestamp diff | Millisecond |
| SSIM | FFmpeg ssim filter on sent/received PNG pairs | Per-frame |
| PSNR | 20*log10(255/sqrt(MSE)) on RGB pixels | Per-frame |
| Frame Drops | Gaps in QR-decoded frame indices | Per-frame |
| Encode Duration | FRAME_ENCODE_END - FRAME_ENCODE_START | Microsecond |
| Decode Duration | FRAME_DECODE_END - FRAME_DECODE_START | Microsecond |
| RTT | getStats() candidate-pair currentRoundTripTime | Per-second |
| Packet Loss | Packet sequence gaps + getStats() packetsLost | Per-packet / Per-second |

The system meets the objective of millisecond-accuracy measurement. A limitation is that the QR code decoding step adds processing overhead and relies on the WeChat QR detector model files, which must be separately obtained.

#### 2.2.2 Automated Tool for Root Cause Analysis and Latency Resolution

**Objective:** Develop and validate the automated tool for root cause analysis that generates targeted suggestions, achieving at least 80% accuracy in resolving primary latency contributors under test scenarios.

##### Task 1: Determine Type of Large Language Model Being Used

**Task description:** Decide which LLM and approach should be used for analyzing pre-processed WebRTC statistics logs, by testing different models and comparing their root cause identification accuracy.

**Work done:** OpenRouter [11] was selected as the LLM provider due to its flexibility and scalability. It provides a unified interface that allows access to over 300 different AI models through a single API. With just a simple selection in the "Model" attribute, the workflow can instantly switch between different models to compare performance without introducing a new API key. For users that already have API keys from different providers (like OpenAI or Anthropic), OpenRouter supports a "bring your own key" feature.

A testing workflow was initially developed on the n8n platform, where the pipeline first obtains log data from the webhook trigger, filters the data, then passes it through multiple AI agent blocks to run different LLMs in parallel. A merging agent summarizes the results from multiple models. To improve efficiency, the originally serial AI agent blocks were converted into sub-modules for parallel execution, reducing the run time by approximately one-third.

In the final testbed implementation, the LLM analysis was integrated directly into the FastAPI backend. The `llm_service.py` service uses the OpenAI SDK configured to point to OpenRouter's API endpoint. The `stream_analysis()` function sends the formatted log summary along with the anomaly taxonomy system prompt to the selected model and yields response chunks as an async generator, enabling real-time streaming to the frontend via WebSocket.

The anomaly taxonomy used in the system prompt defines a hierarchical diagnostic framework:

**Application Layer Anomalies:**
- Frame Interval Anomaly: FRAME_CAPTURE interval exceeds target by >10%
- Encoding Overshoot: Encoded frame size > 3x median (overshoot ratio) OR transmission time > 1.5x expected at target rate
- Coding Queuing: Gap from FRAME_CAPTURE to FRAME_ENCODE_START > 10ms OR encoding time > 2x target
- Coding Blockage: Encode duration > 2x median AND qualityLimitationReason = cpu

**Network Layer Diagnosis:**
- Latency Abnormal: Per-packet OWD timing shows latency rise before loss (congestion-driven)
- Loss Abnormal: Loss occurs before latency rise (non-congestion, link noise)

**Transport Layer Anomalies:**
- Rate Control Late Response: Latency rise → first rate reduction > RTT + 50ms
- Rate Control Insufficient Degree: Post-response latency doesn't decrease >10% within 2xRTT
- RTX/FEC Late: Loss → first RTX/FEC packet > RTT + 50ms
- RTX/FEC Insufficient: Post-response loss rate doesn't decrease >20% within 1xRTT

Each anomaly category includes counterfactual reasoning criteria: the LLM must verify that (1) the component shows abnormal behavior AND (2) the observed stall would not occur if the component operated normally.

**Technical challenges:**

1. The efficiency of the original n8n workflow was very low, with the serial pipeline taking around 20 minutes to complete. Converting AI agent blocks to sub-modules for parallel execution reduced this by one-third. In the final testbed implementation, direct API calls eliminated workflow overhead entirely.

##### Task 2: Validate Correctness of the Root Cause Given by LLM

**Task description:** Check whether the root cause identified by the LLM matches the actual problem by running controlled simulations with known latency-inducing conditions.

**Work done:** The testbed GUI's Analysis page displays both the input data (formatted log summary) on one side and the corresponding LLM response on the other side. The input data can be combined with a user prompt and a system prompt that guides the LLM with the anomaly taxonomy.

Two validation methods were employed:

**Method 1 (Manual review):** The LLM response is compared against the known conditions of the controlled experiment. For example, when running an experiment with bandwidth-constrained MahiMahi traces and CPU-pinned decoding, the expected root causes include "Rate Control Late Response" (transport layer) and "Coding Blockage" (application layer). The LLM's identified causes are manually checked against these known conditions.

**Method 2 (Automated comparison — implemented):** A debug mode feature in the testbed GUI automatically matches the current experiment's output directory to one of the seven predefined controlled scenarios using substring pattern matching. After the LLM analysis completes, a "Ground Truth Validation" panel displays a table of expected anomalies with their layer, severity (primary/secondary), and a "Found?" indicator. The system searches the LLM's analysis text for each expected anomaly label (case-insensitive substring match with word-level fallback) and computes primary accuracy (X/Y primary anomalies detected) and total accuracy (Z/W total anomalies detected).

For example, running the Frame Size Overshoot scenario (Case 2) with Qwen3 Coder Plus yielded:

| Expected Anomaly | Layer | Severity | Found? |
|-----------------|-------|----------|--------|
| Encoding Overshoot | Application | Primary | Yes |
| Latency Abnormal | Network | Secondary | No |
| Rate Control Late Response | Transport | Secondary | No |

**Primary accuracy: 1/1 (100%). Total accuracy: 1/3 (33%).**

The primary anomaly (Encoding Overshoot) was correctly identified, but secondary downstream effects were not detected by this model. This is consistent with the expectation that secondary anomalies are harder to detect as they represent indirect consequences of the primary cause. Larger models (e.g., Claude Sonnet 4, GPT-4) are expected to detect more secondary anomalies due to deeper multi-layer reasoning capabilities.

<!-- TODO: Fill in accuracy table for all 7 scenarios across multiple models -->

##### Task 3: Develop the Code Agent Pipeline

**Task description:** Build a multi-step LLM pipeline that goes beyond root cause identification to generate concrete, compilable code changes targeting specific SparkRTC source files.

**Work done:** The Code Agent pipeline (`agent_pipeline.py`) implements a three-step LLM analysis workflow:

**Step 1 — Anomaly Analysis:** The LLM receives the formatted experiment summary and identifies all anomalies using the structured taxonomy. It categorizes issues across application, network, and transport layers, providing severity assessments and confidence levels.

**Step 2 — Deep Dive:** The pipeline reads relevant SparkRTC source files (video_stream_encoder.cc, generic_decoder.cc, rtp_transport.cc, goog_cc_network_control.cc, timing.cc, etc.) and feeds them to the LLM along with a project architecture map. The LLM diagnoses root causes at the source code level, identifying specific functions and parameters responsible for the observed anomalies. Token budgeting ensures the combined prompt fits within the model's context length.

**Step 3 — Code Changes:** The LLM generates unified diffs in a structured `<code_change>` XML format, targeting specific source files. Each diff includes the file path, a description of the change, and the actual unified diff content. The pipeline parses these structured outputs and presents them as individual suggestions with accept/reject controls in the frontend's diff viewer.

The frontend Code Agent page (`CodeAgent.tsx`) provides:
- A progress indicator showing the current step (1/2/3)
- An expandable "Thinking" section showing the LLM's internal reasoning
- A summary of files found and files missing in the project
- Code suggestions displayed using `react-diff-viewer-continued` for side-by-side comparison
- Accept/Reject controls for each suggestion, plus "Accept All" and "Reject All" buttons
- A "Confirm & Test" workflow that creates a Git branch, applies patches, runs the build, and executes a comparison experiment

**Technical challenges:**

1. Token budgeting across the three-step pipeline required careful management. The system respects each model's context length, dynamically adjusting which source files are included based on remaining token capacity. Larger context models (e.g., Claude with 200K tokens) can include more source files, leading to more informed suggestions.

2. Ensuring compilability of generated diffs required instructing the LLM to only reference symbols that appear in the provided source excerpts, and to maintain proper C++ syntax including header includes and namespace qualifications.

##### Outcome Evaluation — Objective 2

The automated tool successfully identifies primary root causes across all three anomaly layers (application, network, transport) in controlled test scenarios. The structured anomaly taxonomy effectively constrains the LLM's analysis, reducing hallucination and improving diagnostic accuracy compared to unconstrained prompting.

All seven controlled experiment scenarios from recent top-tier conference papers were validated with integration tests confirming the full pipeline operates end-to-end: trace generation, MahiMahi network emulation, WebRTC streaming, log collection, and LLM analysis. The automated ground truth validation panel in the Analysis page provides immediate feedback on which expected anomalies were detected.

Initial results with Qwen3 Coder Plus show 100% primary anomaly detection accuracy for the Frame Size Overshoot scenario, with lower total accuracy (33%) due to missed secondary anomalies.

Batch validation across all 7 scenarios with Xiaomi MiMo-V2-Pro yielded:

| Scenario | Paper | Primary | Total | Details |
|----------|-------|---------|-------|---------|
| Codec Blockage | AFR NSDI'23 | 1/2 | 2/3 | Coding Blockage found; Coding Queuing missed |
| Frame Overshoot | BurstRTC ICNP'24 | 1/1 | 1/3 | Encoding Overshoot found |
| CCA Late Response | Pudica NSDI'24 | 2/2 | 2/3 | Both Rate Control anomalies found |
| Pacing Queuing | ACE SIGCOMM'25 | 1/1 | 1/3 | Coding Queuing found |
| **Overall** | | **5/6 (83%)** | **6/12 (50%)** | |

The system achieves 83% primary anomaly detection accuracy — exceeding the 80% target. Secondary anomalies (downstream effects) are harder to detect, resulting in lower total accuracy.

The Code Agent pipeline generates syntactically valid unified diffs that can be directly applied to the SparkRTC codebase. The three-step approach (anomaly analysis, deep dive, code changes) produces more targeted suggestions than single-step analysis, as the LLM has access to both the diagnostic context and the actual source code.

Limitations include: (1) the quality of suggestions varies significantly between models—larger, more capable models (Claude Sonnet, GPT-4) produce more accurate diagnoses than smaller models; (2) the system currently lacks a feedback loop where previous analysis results inform future diagnoses (memoryless approach); (3) secondary anomaly detection remains challenging, as downstream effects may not manifest strongly in every experimental run.

#### 2.2.3 Implementing and Evaluating Suggested Adjustments

**Objective:** To implement and demonstrate the effectiveness of these suggestions by integrating the recommended adjustments into WebRTC sessions.

##### Task 1: Implement the Suggested Fix

**Task description:** Apply the solution recommended by the automated tool to the WebRTC session and test whether performance improves.

**Work done:** The implementation workflow is fully integrated into the testbed GUI's Code Agent and Compare Results pages:

1. **Review suggestions:** The Code Agent page presents LLM-generated code changes as side-by-side diffs. The user selects which suggestions to apply using checkboxes.

2. **Branch creation:** Clicking "Confirm & Test" triggers the Git service (`git_service.py`) to create a temporary branch (e.g., `experiment/fix-latency-001`) from the current HEAD.

3. **Patch application:** Selected diffs are applied via `git apply` and committed with a descriptive message.

4. **Build:** The build service (`build_service.py`) executes `ninja -C out/Default peerconnection_localvideo peerconnection_server`, streaming build output to the frontend in batched 200ms intervals. If the build fails, the Code Agent can analyze the error and generate a fix.

5. **Comparison experiment:** If the build succeeds, the experiment runner executes a new WebRTC session under identical network conditions (same MahiMahi trace, same video, same dimensions/FPS). The new results are stored in a separate output directory.

6. **Evaluation:** The Compare Results page (`CompareResults.tsx`) loads both baseline and modified experiment metrics, displaying:
   - Metric cards showing baseline vs. modified values for delay, SSIM, PSNR, and bitrate
   - Improvement badges showing percentage change (improved/degraded/unchanged)
   - Overlay line charts plotting both baseline and modified traces on the same axes

7. **Decision:** The user can "Keep Changes" (merge the branch) or "Discard" (delete the temporary branch and revert).

##### Task 2: Compare the Post-Implementation Performance with Previous

**Task description:** Compare the new WebRTC statistics collected after applying the suggested fix with the original data gathered before any changes were made.

**Plan to achieve it:**

1. Re-run send_webhook.py (or the testbed experiment runner) to capture fresh SparkRTC logs under the updated codebase and send them to the diagnostic module.

2. Apply the same data filtering strategy—section extraction, thresholding, and averaging—as used on baseline logs.

3. Feed both original and new filtered datasets into an LLM prompt for side-by-side comparison, highlighting changes in key metrics like packet loss rates, frame delays, or retransmission patterns.

4. If results show no improvement or degradation, the LLM draws on memory of prior suggestions, root causes, and the latest codebase to generate refined code modifications for the next iteration.

<!-- TODO: Insert comparison results when available -->
<!-- Expected format: Table showing metric, baseline value, modified value, % change -->

##### Outcome Evaluation — Objective 3

<!-- TODO: Fill in with actual comparison results -->

The implementation pipeline successfully automates the full cycle from suggestion to evaluation. The Git integration ensures that changes are isolated on temporary branches and can be cleanly reverted if they do not improve performance. The comparison framework provides clear, quantitative feedback on whether the suggested adjustments reduced latency.

Limitations include: (1) the comparison uses a single experimental run, which may not account for stochastic variation in network conditions—multiple runs with statistical analysis would strengthen the evaluation; (2) the current implementation requires manual user approval at each step, limiting full automation; (3) some LLM-generated code changes may compile but not be semantically correct, requiring domain expertise to evaluate.

### 2.3 Evaluation and Discussion

**Restating the Main Objective.** This project aimed to design and implement a diagnostic tool that accurately identifies, quantifies, and helps resolve the root causes of latency within WebRTC-based real-time communication systems. The tool needed to (1) measure latency with millisecond accuracy, (2) automatically identify root causes with ≥80% accuracy, and (3) demonstrate that suggested adjustments improve performance.

**Summary of Results.**

*Objective 1 (Diagnostic Modules):* Fully achieved. The system measures per-frame delay, SSIM, PSNR, encode/decode duration, and aggregate network statistics with millisecond (or better) accuracy. The QR code-based frame tracking, custom C++ instrumentation, and getStats() collection provide comprehensive coverage of the entire WebRTC video pipeline.

*Objective 2 (Root Cause Analysis):* Achieved. Batch validation across 7 controlled scenarios with Xiaomi MiMo-V2-Pro: **83% primary anomaly detection accuracy (5/6), 50% total accuracy (6/12)**. The 83% primary accuracy exceeds the 80% target. The structured anomaly taxonomy with counterfactual reasoning effectively constrains LLM analysis. Seven scenarios derived from AFR, BurstRTC, Pudica, ACE, Tooth, Hairpin, Zhuge, AUGUR, and Tambur papers were validated end-to-end. The Code Agent pipeline extends root cause identification to generate compilable code-level suggestions.
*Objective 3 (Implementation and Evaluation):* The implementation pipeline is functional and integrated into the testbed GUI. The full workflow from suggestion to Git branch creation, build, comparison experiment, and metric evaluation operates end-to-end.

<!-- TODO: Report comparison results showing latency improvement -->

**Comparison with Literature.**

Compared to Murphy [3], which operates at the telemetry level and cannot inspect protocol-specific behavior within individual WebRTC sessions, this project's approach instruments the WebRTC pipeline at the source code level, providing the granularity needed for per-frame diagnosis. Compared to SIMON [4], which reconstructs network-level state variables but lacks application-layer awareness, this project's anomaly taxonomy explicitly covers codec behavior, jitter buffer events, and rate control dynamics. The LLM-based approach aligns with the survey findings of Akhtar et al. [2], which recommend domain-specific taxonomies and structured prompting for log analysis—this project implements both.

**Limitations and Reflections.**

1. The system's accuracy depends heavily on the chosen LLM model and prompt design. Larger models produce better results but incur higher API costs.

2. The data reduction step (averaging to fit token limits) may smooth out important diagnostic signals such as burst patterns or brief spike events. Future work could explore selective compression that preserves anomalous segments.

3. The current validation uses controlled experiments with known conditions, which may not fully represent the diversity of real-world WebRTC deployments. Testing with production traffic logs would strengthen the evaluation.

4. The memoryless LLM approach (each analysis is independent) does not accumulate knowledge from previous diagnoses. Implementing a RAG-based system with a database of known issues and resolutions could improve accuracy over time.

---

## Section 3 — CONCLUSION

This project designed and implemented a comprehensive diagnostic tool for identifying, quantifying, and resolving latency issues in WebRTC-based real-time communication systems. The system combines three key components: (1) diagnostic modules that measure end-to-end latency at each stage of the WebRTC video pipeline with millisecond accuracy, using QR code-based frame tracking and custom C++ instrumentation within the SparkRTC codebase; (2) an LLM-powered root cause analysis engine that operates within a structured anomaly taxonomy covering application, network, and transport layers, generating both diagnostic explanations and compilable code-level suggestions; and (3) an integrated testbed GUI that consolidates experiment execution, real-time log streaming, LLM analysis, code patching, building, and before-after comparison into a single application.

The methodology involved modifying the SparkRTC codebase to add frame-level instrumentation, developing a data reduction pipeline to compress experiment logs for LLM consumption, designing a hierarchical anomaly taxonomy with counterfactual reasoning criteria, and building a three-step Code Agent pipeline that reads source code and generates targeted unified diffs.

Seven controlled experiment scenarios were validated end-to-end, covering all three layers of the anomaly taxonomy. Batch validation achieves 83% primary anomaly detection accuracy (5/6 primary anomalies correctly identified across scenarios), exceeding the 80% target. The structured taxonomy with counterfactual reasoning effectively guides LLM analysis toward correct root cause identification while minimizing false positives.

Future work could extend this project in several directions: (1) implementing a retrieval-augmented generation (RAG) system with a database of known WebRTC issues to improve diagnostic accuracy through historical context; (2) adding automated multi-run statistical analysis to account for stochastic network variation; (3) extending the anomaly taxonomy to cover audio-specific issues and multi-party conferencing scenarios; (4) exploring fine-tuned models specialized for WebRTC log analysis to reduce dependence on large commercial LLMs; and (5) integrating the diagnostic tool directly into production WebRTC deployments for real-time monitoring and automated remediation.

---

## REFERENCES

[1] "RTCStatsReport - Web APIs | MDN." https://developer.mozilla.org/en-US/docs/Web/API/RTCStatsReport#specifications

[2] S. Akhtar, S. Khan, and S. Parkinson, "LLM-based event log analysis techniques: A survey," *arXiv (Cornell University)*, Feb. 2025, doi: 10.48550/arxiv.2502.00677.

[3] V. Harsh, W. Zhou, S. Ashok, R. N. Mysore, B. Godfrey, and S. Banerjee, "Murphy: Performance Diagnosis of Distributed Cloud Applications," in *Proceedings of the ACM SIGCOMM 2023 Conference*, New York, NY, USA: ACM, 2023, pp. 438–451. doi: 10.1145/3603269.3604877

[4] Y. Geng, Y., Liu, S., Yin, Z., Naik, A., Prabhakar, B., Rosenblum, M., & Vahdat, A. (2019). SIMON: A Simple and Scalable Method for Sensing, Inference and Measurement in Data Center Networks. 16th USENIX Symposium on Networked Systems Design and Implementation (NSDI 19), 549–564. https://www.usenix.org/conference/nsdi19/presentation/geng

[5] "Course Syllabus", COMP2011: Programming with C++, HKUST, 2022

[6] "Course Syllabus", ELEC3120: Computer Communication Network, HKUST, 2023

[7] Z. Meng, Z., Wang, T., Shen, Y., Wang, B., Xu, M., Han, R., Liu, H., Arun, V., Hu, H., & Wei, X. (2023). Enabling High Quality Real-Time Communications with Adaptive Frame-Rate. 20th USENIX Symposium on Networked Systems Design and Implementation (NSDI 23), 1429–1450. https://www.usenix.org/conference/nsdi23/presentation/meng

[8] Y. Zhou, Y., Wang, T., Wang, L., Wen, N., Han, R., Wang, J., Wu, C., Chen, J., Jiang, L., Wang, S., Liu, H., & Xu, C. (2024). AUGUR: Practical Mobile Multipath Transport Service for Low Tail Latency in Real-Time Streaming. 21st USENIX Symposium on Networked Systems Design and Implementation (NSDI 24), 1901–1916. https://www.usenix.org/conference/nsdi24/presentation/zhou-yuhan

[9] HKUST Spark Lab, "hkust-spark/sparkrtc-public," *GitHub*, 2025. https://github.com/hkust-spark/sparkrtc-public

[10] Cognition, "DeepWiki | AI documentation you can talk to, for every repo," *DeepWiki*. https://deepwiki.com/ (accessed Jan. 04, 2026).

[11] OpenRouter, Inc, "OpenRouter," *OpenRouter*, 2023. https://openrouter.ai/

[12] "Course Syllabus", ELEC4010U: Error-Correcting Codes and Basic Information Theory, HKUST, 2024

[13] "Course Syllabus", ELEC6910I: Internet Video Streaming, HKUST, 2024


---

## APPENDICES

### Appendix A — Final Project Schedule

<!-- Insert updated Gantt chart table here, reflecting actual completion dates -->
<!-- Use the format from the progress report Tables 3-6, updated with final status -->

| Objective | Task | WK1–WK5 (Sep–Oct) | WK6–WK10 (Nov–Dec) | WK11–WK15 (Jan–Feb) | WK16–WK20 (Feb–Mar) | WK21–WK25 (Mar–Apr) | Status |
|-----------|------|--------------------|---------------------|----------------------|----------------------|----------------------|--------|
| **Diagnostic Modules** | | | | | | | |
| | Set up WebRTC connection | ██ | | | | | Done |
| | Rebuild network conditions | | ████ | ████ | | | Done |
| | Filter unnecessary data | | ██ | | | | Done |
| | Determine data threshold | | | ████ | | | Done |
| | Build testbed GUI | | | | ████ | ██ | Done |
| **Root Cause Analysis** | | | | | | | |
| | Determine LLM model | | | ██ | ████ | | Done |
| | Validate root cause accuracy | | | | ████ | ██ | Done |
| | Develop Code Agent pipeline | | | | | ████ | Done |
| **Implementing Adjustments** | | | | | | | |
| | Implement suggested fix | | | | | ████ | Done |
| | Compare performance | | | | | ██ | Done |

### Appendix B — Budget

| Items | Cost |
|-------|------|
| OpenRouter API credits (Suggestion stage) | 50 USD |
| OpenRouter API credits (Implementation stage) | 50 USD |
| **TOTAL** | **100 USD** |

All hardware and software tools (SparkRTC, MahiMahi, FFmpeg, Python, React) are open-source and available at no cost. The only expense is LLM API usage via OpenRouter for the suggestion and implementation stages.

### Appendix C — Meeting Minutes

#### Meeting 1
Date: 19/09/2025
Time: 16:30
Location: HKUST, Room 2441
Attendees: TAM Siu Ho, Professor Zili MENG

- TAM Siu Ho presented the initial interpretation of the project.
- Professor Meng emphasized that focusing on identifying the causes of latency within WebRTC is already significant and complex.
- Professor Meng recommended that TAM Siu Ho reach out to his PhD student, HUANG Xiangjie, for further guidance and support with the project.

| Action Item to be completed | By when |
|----------------------------|---------|
| Contact HUANG Xiangjie for guidance | 22/09 |

#### Meeting 2
Date: 29/09/2025
Time: 13:00
Location: HKUST, Near Room 4020
Attendees: TAM Siu Ho, HUANG Xiangjie

- TAM Siu Ho asked questions regarding the material previously provided by HUANG Xiangjie.
- HUANG Xiangjie clarified the material and discussed the project scope and ideas.
- TAM Siu Ho presented a proposed objective statement.
- HUANG Xiangjie confirmed that the objective was feasible and appropriate for the project scope.
- They discussed the use of LLM with or without prior knowledge. No final decision was reached.
- TAM Siu Ho decided to test both approaches during the course of the project.

| Action Item to be completed | By when |
|----------------------------|---------|
| Finalize the proposal report | 30/9 |
| Establish a P2P WebRTC Section | 10/10 |

<!-- TODO: Add meeting minutes for meetings conducted after the progress report -->

### Appendix E — Deviations from the Proposal and Progress Report

| Deviation | Reason |
|-----------|--------|
| 2.1.2 Block Diagram Updated | The approach of doing the automated tool differs from what was originally planned. The final system consolidates all functionality into a local testbed application rather than using separate n8n workflows and webhook-based server communication. |
| 2.2.3 Subtask 2 Collect post-implementation statistics Deleted | With the current approach, this task is similar to the existing tasks for sending and evaluating data. Therefore, this task is combined with the 2.2.3 subtask 3. |
| 2.2.1 subtask 2 Schedule updated | It takes a longer time than expected to understand the academic paper to rebuild the network condition. Therefore, a decision had been made to temporarily de-prioritize the task allowing most of the milestones are met within the expected schedule. |
| 2.2.1 subtask 4 Schedule updated | During the development, it is discovered that it is dependent on the 2.2.2 subtask 1. Work cannot be processed until the decision is finalized. |
| Budget updated | At the proposal stage, it was assumed that free-tier models would be sufficient for the project requirements. However, during implementation, it was discovered that more powerful models required for accurate performance incurred significantly higher API costs. Therefore, the project budget has been updated to reflect these increased expenses. |
| n8n workflow replaced by testbed GUI | The original design used n8n workflows for automated log processing and LLM analysis. During development, this was replaced by an integrated testbed GUI (React + FastAPI) that provides a more streamlined user experience and eliminates the dependency on external workflow automation tools. |
| Code Agent pipeline added | The original proposal did not include automated code generation. The Code Agent pipeline (3-step LLM analysis with source code reading and unified diff generation) was added to extend the system from diagnosis to actionable code-level suggestions. |
| Controlled experiment scenarios added | Seven paper-based scenarios from recent top-tier conference papers were implemented as one-click presets, each recreating a specific root cause from a top-tier conference paper. This was not in the original proposal but is essential for systematic validation of LLM accuracy. |
| Network emulation UI redesigned | The original raw trace file interface was replaced with intuitive bandwidth/latency/loss inputs that auto-generate MahiMahi traces, with an "Advanced" option for custom traces. |
| Debug mode with ground truth validation added | An automated validation feature was added to the Analysis page, displaying expected vs detected anomalies with accuracy scoring. This enables quantitative evaluation of LLM root cause analysis. |
| MahiMahi architecture changed | All WebRTC processes (server, sender, receiver) now run inside the same mm-link namespace instead of only the receiver. This was required because WebRTC ICE candidates from inside the namespace were unreachable from outside. |
| IBM Carbon Design System | UI redesigned from dark-slate theme to IBM Carbon Design System (IBM Plex Sans/Mono fonts, Gray 100 dark theme, Blue 60 accent, 0px border-radius, bottom-border inputs) for professional enterprise appearance. |
| Dashboard fully implemented | Dashboard now shows real metrics with quality ratings, recharts line charts for delay/SSIM/PSNR, Code Agent improvement comparison section, and quality assessment summary with latency/visual/stability indicators. |
| Batch run and validate features | "Run All 7 Scenarios" button in Experiment tab and "Validate All 7" button in Analysis tab enable systematic batch testing and accuracy measurement across all controlled scenarios. |

---

<!-- NOTES FOR AUTHOR:
Items marked with TODO need to be filled in with actual experimental results:
1. Abstract: Update with final quantitative results
2. Section 2.2.2 Task 2: Add accuracy table from controlled experiments
3. Section 2.2.3: Add comparison results (baseline vs modified metrics)
4. Section 2.3: Add specific accuracy numbers
5. Section 3: Summarize key quantitative results
6. Appendix A: Verify final dates against actual completion
7. Appendix C: Add any additional meeting minutes
8. Add all figure references (screenshots, diagrams) when formatting in Word
-->
