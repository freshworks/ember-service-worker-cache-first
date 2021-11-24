'use strict';

const Plugin = require('broccoli-plugin');
const fs = require('fs');
const path = require('path');

module.exports = class Config extends Plugin {
  constructor(inputNodes, options) {
    super(inputNodes, {
      name: options && options.name,
      annotation: options && options.annotation
    });

    this.options = options;
  }

  build() {
    let options = this.options;
    // let name = options.name || 'FD-api-cache';
    let assetCacheName = options.assets_name || 'FD-lazy-assets-cache';
    let apiCacheName = options.api_name || 'FD-api-cache';

    let version = options.version || '1';
    let maxAgeHours = options.maxAgeHours || 0;
    let apiPatterns = options.apiPatterns || [];
    let assetPattrns = options.assetPattrns || [];

    let module = '';

    module += `export const ASSET_CACHE_KEY_PREFIX = '${assetCacheName}';\n`;
    module += `export const API_CACHE_KEY_PREFIX = '${apiCacheName}';\n`;

    module += `export const VERSION = '${version}';\n`;

    const hasApiPatterns = apiPatterns.length > 0;
    const hasAssetPatterns = assetPattrns.length > 0;
    const hasNoPatterns = !hasApiPatterns && !hasAssetPatterns;

    if (hasNoPatterns) {
      module += 'export const API_PATTERNS = [];\n';
      module += 'export const ASSET_PATTERNS = [];\n';
    } else {
      apiPatterns = apiPatterns.map((pattern) => pattern.replace(/\\/g, '\\\\'));
      assetPattrns = assetPattrns.map((pattern) => pattern.replace(/\\/g, '\\\\'));

      if (hasApiPatterns && hasAssetPatterns) {
        module += `export const API_PATTERNS = ['${apiPatterns.join("', '")}'];\n`;
        module += `export const ASSET_PATTERNS = ['${assetPattrns.join("', '")}'];\n`;
      } else {
        if (hasApiPatterns) {
          module += `export const API_PATTERNS = ['${apiPatterns.join("', '")}'];\n`;
          module += 'export const ASSET_PATTERNS = [];\n';
        }
        if (hasAssetPatterns) {
          module += 'export const API_PATTERNS = [];\n';
          module += `export const ASSET_PATTERNS = ['${assetPattrns.join("', '")}'];\n`;
        }
      }
    }

    fs.writeFileSync(path.join(this.outputPath, 'config.js'), module);
  }
};
