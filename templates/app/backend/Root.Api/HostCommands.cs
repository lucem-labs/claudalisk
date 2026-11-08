using Claudalisk.Persistence;
using Microsoft.EntityFrameworkCore;

namespace <Root>.Api;

public static class HostCommands
{
    public const string HealthCheck = "--health-check";
    public const string InitializeDatabases = "--initialize-databases";
    public const string ListMigrations = "--list-migrations";

    public static async Task<int?> RunAsync(IServiceProvider services, string[] args, TextWriter output, TextWriter error)
    {
        await using var scope = services.CreateAsyncScope();
        var initializer = scope.ServiceProvider.GetRequiredService<DatabaseInitializer>();

        if (args.Contains(ListMigrations))
        {
            foreach (var registration in initializer.Contexts)
            {
                var context = (DbContext)scope.ServiceProvider.GetRequiredService(registration.ContextType);
                foreach (var migration in context.Database.GetMigrations())
                {
                    await output.WriteLineAsync($"{registration.Schema}/{migration}");
                }
            }

            return 0;
        }

        if (args.Contains(InitializeDatabases))
        {
            await initializer.MigrateAsync();
            return 0;
        }

        var pending = await initializer.GetPendingMigrationsAsync();
        if (pending.Count == 0)
        {
            return null;
        }

        await error.WriteLineAsync($"Refusing to start, because migrations are pending: {string.Join(", ", pending)}");
        return 1;
    }

    public static async Task<int> ProbeHealthAsync()
    {
        var port = (Environment.GetEnvironmentVariable("ASPNETCORE_HTTP_PORTS") ?? "8080").Split(';')[0];
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
        try
        {
            using var response = await client.GetAsync(new Uri($"http://localhost:{port}/api/health"));
            return response.IsSuccessStatusCode ? 0 : 1;
        }
        catch (HttpRequestException)
        {
            return 1;
        }
        catch (TaskCanceledException)
        {
            return 1;
        }
    }
}
