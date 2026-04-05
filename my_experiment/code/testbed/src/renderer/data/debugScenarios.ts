/**
 * Controlled experiment scenarios based on the Profix paper's dataset (Appendix A).
 * Each scenario recreates the root cause from a specific top-tier conference paper
 * and defines the expected anomalies for LLM accuracy validation.
 */

import type { ExperimentConfig } from '../api/types'

export interface ExpectedAnomaly {
  label: string
  layer: 'application' | 'network' | 'transport'
  severity: 'primary' | 'secondary'
  description: string
}

export interface NetworkSetup {
  /** Human-readable description of the network/system config */
  summary: string
  /** Key metrics that define this scenario */
  metrics: { label: string; value: string }[]
}

export interface DebugScenario {
  id: string
  /** Short name shown in buttons */
  name: string
  /** Paper reference (e.g., "AFR NSDI'23") */
  paper: string
  /** Full description of the problem from the paper */
  description: string
  /** Substring to match against output_dir for auto-detection */
  outputDirPattern: string
  /** Partial ExperimentConfig — merged with defaults when triggering */
  experimentConfig: Partial<ExperimentConfig>
  /** How the network/system is configured to reproduce this issue */
  networkSetup: NetworkSetup
  /** Expected anomalies the LLM should identify */
  expectedAnomalies: ExpectedAnomaly[]
}

/**
 * Generate a MahiMahi trace string for a given bandwidth (Mbps) and duration (seconds).
 * Each line = ms timestamp when one 1500-byte packet departs.
 * For N Mbps: interval = 12/N ms between packets.
 */
export function generateTrace(mbps: number, durationSec: number): string {
  const interval = 12 / mbps
  const lines: string[] = []
  let t = 1
  const end = durationSec * 1000
  while (t <= end) {
    lines.push(String(Math.round(t)))
    t += interval
  }
  return lines.join('\n')
}

/**
 * Generate a bursty trace alternating between high and low bandwidth.
 * burstMs/stallMs define the cycle; highMbps/lowMbps define throughput in each phase.
 */
export function generateBurstyTrace(
  highMbps: number, lowMbps: number,
  burstMs: number, stallMs: number,
  durationSec: number
): string {
  const lines: string[] = []
  let t = 1
  const end = durationSec * 1000
  while (t <= end) {
    const cyclePos = t % (burstMs + stallMs)
    const mbps = cyclePos < burstMs ? highMbps : lowMbps
    const interval = 12 / mbps
    lines.push(String(Math.round(t)))
    t += interval
  }
  return lines.join('\n')
}

/**
 * Generate a loss trace string. Format: timestamp_ms,loss_rate per line.
 */
export function generateLossTrace(lossRate: number, durationSec: number, intervalMs: number = 100): string {
  const lines: string[] = []
  for (let t = 0; t <= durationSec * 1000; t += intervalMs) {
    lines.push(`${t},${lossRate}`)
  }
  return lines.join('\n')
}

