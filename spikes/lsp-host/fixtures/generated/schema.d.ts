export interface paths {
    "/api/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["GetHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/orders/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "text/plain": components["schemas"]["OrderResponse"];
                        "application/json": components["schemas"]["OrderResponse"];
                        "text/json": components["schemas"]["OrderResponse"];
                    };
                };
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type?: null | string;
                            title?: null | string;
                            status?: null | number;
                            detail?: null | string;
                            instance?: null | string;
                        };
                    };
                };
                412: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type?: null | string;
                            title?: null | string;
                            status?: null | number;
                            detail?: null | string;
                            instance?: null | string;
                        };
                    };
                };
                428: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type?: null | string;
                            title?: null | string;
                            status?: null | number;
                            detail?: null | string;
                            instance?: null | string;
                        };
                    };
                };
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type?: null | string;
                            title?: null | string;
                            status?: null | number;
                            detail?: null | string;
                            instance?: null | string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreateOrderRequest"];
                    "text/json": components["schemas"]["CreateOrderRequest"];
                    "application/*+json": components["schemas"]["CreateOrderRequest"];
                };
            };
            responses: {
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "text/plain": components["schemas"]["OrderResponse"];
                        "application/json": components["schemas"]["OrderResponse"];
                        "text/json": components["schemas"]["OrderResponse"];
                    };
                };
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type?: null | string;
                            title?: null | string;
                            status?: null | number;
                            detail?: null | string;
                            instance?: null | string;
                        };
                    };
                };
                412: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type?: null | string;
                            title?: null | string;
                            status?: null | number;
                            detail?: null | string;
                            instance?: null | string;
                        };
                    };
                };
                428: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type?: null | string;
                            title?: null | string;
                            status?: null | number;
                            detail?: null | string;
                            instance?: null | string;
                        };
                    };
                };
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type?: null | string;
                            title?: null | string;
                            status?: null | number;
                            detail?: null | string;
                            instance?: null | string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        CreateOrderRequest: {
            name: string;
        };
        HalAction: {
            href: string;
            method: string;
        };
        HalLink: {
            href: string;
        };
        HealthResponse: {
            status: string;
            database: string;
            environment: null | string;
            deployedSha: string;
            deployedRef: string;
        };
        OrderResponse: {
            id: string;
            name: string;
            version: number;
            _links: {
                [key: string]: components["schemas"]["HalLink"];
            };
            _actions: {
                [key: string]: components["schemas"]["HalAction"];
            };
        };
        ProblemDetails: {
            type?: null | string;
            title?: null | string;
            status?: null | number;
            detail?: null | string;
            instance?: null | string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    GetHealth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthResponse"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type?: null | string;
                        title?: null | string;
                        status?: null | number;
                        detail?: null | string;
                        instance?: null | string;
                    };
                };
            };
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type?: null | string;
                        title?: null | string;
                        status?: null | number;
                        detail?: null | string;
                        instance?: null | string;
                    };
                };
            };
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type?: null | string;
                        title?: null | string;
                        status?: null | number;
                        detail?: null | string;
                        instance?: null | string;
                    };
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
        };
    };
}
