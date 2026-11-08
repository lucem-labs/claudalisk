namespace <Root>.ArchitectureTests;

public static class Rule
{
    public static void Holds<T>(string rule, IReadOnlyCollection<T> scanned, Func<IReadOnlyCollection<T>, IEnumerable<string>> check) =>
        Holds(rule, scanned, check, AppModel.Current.HasNoModules);

    public static void Holds<T>(string rule, IReadOnlyCollection<T> scanned, Func<IReadOnlyCollection<T>, IEnumerable<string>> check, bool appHasNoModules)
    {
        if (scanned.Count == 0 && appHasNoModules)
        {
            return;
        }

        Assert.True(scanned.Count > 0, $"{rule}: the scan found nothing to check, so the rule would pass while checking nothing.");
        var violations = check(scanned).ToArray();
        Assert.True(violations.Length == 0, $"{rule}:{Environment.NewLine}{string.Join(Environment.NewLine, violations)}");
    }
}
