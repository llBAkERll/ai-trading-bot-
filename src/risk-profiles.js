const profiles = {
  safest: {
    label: "Safest",
    minLiquidityUsd: 25000,
    minVolume24hUsd: 100000,
    reserveCashPct: 65,
    maxBalanceAllocationPct: 1,
    maxDeployedPct: 15,
    takeProfitPct: 2.5,
    quickProfitPct: 1.2,
    stopLossPct: 12,
    earlyRugExitPct: 4,
    trailingStopPct: 2.2,
    minNetProfitPct: 0.6,
    lossCooldownMinutes: 720
  },
  moderate: {
    label: "Moderate",
    minLiquidityUsd: 10000,
    minVolume24hUsd: 50000,
    reserveCashPct: 45,
    maxBalanceAllocationPct: 2,
    maxDeployedPct: 30,
    takeProfitPct: 4,
    quickProfitPct: 1.5,
    stopLossPct: 20,
    earlyRugExitPct: 7,
    trailingStopPct: 4,
    minNetProfitPct: 0.8,
    lossCooldownMinutes: 480
  },
  aggressive: {
    label: "Aggressive",
    minLiquidityUsd: 5000,
    minVolume24hUsd: 25000,
    reserveCashPct: 25,
    maxBalanceAllocationPct: 3.5,
    maxDeployedPct: 50,
    takeProfitPct: 7,
    quickProfitPct: 2,
    stopLossPct: 30,
    earlyRugExitPct: 10,
    trailingStopPct: 6,
    minNetProfitPct: 1,
    lossCooldownMinutes: 360
  }
};

export function riskProfile(level = "moderate") {
  return profiles[level] || profiles.moderate;
}

export function applyRiskProfile(config, level = "moderate") {
  return {
    ...config,
    riskLevel: profiles[level] ? level : "moderate",
    ...riskProfile(level)
  };
}

export function listRiskProfiles() {
  return profiles;
}
