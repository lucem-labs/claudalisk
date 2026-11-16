namespace Bench.Modules.Billing.Shared.Ledger;

internal sealed class InvoicePosting(ILedger ledger, IAuditTrail audit)
{
    public void Post(string account, decimal amount)
    {
        ledger.Record(account, amount);
        audit.Record(account, amount);
        Metrics.Record(account, amount);
    }
}
