namespace Proof.LspCases;

public static class Pricing
{
    public static decimal Total(int quantity, decimal unit) => quantity * unit;

    public static decimal Total(decimal amount) => Total(1, amount);

    public static decimal Total(IEnumerable<decimal> amounts) => amounts.Sum();
}

public static class PricingUsers
{
    public static decimal Basket() => Pricing.Total(2, 3.5m) + Pricing.Total(4m) + Pricing.Total([1m, 2m]);
}
