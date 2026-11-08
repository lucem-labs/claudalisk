using Claudalisk.Dispatching;
using <Root>.Modules.<Name>.Domain;
using <Root>.Modules.<Name>.Interfaces;
using <Root>.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace <Root>.Modules.<Name>.Tests.Features.Create<Aggregate>;

public sealed class Create<Aggregate>Tests
{
    [Fact]
    public void ANew<Aggregate>StartsAtTheInitialVersion() =>
        Assert.Equal(<Aggregate>.InitialVersion, <Aggregate>.Create(Guid.NewGuid(), "first").Version);

    [Fact]
    public async Task TheCommandStoresThe<Aggregate>()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var provider = await ComposeAsync(cancellationToken);
        await using var scope = provider.CreateAsyncScope();
        var dispatcher = scope.ServiceProvider.GetRequiredService<IDispatcher>();

        var created = await dispatcher.SendAsync<<Aggregate>Summary>(new Create<Aggregate>Command("first"), cancellationToken);

        var found = await dispatcher.SendAsync<<Aggregate>Summary>(new Get<Aggregate>Query(created.Id), cancellationToken);
        Assert.Equal("first", found.Name);
    }

    [Fact]
    public async Task AnEmptyNameFailsValidation()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var provider = await ComposeAsync(cancellationToken);
        await using var scope = provider.CreateAsyncScope();
        var dispatcher = scope.ServiceProvider.GetRequiredService<IDispatcher>();

        await Assert.ThrowsAsync<MessageValidationException>(
            async () => await dispatcher.SendAsync<<Aggregate>Summary>(new Create<Aggregate>Command(""), cancellationToken));
    }

    private static async Task<ServiceProvider> ComposeAsync(CancellationToken cancellationToken)
    {
        var connectionString = await PostgresServer.CreateMigratedDatabaseAsync(cancellationToken);
        var services = PostgresServer.CreateServices(connectionString, new <Name>Module());
        services.AddClaudaliskDispatching();
        return services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true });
    }
}
