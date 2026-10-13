import assert from "node:assert/strict";
import test from "node:test";
import { checkAwsCodePlan } from "./check-aws-code-plan.mjs";

function plan(overrides = {}) {
  return { resource_changes: [{
    address: "aws_lambda_function.api", type: "aws_lambda_function", mode: "managed",
    change: {
      actions: ["update"],
      before: { function_name: "inspectiq-api", source_code_hash: "before", role: "unchanged", environment: { variables: { PRIVATE_SETTING: "kept" } } },
      after: { function_name: "inspectiq-api", source_code_hash: "after", role: "unchanged", environment: { variables: { PRIVATE_SETTING: "kept" } } },
      ...overrides
    }
  }] };
}

test("permits only existing in-place Lambda code updates", () => {
  assert.deepEqual(checkAwsCodePlan(plan()), ["aws_lambda_function.api"]);
});
test("permits no-op resources and data-source reads", () => {
  assert.deepEqual(checkAwsCodePlan({ resource_changes: [
    { address: "aws_s3_bucket.images", change: { actions: ["no-op"] } },
    { address: "data.aws_caller_identity.current", mode: "data", change: { actions: ["read"] } }
  ] }), []);
});
for (const actions of [["create"], ["delete"], ["delete", "create"]]) {
  test(`rejects ${actions.join("/")} actions`, () => assert.throws(() => checkAwsCodePlan(plan({ actions })), /Unexpected resource action/));
}
test("rejects unexpected resources", () => {
  const changed = plan(); changed.resource_changes[0].address = "aws_dynamodb_table.operations";
  assert.throws(() => checkAwsCodePlan(changed), /Unexpected resource action/);
});
test("rejects role, environment and function identity changes without printing values", () => {
  for (const change of [
    { role: "private-role-value" },
    { environment: { variables: { PRIVATE_SETTING: "private-secret-value" } } },
    { function_name: "other-function" }
  ]) {
    const changed = plan(); Object.assign(changed.resource_changes[0].change.after, change);
    assert.throws(() => checkAwsCodePlan(changed), (error) => !error.message.includes("private-") && /Unexpected/.test(error.message));
  }
});
test("rejects an invalid or unknown configuration plan", () => {
  assert.throws(() => checkAwsCodePlan({}), /missing/);
  assert.throws(() => checkAwsCodePlan(plan({ after_unknown: { environment: true } })), /Unexpected configuration/);
  assert.throws(() => checkAwsCodePlan(plan({ after_unknown: { environment: { variables: { PRIVATE_SETTING: true } } } })), /Unexpected configuration/);
});
