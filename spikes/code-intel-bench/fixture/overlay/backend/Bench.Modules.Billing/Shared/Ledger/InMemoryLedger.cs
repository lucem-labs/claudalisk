namespace Bench.Modules.Billing.Shared.Ledger;

internal sealed class InMemoryLedger : ILedger
{
    private readonly List<(string Account, decimal Amount)> entries = [];

    public IReadOnlyList<(string Account, decimal Amount)> Entries => entries;

    public void Record(string account, decimal amount) => entries.Add((account, amount));
}
