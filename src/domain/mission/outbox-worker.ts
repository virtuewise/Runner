export interface OutboxMessage {
  readonly id: string; readonly aggregateId: string; readonly eventType: string;
  readonly payload: Readonly<Record<string, unknown>>; readonly attempts: number;
}
export interface OutboxStore {
  claimBatch(input: { now: string; limit: number; leaseSeconds: number }): Promise<readonly OutboxMessage[]>;
  markPublished(input: { id: string; publishedAt: string }): Promise<void>;
  scheduleRetry(input: { id: string; availableAt: string; errorCode: string }): Promise<void>;
  moveToDeadLetter(input: { id: string; failedAt: string; errorCode: string }): Promise<void>;
}
export interface OutboxPublisher { publish(message: OutboxMessage): Promise<void>; }
export interface OutboxPolicy {
  readonly batchSize: number; readonly leaseSeconds: number; readonly maxAttempts: number;
  readonly baseBackoffSeconds: number; readonly maxBackoffSeconds: number;
}
export interface OutboxBatchResult {
  readonly claimed: number; readonly published: number; readonly retried: number; readonly deadLettered: number;
}
export async function processOutboxBatch(input: {
  store: OutboxStore; publisher: OutboxPublisher; policy: OutboxPolicy; now: string;
}): Promise<OutboxBatchResult> {
  const now = Date.parse(input.now), p = input.policy;
  if (!Number.isFinite(now) || !Number.isSafeInteger(p.batchSize) || p.batchSize < 1 || p.batchSize > 500 ||
      !Number.isSafeInteger(p.leaseSeconds) || p.leaseSeconds < 5 ||
      !Number.isSafeInteger(p.maxAttempts) || p.maxAttempts < 1 ||
      !Number.isSafeInteger(p.baseBackoffSeconds) || p.baseBackoffSeconds < 1 ||
      !Number.isSafeInteger(p.maxBackoffSeconds) || p.maxBackoffSeconds < p.baseBackoffSeconds)
    throw new Error("Invalid outbox worker policy");
  const messages = await input.store.claimBatch({ now: input.now, limit: p.batchSize, leaseSeconds: p.leaseSeconds });
  let published = 0, retried = 0, deadLettered = 0;
  for (const message of messages) {
    try {
      await input.publisher.publish(message);
      await input.store.markPublished({ id: message.id, publishedAt: input.now });
      published += 1;
    } catch {
      const attempts = message.attempts;
      if (attempts >= p.maxAttempts) {
        await input.store.moveToDeadLetter({ id: message.id, failedAt: input.now, errorCode: "publisher_failed" });
        deadLettered += 1;
      } else {
        const delay = Math.min(p.maxBackoffSeconds, p.baseBackoffSeconds * 2 ** Math.min(attempts - 1, 20));
        await input.store.scheduleRetry({ id: message.id, availableAt: new Date(now + delay * 1000).toISOString(),
          errorCode: "publisher_failed" });
        retried += 1;
      }
    }
  }
  return { claimed: messages.length, published, retried, deadLettered };
}
