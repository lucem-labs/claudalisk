using System.Reflection;
using System.Text.Json;
using Claudalisk.Modules;
using <Root>.ArchitectureTests.BadExamples;

namespace <Root>.ArchitectureTests;

public sealed class RuleGuardTests
{
    private static readonly Naming Naming = new("App");

    private static readonly ContextModel Bad = new("Billing", "billing", AppModel.ModelOf(typeof(BadContext)));

    private static ProjectFile Project(string name, string[]? projects = null, string[]? packages = null, SourceFile[]? sources = null) =>
        new(name, projects ?? [], packages ?? [], sources ?? []);

    private static SourceFile Source(string text, string path = "File.cs") => new(path, text);

    private static void Flags(IEnumerable<string> violations) => Assert.NotEmpty(violations);

    [Fact]
    public void CLA0001_ModuleNamesAreSingular() => Flags(Rules.SingularModuleNames([typeof(OrdersModule)]));

    [Fact]
    public void CLA0002_ModulesReferenceOnlyInterfaces() =>
        Flags(Rules.ModulesReferenceOnlyInterfaces([Project("App.Modules.A", ["App.Modules.B.Domain"])], Naming));

    [Fact]
    public void CLA0002_OnlyHostAndTestsReferenceImplementations() =>
        Flags(Rules.OnlyHostAndTestsReferenceImplementations([Project("App.Modules.A", ["App.Modules.B"])], Naming));

    [Fact]
    public void CLA0002_NoReferenceToAnotherModulesPersistence() =>
        Flags(Rules.NoReferenceToAnotherModulesPersistence([Project("App.Modules.A.Tests", ["App.Modules.B.Persistence"])], Naming));

    [Fact]
    public void CLA0003_MessagesAreLogicFreePocos()
    {
        Flags(Rules.MessagesAreLogicFreePocos([typeof(MessageWithBase)]));
        Flags(Rules.MessagesAreLogicFreePocos([typeof(MessageWithService)]));
    }

    [Fact]
    public void CLA0003_InterfacesProjectsReferenceNothing() =>
        Flags(Rules.InterfacesProjectsReferenceNothing([Project("App.Modules.A.Interfaces", packages: ["Some.Package"])]));

    [Fact]
    public void CLA0005_ControllersLiveInHostOrImplementation() =>
        Flags(Rules.ControllersLiveInHostOrImplementation([typeof(BadController)], Naming));

    [Fact]
    public void CLA0005_DtosLiveInFeaturesOrShared() => Flags(Rules.DtosLiveInFeaturesOrShared([typeof(MisplacedResponse)]));

    [Fact]
    public void CLA0005_NoDtosInInterfacesOrRootShared() => Flags(Rules.NoDtosInInterfacesOrRootShared([typeof(MisplacedResponse)]));

    [Fact]
    public void CLA0006_ModuleCountMatchesProjects() => Flags(Rules.ModuleCountMatchesProjects(1, 2));

    [Fact]
    public void CLA0006_EveryModuleHasAnInterfacesProject() =>
        Flags(Rules.EveryModuleHasPart(["A"], [Project("App.Modules.A")], Naming, "Interfaces"));

    [Fact]
    public void CLA0007_EfCoreOnlyInPersistence() =>
        Flags(Rules.EfCoreOnlyInPersistence([Project("App.Modules.A", packages: ["Microsoft.EntityFrameworkCore"])], Naming));

    [Fact]
    public void CLA0007_EntitiesMapToTheirOwnSchema() => Flags(Rules.EntitiesMapToTheirOwnSchema([Bad]));

    [Fact]
    public void CLA0007_NoForeignKeysAcrossSchemas() => Flags(Rules.NoForeignKeysAcrossSchemas([Bad]));

    [Fact]
    public void CLA0012_NoCodeNamesAnotherModulesSchema() =>
        Flags(Rules.NoCodeNamesAnotherModulesSchema(
            [Project("App.Modules.A.Persistence", sources: [Source("migrationBuilder.Sql(\"DELETE FROM b.rows\");")])],
            ["a", "b"],
            Naming));

    [Fact]
    public void CLA0044_SuccessResponsesCarryLinksAndActions()
    {
        using var document = JsonDocument.Parse("""
            {"paths":{"/x":{"get":{"tags":["A"],"responses":{"200":{"content":{"application/json":{"schema":{"properties":{"id":{}}}}}}}}}}}
            """);
        Flags(Rules.SuccessResponsesCarryLinksAndActions(document));
    }

    [Fact]
    public void CLA0046_OperationsHaveTheirModulesTag()
    {
        using var document = JsonDocument.Parse("""
            {"paths":{"/x":{"get":{"tags":["Unknown"],"responses":{}}}}}
            """);
        Flags(Rules.OperationsHaveTheirModulesTag(document, ["A"]));
    }

    [Fact]
    public void CLA0047_FeaturesDoNotReferenceEachOther() =>
        Flags(Rules.FeaturesDoNotReferenceEachOther([Project("App.Modules.A", sources: [
            Source("class FirstThing { SecondThing? other; }", "Features/First/FirstThing.cs"),
            Source("class SecondThing;", "Features/Second/SecondThing.cs"),
        ])]));

