namespace Bench.Modules.Billing.Shared.Pricing;

internal sealed class InvoicePricing(IDiscountPolicy policy)
{
    public decimal Price(decimal amount) => policy.Apply(amount);

    public IReadOnlyList<decimal> PriceAll(IEnumerable<decimal> amounts) => amounts.Select(policy.Apply).ToList();
}
