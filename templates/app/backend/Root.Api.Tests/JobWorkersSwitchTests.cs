using Claudalisk.Jobs;
using <Root>.Testing;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace <Root>.Api.Tests;

public sealed class JobWorkersSwitchTests
{
    [Theory]
    [InlineData(null, true)]
    [InlineData("false", false)]
    [InlineData("true", true)]
    public async Task TheHostReadsTheWorkerSwitchFromConfiguration(string? setting, bool expected)
    {
        var connectionString = await PostgresServer.CreateMigratedDatabaseAsync(TestContext.Current.CancellationToken);
        await using var factory = new ApiFactory(connectionString).WithWebHostBuilder(builder =>
        {
            if (setting is not null)
            {
                builder.UseSetting("Jobs:WorkersEnabled", setting);
            }
        });

        Assert.Equal(expected, factory.Services.GetRequiredService<IOptions<JobsOptions>>().Value.WorkersEnabled);
    }
}
