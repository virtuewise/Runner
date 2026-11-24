import type { Mission, MissionStatus, RunnerEligibility } from "./types";

const TRANSITIONS: Readonly<Record<MissionStatus, readonly MissionStatus[]>> = {
  draft: ["quoted", "cancelled"],
  quoted: ["open", "cancelled", "expired"],
  open: ["matching", "assigned", "cancelled", "expired", "safety_hold"],
  matching: ["assigned", "cancelled", "expired", "safety_hold"],
  assigned: ["runner_en_route", "cancelled", "failed", "safety_hold"],
  runner_en_route: ["at_pickup", "cancelled", "failed", "safety_hold"],
  at_pickup: ["in_custody", "cancelled", "failed", "safety_hold"],
  in_custody: ["en_route_to_destination", "failed", "disputed", "safety_hold"],
  en_route_to_destination: ["delivered", "failed", "disputed", "safety_hold"],
  delivered: ["closed", "disputed", "safety_hold"],
  closed: [],
  cancelled: [],
  expired: [],
  failed: ["disputed", "closed"],
  disputed: ["closed", "safety_hold"],
  safety_hold: ["disputed", "failed", "closed"],
  customs_hold: ["in_custody", "en_route_to_destination", "disputed", "safety_hold"],
};

export function canTransition(from: MissionStatus, to: MissionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isRunnerEligible(mission: Mission, runner: RunnerEligibility): boolean {
  if (!runner.identityVerified || !runner.qualified || !runner.active) return false;
  if (!mission.terms.prohibitedItemScreeningPassed) return false;
  const required = mission.terms.requiredCapabilities;
  if (!required.every((capability) => runner.capabilities.includes(capability))) return false;
  if (mission.terms.requiredVehicleClass && runner.vehicleClass !== mission.terms.requiredVehicleClass) return false;
  return runner.jurisdictionCodes.includes(mission.terms.pickup.countryCode) &&
    runner.jurisdictionCodes.includes(mission.terms.destination.countryCode);
}
