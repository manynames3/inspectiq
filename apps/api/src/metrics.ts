export function emitMetric(
  name: string,
  value: number,
  dimensions: Record<string, string> = {}
): void {
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") return;
  const dimensionNames = Object.keys(dimensions);
  console.log(JSON.stringify({
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [{
        Namespace: "InspectIQ",
        Dimensions: dimensionNames.length ? [dimensionNames] : [[]],
        Metrics: [{ Name: name, Unit: name.endsWith("Seconds") ? "Seconds" : "Count" }]
      }]
    },
    ...dimensions,
    [name]: value
  }));
}
