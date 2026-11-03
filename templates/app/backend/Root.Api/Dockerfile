FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . ./
RUN dotnet restore <Root>.Api/<Root>.Api.csproj
RUN dotnet publish <Root>.Api/<Root>.Api.csproj --no-restore --configuration Release --output /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app/publish ./
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
USER $APP_UID
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 CMD ["dotnet", "<Root>.Api.dll", "--health-check"]
ENTRYPOINT ["dotnet", "<Root>.Api.dll"]
