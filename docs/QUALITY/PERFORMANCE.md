# Performance & Capacity Plan

Status: Targets proposed; no production benchmark completed. Owner: Engineering.

Collect mission creation rate, open missions by zone, Runner supply, candidate fan-out, location update rate, relay graph size, event writes, read/write ratio and peak-to-average ratio.

Initial targets: p95 simple read <300 ms; p95 command <700 ms excluding providers; no duplicate leg assignment; measure queue age, DB pool and lock waits. These are hypotheses, not measured SLAs.

Benchmark baseline pilot workload, queue scans, assignment races, relay worst cases and provider failures. Record p50/p95/p99, throughput, errors, CPU, memory, DB saturation and lock waits with commit, dataset and scripts.

Add replicas, spatial indexes, caches or external queues only when measured bottlenecks justify them.