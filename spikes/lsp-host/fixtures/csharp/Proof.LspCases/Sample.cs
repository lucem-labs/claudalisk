using System.Text;

namespace Proof.LspCases;

public static class Sample
{
    public static string Label(int quantity, decimal unit)
    {
        var total = Pricing.Total(quantity, unit);
        var text = $"Total {total}";
        if (quantity > 10)
        {
            text += " (bulk)";
        }
        return text;
    }
}
