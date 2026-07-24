import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("@aws-sdk/client-dynamodb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-dynamodb")>();
  return {
    ...actual,
    DynamoDBClient: vi.fn(() => ({ send: sendMock }))
  };
});

import {
  claimInspectionOperation,
  completeInspectionOperation,
  failInspectionOperation,
  reserveBedrockUsage
} from "./operationsStore.js";

function key(command: unknown): string {
  const input = (command as { input?: { Key?: { pk?: { S?: string } } } }).input;
  return input?.Key?.pk?.S ?? "";
}

describe("reserveBedrockUsage", () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.OPERATIONS_TABLE_NAME = "inspectiq-operations-test";
    process.env.BEDROCK_MONTHLY_IMAGE_LIMIT = "250";
  });

  it("does not misclassify an infrastructure authorization failure as a spent budget", async () => {
    const denied = Object.assign(new Error("not authorized to perform dynamodb:PutItem"), { name: "AccessDeniedException" });
    sendMock.mockImplementation(async (command) => {
      const commandName = command?.constructor?.name;
      if (commandName === "TransactWriteItemsCommand") throw denied;
      if (key(command).startsWith("USAGE#")) return {};
      if (key(command).startsWith("COST#")) return { Item: { imageAnalyses: { N: "1" } } };
      throw new Error(`Unexpected command: ${commandName}`);
    });

    await expect(reserveBedrockUsage("imageAnalyses", "iam-regression")).rejects.toBe(denied);
  });

  it("returns COST_GUARD_REACHED only when the configured counter is at its limit", async () => {
    sendMock.mockImplementation(async (command) => {
      const commandName = command?.constructor?.name;
      if (commandName === "TransactWriteItemsCommand") throw new Error("transaction cancelled");
      if (key(command).startsWith("USAGE#")) return {};
      if (key(command).startsWith("COST#")) return { Item: { imageAnalyses: { N: "250" } } };
      throw new Error(`Unexpected command: ${commandName}`);
    });

    await expect(reserveBedrockUsage("imageAnalyses", "quota-regression")).rejects.toMatchObject({
      status: 429,
      code: "COST_GUARD_REACHED"
    });
  });

  it("treats an existing reservation as an idempotent retry", async () => {
    sendMock.mockImplementation(async (command) => {
      const commandName = command?.constructor?.name;
      if (commandName === "TransactWriteItemsCommand") throw new Error("transaction cancelled");
      if (key(command).startsWith("USAGE#")) return { Item: { pk: { S: key(command) } } };
      if (key(command).startsWith("COST#")) return { Item: { imageAnalyses: { N: "2" } } };
      throw new Error(`Unexpected command: ${commandName}`);
    });

    await expect(reserveBedrockUsage("imageAnalyses", "duplicate-regression")).resolves.toMatchObject({
      imageAnalyses: 2
    });
  });

  it("retries transient transaction conflicts without losing the reservation", async () => {
    let transactionAttempts = 0;
    sendMock.mockImplementation(async (command) => {
      const commandName = command?.constructor?.name;
      if (commandName === "TransactWriteItemsCommand") {
        transactionAttempts += 1;
        if (transactionAttempts < 3) {
          throw Object.assign(
            new Error("Transaction cancelled [None, TransactionConflict]"),
            { name: "TransactionCanceledException" }
          );
        }
        return {};
      }
      if (key(command).startsWith("COST#")) return { Item: { imageAnalyses: { N: "3" } } };
      throw new Error(`Unexpected command: ${commandName}`);
    });

    await expect(reserveBedrockUsage("imageAnalyses", "conflict-regression")).resolves.toMatchObject({
      imageAnalyses: 3
    });
    expect(transactionAttempts).toBe(3);
  });
});

describe("inspection operation idempotency", () => {
  it("claims once, reports in-flight retries, and replays the completed result", async () => {
    delete process.env.OPERATIONS_TABLE_NAME;
    const inspectionId = "inspection-idempotency-test";
    const operationKey = "inspection-idempotency-test:report:abc123";

    await expect(claimInspectionOperation(inspectionId, "report", operationKey)).resolves.toEqual({
      status: "claimed"
    });
    await expect(claimInspectionOperation(inspectionId, "report", operationKey)).resolves.toEqual({
      status: "in_progress"
    });

    await completeInspectionOperation(inspectionId, "report", operationKey, "report-job-1");
    await expect(claimInspectionOperation(inspectionId, "report", operationKey)).resolves.toEqual({
      status: "completed",
      resultId: "report-job-1"
    });
  });

  it("allows a failed operation to be claimed again", async () => {
    delete process.env.OPERATIONS_TABLE_NAME;
    const inspectionId = "inspection-failed-idempotency-test";
    const operationKey = "inspection-failed-idempotency-test:report:def456";

    await claimInspectionOperation(inspectionId, "report", operationKey);
    await failInspectionOperation(inspectionId, "report", operationKey, "Provider timeout");

    await expect(claimInspectionOperation(inspectionId, "report", operationKey)).resolves.toEqual({
      status: "claimed"
    });
  });
});
