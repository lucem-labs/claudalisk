using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using <Root>.Testing;

namespace <Root>.Modules.<Name>.Tests.Features.Get<Aggregate>;

public sealed class Get<Aggregate>Tests
{
    [Fact]
    public async Task ACreated<Aggregate>IsReturnedWithLinksAndActions()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var factory = new ApiFactory(await PostgresServer.CreateMigratedDatabaseAsync(cancellationToken));
        using var client = factory.CreateClient();

        using var created = await client.PostAsJsonAsync("/api/<routes>", new { name = "first" }, cancellationToken);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        using var response = await client.GetAsync(created.Headers.Location, cancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken);
        Assert.True(body.TryGetProperty("_links", out _));
        Assert.True(body.TryGetProperty("_actions", out _));
    }

    [Fact]
    public async Task AnUnknownIdIsNotFound()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var factory = new ApiFactory(await PostgresServer.CreateMigratedDatabaseAsync(cancellationToken));
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(new Uri($"/api/<routes>/{Guid.NewGuid()}", UriKind.Relative), cancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
