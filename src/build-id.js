// The build's stamp (D71), set by tools/build.js. Tests that load the source directly have none.
/* global __BUILD_ID__ */
// @ts-ignore: defined by the bundler
export const BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'source';
