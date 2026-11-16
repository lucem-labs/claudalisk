namespace Proof.LspCases;

public partial class Ledger
{
    private readonly List<decimal> entries = [];

    public void Add(decimal amount) => entries.Add(amount);
}
