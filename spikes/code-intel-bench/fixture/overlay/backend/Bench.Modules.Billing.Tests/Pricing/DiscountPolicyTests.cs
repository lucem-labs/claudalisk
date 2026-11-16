using Bench.Modules.Billing.Shared.Pricing;

namespace Bench.Modules.Billing.Tests.Pricing;

public sealed class DiscountPolicyTests
{
    private sealed class FlatDiscountPolicy(decimal off) : IDiscountPolicy
    {
        public decimal Apply(decimal amount) => amount - off;
    }

    [Fact]
    public void TheStandardPolicyChargesTheFullAmount() =>
        Assert.Equal(100m, new StandardDiscountPolicy().Apply(100m));

    [Fact]
    public void TheVolumePolicyDiscountsLargeAmounts()
    {
        var policy = new VolumeDiscountPolicy();

        Assert.Equal(950m, policy.Apply(1000m));
        Assert.Equal(999m, policy.Apply(999m));
    }

    [Fact]
    public void PricingAppliesItsPolicyToEveryAmount() =>
        Assert.Equal([90m, 190m], new InvoicePricing(new FlatDiscountPolicy(10m)).PriceAll([100m, 200m]));

    [Fact]
    public void AQuoteChainsAndComparesItsPolicies()
    {
        var quote = new InvoiceQuote([new FlatDiscountPolicy(10m), new VolumeDiscountPolicy()]);

        Assert.Equal(990m, quote.Chained(1000m));
        Assert.Equal(90m, quote.Best(100m));
    }
}
