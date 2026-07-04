import { execFileSync } from "node:child_process";

const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
const projectName = process.env.PROJECT_NAME ?? "inspectiq";

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", options.allowFailure ? "ignore" : "pipe"]
  }).trim();
}

function json(command, args, options = {}) {
  const output = run(command, args, options);
  return output ? JSON.parse(output) : null;
}

function terraformOutputs() {
  return json("terraform", ["-chdir=infra/terraform", "output", "-json"]);
}

async function health(apiEndpoint) {
  const response = await fetch(`${apiEndpoint}/api/health`);
  return {
    ok: response.ok,
    status: response.status,
    body: response.ok ? await response.json() : await response.text()
  };
}

function alarmSummary() {
  const alarmNames = [
    `${projectName}-api-errors`,
    `${projectName}-worker-errors`,
    `${projectName}-image-dlq-visible`,
    `${projectName}-image-queue-age`,
    `${projectName}-api-p95-latency`
  ];
  const response = json("aws", [
    "cloudwatch",
    "describe-alarms",
    "--region",
    region,
    "--alarm-names",
    ...alarmNames,
    "--output",
    "json"
  ]);
  return (response?.MetricAlarms ?? []).map((alarm) => ({
    name: alarm.AlarmName,
    state: alarm.StateValue,
    reason: alarm.StateReason
  }));
}

function queueAttributes(queueUrl) {
  const response = json("aws", [
    "sqs",
    "get-queue-attributes",
    "--region",
    region,
    "--queue-url",
    queueUrl,
    "--attribute-names",
    "ApproximateNumberOfMessages",
    "ApproximateNumberOfMessagesNotVisible",
    "ApproximateNumberOfMessagesDelayed",
    "--output",
    "json"
  ]);
  return response?.Attributes ?? {};
}

function dlqUrl() {
  return run("aws", [
    "sqs",
    "get-queue-url",
    "--region",
    region,
    "--queue-name",
    `${projectName}-image-analysis-dlq`,
    "--query",
    "QueueUrl",
    "--output",
    "text"
  ]);
}

const outputs = terraformOutputs();
const apiEndpoint = outputs.api_endpoint.value;
const queueUrl = outputs.image_analysis_queue_url.value;
const dlq = dlqUrl();
const dashboardUrl = `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#dashboards:name=${projectName}-ops`;

console.log(JSON.stringify({
  region,
  apiEndpoint,
  health: await health(apiEndpoint),
  serviceLevelObjectives: [
    "Image analysis success >= 99%",
    "Retake precision >= 80% before model/prompt promotion",
    "Pending AI suggestions reviewed during the same inspection workflow",
    "Final report release >= 95% after reviewer approval"
  ],
  alarms: alarmSummary(),
  queues: {
    imageAnalysis: queueAttributes(queueUrl),
    deadLetter: queueAttributes(dlq)
  },
  failedJobRecovery: [
    "Open the affected inspection audit trail and identify image_analysis.failed or dead_letter.",
    "If the object/prompt/provider issue is fixed, retry the photo analysis job from the inspection workbench.",
    "If image quality caused the failure, request a retake before CR/VDP release.",
    "Confirm readiness blockers clear before grading, report generation, and finalization."
  ],
  dashboardUrl
}, null, 2));
