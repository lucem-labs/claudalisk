namespace Bench.Modules.Billing.Shared.Ledger;

internal sealed class InMemoryAuditTrail : IAuditTrail
{
    private readonly List<string> lines = [];

    public IReadOnlyList<string> Lines => lines;

    public void Record(string account, decimal amount) => lines.Add($"{account}:{amount}");
}
