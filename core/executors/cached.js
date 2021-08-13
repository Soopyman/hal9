import Executor from './definition'
import * as snippets from '../snippets';

import RemoteExecutor from './remote'
import LocalExecutor from './local'

import clone from '../utils/clone';

import md5 from 'crypto-js/md5';

import { isElectron } from '../utils/environment'

const isArquero = (e) => e && typeof(e.columnNames) === 'function';

const isDanfo = (e) => e && typeof(e.col_data_tensor) === 'object';

const smartclone = (entries) => {
  var cloned = {};
  Object.keys(entries).map(name => {
    if (isArquero(entries[name]) || isDanfo(entries[name])) {
      cloned[name] = entries[name];
    }
    else {
      cloned[name] = clone(entries[name]);
    }
  });
  return cloned;
}

export default class CachedExecutor extends Executor {
  async runStep() {
    
    // only allow relevant fields to invalidate the cache
    var step = Object.assign({}, { id: this.step.id, params: this.step.params });

    const hashes = {
      inputs: md5(JSON.stringify(this.inputs)).toString(),
      script: md5(JSON.stringify(this.script)).toString(),
      params: md5(JSON.stringify(this.params)).toString()
    };

    var result = null;
    var changed = true;

    if (this.state && this.state.cache && this.state.cache.hashes) {
      const changedHashes = Object.keys(hashes).filter(name => this.state.cache.hashes[name] != hashes[name]);
      if (changedHashes.length > 0) {
        console.log('Cache for step ' + this.step.name + ' invalidated due to ' + JSON.stringify(changedHashes));
      }
      else {
        changed = false;
      }
    }

    if (!changed) {
      result = this.state.cache.result;
    }
    else {
      const metadata = snippets.parseHeader(this.script);

      if (metadata.environment === 'desktop') {
        metadata.environment = isElectron() ? undefined : 'worker';
      }

      var executor = null;
      if (metadata.environment === 'worker') {
        executor = new RemoteExecutor(this.inputs, this.step, this.context, this.script, this.params, this.deps, this.state, this.callbacks);
      }
      else {
        executor = new LocalExecutor(this.inputs, this.step, this.context, this.script, this.params, this.deps, this.state, this.callbacks);
      }

      result = await executor.runStep();
    }

    result = Object.assign(result, { state: {
      cache: {
        hashes: hashes,
        result: smartclone(result)
      }
    }});

    return result;
  }
}