namespace Bench.Modules.Billing.Shared.Pricing;

internal sealed class SeasonalDiscountPolicy : IDiscountPolicy
{
    public decimal Apply(decimal amount) => Math.Round(amount * 0.9m, 2);
}
