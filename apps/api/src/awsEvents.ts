import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { DeleteMessageBatchCommand, GetQueueAttributesCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { DomainEventV1Schema } from "@inspectiq/shared";
import type { MemoryStore } from "./store.js";
import { emitMetric } from "./metrics.js";

let client: EventBridgeClient | null = null;
let sqsClient: SQSClient | null = null;

function eventBridge(): EventBridgeClient {
  client ??= new EventBridgeClient({ region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1" });
  return client;
}

function sqs(): SQSClient {
  sqsClient ??= new SQSClient({ region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1" });
  return sqsClient;
}

export async function flushPendingDomainEvents(store: MemoryStore, eventIds?: string[]): Promise<{ delivered: number; failed: number }> {
  const candidates = store.pendingDomainEvents()
    .filter((event) => !eventIds || eventIds.includes(event.id));
  if (candidates.length === 0) {
    emitMetric("PendingOutboxAgeSeconds", 0);
    return { delivered: 0, failed: 0 };
  }
  const busName = process.env.DOMAIN_EVENT_BUS_NAME?.trim();
  if (!busName) {
    for (const event of candidates) {
      event.status = "delivered";
      event.deliveredAt = new Date().toISOString();
      event.lastError = null;
    }
    emitMetric("PendingOutboxAgeSeconds", 0);
    return { delivered: candidates.length, failed: 0 };
  }

  let delivered = 0;
  let failed = 0;
  for (let index = 0; index < candidates.length; index += 10) {
    const batch = candidates.slice(index, index + 10);
    for (const event of batch) event.deliveryAttempts += 1;
    try {
      const response = await eventBridge().send(new PutEventsCommand({
        Entries: batch.map((event) => ({
          EventBusName: busName,
          Source: process.env.DOMAIN_EVENT_SOURCE ?? "inspectiq.api",
          DetailType: event.eventType,
          Time: new Date(event.createdAt),
          Detail: JSON.stringify(DomainEventV1Schema.parse({
            eventId: event.id,
            eventType: event.eventType,
            schemaVersion: event.schemaVersion,
            occurredAt: event.createdAt,
            inspectionId: event.inspectionId,
            actor: { id: event.actorId, role: event.actorRole },
            correlationId: event.correlationId,
            payload: event.payloadJson
          }))
        }))
      }));
      batch.forEach((event, batchIndex) => {
        const entry = response.Entries?.[batchIndex];
        if (entry?.ErrorCode) {
          event.status = "failed";
          event.lastError = `${entry.ErrorCode}: ${entry.ErrorMessage ?? "EventBridge rejected the event."}`;
          failed += 1;
        } else {
          event.status = "delivered";
          event.deliveredAt = new Date().toISOString();
          event.lastError = null;
          delivered += 1;
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "EventBridge delivery failed.";
      for (const event of batch) {
        event.status = "failed";
        event.lastError = message;
        failed += 1;
      }
    }
  }
  const pending = store.pendingDomainEvents();
  const oldestAgeSeconds = pending.length
    ? Math.max(0, Math.floor((Date.now() - Date.parse(pending[0]!.createdAt)) / 1000))
    : 0;
  emitMetric("PendingOutboxAgeSeconds", oldestAgeSeconds);
  if (failed > 0) emitMetric("DomainEventDeliveryFailures", failed);
  return { delivered, failed };
}

export async function domainEventDlqHealth(): Promise<{ configured: boolean; visibleMessages: number }> {
  const queueUrl = process.env.DOMAIN_EVENT_DLQ_URL?.trim();
  if (!queueUrl) return { configured: false, visibleMessages: 0 };
  const response = await sqs().send(new GetQueueAttributesCommand({
    QueueUrl: queueUrl,
    AttributeNames: ["ApproximateNumberOfMessages"]
  }));
  return {
    configured: true,
    visibleMessages: Number(response.Attributes?.ApproximateNumberOfMessages ?? 0)
  };
}

export async function replayDomainEventDlq(maxMessages = 10): Promise<{ received: number; replayed: number; failed: number }> {
  const queueUrl = process.env.DOMAIN_EVENT_DLQ_URL?.trim();
  const busName = process.env.DOMAIN_EVENT_BUS_NAME?.trim();
  if (!queueUrl || !busName) throw new Error("Domain event DLQ replay is not configured.");
  const response = await sqs().send(new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: Math.min(Math.max(maxMessages, 1), 10),
    VisibilityTimeout: 60,
    WaitTimeSeconds: 0
  }));
  const messages = response.Messages ?? [];
  const deleted: Array<{ Id: string; ReceiptHandle: string }> = [];
  let replayed = 0;
  let failed = 0;
  for (const [index, message] of messages.entries()) {
    try {
      const original = JSON.parse(message.Body ?? "{}") as {
        source?: string;
        "detail-type"?: string;
        detail?: unknown;
        time?: string;
      };
      DomainEventV1Schema.parse(typeof original.detail === "string" ? JSON.parse(original.detail) : original.detail);
      const put = await eventBridge().send(new PutEventsCommand({
        Entries: [{
          EventBusName: busName,
          Source: original.source ?? process.env.DOMAIN_EVENT_SOURCE ?? "inspectiq.replay",
          DetailType: original["detail-type"] ?? "domain.event.replayed",
          Time: original.time ? new Date(original.time) : new Date(),
          Detail: typeof original.detail === "string" ? original.detail : JSON.stringify(original.detail)
        }]
      }));
      if (put.FailedEntryCount || put.Entries?.[0]?.ErrorCode) throw new Error(put.Entries?.[0]?.ErrorMessage ?? "EventBridge rejected the replay.");
      if (message.ReceiptHandle) deleted.push({ Id: String(index), ReceiptHandle: message.ReceiptHandle });
      replayed += 1;
    } catch {
      failed += 1;
    }
  }
  if (deleted.length > 0) {
    await sqs().send(new DeleteMessageBatchCommand({ QueueUrl: queueUrl, Entries: deleted }));
  }
  return { received: messages.length, replayed, failed };
}
