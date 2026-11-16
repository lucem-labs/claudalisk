namespace Bench.Modules.Billing.Shared.Pricing;

internal interface IDiscountPolicy
{
    decimal Apply(decimal amount);
}
