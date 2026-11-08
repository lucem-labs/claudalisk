using System.ComponentModel.DataAnnotations;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Claudalisk.Dispatching;
using Claudalisk.Domain;
using Claudalisk.Jobs;
using Claudalisk.Modules;
using Claudalisk.Persistence;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace <Root>.ArchitectureTests;

public static partial class Rules
{
    private static readonly string[] SingularNounsEndingInS = ["Access", "Address", "Analysis", "Basis", "Bus", "Business", "Campus", "Canvas", "Class", "Status", "Process", "Progress"];

    private static readonly string[] RecordMembers = ["ToString", "Equals", "GetHashCode", "Deconstruct", "<Clone>$", "PrintMembers", "op_Equality", "op_Inequality"];

    private static readonly string[] MappingLibraries = ["AutoMapper", "Mapster", "Riok.Mapperly", "Mapperly"];

    public static IEnumerable<string> SingularModuleNames(IEnumerable<Type> modules) =>
        modules.Select(type => type.Name.Replace("Module", "", StringComparison.Ordinal))
            .Where(name => name.EndsWith('s') && !SingularNounsEndingInS.Any(noun => name.EndsWith(noun, StringComparison.Ordinal)))
            .Select(name => $"The module {name} has a plural name.");

    public static IEnumerable<string> ModulesReferenceOnlyInterfaces(IEnumerable<ProjectFile> projects, Naming naming) =>
        from project in projects
        let module = naming.ModuleOf(project.Name)
        where module is not null && !naming.IsTest(project.Name)
        from reference in project.ProjectReferences
        let other = naming.ModuleOf(reference)
        where other is not null && other != module && naming.PartOf(reference) != "Interfaces"
        select $"{project.Name} references {reference}, which is not an Interfaces project.";

    public static IEnumerable<string> OnlyHostAndTestsReferenceImplementations(IEnumerable<ProjectFile> projects, Naming naming) =>
        from project in projects
        where project.Name != naming.Host && !naming.IsTest(project.Name)
        from reference in project.ProjectReferences
        where naming.IsImplementation(reference)
        select $"{project.Name} references the implementation project {reference}.";

    public static IEnumerable<string> NoReferenceToAnotherModulesPersistence(IEnumerable<ProjectFile> projects, Naming naming) =>
        from project in projects
        where project.Name != $"{naming.Root}.ArchitectureTests"
        from reference in project.ProjectReferences
        where naming.PartOf(reference) is "Persistence" or "Persistence.Interfaces"
        where naming.ModuleOf(reference) != naming.ModuleOf(project.Name)
        select $"{project.Name} references {reference}, the persistence of another module.";

    public static IEnumerable<string> MessagesAreLogicFreePocos(IEnumerable<Type> interfaceTypes) =>
        from type in interfaceTypes
        where !IsMarker(type) && !type.IsEnum
        let interfaces = type.GetInterfaces().Where(contract => contract != typeof(IEquatable<>).MakeGenericType(type))
        let badProperty = type.GetProperties().FirstOrDefault(property => IsInfrastructureType(property.PropertyType))
        where interfaces.Any() || type.BaseType != typeof(object) || badProperty is not null
        select $"{type.FullName} is not a plain message: it has a base type, an interface or a property of an infrastructure type.";

    public static IEnumerable<string> InterfacesProjectsReferenceNothing(IEnumerable<ProjectFile> interfacesProjects) =>
        interfacesProjects.Where(project => project.ProjectReferences.Count + project.PackageReferences.Count > 0)
            .Select(project => $"{project.Name} references a project or a package.");

    public static IEnumerable<string> ControllersLiveInHostOrImplementation(IEnumerable<Type> controllers, Naming naming) =>
        from controller in controllers
        let project = controller.Assembly.GetName().Name!
        where project != naming.Host && !naming.IsImplementation(project)
        select $"{controller.FullName} is a controller in {project}.";

