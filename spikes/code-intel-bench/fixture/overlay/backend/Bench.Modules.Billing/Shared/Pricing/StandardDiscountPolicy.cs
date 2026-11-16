namespace Bench.Modules.Billing.Shared.Pricing;

internal sealed class StandardDiscountPolicy : IDiscountPolicy
{
    public decimal Apply(decimal amount) => amount;
}
