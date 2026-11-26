export interface CustodyChallenge {
  readonly id: string; readonly missionId: string; readonly legId: string; readonly receivingLegId?: string;
  readonly releasingActorId: string; readonly receivingActorId: string;
  readonly purpose: "pickup" | "relay_handover" | "final_delivery"; readonly tokenHash: string;
  readonly expiresAt: string; readonly status: "pending" | "confirmed" | "expired" | "invalidated" | "disputed";
  readonly releaseConfirmedAt?: string; readonly receiveConfirmedAt?: string; readonly version: number;
}
export interface CustodyTransaction {
  createChallenge(challenge: CustodyChallenge): Promise<void>;
  loadChallengeForUpdate(challengeId: string): Promise<CustodyChallenge | null>;
  saveChallenge(challenge: CustodyChallenge, expectedVersion: number): Promise<boolean>;
  expireChallenges(now: string, limit: number): Promise<readonly CustodyChallenge[]>;
  appendCustodyEvent(input: { readonly challengeId: string; readonly missionId: string; readonly legId: string;
    readonly actorId: string; readonly type: "custody.challenge_issued" | "custody.release_confirmed" |
      "custody.receive_confirmed" | "custody.handover_confirmed" | "custody.challenge_invalidated" | "custody.challenge_expired";
    readonly occurredAt: string }): Promise<void>;
}
export interface CustodyRepository { transaction<T>(work: (tx: CustodyTransaction) => Promise<T>): Promise<T>; }
export interface CustodyCrypto {
  randomToken(bytes: number): string;
  hashToken(token: string): Promise<string>;
  equalDigest(leftHex: string, rightHex: string): boolean;
}
export type CustodyResult = { readonly ok: true; readonly challenge: CustodyChallenge; readonly plaintextToken?: string } |
  { readonly ok: false; readonly reason: "NOT_FOUND" | "FORBIDDEN" | "EXPIRED" | "REPLAYED" | "INVALID_TOKEN" | "CONFLICT" };

export async function issueCustodyChallenge(input: {
  readonly repository: CustodyRepository; readonly crypto: CustodyCrypto; readonly challengeId: string;
  readonly missionId: string; readonly legId: string; readonly receivingLegId?: string; readonly releasingActorId: string; readonly receivingActorId: string;
  readonly purpose: CustodyChallenge["purpose"]; readonly now: string; readonly ttlSeconds: number;
}): Promise<CustodyResult> {
  const now = Date.parse(input.now);
  if (!Number.isFinite(now) || !input.challengeId || !input.missionId || !input.legId ||
      !input.releasingActorId || !input.receivingActorId || input.releasingActorId === input.receivingActorId ||
      (input.purpose === "relay_handover" && !input.receivingLegId) ||
      (input.receivingLegId && input.receivingLegId === input.legId) ||
      !Number.isSafeInteger(input.ttlSeconds) || input.ttlSeconds < 30 || input.ttlSeconds > 900)
    throw new Error("Invalid custody challenge request");
  const plaintextToken = input.crypto.randomToken(32);
  if (!plaintextToken || plaintextToken.length < 32) throw new Error("Custody token source did not return sufficient entropy");
  const tokenHash = await input.crypto.hashToken(plaintextToken);
  if (!/^[a-f0-9]{64,}$/i.test(tokenHash)) throw new Error("Custody token digest is invalid");
  const challenge: CustodyChallenge = { id: input.challengeId, missionId: input.missionId, legId: input.legId,
    releasingActorId: input.releasingActorId, receivingActorId: input.receivingActorId,
    ...(input.receivingLegId ? { receivingLegId: input.receivingLegId } : {}), purpose: input.purpose,
    tokenHash, expiresAt: new Date(now + input.ttlSeconds * 1000).toISOString(), status: "pending", version: 1 };
  await input.repository.transaction(async (tx) => {
    await tx.createChallenge(challenge);
    await tx.appendCustodyEvent({ challengeId: challenge.id, missionId: challenge.missionId, legId: challenge.legId,
      actorId: challenge.releasingActorId, type: "custody.challenge_issued", occurredAt: input.now });
  });
  return { ok: true, challenge: { ...challenge, tokenHash: "[redacted]" }, plaintextToken };
}

