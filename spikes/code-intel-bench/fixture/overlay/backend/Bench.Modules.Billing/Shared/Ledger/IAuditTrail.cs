namespace Bench.Modules.Billing.Shared.Ledger;

internal interface IAuditTrail
{
    void Record(string account, decimal amount);
}
