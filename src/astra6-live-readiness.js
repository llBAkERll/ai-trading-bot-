// Live trading is intentionally fail-closed until an audited execution adapter exists.
// A Phantom browser connection alone does not authorize unattended trading.
export function liveReadiness(env=process.env) {
 const checks={
  executionAdapterInstalled:false,
  persistentKeyCustodyConfigured:false,
  transactionSimulationAndConfirmation:false,
  feeAndRentReserveValidated:false,
  restartRecoveryAndIdempotency:false,
  manualKillSwitchVerified:false,
  tradeReconciliationVerified:false,
  paperValidationComplete:false
 };
 return {mode:"live",enabled:false,checks,ready:false,reason:"Real-money trading is locked until the execution and safety checks are implemented and verified. Paper trading remains available."};
}
export function assertLiveReady() {throw new Error("Live trading is disabled: no audited execution adapter is installed.");}
