namespace Bench.Modules.Billing.Shared.Pricing;

internal sealed class InvoiceQuote(IEnumerable<IDiscountPolicy> policies)
{
    public IReadOnlyList<IDiscountPolicy> Policies { get; } = policies.ToList();

    public decimal Best(decimal amount) => Policies.Min(policy => policy.Apply(amount));

    public decimal Chained(decimal amount) => Policies.Aggregate(amount, (current, policy) => policy.Apply(current));
}