/** Both parties authenticate against the same challenge; repository row-lock/CAS makes replay atomic. */
export async function confirmCustody(input: {
  readonly repository: CustodyRepository; readonly crypto: CustodyCrypto; readonly challengeId: string;
  readonly actorId: string; readonly token: string; readonly now: string;
}): Promise<CustodyResult> {
  const now = Date.parse(input.now);
  if (!Number.isFinite(now) || !input.challengeId || !input.actorId || !input.token) throw new Error("Invalid custody confirmation");
  const suppliedHash = await input.crypto.hashToken(input.token);
  return input.repository.transaction(async (tx) => {
    const challenge = await tx.loadChallengeForUpdate(input.challengeId);
    if (!challenge) return { ok: false, reason: "NOT_FOUND" };
    if (challenge.status !== "pending") return { ok: false, reason: "REPLAYED" };
    if (Date.parse(challenge.expiresAt) <= now) {
      const expired: CustodyChallenge = { ...challenge, status: "expired", version: challenge.version + 1 };
      if (!await tx.saveChallenge(expired, challenge.version)) return { ok: false, reason: "CONFLICT" };
      await tx.appendCustodyEvent({ challengeId: challenge.id, missionId: challenge.missionId, legId: challenge.legId,
        actorId: "00000000-0000-0000-0000-000000000000", type: "custody.challenge_expired", occurredAt: input.now });
      return { ok: false, reason: "EXPIRED" };
    }
    if (input.actorId !== challenge.releasingActorId && input.actorId !== challenge.receivingActorId)
      return { ok: false, reason: "FORBIDDEN" };
    if ((input.actorId === challenge.releasingActorId && challenge.releaseConfirmedAt) ||
        (input.actorId === challenge.receivingActorId && challenge.receiveConfirmedAt))
      return { ok: false, reason: "REPLAYED" };
    if (!input.crypto.equalDigest(challenge.tokenHash, suppliedHash)) return { ok: false, reason: "INVALID_TOKEN" };
    const next: CustodyChallenge = input.actorId === challenge.releasingActorId
      ? { ...challenge, releaseConfirmedAt: challenge.releaseConfirmedAt ?? input.now, version: challenge.version + 1 }
      : { ...challenge, receiveConfirmedAt: challenge.receiveConfirmedAt ?? input.now, version: challenge.version + 1 };
    const complete = Boolean(next.releaseConfirmedAt && next.receiveConfirmedAt);
    const saved: CustodyChallenge = complete ? { ...next, status: "confirmed" } : next;
    if (!await tx.saveChallenge(saved, challenge.version)) return { ok: false, reason: "CONFLICT" };
    await tx.appendCustodyEvent({ challengeId: challenge.id, missionId: challenge.missionId, legId: challenge.legId,
      actorId: input.actorId, type: complete ? "custody.handover_confirmed" :
        input.actorId === challenge.releasingActorId ? "custody.release_confirmed" : "custody.receive_confirmed",
      occurredAt: input.now });
    return { ok: true, challenge: { ...saved, tokenHash: "[redacted]" } };
  });
}


/** Scheduled cleanup: expire stale pending challenges so they cannot block a fresh handover. */
export async function expireCustodyChallenges(input: {
  readonly repository: CustodyRepository; readonly now: string; readonly batchSize?: number;
}): Promise<number> {
  const now = Date.parse(input.now), limit = input.batchSize ?? 100;
  if (!Number.isFinite(now) || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
    throw new Error("Invalid custody expiry batch");
  return input.repository.transaction(async (tx) => {
    const expired = await tx.expireChallenges(input.now, limit);
    for (const challenge of expired) await tx.appendCustodyEvent({ challengeId: challenge.id,
      missionId: challenge.missionId, legId: challenge.legId,
      actorId: "00000000-0000-0000-0000-000000000000", type: "custody.challenge_expired", occurredAt: input.now });
    return expired.length;
  });
}
