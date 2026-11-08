using System.Text.Json;
using Claudalisk.Modules;

namespace <Root>.ArchitectureTests;

public sealed class ArchitectureRuleTests
{
    private static AppModel App => AppModel.Current;

    private static Naming Naming => App.Naming;

    private static ProjectFile[] Part(string part) =>
        [.. App.Projects.Where(project => Naming.ModuleOf(project.Name) is not null && Naming.PartOf(project.Name) == part)];

    private static Type[] Implementation => [.. App.TypesIn(Naming.IsImplementation)];

    private static Type[] Interfaces => [.. App.TypesIn(name => Naming.PartOf(name) == "Interfaces")];

    private static Type[] Domain => [.. App.TypesIn(name => Naming.PartOf(name) == "Domain")];

    private static Type[] Persistence => [.. App.TypesIn(name => Naming.PartOf(name) == "Persistence")];

    private static string[] Schemas => [.. App.ModuleNames.Select(Naming.ToSnakeCase)];

    [Fact]
    public void CLA0001_ModuleNamesAreSingular() =>
        Rule.Holds("CLA-0001 module names are singular", [.. Rules.ModuleClasses(Implementation)], Rules.SingularModuleNames);

    [Fact]
    public void CLA0002_ModulesReferenceOnlyInterfaces() =>
        Rule.Holds("CLA-0002 modules reference only other modules' Interfaces projects", App.Projects, scanned => Rules.ModulesReferenceOnlyInterfaces(scanned, Naming));

    [Fact]
    public void CLA0002_OnlyHostAndTestsReferenceImplementations() =>
        Rule.Holds("CLA-0002 only the Host and tests reference implementation projects", App.Projects, scanned => Rules.OnlyHostAndTestsReferenceImplementations(scanned, Naming));

    [Fact]
    public void CLA0002_NoReferenceToAnotherModulesPersistence() =>
        Rule.Holds("CLA-0002 no project references another module's persistence", App.Projects, scanned => Rules.NoReferenceToAnotherModulesPersistence(scanned, Naming));

    [Fact]
    public void CLA0003_MessagesAreLogicFreePocos() =>
        Rule.Holds("CLA-0003 messages are plain", Interfaces, Rules.MessagesAreLogicFreePocos);

    [Fact]
    public void CLA0003_InterfacesProjectsReferenceNothing() =>
        Rule.Holds("CLA-0003 Interfaces projects reference nothing", Part("Interfaces"), Rules.InterfacesProjectsReferenceNothing);

    [Fact]
    public void CLA0005_ControllersLiveInHostOrImplementation() =>
        Rule.Holds("CLA-0005 controllers live in the Host or a module", [.. Rules.Controllers(App.Types)], scanned => Rules.ControllersLiveInHostOrImplementation(scanned, Naming));

    [Fact]
    public void CLA0005_DtosLiveInFeaturesOrShared() =>
        Rule.Holds("CLA-0005 and CLA-0047 DTOs live in a feature or Shared and do not use EF Core", [.. Rules.Dtos(Implementation)], Rules.DtosLiveInFeaturesOrShared);

    [Fact]
    public void CLA0005_NoDtosInInterfacesOrRootShared() =>
        Rule.Holds("CLA-0005 no Interfaces project or Shared project holds a DTO", [.. Interfaces.Concat(App.TypesIn(name => name == Naming.Shared))], Rules.NoDtosInInterfacesOrRootShared);

    [Fact]
    public void CLA0006_ModuleCountMatchesProjects()
    {
        var csprojFiles = Directory.GetDirectories(App.Backend)
            .SelectMany(folder => Directory.GetFiles(folder, "*.csproj"))
            .Select(Path.GetFileNameWithoutExtension)
            .Count(name => Naming.IsImplementation(name!));
        Rule.Holds("CLA-0006 the module count matches the csproj files", App.ModuleNames, scanned => Rules.ModuleCountMatchesProjects(AppModel.Modules.Length, csprojFiles));
    }