    public static IEnumerable<string> DtosLiveInFeaturesOrShared(IEnumerable<Type> dtos) =>
        from dto in dtos
        let inPlace = dto.Namespace is { } ns && (ns.Contains(".Features.", StringComparison.Ordinal) || ns.Contains(".Shared", StringComparison.Ordinal))
        let usesEf = dto.GetProperties().Any(property => InNamespace(property.PropertyType, "Microsoft.EntityFrameworkCore"))
        where !inPlace || usesEf
        select $"{dto.FullName} must live in a feature folder or Shared and must not use EF Core.";

    public static IEnumerable<string> NoDtosInInterfacesOrRootShared(IEnumerable<Type> types) =>
        types.Where(IsDto).Select(type => $"{type.FullName} is a DTO in an Interfaces or Shared project.");

    public static IEnumerable<string> ModuleCountMatchesProjects(int modulesFound, int moduleProjects) =>
        modulesFound == moduleProjects ? [] : [$"Found {modulesFound} modules but {moduleProjects} module csproj files."];

    public static IEnumerable<string> EveryModuleHasPart(IEnumerable<string> modules, IEnumerable<ProjectFile> projects, Naming naming, string part) =>
        from module in modules
        let name = $"{naming.Root}.Modules.{module}.{part}"
        where projects.All(project => project.Name != name)
        select $"The module {module} has no {name} project.";

    public static IEnumerable<string> EfCoreOnlyInPersistence(IEnumerable<ProjectFile> projects, Naming naming) =>
        from project in projects
        where !naming.IsTest(project.Name) && naming.PartOf(project.Name) != "Persistence"
        from package in project.PackageReferences
        where (package.StartsWith("Microsoft.EntityFrameworkCore", StringComparison.Ordinal) && !package.EndsWith(".Design", StringComparison.Ordinal)) || package.StartsWith("Npgsql", StringComparison.Ordinal)
        select $"{project.Name} references {package} outside a Persistence project.";

    public static IEnumerable<string> EntitiesMapToTheirOwnSchema(IEnumerable<ContextModel> contexts) =>
        from context in contexts
        from entity in context.Model.GetEntityTypes()
        where entity.GetSchema() != context.ExpectedSchema
        select $"{entity.Name} maps to the schema {entity.GetSchema()}, not {context.ExpectedSchema}.";

    public static IEnumerable<string> NoForeignKeysAcrossSchemas(IEnumerable<ContextModel> contexts) =>
        from context in contexts
        from entity in context.Model.GetEntityTypes()
        from key in entity.GetForeignKeys()
        where key.PrincipalEntityType.GetSchema() != entity.GetSchema()
        select $"{entity.Name} has a foreign key to the schema {key.PrincipalEntityType.GetSchema()}.";

    public static IEnumerable<string> NoCodeNamesAnotherModulesSchema(IEnumerable<ProjectFile> moduleCode, IReadOnlyCollection<string> schemas, Naming naming) =>
        from project in moduleCode
        let own = Naming.ToSnakeCase(naming.ModuleOf(project.Name)!)
        from schema in schemas.Where(schema => schema != own)
        let pattern = new Regex($"\"{schema}\"|\\b(FROM|JOIN|INTO|UPDATE|TABLE)\\s+\"?{schema}\"?\\.", RegexOptions.IgnoreCase)
        from source in project.Sources
        where pattern.IsMatch(source.Text)
        select $"{project.Name}/{source.Path} names the schema {schema}.";

    public static IEnumerable<string> SuccessResponsesCarryLinksAndActions(JsonDocument document) =>
        from operation in Operations(document)
        where !operation.Tags.Contains("Host")
        from response in operation.Element.GetProperty("responses").EnumerateObject()
        where response.Name.StartsWith('2') && response.Name != "204"
        where response.Value.TryGetProperty("content", out _)
        let schema = response.Value.GetProperty("content").EnumerateObject().First().Value.GetProperty("schema")
        where !HasMember(document, schema, "_links") || !HasMember(document, schema, "_actions")
        select $"{operation.Name} answers {response.Name} without _links and _actions.";

