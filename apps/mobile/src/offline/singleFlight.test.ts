import { createSingleFlight } from "./singleFlight";

describe("single-flight operations", () => {
  it("shares an active operation instead of starting a duplicate", async () => {
    let complete: (value: string) => void = () => { throw new Error("operation did not start"); };
    const firstOperation = jest.fn(() => new Promise<string>((resolve) => { complete = resolve; }));
    const secondOperation = jest.fn(async () => "second");
    const run = createSingleFlight<string>();

    const first = run(firstOperation);
    const second = run(secondOperation);

    expect(first).toBe(second);
    await Promise.resolve();
    expect(firstOperation).toHaveBeenCalledTimes(1);
    expect(secondOperation).not.toHaveBeenCalled();
    complete("uploaded");
    await expect(first).resolves.toBe("uploaded");
  });

  it("allows a later operation after failure", async () => {
    const run = createSingleFlight<string>();

    await expect(run(async () => { throw new Error("network unavailable"); })).rejects.toThrow("network unavailable");
    await expect(run(async () => "retried")).resolves.toBe("retried");
  });
});