    [Fact]
    public void CLA0006_EveryModuleHasAnInterfacesProject() =>
        Rule.Holds("CLA-0006 every module has an Interfaces project", App.ModuleNames, scanned => Rules.EveryModuleHasPart(scanned, App.Projects, Naming, "Interfaces"));

    [Fact]
    public void CLA0007_EfCoreOnlyInPersistence() =>
        Rule.Holds("CLA-0007 EF Core only in persistence projects", App.Projects, scanned => Rules.EfCoreOnlyInPersistence(scanned, Naming));

    [Fact]
    public void CLA0007_EntitiesMapToTheirOwnSchema() =>
        Rule.Holds("CLA-0007 entities map to their own context's schema", App.Contexts, Rules.EntitiesMapToTheirOwnSchema);

    [Fact]
    public void CLA0007_NoForeignKeysAcrossSchemas() =>
        Rule.Holds("CLA-0007 no foreign keys across schemas", App.Contexts, Rules.NoForeignKeysAcrossSchemas);

    [Fact]
    public void CLA0012_NoCodeNamesAnotherModulesSchema() =>
        Rule.Holds("CLA-0012 no module code names another module's schema", App.ModuleCode, scanned => Rules.NoCodeNamesAnotherModulesSchema(scanned, Schemas, Naming));

    [Fact]
    public async Task CLA0044_SuccessResponsesCarryLinksAndActions()
    {
        using var document = await AppModel.OpenApiAsync(TestContext.Current.CancellationToken);
        Rule.Holds("CLA-0044 every success response body has _links and _actions", new[] { document }, scanned => Rules.SuccessResponsesCarryLinksAndActions(scanned.Single()));
    }

    [Fact]
    public async Task CLA0046_OperationsHaveTheirModulesTag()
    {
        using var document = await AppModel.OpenApiAsync(TestContext.Current.CancellationToken);
        Rule.Holds("CLA-0046 every operation has its module's tag", new[] { document }, scanned => Rules.OperationsHaveTheirModulesTag(scanned.Single(), App.ModuleNames));
    }

    [Fact]
    public void CLA0047_FeaturesDoNotReferenceEachOther() =>
        Rule.Holds("CLA-0047 and CLA-0050 features do not reference each other", Part(""), Rules.FeaturesDoNotReferenceEachOther);

    [Fact]
    public void CLA0048_DomainProjectsReferenceOnlySharedAndDomainPackage() =>
        Rule.Holds("CLA-0048 Domain projects reference only Shared and Claudalisk.Domain", Part("Domain"), scanned => Rules.DomainProjectsReferenceOnlySharedAndDomainPackage(scanned, Naming));

    [Fact]
    public void CLA0049_ControllersDependOnlyOnTheDispatcher() =>
        Rule.Holds("CLA-0049 controllers depend only on the dispatcher and their feature's types", [.. Rules.Controllers(Implementation)], Rules.ControllersDependOnlyOnTheDispatcher);

    [Fact]
    public void CLA0050_SharedDoesNotReferenceFeatures() =>
        Rule.Holds("CLA-0050 Shared does not reference Features", [.. Part("").SelectMany(project => project.Sources).Where(source => source.Path.StartsWith("Shared/", StringComparison.Ordinal))], Rules.SharedDoesNotReferenceFeatures);

    [Fact]
    public void CLA0051_IdentifiersFitPostgres() =>
        Rule.Holds("CLA-0051 no identifier is over 63 bytes", App.Contexts, Rules.IdentifiersFitPostgres);

    [Fact]
    public void CLA0051_ColumnSuffixesMatchTheirType() =>
        Rule.Holds("CLA-0051 column suffixes match their type", App.Contexts, Rules.ColumnSuffixesMatchTheirType);

