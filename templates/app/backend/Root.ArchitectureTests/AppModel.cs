using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Claudalisk.Modules;
using <Root>.Api;
using <Root>.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;

namespace <Root>.ArchitectureTests;

public sealed record SourceFile(string Path, string Text);

public sealed record ProjectFile(
    string Name,
    IReadOnlyList<string> ProjectReferences,
    IReadOnlyList<string> PackageReferences,
    IReadOnlyList<SourceFile> Sources);

public sealed record ContextModel(string Module, string ExpectedSchema, IModel Model);

public sealed partial class Naming(string root)
{
    public string Root { get; } = root;

    public string Host => $"{Root}.Api";

    public string Shared => $"{Root}.Shared";

    public string? ModuleOf(string project)
    {
        var match = ModulePattern().Match(project);
        return match.Success && match.Groups["app"].Value == Root ? match.Groups["module"].Value : null;
    }

    public string PartOf(string project)
    {
        var module = ModuleOf(project);
        return module is null ? "" : project[$"{Root}.Modules.{module}".Length..].TrimStart('.');
    }

    public bool IsImplementation(string project) => ModuleOf(project) is not null && PartOf(project).Length == 0;

    public bool IsTest(string project) =>
        project.EndsWith(".Tests", StringComparison.Ordinal)
        || project == $"{Root}.ArchitectureTests"
        || project == $"{Root}.Testing";

    public static string ToSnakeCase(string name) => UpperAfterLower().Replace(name, "$1_$2").ToLowerInvariant();

    [GeneratedRegex(@"^(?<app>.+?)\.Modules\.(?<module>[^.]+)(\.(?<part>.+))?$")]
    private static partial Regex ModulePattern();

    [GeneratedRegex("([a-z0-9])([A-Z])")]
    private static partial Regex UpperAfterLower();
}

public sealed class AppModel
{
    private static readonly Lazy<AppModel> Instance = new(Load);

    private AppModel(string backend, IReadOnlyList<ProjectFile> projects, Naming naming)
    {
        Backend = backend;
        Projects = projects;
        Naming = naming;
    }

    public static AppModel Current => Instance.Value;

    public string Backend { get; }

    public IReadOnlyList<ProjectFile> Projects { get; }

    public Naming Naming { get; }

    public bool HasNoModules => !Projects.Any(project => project.Name.Contains(".Modules.", StringComparison.Ordinal));

    public IReadOnlyList<ProjectFile> ModuleProjects => [.. Projects.Where(project => Naming.ModuleOf(project.Name) is not null)];

    public IReadOnlyList<ProjectFile> ModuleCode => [.. ModuleProjects.Where(project => !Naming.IsTest(project.Name))];

    public IReadOnlyList<string> ModuleNames =>
        [.. Projects.Where(project => Naming.IsImplementation(project.Name)).Select(project => Naming.ModuleOf(project.Name)!)];

    public IReadOnlyList<Assembly> Assemblies =>
        [.. Projects.Where(project => !Naming.IsTest(project.Name)).Select(project => Assembly.Load(project.Name))];

    public IReadOnlyList<Type> Types => [.. Assemblies.SelectMany(TypesOf)];

    public IReadOnlyList<Type> TypesIn(Func<string, bool> project) =>
        [.. Assemblies.Where(assembly => project(assembly.GetName().Name!)).SelectMany(TypesOf)];

    public IReadOnlyList<ContextModel> Contexts =>
        [.. TypesIn(name => Naming.PartOf(name) == "Persistence")
            .Where(type => type.IsAssignableTo(typeof(DbContext)) && !type.IsAbstract)
            .Select(type => new ContextModel(
                Naming.ModuleOf(type.Assembly.GetName().Name!)!,
                Naming.ToSnakeCase(Naming.ModuleOf(type.Assembly.GetName().Name!)!),
                ModelOf(type)))];

    public static IReadOnlyList<Type> TypesOf(Assembly assembly) =>
        [.. assembly.GetTypes().Where(type => !type.IsDefined(typeof(CompilerGeneratedAttribute), false) && !type.Name.Contains('<', StringComparison.Ordinal))];

    public static IModel ModelOf(Type contextType)
    {
        var builder = (DbContextOptionsBuilder)Activator.CreateInstance(typeof(DbContextOptionsBuilder<>).MakeGenericType(contextType))!;
        builder.UseNpgsql("Host=localhost;Database=unused").UseSnakeCaseNamingConvention();
        using var context = (DbContext)Activator.CreateInstance(contextType, builder.Options)!;
        return context.GetService<IDesignTimeModel>().Model;
    }

    public static IModule[] Modules => AppModules.All();

    public static async Task<JsonDocument> OpenApiAsync(CancellationToken cancellationToken)
    {
        await using var factory = new ApiFactory(await PostgresServer.CreateMigratedDatabaseAsync(cancellationToken));
        using var client = factory.CreateClient();
        await using var stream = await client.GetStreamAsync(new Uri("/openapi/v1.json", UriKind.Relative), cancellationToken);
        return await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
    }

    private static AppModel Load()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && directory.GetFiles("*.slnx").Length == 0)
        {
            directory = directory.Parent;
        }

        var backend = directory ?? throw new InvalidOperationException($"No .slnx file above {AppContext.BaseDirectory}.");
        var naming = new Naming(Path.GetFileNameWithoutExtension(backend.GetFiles("*.slnx").Single().Name));
        var projects = backend.GetDirectories()
            .SelectMany(folder => folder.GetFiles("*.csproj"))
            .Select(ReadProject)
            .ToArray();
        return new AppModel(backend.FullName, projects, naming);
    }

    private static ProjectFile ReadProject(FileInfo csproj)
    {
        var document = XDocument.Load(csproj.FullName);
        var folder = csproj.DirectoryName!;
        var sources = Directory.EnumerateFiles(folder, "*.cs", SearchOption.AllDirectories)
            .Where(path => !IsBuildOutput(Path.GetRelativePath(folder, path)))
            .Select(path => new SourceFile(Path.GetRelativePath(folder, path).Replace('\\', '/'), File.ReadAllText(path)))
            .ToArray();
        return new ProjectFile(
            Path.GetFileNameWithoutExtension(csproj.Name),
            [.. document.Descendants("ProjectReference")
                .Select(reference => Path.GetFileNameWithoutExtension(reference.Attribute("Include")!.Value))
                .Where(name => !name.Contains('*', StringComparison.Ordinal))],
            [.. document.Descendants("PackageReference").Select(reference => reference.Attribute("Include")!.Value)],
            sources);
    }

    private static bool IsBuildOutput(string relative) =>
        relative.StartsWith("bin", StringComparison.Ordinal) || relative.StartsWith("obj", StringComparison.Ordinal);
}
