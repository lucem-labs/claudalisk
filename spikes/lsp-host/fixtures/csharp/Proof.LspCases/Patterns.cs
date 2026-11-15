using System.Text.RegularExpressions;

namespace Proof.LspCases;

public static partial class Patterns
{
    [GeneratedRegex(@"^\d+$")]
    public static partial Regex DigitsOnly();

    public static bool IsNumber(string text) => DigitsOnly().IsMatch(text);
}