    public static IEnumerable<string> OperationsHaveTheirModulesTag(JsonDocument document, IReadOnlyCollection<string> modules) =>
        from operation in Operations(document)
        where operation.Tags.Count != 1 || (operation.Tags[0] != "Host" && !modules.Contains(operation.Tags[0]))
        select $"{operation.Name} has the tags [{string.Join(", ", operation.Tags)}], not its module's.";

    public static IEnumerable<string> FeaturesDoNotReferenceEachOther(IEnumerable<ProjectFile> implementations) =>
        from project in implementations
        let features = project.Sources.Where(source => source.Path.StartsWith("Features/", StringComparison.Ordinal))
            .GroupBy(source => source.Path.Split('/')[1]).ToArray()
        from feature in features
        from other in features.Where(candidate => candidate.Key != feature.Key)
        let names = other.SelectMany(source => DeclaredType().Matches(source.Text)).Select(match => match.Groups["name"].Value).ToArray()
        from source in feature
        where source.Text.Contains($".Features.{other.Key}", StringComparison.Ordinal)
            || names.Any(name => Regex.IsMatch(source.Text, $@"\b{name}\b"))
        select $"{project.Name}/{source.Path} references the feature {other.Key}.";

    public static IEnumerable<string> SharedDoesNotReferenceFeatures(IEnumerable<SourceFile> sharedSources) =>
        sharedSources.Where(source => source.Text.Contains(".Features.", StringComparison.Ordinal) || source.Text.Contains("using Features", StringComparison.Ordinal))
            .Select(source => $"{source.Path} references a feature from Shared.");

    public static IEnumerable<string> DomainProjectsReferenceOnlySharedAndDomainPackage(IEnumerable<ProjectFile> domainProjects, Naming naming) =>
        from project in domainProjects
        from reference in project.ProjectReferences.Where(reference => reference != naming.Shared)
            .Concat(project.PackageReferences.Where(package => package != "Claudalisk.Domain"))
        select $"{project.Name} references {reference}.";

    public static IEnumerable<string> ControllersDependOnlyOnTheDispatcher(IEnumerable<Type> controllers) =>
        from controller in controllers
        from constructor in controller.GetConstructors()
        from parameter in constructor.GetParameters()
        where parameter.ParameterType != typeof(IDispatcher) && parameter.ParameterType.Namespace != controller.Namespace
        select $"{controller.FullName} depends on {parameter.ParameterType.Name}.";

    public static IEnumerable<string> IdentifiersFitPostgres(IEnumerable<ContextModel> contexts) =>
        from context in contexts
        from entity in context.Model.GetEntityTypes()
        from identifier in IdentifiersOf(entity)
        where Encoding.UTF8.GetByteCount(identifier) > 63
        select $"The identifier {identifier} is longer than 63 bytes.";

    public static IEnumerable<string> ColumnSuffixesMatchTheirType(IEnumerable<ContextModel> contexts) =>
        from context in contexts
        from entity in context.Model.GetEntityTypes()
        from property in entity.GetProperties()
        let column = property.GetColumnName()
        let type = Nullable.GetUnderlyingType(property.ClrType) ?? property.ClrType
        where (type == typeof(DateTimeOffset) || type == typeof(DateTime)) && !column.EndsWith("_timestamp", StringComparison.Ordinal)
            || type == typeof(DateOnly) && !column.EndsWith("_date", StringComparison.Ordinal)
            || type == typeof(bool) && !column.StartsWith("is_", StringComparison.Ordinal) && !column.StartsWith("has_", StringComparison.Ordinal)
        select $"The column {column} does not follow the naming for {type.Name}.";

