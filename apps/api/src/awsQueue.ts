import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { Actor } from "./domain.js";

const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
const sqs = new SQSClient({ region });

export type ImageAnalysisMessage = {
  jobId?: string;
  jobIds?: string[];
  photoId: string;
  inspectionId: string;
  actor: Actor;
};

export async function sendImageAnalysisMessage(message: ImageAnalysisMessage): Promise<void> {
  if (!process.env.IMAGE_ANALYSIS_QUEUE_URL) {
    throw new Error("IMAGE_ANALYSIS_QUEUE_URL is required when IMAGE_ANALYSIS_MODE=queue.");
  }
  await sqs.send(new SendMessageCommand({
    QueueUrl: process.env.IMAGE_ANALYSIS_QUEUE_URL,
    MessageBody: JSON.stringify(message),
    MessageAttributes: {
      jobId: { DataType: "String", StringValue: message.jobId ?? message.jobIds?.join(",") ?? "batch" },
      inspectionId: { DataType: "String", StringValue: message.inspectionId }
    }
  }));
}
