export interface TextOverflowMeasurements {
  readonly clientHeight: number;
  readonly clientWidth: number;
  readonly scrollHeight: number;
  readonly scrollWidth: number;
}

const overflowMeasurementTolerancePx = 1;

export function isTextOverflowing(
  measurements: TextOverflowMeasurements
): boolean {
  return (
    measurements.scrollWidth - measurements.clientWidth >
      overflowMeasurementTolerancePx ||
    measurements.scrollHeight - measurements.clientHeight >
      overflowMeasurementTolerancePx
  );
}
