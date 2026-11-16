namespace Bench.Modules.Billing.Shared.Pricing;

internal sealed class VolumeDiscountPolicy : IDiscountPolicy
{
    private const decimal Threshold = 1000m;
    private const decimal Factor = 0.95m;

    public decimal Apply(decimal amount) => amount >= Threshold ? amount * Factor : amount;
}
