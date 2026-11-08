namespace <Root>.Api.Tests;

internal static class ModulesExist
{
    public static void OrSkip() => Assert.SkipWhen(AppModules.All().Length == 0, "The app has no modules yet.");
}