    [Fact]
    public void CLA0052_MessageSuffixesMatchHandlers() =>
        Rule.Holds("CLA-0052 suffixes match the dispatcher's interfaces", [.. Rules.Handlers(Implementation)], Rules.MessageSuffixesMatchHandlers);

    [Fact]
    public void CLA0052_EveryAggregateHasAnEntity() =>
        Rule.Holds("CLA-0052 every aggregate root has its entity", [.. Rules.Aggregates(Domain)], scanned => Rules.EveryAggregateHasAnEntity(scanned, Persistence));

    [Fact]
    public void CLA0056_EntitiesMapAVersionToken() =>
        Rule.Holds("CLA-0056 every aggregate's entity maps a version concurrency token", [.. Rules.Aggregates(Domain)], scanned => Rules.EntitiesMapAVersionToken(scanned, App.Contexts));

    [Fact]
    public void CLA0057_ValidatorsLiveNextToTheirMessage() =>
        Rule.Holds("CLA-0057 validators live next to their message", [.. Rules.Validators(Implementation)], Rules.ValidatorsLiveNextToTheirMessage);

    [Fact]
    public void CLA0057_RequestDtosHaveNoValidationAttributes() =>
        Rule.Holds("CLA-0057 request DTOs have no validation attributes", [.. Rules.Requests(Implementation)], Rules.RequestDtosHaveNoValidationAttributes);

    [Fact]
    public void CLA0058_OnlyBackgroundModulesHaveAJobsTable() =>
        Rule.Holds("CLA-0058 only modules that accept background work have a jobs table", App.ModuleCode, scanned => Rules.OnlyBackgroundModulesHaveAJobsTable(scanned, Naming));

    [Fact]
    public void CLA0058_NoModuleReferencesAnotherModulesJobs() =>
        Rule.Holds("CLA-0058 no module references another module's jobs", App.ModuleCode, scanned => Rules.NoModuleReferencesAnotherModulesJobs(scanned, Naming));

    [Fact]
    public void CLA0063_NoExceptionFiltersOrProblemDetailsInModules() =>
        Rule.Holds("CLA-0063 no exception filters or ProblemDetails construction in modules", [.. App.ModuleCode.SelectMany(project => project.Sources)], Rules.NoExceptionFiltersOrProblemDetailsInModules);

    [Fact]
    public void CLA0064_EveryModuleHasATestProject() =>
        Rule.Holds("CLA-0064 every module has a test project", App.ModuleNames, scanned => Rules.EveryModuleHasPart(scanned, App.Projects, Naming, "Tests"));

    [Fact]
    public void CLA0067_InterfacesHoldOnlyMessagesAndTheMarker() =>
        Rule.Holds("CLA-0067 Interfaces projects hold only messages and the module marker", Interfaces, Rules.InterfacesHoldOnlyMessagesAndTheMarker);

    [Fact]
    public void CLA0068_EventHandlersStayOutOfTheUnitOfWork() =>
        Rule.Holds("CLA-0068 no event handler runs inside the publisher's unit of work", [.. Rules.Handlers(Implementation)], Rules.EventHandlersStayOutOfTheUnitOfWork);

    [Fact]
    public void CLA0068_ModuleDependenciesAreAcyclic() =>
        Rule.Holds<IModule>("CLA-0068 module dependencies stay acyclic", AppModel.Modules, Rules.ModuleDependenciesAreAcyclic);

    [Fact]
    public void CLA0069_NoMappingLibraries() =>
        Rule.Holds("CLA-0069 no project references a mapping library", App.Projects, Rules.NoMappingLibraries);

    [Fact]
    public void CLA0070_NoFakesOfStoresDispatcherOrContext() =>
        Rule.Holds("CLA-0070 no faked stores, dispatcher or DbContext in test projects", [.. App.Projects.Where(project => project.Name.EndsWith(".Tests", StringComparison.Ordinal)).SelectMany(project => project.Sources)], Rules.NoFakesOfStoresDispatcherOrContext);
}