    public static IEnumerable<string> MessageSuffixesMatchHandlers(IEnumerable<Type> handlers) =>
        from handler in handlers
        from contract in handler.GetInterfaces().Where(IsDispatcherHandler)
        let message = contract.GetGenericArguments()[0].Name
        let expected = Regex.Replace(message, "(Command|Query)$", "") + "Handler"
        where !message.EndsWith("Command", StringComparison.Ordinal) && !message.EndsWith("Query", StringComparison.Ordinal) || handler.Name != expected
        select $"{handler.FullName} handles {message}; a handler is named {expected} and handles a Command or a Query.";

    public static IEnumerable<string> EveryAggregateHasAnEntity(IEnumerable<Type> aggregates, IEnumerable<Type> persistenceTypes) =>
        from aggregate in aggregates
        where persistenceTypes.All(type => type.Name != $"{aggregate.Name}Entity")
        select $"The aggregate {aggregate.FullName} has no {aggregate.Name}Entity.";

    public static IEnumerable<string> EntitiesMapAVersionToken(IEnumerable<Type> aggregates, IEnumerable<ContextModel> contexts)
    {
        var entities = contexts.SelectMany(context => context.Model.GetEntityTypes()).ToArray();
        return from aggregate in aggregates
               let entity = entities.FirstOrDefault(candidate => candidate.ClrType.Name == $"{aggregate.Name}Entity")
               let version = entity?.FindProperty("Version")
               where version is null || !version.IsConcurrencyToken || version.GetColumnName() != "version"
               select $"{aggregate.Name}Entity does not map a version concurrency token.";
    }

    public static IEnumerable<string> ValidatorsLiveNextToTheirMessage(IEnumerable<Type> validators) =>
        from validator in validators
        let message = validator.BaseType!.GetGenericArguments()[0].Name
        let feature = Regex.Replace(message, "(Command|Query)$", "")
        where validator.Name != $"{message}Validator" || validator.Namespace?.EndsWith($".Features.{feature}", StringComparison.Ordinal) != true
        select $"{validator.FullName} validates {message}; it belongs in Features/{feature} as {message}Validator.";

    public static IEnumerable<string> RequestDtosHaveNoValidationAttributes(IEnumerable<Type> requests) =>
        from request in requests
        from member in request.GetProperties().Cast<ICustomAttributeProvider>()
            .Concat(request.GetConstructors().SelectMany(constructor => constructor.GetParameters()))
        where member.GetCustomAttributes(typeof(ValidationAttribute), true).Length > 0
        select $"{request.FullName} has a validation attribute.";

    public static IEnumerable<string> OnlyBackgroundModulesHaveAJobsTable(IEnumerable<ProjectFile> moduleCode, Naming naming) =>
        from module in moduleCode.GroupBy(project => naming.ModuleOf(project.Name)!)
        let sources = module.SelectMany(project => project.Sources).ToArray()
        where sources.Any(source => source.Text.Contains("name: \"jobs\"", StringComparison.Ordinal))
            && !sources.Any(source => source.Text.Contains(nameof(JobsServiceCollectionExtensions.AddClaudaliskModuleJobs), StringComparison.Ordinal))
        select $"The module {module.Key} has a jobs table but accepts no background work.";

    public static IEnumerable<string> NoModuleReferencesAnotherModulesJobs(IEnumerable<ProjectFile> moduleCode, Naming naming) =>
        from project in moduleCode
        let own = naming.ModuleOf(project.Name)
        from source in project.Sources
        from match in OtherModuleJob().Matches(source.Text)
        where match.Groups["module"].Value != own
        select $"{project.Name}/{source.Path} references the job {match.Value}.";

    public static IEnumerable<string> NoExceptionFiltersOrProblemDetailsInModules(IEnumerable<SourceFile> sources) =>
        sources.Where(source => ProblemConstruction().IsMatch(source.Text))
            .Select(source => $"{source.Path} builds Problem Details or an exception filter.");

