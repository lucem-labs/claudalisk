namespace Bench.Modules.Billing.Shared.Ledger;

internal sealed class PostingBatch(PostingContext context, Func<string, ILedger> factory)
{
    private readonly List<(string Account, decimal Amount)> pending = [];

    public void Add(string account, decimal amount) => pending.Add((account, amount));

    public void Flush()
    {
        foreach (var (account, amount) in pending)
        {
            context.Ledger.Record(account, amount);
            context.Audit.Record(account, amount);
        }

        pending.Clear();
    }

    public void FlushTo(string name)
    {
        var target = factory(name);
        foreach (var (account, amount) in pending)
        {
            target.Record(account, amount);
        }

        pending.Clear();
    }
}
