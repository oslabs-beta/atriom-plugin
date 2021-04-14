const fs = require('fs');
const AutomaticVendorFederation = require('@module-federation/automatic-vendor-federation');
const convertToGraph = require('./convertToGraph');

/** @typedef {import('webpack/lib/Compilation')} Compilation */
/** @typedef {import('webpack/lib/Compiler')} Compiler */

/**
 * @typedef AtriomPluginOptions
 * @property {string} filename
 * @property {function} reportFunction
 */

const PLUGIN_NAME = 'AtriomPlugin';

class AtriomPlugin {
  /**
   *
   * @param {AtriomPluginOptions} options
   */
  constructor(options) {
    this._options = options;
    this._dashData = null;
  }

  /**
   * @param {Compiler} compiler
   */
  apply(compiler) {
    const FederationPlugin = compiler.options.plugins.find((plugin) => {
      return plugin.constructor.name === 'ModuleFederationPlugin';
    });
    let FederationPluginOptions;
    if (FederationPlugin) {
      FederationPluginOptions = FederationPlugin._options;
    }

    compiler.hooks.afterDone.tap(PLUGIN_NAME, (liveStats) => {
      if (!this._options.outputPath) {
        console.warn('ATRIOM WARNING: No output path provided in options.');
        process.exit(1);
      }
      const stats = liveStats.toJson();

      // find relevant module objects
      const modules = stats.modules.filter((module) => {
        const array = [
          module.name.includes('container entry'),
          // modules brought in from other apps
          module.name.includes('remote '),
          // shared dependencies (react, redux, etc.)
          module.name.includes('shared module '),
          module.name.includes('provide module '),
        ];
        return array.some((item) => item);
      });
      const directReasons = new Set();
      Array.from(modules).forEach((module) => {
        if (module.reasons) {
          module.reasons.forEach((reason) => {
            if (reason.userRequest) {
              try {
                // grab user required package.json
                const subsetPackage = require(reason.userRequest +
                  '/package.json');
                directReasons.add(subsetPackage);
              } catch (e) {}
            }
          });
        }
      });
      // get RemoteEntryChunk
      // find chunk associated with current app - find first chunk in stats.chunks with a name that matches the current app
      const RemoteEntryChunk = stats.chunks.find((chunk) => {
        const specificChunk = chunk.names.find((name) => {
          return name === FederationPluginOptions.name;
        });
        return specificChunk;
      });
      // use liveStats.compilation.namedChunks (JS Map Object)
      // get chunk that is associated with the current application
      // getting this by using the chunk associated with FederationPluginOptions.name provided in webpack config
      const namedChunkRefs = liveStats.compilation.namedChunks.get(
        FederationPluginOptions.name
      );

      // AllReferencedChunksByRemote is a Set (or array if namedChunkRefs is falsey)
      const AllReferencedChunksByRemote = namedChunkRefs
        ? namedChunkRefs.getAllReferencedChunks()
        : [];

      const validChunkArray = [];
      AllReferencedChunksByRemote.forEach((chunk) => {
        if (chunk.id !== FederationPluginOptions.name) {
          // will chunk.id ever equal FederationPluginOptions.name?? - FederationPluginOptions.name refers to the name of the application
          validChunkArray.push(chunk);
        }
      });
      // validChunkArray is now an array of chunk objects (in this case, identical to the AllReferencedChunksByRemote Set)

      function mapToObjectRec(m) {
        let lo = {};
        for (let [k, v] of Object.entries(m)) {
          if (v instanceof Map) {
            lo[k] = mapToObjectRec(v);
          } else if (v instanceof Set) {
            lo[k] = mapToObjectRec(Array.from(v));
          } else {
            lo[k] = v;
          }
        }
        return lo;
      }

      const chunkDependencies = validChunkArray.reduce((acc, chunk) => {
        const subset = chunk.getAllReferencedChunks();
        const stringifiableChunk = Array.from(subset).map((sub) => {
          const cleanSet = Object.getOwnPropertyNames(sub).reduce(
            (acc, key) => {
              if (key === '_groups') return acc;
              return Object.assign(acc, { [key]: sub[key] });
            },
            {}
          );
          return mapToObjectRec(cleanSet);
        });
        return Object.assign(acc, {
          [chunk.id]: stringifiableChunk,
        });
      }, {});
      let packageJson,
        vendorFederation = {};
      try {
        packageJson = require(liveStats.compilation.options.context +
          '/package.json');
      } catch (e) {}
      if (packageJson) {
        vendorFederation.dependencies = AutomaticVendorFederation({
          exclude: [],
          ignoreVersion: false,
          packageJson,
          subPackages: Array.from(directReasons),
          shareFrom: ['dependencies'],
          ignorePatchVersion: true,
        });
        vendorFederation.devDependencies = AutomaticVendorFederation({
          exclude: [],
          ignoreVersion: false,
          packageJson,
          subPackages: Array.from(directReasons),
          shareFrom: ['devDependencies'],
          ignorePatchVersion: true,
        });
        vendorFederation.optionalDependencies = AutomaticVendorFederation({
          exclude: [],
          ignoreVersion: false,
          packageJson,
          subPackages: Array.from(directReasons),
          shareFrom: ['optionalDependencies'],
          ignorePatchVersion: true,
        });
      }

      const rawData = {
        name: FederationPluginOptions.name,
        metadata: this._options.metadata || {},
        topLevelPackage: vendorFederation || {},
        publicPath: stats.publicPath,
        federationRemoteEntry: RemoteEntryChunk,
        buildHash: stats.hash,
        modules,
        chunkDependencies,
      };

      let graphData = null;
      try {
        graphData = convertToGraph(rawData);
      } catch (err) {
        console.warn('Error during dashboard data processing');
        console.warn(err);
      }

      if (graphData) {
        const dashData = (this._dashData = JSON.stringify(graphData));

        // Write to user-specified path
        // Filename will be user-specified or 'ATRIOM'
        const filePathAtriom = `${this._options.outputPath}/${
          this._options.filename || 'ATRIOM'
        }.dat`;
        console.log('ATRIOM: Writing to...', filePathAtriom);
        fs.appendFile(
          filePathAtriom,
          dashData + ',',
          { encoding: 'utf-8' },
          () => {}
        );
      }
    });
  }
}

module.exports = AtriomPlugin;