    public static IEnumerable<string> InterfacesHoldOnlyMessagesAndTheMarker(IEnumerable<Type> interfaceTypes) =>
        from type in interfaceTypes
        where !type.IsEnum
        let methods = type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(method => !method.IsSpecialName && !RecordMembers.Contains(method.Name))
        where type.IsInterface || type.IsAbstract || methods.Any() || IsDto(type)
        select $"{type.FullName} is not a message or the module marker.";

    public static IEnumerable<string> EventHandlersStayOutOfTheUnitOfWork(IEnumerable<Type> handlers) =>
        from handler in handlers
        where handler.GetInterfaces().Any(IsEventHandler) || handler.GetInterfaces().Any(contract => IsDispatcherHandler(contract) && contract.GetGenericArguments()[0].IsAssignableTo(typeof(IDomainEvent)))
        where !handler.GetInterfaces().Any(IsEventHandler) || handler.GetConstructors().SelectMany(constructor => constructor.GetParameters()).Any(parameter => parameter.ParameterType == typeof(IUnitOfWork))
        select $"{handler.FullName} would run an event inside the publisher's unit of work.";

    public static IEnumerable<string> ModuleDependenciesAreAcyclic(IReadOnlyCollection<IModule> modules)
    {
        var byContract = modules.Where(module => module.Contract is not null).ToDictionary(module => module.Contract!);
        foreach (var start in modules)
        {
            var seen = new HashSet<IModule>();
            var pending = new Stack<IModule>(start.Dependencies.Where(byContract.ContainsKey).Select(contract => byContract[contract]));
            while (pending.TryPop(out var current))
            {
                if (current == start)
                {
                    yield return $"The module {start.GetType().Name} depends on itself through other modules.";
                    break;
                }

                if (seen.Add(current))
                {
                    foreach (var next in current.Dependencies.Where(byContract.ContainsKey))
                    {
                        pending.Push(byContract[next]);
                    }
                }
            }
        }
    }

    public static IEnumerable<string> NoMappingLibraries(IEnumerable<ProjectFile> projects) =>
        from project in projects
        from package in project.PackageReferences
        where MappingLibraries.Contains(package)
        select $"{project.Name} references the mapping library {package}.";

    public static IEnumerable<string> NoFakesOfStoresDispatcherOrContext(IEnumerable<SourceFile> testSources) =>
        testSources.Where(source => FakeDeclaration().IsMatch(source.Text))
            .Select(source => $"{source.Path} fakes a store, the dispatcher, the unit of work or a DbContext.");

    private static bool IsMarker(Type type) =>
        type.IsSealed && type.Name.EndsWith("Contract", StringComparison.Ordinal)
        && type.GetProperties().Length == 0 && type.GetFields().Length == 0;

    private static bool IsDto(Type type) =>
        type.Name.EndsWith("Request", StringComparison.Ordinal)
        || type.Name.EndsWith("Response", StringComparison.Ordinal)
        || type.Name.EndsWith("Dto", StringComparison.Ordinal);

    private static bool IsInfrastructureType(Type type) =>
        InNamespace(type, "Microsoft.EntityFrameworkCore")
        || InNamespace(type, "Microsoft.AspNetCore")
        || InNamespace(type, "Microsoft.Extensions")
        || (type.IsInterface && !InNamespace(type, "System.Collections"));

    private static bool InNamespace(Type type, string prefix) =>
        type.Namespace?.StartsWith(prefix, StringComparison.Ordinal) == true
        || type.GetGenericArguments().Any(argument => InNamespace(argument, prefix));

    private static bool IsDispatcherHandler(Type contract) =>
        contract.IsGenericType && contract.GetGenericTypeDefinition() == typeof(IHandler<,>);

    private static bool IsEventHandler(Type contract) =>
        contract.IsGenericType && contract.GetGenericTypeDefinition() == typeof(IEventHandler<>);

