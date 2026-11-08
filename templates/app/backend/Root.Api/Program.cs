using Claudalisk.AspNetCore;
using Claudalisk.Dispatching;
using Claudalisk.Jobs;
using Claudalisk.Jobs.PostgreSql;
using Claudalisk.Modules;
using Claudalisk.Persistence;
using <Root>.Api;

if (args.Contains(HostCommands.HealthCheck))
{
    return await HostCommands.ProbeHealthAsync();
}

var builder = WebApplication.CreateBuilder(args);
var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? throw new InvalidOperationException("Set the connection string ConnectionStrings__Default.");

builder.Services.AddClaudaliskWeb();
builder.Services.AddClaudaliskPersistence(connectionString);
builder.Services.AddClaudaliskModules(builder.Configuration, AppModules.All());
builder.Services.AddClaudaliskDispatching();
builder.Services.AddClaudaliskJobs(options => options.WorkersEnabled = builder.Configuration.GetValue("Jobs:WorkersEnabled", true));
builder.Services.AddClaudaliskPostgreSqlJobs();
builder.Services.AddSingleton<IDatabaseHealthProbe, DatabaseHealthProbe>();

var app = builder.Build();

if (await HostCommands.RunAsync(app.Services, args, Console.Out, Console.Error) is { } exitCode)
{
    return exitCode;
}

app.UseClaudaliskWeb();
app.MapControllers();
await app.RunAsync();
return 0;

public partial class Program;
