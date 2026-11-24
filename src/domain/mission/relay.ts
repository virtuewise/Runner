export interface RelayNode {
  readonly id: string;
  readonly approvedHandover: boolean;
  readonly handoverBufferMinutes: number;
}

export interface RelayEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly runnerId: string;
  readonly mode: "foot" | "bicycle" | "motorcycle" | "car" | "van" | "rail" | "air" | "other";
  readonly departureAt: string;
  readonly arrivalAt: string;
  readonly costMinor: number;
  readonly reliability: number;
  readonly qualified: boolean;
  readonly itemPermitted: boolean;
  readonly jurisdictionApproved: boolean;
}

export interface RelayPolicy {
  readonly maxLegs: number;
  readonly maxCostMinor: number;
  readonly minutesWeight: number;
  readonly costWeight: number;
  readonly riskWeight: number;
}

export interface RelayPlan {
  readonly edges: readonly RelayEdge[];
  readonly totalCostMinor: number;
  readonly arrivalAt: string;
  readonly generalizedCost: number;
}

export type RelayPlanResult =
  | { readonly ok: true; readonly plan: RelayPlan }
  | { readonly ok: false; readonly reason: "NO_FEASIBLE_ROUTE" | "INVALID_GRAPH" };

function edgeWeight(edge: RelayEdge, policy: RelayPolicy): number {
  const durationMinutes = (Date.parse(edge.arrivalAt) - Date.parse(edge.departureAt)) / 60_000;
  return durationMinutes * policy.minutesWeight +
    edge.costMinor * policy.costWeight +
    (1 - edge.reliability) * policy.riskWeight;
}

/**
 * Finds a policy-feasible multi-hop route. This is a route candidate generator,
 * not dispatch authorization: each chosen Runner must be revalidated at assignment.
 */
export function planRelay(input: {
  readonly nodes: readonly RelayNode[];
  readonly edges: readonly RelayEdge[];
  readonly origin: string;
  readonly destination: string;
  readonly earliestDepartureAt: string;
  readonly policy: RelayPolicy;
}): RelayPlanResult {
  const { nodes, edges, origin, destination, earliestDepartureAt, policy } = input;
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const validPolicy = Number.isInteger(policy.maxLegs) && policy.maxLegs > 0 &&
    Number.isFinite(policy.maxCostMinor) && policy.maxCostMinor >= 0 &&
    [policy.minutesWeight, policy.costWeight, policy.riskWeight].every((v) => Number.isFinite(v) && v >= 0);
  if (!validPolicy || !nodeMap.has(origin) || !nodeMap.has(destination) ||
      !Number.isFinite(Date.parse(earliestDepartureAt))) return { ok: false, reason: "INVALID_GRAPH" };
  if (origin === destination) return { ok: true, plan: { edges: [], totalCostMinor: 0, arrivalAt: earliestDepartureAt, generalizedCost: 0 } };

  const adjacency = new Map<string, RelayEdge[]>();
  for (const edge of edges) {
    const departure = Date.parse(edge.departureAt);
    const arrival = Date.parse(edge.arrivalAt);
    if (!nodeMap.has(edge.from) || !nodeMap.has(edge.to) || edge.from === edge.to ||
        !edge.runnerId || !Number.isFinite(departure) || !Number.isFinite(arrival) ||
        arrival <= departure || !Number.isSafeInteger(edge.costMinor) || edge.costMinor < 0 ||
        !Number.isFinite(edge.reliability) || edge.reliability < 0 || edge.reliability > 1) {
      return { ok: false, reason: "INVALID_GRAPH" };
    }
    if (!edge.qualified || !edge.itemPermitted || !edge.jurisdictionApproved) continue;
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge);
    adjacency.set(edge.from, list);
  }

  interface State { node: string; arrival: number; cost: number; score: number; path: RelayEdge[]; }
  const queue: State[] = [{ node: origin, arrival: Date.parse(earliestDepartureAt), cost: 0, score: 0, path: [] }];
  const best = new Map<string, number>();
  while (queue.length) {
    queue.sort((a, b) => a.score - b.score);
    const current = queue.shift()!;
    const stateKey = `${current.node}:${current.path.length}`;
    if ((best.get(stateKey) ?? Infinity) < current.score) continue;
    if (current.node === destination) {
      return { ok: true, plan: {
        edges: current.path, totalCostMinor: current.cost,
        arrivalAt: new Date(current.arrival).toISOString(), generalizedCost: current.score,
      } };
    }
    if (current.path.length >= policy.maxLegs) continue;
    for (const edge of adjacency.get(current.node) ?? []) {
      if (current.path.some((used) => used.id === edge.id || used.runnerId === edge.runnerId)) continue;
      const node = nodeMap.get(current.node)!;
      const departure = Date.parse(edge.departureAt);
      if (current.path.length > 0 && !node.approvedHandover) continue;
      const earliest = current.arrival + (current.path.length > 0 ? node.handoverBufferMinutes * 60_000 : 0);
      if (departure < earliest) continue;
      const cost = current.cost + edge.costMinor;
      if (cost > policy.maxCostMinor) continue;
      const score = current.score + edgeWeight(edge, policy);
      const next: State = { node: edge.to, arrival: Date.parse(edge.arrivalAt), cost, score, path: [...current.path, edge] };
      const key = `${next.node}:${next.path.length}`;
      if (score < (best.get(key) ?? Infinity)) {
        best.set(key, score);
        queue.push(next);
      }
    }
  }
  return { ok: false, reason: "NO_FEASIBLE_ROUTE" };
}
