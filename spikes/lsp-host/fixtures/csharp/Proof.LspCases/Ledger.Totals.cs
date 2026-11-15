namespace Proof.LspCases;

public partial class Ledger
{
    public decimal Balance() => entries.Sum();

    public decimal AddAndBalance(decimal amount)
    {
        Add(amount);
        return Balance();
    }
}
