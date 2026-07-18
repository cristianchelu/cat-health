/**
 * Node custom loader: treat CSS imports as empty modules so component
 * side-effect CSS imports work under node:test.
 */
export async function load(url, context, nextLoad) {
  if (url.endsWith('.css') || url.includes('.css?')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: 'export default {};\n',
    };
  }
  return nextLoad(url, context);
}
