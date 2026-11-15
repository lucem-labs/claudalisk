namespace Bench.Modules.Billing.Shared.Ledger;

internal interface ILedger
{
    void Record(string account, decimal amount);
}
