using Bench.Modules.Billing.Shared.Pricing;

namespace Bench.Hidden.T3.Tests;

public sealed class DiscountTierTests
{
    private sealed class GoldTenth : IDiscountPolicy
    {
        public decimal Apply(decimal amount, string customerTier) => customerTier == "gold" ? amount * 0.9m : amount;
    }

    [Fact]
    public void TheInterfaceTakesTheTierWithoutADefault()
    {
        var methods = typeof(IDiscountPolicy).GetMethods();

        var apply = Assert.Single(methods);
        Assert.Equal("Apply", apply.Name);
        var parameters = apply.GetParameters();
        Assert.Equal([typeof(decimal), typeof(string)], parameters.Select(parameter => parameter.ParameterType));
        Assert.Equal("customerTier", parameters[1].Name);
        Assert.All(parameters, parameter => Assert.False(parameter.HasDefaultValue));
    }

    [Fact]
    public void EveryImplementationKeepsItsBehaviour()
    {
        Assert.Equal(100m, new StandardDiscountPolicy().Apply(100m, "gold"));
        Assert.Equal(1140m, new VolumeDiscountPolicy().Apply(1200m, "standard"));
        Assert.Equal(999m, new VolumeDiscountPolicy().Apply(999m, "gold"));
        Assert.Equal(90m, new SeasonalDiscountPolicy().Apply(100m, "standard"));
    }

    [Fact]
    public void ThereAreThreeImplementationsInTheModule()
    {
        var implementations = typeof(IDiscountPolicy).Assembly.GetTypes()
            .Where(type => type is { IsClass: true, IsAbstract: false } && type.IsAssignableTo(typeof(IDiscountPolicy)));

        Assert.Equal(3, implementations.Count());
    }

    [Fact]
    public void PricingPassesTheTierOn()
    {
        var pricing = new InvoicePricing(new GoldTenth());

        Assert.Equal(90m, pricing.Price(100m, "gold"));
        Assert.Equal(100m, pricing.Price(100m, "standard"));
        Assert.Equal([90m, 180m], pricing.PriceAll([100m, 200m], "gold"));
    }

    [Fact]
    public void AQuotePassesTheTierOn()
    {
        var quote = new InvoiceQuote([new GoldTenth(), new VolumeDiscountPolicy()]);

        Assert.Equal(90m, quote.Best(100m, "gold"));
        Assert.Equal(1000m * 0.9m, quote.Chained(1000m, "gold"));
        Assert.Equal(950m, quote.Chained(1000m, "standard"));
    }
}
