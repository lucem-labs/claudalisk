namespace Bench.Modules.Billing.Shared.Ledger;

internal sealed class PostingContext(ILedger ledger, IAuditTrail audit)
{
    public ILedger Ledger { get; } = ledger;

    public IAuditTrail Audit { get; } = audit;
}