export const SCENARIOS: DebugScenario[] = [
  // ===== Case 1: Codec Blockage (Application Layer) =====
  // AFR: 1080p@60fps, decode delay p99=18ms vs inter-arrival=16.7ms, edge RTT ~15ms
  // Measured on Tencent Start: 38,100 sessions, 7.73B frames. 57% of frames with >100ms
  // total delay had queuing delay >50ms at decoder.
  {
    id: 'codec_blockage',
    name: 'Codec Blockage',
    paper: 'AFR NSDI\'23',
    description:
      'Recreates the client decoder queue bottleneck from AFR [Meng et al., NSDI\'23]. ' +
      'Measured on Tencent Start (38,100 sessions, 7.73B frames): at 1080p@60fps, the p99 ' +
      'decode delay is 18ms while inter-arrival is 16.7ms, causing queue utilization ρ≈1.0 ' +
      'at tail. 57% of frames with >100ms total delay had >50ms queuing at the decoder. ' +
      'Constructed by pinning receiver to single CPU core (taskset -c 0) with bursty network.',
    outputDirPattern: 'codec_blockage',
    experimentConfig: {
      fps: 30,
      enable_mahimahi: true,
      field_trials: 'WebRTC-TasksetReceiver/c0/',
    },
    networkSetup: {
      summary: 'Bursty 12Mbps trace + receiver pinned to 1 CPU core (taskset -c 0)',
      metrics: [
        { label: 'Bandwidth', value: '12 Mbps (bursty: 500ms burst / 200ms stall at 0.5Mbps)' },
        { label: 'CPU Constraint', value: 'taskset -c 0 (single core, mimicking mid-range HW)' },
        { label: 'Resolution', value: '1920x1080 @ 30fps (paper: 1080p@60fps)' },
        { label: 'Root Cause', value: 'Decode p99=18ms ≈ inter-arrival 16.7ms → ρ≈1.0 at tail' },
      ]
    },
    expectedAnomalies: [
      {
        label: 'Coding Blockage',
        layer: 'application',
        severity: 'primary',
        description: 'Decode duration > 2x median; qualityLimitationReason=cpu'
      },
      {
        label: 'Coding Queuing',
        layer: 'application',
        severity: 'primary',
        description: 'Decoding queue > 3 frames; FRAME_CAPTURE to FRAME_ENCODE_START gap > 10ms'
      },
      {
        label: 'Frame Interval Anomaly',
        layer: 'application',
        severity: 'secondary',
        description: 'Frame interval exceeds target by >10% due to queue stalls'
      }
    ]
  },

  // ===== Case 2: Frame Size Overshooting (Application Layer) =====
  {
    id: 'frame_overshoot',
    name: 'Frame Size Overshoot',
    paper: 'BurstRTC ICNP\'24',
    description:
      'Recreates the sending buffer overshoot from BurstRTC [Jia et al., ICNP\'24]. ' +
      'Traditional network-oriented CC assumes continuous packet transmission, but RTC has ' +
      'discrete video frames with inherent bit-rate variation. Large frames exceed the target ' +
      'rate, causing buffer overshoot and frame delays exceeding thresholds.',
    outputDirPattern: 'frame_overshoot',
    experimentConfig: {
      fps: 30,
      enable_mahimahi: true,
    },
    networkSetup: {
      summary: 'Bandwidth-limited 4Mbps trace with 1080p video causing frame size > target rate',
      metrics: [
        { label: 'Bandwidth', value: '4 Mbps (constant)' },
        { label: 'Resolution', value: '1920x1080 @ 30fps' },
        { label: 'Expected Overshoot', value: 'Frame size > 1.2x target at 4Mbps' },
        { label: 'Root Cause', value: 'Encoded frame size exceeds target → prolonged transmission' },
      ]
    },
    expectedAnomalies: [
      {
        label: 'Encoding Overshoot',
        layer: 'application',
        severity: 'primary',
        description: 'Encoded frame size > target by >20%; transmission time > 1.5x expected'
      },
      {
        label: 'Latency Abnormal',
        layer: 'network',
        severity: 'secondary',
        description: 'Oversized frames cause congestion-driven latency rise'
      },
      {
        label: 'Rate Control Late Response',
        layer: 'transport',
        severity: 'secondary',
        description: 'CC slow to adapt target rate to actual frame sizes'
      }
    ]
  },

  // ===== Case 3: CCA Late Response (Transport Layer) =====
  // Pudica: 57,000 sessions, 15 cities, 5 weeks. 60fps, max 50Mbps.
  // Base RTT: 50%<10ms, 90%<20ms. BW drops: 5.6% Eth / 35.5% WiFi have ≥5 drops >50%/min.
  // Stall = frame delay >100ms. Queue draining takes ~200ms.
  // SQP takes ~5s to drain queue; Pudica drains in ~200ms via active queue draining.
  {
    id: 'cca_late_response',
    name: 'CCA Late Response',
    paper: 'Pudica NSDI\'24',
    description:
      'Recreates the self-induced bottleneck queuing from Pudica [Wang et al., NSDI\'24]. ' +
      'Measured on 57,000 sessions (15 cities, 5 weeks): base RTT 50%<10ms, 90%<20ms; ' +
      '35.5% of WiFi users experience ≥5 bandwidth reductions of >50% per minute. ' +
      'Existing CC (GCC, SQP) takes ~5s to drain self-induced queues. Max bitrate 50Mbps, 60fps.',
    outputDirPattern: 'cca_late_response',
    experimentConfig: {
      fps: 30,
      enable_mahimahi: true,
    },
    networkSetup: {
      summary: 'Sudden BW drops (30→5 Mbps) mimicking edge conditions from Pudica Fig.12',
      metrics: [
        { label: 'Bandwidth', value: '30 Mbps → 5 Mbps (sudden drop, recover cycle ~10s)' },
        { label: 'Base RTT', value: '<10ms (50th pctl from paper Fig.3)' },
        { label: 'BW Drop Freq', value: '≥5 drops >50%/min (35.5% of WiFi users)' },
        { label: 'Root Cause', value: 'CC response > RTT+50ms; queue drain takes ~5s (SQP)' },
      ]
    },
    expectedAnomalies: [
      {
        label: 'Rate Control Late Response',
        layer: 'transport',
        severity: 'primary',
        description: 'Time from latency rise to first rate reduction > RTT + 50ms'
      },
      {
        label: 'Rate Control Insufficient Degree',
        layer: 'transport',
        severity: 'primary',
        description: 'Post-response latency does not decrease >10% within 2xRTT'
      },
      {
        label: 'Latency Abnormal',
        layer: 'network',
        severity: 'secondary',
        description: 'Congestion-driven latency rise after bandwidth drop'
      }
    ]
  },

  // ===== Case 4: Pacing Queuing (Transport Layer) =====
  {
    id: 'pacing_queuing',
    name: 'Pacing Queuing',
    paper: 'ACE SIGCOMM\'25',
    description:
      'Recreates the pacing queue latency from ACE [Huang et al., SIGCOMM\'25]. ' +
      'Pacing latency in the sender\'s pacing queue is caused by mismatch between the ' +
      'bursty frame stream generated by the encoder and the smooth traffic expected by ' +
      'the network. When RTT drops below frame interval, pacing latency dominates.',
    outputDirPattern: 'pacing_queuing',
    experimentConfig: {
      fps: 30,
      enable_mahimahi: true,
    },
    networkSetup: {
      summary: 'High-bandwidth 20Mbps trace with low RTT, exposing pacing queue buildup',
      metrics: [
        { label: 'Bandwidth', value: '20 Mbps (constant, smooth)' },
        { label: 'RTT', value: '<5ms (ideal network, pacing-limited)' },
        { label: 'Resolution', value: '1920x1080 @ 30fps (large frames)' },
        { label: 'Root Cause', value: 'Bursty encoder output vs smooth pacer → queue delay' },
      ]
    },
    expectedAnomalies: [
      {
        label: 'Coding Queuing',
        layer: 'application',
        severity: 'primary',
        description: 'Pacing queue buildup: gap from capture to encode > 10ms'
      },
      {
        label: 'Encoding Overshoot',
        layer: 'application',
        severity: 'secondary',
        description: 'Large frame bursts exceed pacing capacity'
      },
      {
        label: 'Rate Control Late Response',
        layer: 'transport',
        severity: 'secondary',
        description: 'Pacer does not adjust bucket size to match encoder burstiness'
      }
    ]
  },

  // ===== Case 5: RTX Overshooting (Transport Layer) =====
  // Hairpin: median RTT 10-20ms (edge), median session loss 0.05%, but instantaneous
  // frame-level loss: 2% of frames lose >20% packets. Deadline: 50-200ms.
  // 70% of frames with >10% loss last >2 frames duration.
  // Tooth: large frame loss rate as low as 2%, small frame loss rate >30%.
  {
    id: 'rtx_overshoot',
    name: 'RTX/FEC Overshoot',
    paper: 'Tooth NSDI\'25 / Hairpin NSDI\'24',
    description:
      'Recreates the FEC/RTX inefficiency from Tooth [An et al., NSDI\'25] and Hairpin ' +
      '[Meng et al., NSDI\'24]. Hairpin measured on O(10,000) edge users: median RTT ' +
      '10-20ms, median session loss 0.05%, but 2% of frames lose >20% of packets ' +
      'instantaneously. Tooth found large frame loss ≈2% vs small frame loss >30%. ' +
      'Deadline: 50-200ms (cloud gaming <96ms).',
    outputDirPattern: 'rtx_overshoot',
    experimentConfig: {
      fps: 30,
      enable_mahimahi: true,
      enable_loss_trace: true,
    },
    networkSetup: {
      summary: '8Mbps + 5% packet loss (edge RTT 10-20ms, simulating Hairpin Fig.4)',
      metrics: [
        { label: 'Bandwidth', value: '8 Mbps (constant, no congestion)' },
        { label: 'Packet Loss', value: '5% (frame-level instantaneous can reach 20%)' },
        { label: 'RTT', value: '10-20ms (edge, from Hairpin Fig.4a)' },
        { label: 'Root Cause', value: 'FEC 100% redundancy for high-loss frames; DMR>0.1%' },
      ]
    },
    expectedAnomalies: [
      {
        label: 'RTX/FEC Insufficient',
        layer: 'transport',
        severity: 'primary',
        description: 'Post-response loss rate does not decrease >20% within 1xRTT'
      },
      {
        label: 'RTX/FEC Late',
        layer: 'transport',
        severity: 'primary',
        description: 'Time from loss to first RTX/FEC packet > RTT + 50ms'
      },
      {
        label: 'Loss Abnormal',
        layer: 'network',
        severity: 'secondary',
        description: 'Non-congestion loss (loss before latency rise)'
      }
    ]
  },

  // ===== Case 6: Latency Rise (Network Layer) =====
  {
    id: 'latency_rise',
    name: 'Latency Rise',
    paper: 'Zhuge SIGCOMM\'25 / AUGUR NSDI\'24',
    description:
      'Recreates the wireless RTT inflation from AUGUR [Zhou et al., NSDI\'24] and the ' +
      'long control loop latency from Zhuge [Meng et al., SIGCOMM\'25]. Wi-Fi networks ' +
      'suffer from RTT inflation — 99th percentile latency is 290% higher than wired. ' +
      'The CC control loop is too long to adapt to rapid wireless fluctuations.',
    outputDirPattern: 'latency_rise',
    experimentConfig: {
      fps: 30,
      enable_mahimahi: true,
    },
    networkSetup: {
      summary: 'Bandwidth trace with periodic congestion events causing latency spikes >200ms',
      metrics: [
        { label: 'Bandwidth', value: '12→1 Mbps (periodic drops every 8s for 3s)' },
        { label: 'Expected RTT', value: 'Spikes to >200ms during congestion' },
        { label: 'P99 Latency', value: '>400ms (simulating Wi-Fi RTT inflation)' },
        { label: 'Root Cause', value: 'Congestion-driven latency rise (t_latency < t_loss)' },
      ]
    },
    expectedAnomalies: [
      {
        label: 'Latency Abnormal',
        layer: 'network',
        severity: 'primary',
        description: 'Latency rise precedes packet loss — congestion-driven (t_latency < t_loss)'
      },
      {
        label: 'Rate Control Late Response',
        layer: 'transport',
        severity: 'secondary',
        description: 'CC too slow to respond to sudden congestion'
      },
      {
        label: 'Rate Control Insufficient Degree',
        layer: 'transport',
        severity: 'secondary',
        description: 'Rate reduction insufficient to drain queue within 2xRTT'
      }
    ]
  },

  // ===== Case 7: Loss Rise (Network Layer) =====
  // Hairpin: session-level loss median 0.05%, but frame-level instantaneous can be 20%+
  // 70% of loss events with >10% loss rate span >2 frames (burst loss).
  // Tambur: analyzed Microsoft Teams calls, burst loss is common in videoconferencing.
  {
    id: 'loss_rise',
    name: 'Loss Rise',
    paper: 'Hairpin NSDI\'24 / Tambur NSDI\'23',
    description:
      'Recreates non-congestion burst loss from Hairpin [Meng et al., NSDI\'24] and ' +
      'Tambur [Rudow et al., NSDI\'23]. Hairpin measured: session-level loss median 0.05%, ' +
      'but 2% of frames lose >20% of packets instantaneously. 70% of loss events with ' +
      '>10% loss rate span >2 frames. Tambur confirmed burst loss is common in Teams calls.',
    outputDirPattern: 'loss_rise',
    experimentConfig: {
      fps: 30,
      enable_mahimahi: true,
      enable_loss_trace: true,
    },
    networkSetup: {
      summary: '12Mbps + 10% burst loss (no congestion, simulating Hairpin Fig.3/5)',
      metrics: [
        { label: 'Bandwidth', value: '12 Mbps (constant, no congestion)' },
        { label: 'Packet Loss', value: '10% burst (instantaneous frame-level, from Hairpin)' },
        { label: 'RTT', value: '10-20ms (edge, from Hairpin Fig.4a)' },
        { label: 'Root Cause', value: 'Loss without latency rise → non-congestion (t_loss ≤ t_latency)' },
      ]
    },
    expectedAnomalies: [
      {
        label: 'Loss Abnormal',
        layer: 'network',
        severity: 'primary',
        description: 'Loss occurs without preceding latency rise — non-congestion link noise'
      },
      {
        label: 'RTX/FEC Insufficient',
        layer: 'transport',
        severity: 'primary',
        description: 'FEC/RTX cannot recover burst losses efficiently within deadline'
      },
      {
        label: 'RTX/FEC Late',
        layer: 'transport',
        severity: 'secondary',
        description: 'Retransmission response exceeds RTT + 50ms threshold'
      }
    ]
  }
]

/**
 * Match an experiment's output_dir to a known debug scenario.
 * Uses case-insensitive substring matching.
 */
export function matchScenario(outputDir: string): DebugScenario | null {
  const lower = outputDir.toLowerCase()
  return SCENARIOS.find(s => lower.includes(s.outputDirPattern)) ?? null
}