    [Fact]
    public void CLA0048_DomainProjectsReferenceOnlySharedAndDomainPackage() =>
        Flags(Rules.DomainProjectsReferenceOnlySharedAndDomainPackage([Project("App.Modules.A.Domain", packages: ["Newtonsoft.Json"])], Naming));

    [Fact]
    public void CLA0049_ControllersDependOnlyOnTheDispatcher() => Flags(Rules.ControllersDependOnlyOnTheDispatcher([typeof(BadController)]));

    [Fact]
    public void CLA0050_SharedDoesNotReferenceFeatures() =>
        Flags(Rules.SharedDoesNotReferenceFeatures([Source("using App.Modules.A.Features.First;")]));

    [Fact]
    public void CLA0051_IdentifiersFitPostgres() => Flags(Rules.IdentifiersFitPostgres([Bad]));

    [Fact]
    public void CLA0051_ColumnSuffixesMatchTheirType() => Flags(Rules.ColumnSuffixesMatchTheirType([Bad]));

    [Fact]
    public void CLA0052_MessageSuffixesMatchHandlers() => Flags(Rules.MessageSuffixesMatchHandlers([typeof(SomeProcessor)]));

    [Fact]
    public void CLA0052_EveryAggregateHasAnEntity() => Flags(Rules.EveryAggregateHasAnEntity([typeof(WrongAggregate)], [typeof(BadEntity)]));

    [Fact]
    public void CLA0056_EntitiesMapAVersionToken() => Flags(Rules.EntitiesMapAVersionToken([typeof(BadAggregateNamedBad)], [Bad]));

    [Fact]
    public void CLA0057_ValidatorsLiveNextToTheirMessage() => Flags(Rules.ValidatorsLiveNextToTheirMessage([typeof(MisplacedDoThingCommandValidator)]));

    [Fact]
    public void CLA0057_RequestDtosHaveNoValidationAttributes() => Flags(Rules.RequestDtosHaveNoValidationAttributes([typeof(InvalidRequest)]));

    [Fact]
    public void CLA0058_OnlyBackgroundModulesHaveAJobsTable() =>
        Flags(Rules.OnlyBackgroundModulesHaveAJobsTable([Project("App.Modules.A.Persistence", sources: [Source("CreateTable(name: \"jobs\")")])], Naming));

    [Fact]
    public void CLA0058_NoModuleReferencesAnotherModulesJobs() =>
        Flags(Rules.NoModuleReferencesAnotherModulesJobs([Project("App.Modules.A", sources: [Source("using App.Modules.B.Internal.RebuildJob;")])], Naming));

    [Fact]
    public void CLA0063_NoExceptionFiltersOrProblemDetailsInModules() =>
        Flags(Rules.NoExceptionFiltersOrProblemDetailsInModules([Source("return new ProblemDetails();")]));

    [Fact]
    public void CLA0064_EveryModuleHasATestProject() =>
        Flags(Rules.EveryModuleHasPart(["A"], [Project("App.Modules.A")], Naming, "Tests"));

    [Fact]
    public void CLA0067_InterfacesHoldOnlyMessagesAndTheMarker() => Flags(Rules.InterfacesHoldOnlyMessagesAndTheMarker([typeof(IServiceInInterfaces)]));

    [Fact]
    public void CLA0068_EventHandlersStayOutOfTheUnitOfWork() => Flags(Rules.EventHandlersStayOutOfTheUnitOfWork([typeof(ThingHappenedHandler)]));

    [Fact]
    public void CLA0068_ModuleDependenciesAreAcyclic() => Flags(Rules.ModuleDependenciesAreAcyclic([new FirstModule(), new SecondModule()]));

    [Fact]
    public void CLA0069_NoMappingLibraries() => Flags(Rules.NoMappingLibraries([Project("App.Modules.A", packages: ["AutoMapper"])]));

    [Fact]
    public void CLA0070_NoFakesOfStoresDispatcherOrContext() =>
        Flags(Rules.NoFakesOfStoresDispatcherOrContext([Source("internal sealed class FakeStore : IOrderStore { }")]));

    [Fact]
    public void AnEmptyScanFailsTheRule() =>
        Assert.ThrowsAny<Exception>(() => Rule.Holds<string>("empty", [], _ => [], appHasNoModules: false));

    [Fact]
    public void AnEmptyScanPassesOnlyWhileTheAppHasNoModules() =>
        Rule.Holds<string>("empty", [], _ => ["never checked"], appHasNoModules: true);

    [Fact]
    public void AScanThatFindsSomethingIsCheckedEvenWithoutModules() =>
        Assert.ThrowsAny<Exception>(() => Rule.Holds<string>("found", ["item"], _ => ["violation"], appHasNoModules: true));

    [Fact]
    public void EveryRuleHasAGuardTest()
    {
        static string[] Facts(Type type) =>
            [.. type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                .Where(method => method.Name.StartsWith("CLA", StringComparison.Ordinal))
                .Select(method => method.Name)
                .Order(StringComparer.Ordinal)];

        var rules = Facts(typeof(ArchitectureRuleTests));
        Assert.NotEmpty(rules);
        Assert.Equal(rules, Facts(typeof(RuleGuardTests)));
    }

    private sealed class BadAggregateNamedBad : Claudalisk.Domain.AggregateRoot;
}
