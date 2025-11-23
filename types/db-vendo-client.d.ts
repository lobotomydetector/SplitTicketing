declare module 'db-vendo-client' {
    export function createClient(profile: any, userAgent: string, opt?: any): any;
}

declare module 'db-vendo-client/p/dbnav/index.js' {
    export const profile: any;
}
