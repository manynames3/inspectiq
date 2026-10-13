import { pathToFileURL } from "node:url";

const functions = new Map([
  ["aws_lambda_function.api", "inspectiq-api"],
  ["aws_lambda_function.image_worker", "inspectiq-image-worker"],
  ["aws_lambda_function.operations_projector", "inspectiq-operations-projector"]
]);
const codeAttributes = new Set([
  "source_code_hash", "last_modified", "source_code_size",
  "qualified_arn", "qualified_invoke_arn", "version"
]);
const hasUnknown = (value) => value === true || (value !== null && typeof value === "object" && Object.values(value).some(hasUnknown));

export function checkAwsCodePlan(plan) {
  if (!Array.isArray(plan?.resource_changes)) throw new Error("Terraform resource_changes are missing.");
  const updates = [];
  for (const resource of plan.resource_changes) {
    const change = resource.change;
    if (JSON.stringify(change?.actions) === '["no-op"]') continue;
    if (resource.mode === "data" && JSON.stringify(change?.actions) === '["read"]') continue;
    const expectedName = functions.get(resource.address);
    if (!expectedName || resource.type !== "aws_lambda_function" || JSON.stringify(change?.actions) !== '["update"]') {
      throw new Error(`Unexpected resource action: ${resource.address}. Review infrastructure changes separately.`);
    }
    if (change.before?.function_name !== expectedName || change.after?.function_name !== expectedName) {
      throw new Error(`Unexpected function identity: ${resource.address}.`);
    }
    for (const key of new Set([...Object.keys(change.before ?? {}), ...Object.keys(change.after ?? {}), ...Object.keys(change.after_unknown ?? {})])) {
      if (codeAttributes.has(key)) continue;
      if (hasUnknown(change.after_unknown?.[key]) || JSON.stringify(change.before?.[key]) !== JSON.stringify(change.after?.[key])) {
        throw new Error(`Unexpected configuration change: ${resource.address}.${key}.`);
      }
    }
    updates.push(resource.address);
  }
  return updates;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    const updates = checkAwsCodePlan(JSON.parse(input));
    console.log(JSON.stringify({ ok: true, codeOnlyUpdates: updates }));
  } catch (error) {
    // Report field names only; Terraform JSON may contain sensitive values.
    console.error(`[inspectiq-aws-plan] ${error instanceof Error ? error.message : "Invalid plan"}`);
    process.exitCode = 1;
  }
}
