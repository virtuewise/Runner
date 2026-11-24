import type { MissionTerms, MissionQuote, Money } from "./types";

export interface PricingPolicy {
  readonly version: string;
  readonly currency: string;
  readonly baseMinor: number;
  readonly perKilometreMinor: number;
  readonly handlingMinor: number;
  readonly platformFeeBasisPoints: number;
  readonly runnerShareBasisPoints: number;
  readonly quoteValidityMinutes: number;
}

export interface QuoteInput {
  readonly terms: MissionTerms;
  readonly estimatedDistanceMetres: number;
  readonly policy: PricingPolicy;
  readonly now: string;
}

export function calculateQuote(input: QuoteInput): MissionQuote {
  const { terms, estimatedDistanceMetres, policy } = input;
  const numericValues = [estimatedDistanceMetres, policy.baseMinor, policy.perKilometreMinor,
    policy.handlingMinor, policy.platformFeeBasisPoints, policy.runnerShareBasisPoints,
    policy.quoteValidityMinutes, terms.declaredValueMinor, terms.weightGrams];
  if (numericValues.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Pricing inputs must be finite non-negative numbers");
  }
  if (policy.platformFeeBasisPoints > 10_000 || policy.runnerShareBasisPoints > 10_000) {
    throw new Error("Pricing basis points cannot exceed 10000");
  }
  if (!policy.currency || !policy.version || !Number.isFinite(Date.parse(input.now))) {
    throw new Error("Pricing policy and timestamp are invalid");
  }
  const money = (amountMinor: number): Money => ({ amountMinor, currency: policy.currency });
  const distanceMinor = Math.round((estimatedDistanceMetres / 1000) * policy.perKilometreMinor);
  const subtotal = policy.baseMinor + distanceMinor + policy.handlingMinor;
  const platformFee = Math.round(subtotal * policy.platformFeeBasisPoints / 10_000);
  const runnerReward = Math.round(subtotal * policy.runnerShareBasisPoints / 10_000);
  const expiresAt = new Date(Date.parse(input.now) + policy.quoteValidityMinutes * 60_000).toISOString();
  return {
    base: money(policy.baseMinor),
    distance: money(distanceMinor),
    handling: money(policy.handlingMinor),
    platformFee: money(platformFee),
    runnerReward: money(runnerReward),
    requesterTotal: money(subtotal + platformFee),
    expiresAt,
    pricingVersion: policy.version,
  };
}
