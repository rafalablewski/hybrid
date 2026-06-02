import { prisma } from "@/lib/db";
import { PRIOR_COEFFS, RISK_MODEL_VERSION, type CalibrationCoeffs } from "@hybrid/core";

// The live injury calibration: the latest persisted ModelFit, or the prior.
// computeInjuryRisk applies these coefficients everywhere injury risk is read.
export async function activeCalibration(): Promise<{ coeffs: CalibrationCoeffs; version: string; n: number }> {
  const fit = await prisma.modelFit.findFirst({
    where: { key: "injury-calibration" },
    orderBy: { createdAt: "desc" },
  });
  if (!fit) return { coeffs: PRIOR_COEFFS, version: RISK_MODEL_VERSION, n: 0 };
  return { coeffs: { intercept: fit.intercept, slope: fit.slope }, version: fit.version, n: fit.n };
}
