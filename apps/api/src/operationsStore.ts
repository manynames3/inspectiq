import {
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
  TransactWriteItemsCommand,
  type AttributeValue
} from "@aws-sdk/client-dynamodb";
import { costGuardReached } from "./errors.js";

export type BedrockUsageKind = "imageAnalyses" | "reportDrafts";

type MonthlyUsage = {
  month: string;
  imageAnalyses: number;
  reportDrafts: number;
};

const localReservations = new Set<string>();
const localUsage = new Map<string, MonthlyUsage>();
let client: DynamoDBClient | null = null;

function monthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function tableName(): string | null {
  return process.env.OPERATIONS_TABLE_NAME?.trim() || null;
}

function dynamo(): DynamoDBClient {
  client ??= new DynamoDBClient({ region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1" });
  return client;
}

function monthlyLimit(kind: BedrockUsageKind): number {
  const key = kind === "imageAnalyses" ? "BEDROCK_MONTHLY_IMAGE_LIMIT" : "BEDROCK_MONTHLY_REPORT_LIMIT";
  const fallback = kind === "imageAnalyses" ? 250 : 50;
  const value = Number(process.env[key] ?? fallback);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function numberValue(value: AttributeValue | undefined): number {
  return value && "N" in value ? Number(value.N ?? 0) : 0;
}

function reserveLocally(kind: BedrockUsageKind, idempotencyKey: string): MonthlyUsage {
  const month = monthKey();
  const reservation = `${month}:${kind}:${idempotencyKey}`;
  const usage = localUsage.get(month) ?? { month, imageAnalyses: 0, reportDrafts: 0 };
  if (localReservations.has(reservation)) return usage;
  const limit = monthlyLimit(kind);
  if (usage[kind] >= limit) throw costGuardReached(kind === "imageAnalyses" ? "Image analysis" : "Report drafting", limit);
  usage[kind] += 1;
  localReservations.add(reservation);
  localUsage.set(month, usage);
  return usage;
}

export async function reserveBedrockUsage(kind: BedrockUsageKind, idempotencyKey: string): Promise<MonthlyUsage> {
  const table = tableName();
  if (!table) return reserveLocally(kind, idempotencyKey);
  const month = monthKey();
  const reservationKey = `${month}:${kind}:${idempotencyKey}`;
  const limit = monthlyLimit(kind);
  const expiresAt = Math.floor(Date.now() / 1000) + 45 * 24 * 60 * 60;
  try {
    await dynamo().send(new TransactWriteItemsCommand({
      TransactItems: [
        {
          Put: {
            TableName: table,
            Item: {
              pk: { S: `USAGE#${reservationKey}` },
              sk: { S: "RESERVATION" },
              kind: { S: kind },
              expiresAt: { N: String(expiresAt) }
            },
            ConditionExpression: "attribute_not_exists(pk)"
          }
        },
        {
          Update: {
            TableName: table,
            Key: { pk: { S: `COST#${month}` }, sk: { S: "BEDROCK" } },
            UpdateExpression: "ADD #counter :one SET updatedAt = :updatedAt, gsi1pk = :gsi1pk, gsi1sk = :gsi1sk",
            ConditionExpression: "attribute_not_exists(#counter) OR #counter < :limit",
            ExpressionAttributeNames: { "#counter": kind },
            ExpressionAttributeValues: {
              ":one": { N: "1" },
              ":limit": { N: String(limit) },
              ":updatedAt": { S: new Date().toISOString() },
              ":gsi1pk": { S: "COST" },
              ":gsi1sk": { S: month }
            }
          }
        }
      ]
    }));
  } catch (error) {
    const existing = await dynamo().send(new GetItemCommand({
      TableName: table,
      Key: { pk: { S: `USAGE#${reservationKey}` }, sk: { S: "RESERVATION" } },
      ConsistentRead: true
    }));
    if (!existing.Item) {
      throw costGuardReached(kind === "imageAnalyses" ? "Image analysis" : "Report drafting", limit);
    }
  }
  return getMonthlyBedrockUsage();
}

export async function getMonthlyBedrockUsage(): Promise<MonthlyUsage> {
  const month = monthKey();
  const table = tableName();
  if (!table) return localUsage.get(month) ?? { month, imageAnalyses: 0, reportDrafts: 0 };
  const result = await dynamo().send(new GetItemCommand({
    TableName: table,
    Key: { pk: { S: `COST#${month}` }, sk: { S: "BEDROCK" } }
  }));
  return {
    month,
    imageAnalyses: numberValue(result.Item?.imageAnalyses),
    reportDrafts: numberValue(result.Item?.reportDrafts)
  };
}

export async function listRecentOperationalEvents(limit = 20): Promise<Array<Record<string, unknown>>> {
  const table = tableName();
  if (!table) return [];
  const result = await dynamo().send(new QueryCommand({
    TableName: table,
    IndexName: "gsi1",
    KeyConditionExpression: "gsi1pk = :pk",
    ExpressionAttributeValues: { ":pk": { S: "OPS" } },
    ScanIndexForward: false,
    Limit: limit
  }));
  return (result.Items ?? []).map((item) => ({
    eventId: item.eventId && "S" in item.eventId ? item.eventId.S : null,
    eventType: item.eventType && "S" in item.eventType ? item.eventType.S : null,
    inspectionId: item.inspectionId && "S" in item.inspectionId ? item.inspectionId.S : null,
    occurredAt: item.occurredAt && "S" in item.occurredAt ? item.occurredAt.S : null,
    correlationId: item.correlationId && "S" in item.correlationId ? item.correlationId.S : null
  }));
}

export async function getOperationalProjectionHealth(): Promise<Record<string, unknown>> {
  const table = tableName();
  if (!table) {
    return {
      configured: false,
      projectedCount: 0,
      duplicateCount: 0,
      lastEventId: null,
      lastEventType: null,
      lastCorrelationId: null,
      lastProjectedAt: null,
      lastDuplicateEventId: null,
      lastDuplicateAt: null
    };
  }
  const result = await dynamo().send(new GetItemCommand({
    TableName: table,
    Key: { pk: { S: "PROJECTOR#HEALTH" }, sk: { S: "STATE" } },
    ConsistentRead: true
  }));
  const stringValue = (key: string): string | null => {
    const value = result.Item?.[key];
    return value && "S" in value ? value.S ?? null : null;
  };
  return {
    configured: true,
    projectedCount: numberValue(result.Item?.projectedCount),
    duplicateCount: numberValue(result.Item?.duplicateCount),
    lastEventId: stringValue("lastEventId"),
    lastEventType: stringValue("lastEventType"),
    lastCorrelationId: stringValue("lastCorrelationId"),
    lastProjectedAt: stringValue("lastProjectedAt"),
    lastDuplicateEventId: stringValue("lastDuplicateEventId"),
    lastDuplicateAt: stringValue("lastDuplicateAt")
  };
}
