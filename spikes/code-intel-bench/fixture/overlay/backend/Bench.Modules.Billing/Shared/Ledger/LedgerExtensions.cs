namespace Bench.Modules.Billing.Shared.Ledger;

internal static class LedgerExtensions
{
    public static void RecordAll(this ILedger ledger, IEnumerable<(string Account, decimal Amount)> entries)
    {
        foreach (var (account, amount) in entries)
        {
            ledger.Record(account, amount);
        }
    }

    public static void RecordAll(this IAuditTrail audit, IEnumerable<(string Account, decimal Amount)> entries)
    {
        foreach (var (account, amount) in entries)
        {
            audit.Record(account, amount);
        }
    }
}
