using Claudalisk.Modules;
using <Root>.Testing;
using Microsoft.AspNetCore.Mvc.ApplicationParts;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.Extensions.DependencyInjection;

namespace <Root>.Api.Tests;

public sealed class ModuleRegistrationTests
{
    private const string NoDatabase = "Host=localhost;Database=unused;Username=unused";

    [Fact]
    public void TheHostListsModules() => Assert.NotEmpty(AppModules.All());

    [Fact]
    public async Task EveryModuleComposesWithOnlyItsDeclaredDependencies()
    {
        var all = AppModules.All();
        foreach (var module in all)
        {
            await using var provider = PostgresServer.BuildServices(NoDatabase, Closure(module, all));
            Assert.NotNull(provider.GetService<ModuleCatalog>());
        }
    }

    [Fact]
    public async Task RegisteringTheModulesTwiceChangesNothing()
    {
        var services = new ServiceCollection();
        var configuration = new Microsoft.Extensions.Configuration.ConfigurationBuilder().Build();
        Claudalisk.Persistence.PersistenceServiceCollectionExtensions.AddClaudaliskPersistence(services, NoDatabase);
        services.AddClaudaliskModules(configuration, AppModules.All());
        var count = services.Count;

        services.AddClaudaliskModules(configuration, AppModules.All());

        Assert.Equal(count, services.Count);
        await using var provider = services.BuildServiceProvider();
        Assert.NotNull(provider.GetService<ModuleCatalog>());
    }

    [Fact]
    public void EveryModuleExposesItsControllers()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        Claudalisk.Persistence.PersistenceServiceCollectionExtensions.AddClaudaliskPersistence(services, NoDatabase);
        var mvc = services.AddClaudaliskModules(new Microsoft.Extensions.Configuration.ConfigurationBuilder().Build(), AppModules.All());
        var feature = new ControllerFeature();

        mvc.PartManager.PopulateFeature(feature);

        foreach (var module in AppModules.All())
        {
            Assert.Contains(feature.Controllers, controller => controller.Assembly == module.GetType().Assembly);
        }
    }

    private static IModule[] Closure(IModule module, IModule[] all)
    {
        var found = new List<IModule>();
        Visit(module);
        return [.. found];

        void Visit(IModule current)
        {
            if (found.Contains(current))
            {
                return;
            }

            found.Add(current);
            foreach (var dependency in current.Dependencies)
            {
                Visit(all.Single(candidate => candidate.Contract == dependency));
            }
        }
    }
}