    private static IEnumerable<string> IdentifiersOf(IEntityType entity) =>
        new[] { entity.GetTableName() ?? "" }
            .Concat(entity.GetProperties().Select(property => property.GetColumnName()))
            .Concat(entity.GetKeys().Select(key => key.GetName() ?? ""))
            .Concat(entity.GetForeignKeys().Select(key => key.GetConstraintName() ?? ""))
            .Concat(entity.GetIndexes().Select(index => index.GetDatabaseName() ?? ""));

    private static IEnumerable<(string Name, JsonElement Element, IReadOnlyList<string> Tags)> Operations(JsonDocument document) =>
        from path in document.RootElement.GetProperty("paths").EnumerateObject()
        from operation in path.Value.EnumerateObject()
        where operation.Value.ValueKind == JsonValueKind.Object && operation.Value.TryGetProperty("responses", out _)
        let tags = operation.Value.TryGetProperty("tags", out var list) ? list.EnumerateArray().Select(tag => tag.GetString()!).ToArray() : []
        select ($"{operation.Name.ToUpperInvariant()} {path.Name}", operation.Value, (IReadOnlyList<string>)tags);

    private static bool HasMember(JsonDocument document, JsonElement schema, string member)
    {
        if (schema.TryGetProperty("$ref", out var reference))
        {
            var name = reference.GetString()!.Split('/')[^1];
            schema = document.RootElement.GetProperty("components").GetProperty("schemas").GetProperty(name);
        }

        return schema.TryGetProperty("properties", out var properties) && properties.TryGetProperty(member, out _);
    }

    public static IEnumerable<Type> Controllers(IEnumerable<Type> types) =>
        types.Where(type => type.IsAssignableTo(typeof(ControllerBase)) && !type.IsAbstract);

    public static IEnumerable<Type> Aggregates(IEnumerable<Type> types) =>
        types.Where(type => type.IsAssignableTo(typeof(AggregateRoot)) && !type.IsAbstract);

    public static IEnumerable<Type> Validators(IEnumerable<Type> types) =>
        types.Where(type => type.BaseType is { IsGenericType: true } parent && parent.GetGenericTypeDefinition() == typeof(AbstractValidator<>));

    public static IEnumerable<Type> Handlers(IEnumerable<Type> types) =>
        types.Where(type => type.GetInterfaces().Any(contract => IsDispatcherHandler(contract) || IsEventHandler(contract)));

    public static IEnumerable<Type> Dtos(IEnumerable<Type> types) => types.Where(IsDto);

    public static IEnumerable<Type> Requests(IEnumerable<Type> types) =>
        types.Where(type => type.Name.EndsWith("Request", StringComparison.Ordinal));

    public static IEnumerable<Type> ModuleClasses(IEnumerable<Type> types) =>
        types.Where(type => type.IsAssignableTo(typeof(IModule)) && !type.IsAbstract);

    [GeneratedRegex(@"\b(class|record|interface|enum|struct)\s+(?<name>[A-Z]\w+)")]
    private static partial Regex DeclaredType();

    [GeneratedRegex(@"Modules\.(?<module>\w+)\.[\w.]*Job\w*")]
    private static partial Regex OtherModuleJob();

    [GeneratedRegex(@"\b(ExceptionFilterAttribute|IExceptionFilter|IAsyncExceptionFilter)\b|new\s+(Validation)?ProblemDetails\b")]
    private static partial Regex ProblemConstruction();

    [GeneratedRegex(@"(class|record)\s+\w+[^{;]*:[^{;]*\b(I\w+Store|I\w+ReadStore|IDispatcher|IUnitOfWork|DbContext)\b|(Substitute\.For|Mock)<\s*(I\w+Store|I\w+ReadStore|IDispatcher|IUnitOfWork)")]
    private static partial Regex FakeDeclaration();
}
