using <Root>.Testing;

namespace <Root>.Api.Tests;

public sealed class HostCommandsTests
{
    [Fact]
    public async Task RefusesToStartWhileMigrationsArePending()
    {
        var connectionString = await PostgresServer.CreateDatabaseAsync(TestContext.Current.CancellationToken);
        await using var provider = PostgresServer.BuildAppServices(connectionString);
        using var error = new StringWriter();

        var exitCode = await HostCommands.RunAsync(provider, [], TextWriter.Null, error);

        Assert.Equal(1, exitCode);
        Assert.Contains("migrations are pending", error.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task StartsWhenNothingIsPending()
    {
        var connectionString = await PostgresServer.CreateMigratedDatabaseAsync(TestContext.Current.CancellationToken);
        await using var provider = PostgresServer.BuildAppServices(connectionString);

        Assert.Null(await HostCommands.RunAsync(provider, [], TextWriter.Null, TextWriter.Null));
    }

    [Fact]
    public async Task InitializeDatabasesMigratesAndExits()
    {
        var connectionString = await PostgresServer.CreateDatabaseAsync(TestContext.Current.CancellationToken);
        await using var provider = PostgresServer.BuildAppServices(connectionString);

        Assert.Equal(0, await HostCommands.RunAsync(provider, [HostCommands.InitializeDatabases], TextWriter.Null, TextWriter.Null));
        Assert.Null(await HostCommands.RunAsync(provider, [], TextWriter.Null, TextWriter.Null));
    }

    [Fact]
    public async Task ListMigrationsPrintsSchemaAndId()
    {
        var connectionString = await PostgresServer.CreateDatabaseAsync(TestContext.Current.CancellationToken);
        await using var provider = PostgresServer.BuildAppServices(connectionString);
        using var output = new StringWriter();

        Assert.Equal(0, await HostCommands.RunAsync(provider, [HostCommands.ListMigrations], output, TextWriter.Null));

        var lines = output.ToString().Split(Environment.NewLine, StringSplitOptions.RemoveEmptyEntries);
        Assert.NotEmpty(lines);
        Assert.All(lines, line => Assert.Matches("^[a-z0-9_]+/[0-9]{14}_[A-Za-z0-9]+$", line));
    }
}
