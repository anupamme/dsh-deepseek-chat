declare module '*.json' {
  const catalog: { readonly ui: Readonly<Record<string, string>> }
  export default catalog
}
