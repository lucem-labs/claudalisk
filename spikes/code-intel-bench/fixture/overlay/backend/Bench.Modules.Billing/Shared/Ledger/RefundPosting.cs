namespace Bench.Modules.Billing.Shared.Ledger;

internal sealed class RefundPosting(Func<ILedger> resolve, IReadOnlyList<IAuditTrail> trails, Lazy<ILedger> deferred, ILedger? optional)
{
    public void Refund(string account, decimal amount)
    {
        resolve().Record(account, -amount);
        trails.ToList().ForEach(trail => trail.Record(account, -amount));
    }

    public void Defer(string account, decimal amount)
    {
        deferred.Value.Record(account, -amount);
        optional?.Record(account, -amount);
    }
}
