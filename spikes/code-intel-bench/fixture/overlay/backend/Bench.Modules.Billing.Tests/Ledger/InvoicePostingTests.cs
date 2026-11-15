using Bench.Modules.Billing.Shared.Ledger;

namespace Bench.Modules.Billing.Tests.Ledger;

public sealed class InvoicePostingTests
{
    [Fact]
    public void PostingRecordsInTheLedgerAndTheAuditTrail()
    {
        var ledger = new InMemoryLedger();
        var audit = new InMemoryAuditTrail();

        new InvoicePosting(ledger, audit).Post("receivable", 25m);

        Assert.Equal([("receivable", 25m)], ledger.Entries);
        Assert.Equal(["receivable:25"], audit.Lines);
    }

    [Fact]
    public void ABatchFlushesToItsContext()
    {
        var ledger = new InMemoryLedger();
        var batch = new PostingBatch(new PostingContext(ledger, new InMemoryAuditTrail()), _ => ledger);

        batch.Add("receivable", 5m);
        batch.Flush();

        Assert.Single(ledger.Entries);
    }
}
