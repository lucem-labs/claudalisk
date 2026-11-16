namespace Bench.Modules.Billing.Shared.Ledger;

internal static class Metrics
{
    private static readonly List<(string Name, decimal Value)> Samples = [];

    public static int Count => Samples.Count;

    public static void Record(string name, decimal value) => Samples.Add((name, value));
}
