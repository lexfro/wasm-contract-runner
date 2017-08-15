export default class Runtime {
  storage = null;
  memory = new window.WebAssembly.Memory({ initial: 256, maximum: 256 });
    // todo: figure out how to do counter with multiple executables
  gasCounter = 0;
  dynamicTopPtr = 1024;
  constructor (env, contract) {
    env.memory = this.memory;
    env._storage_write = this.storageWrite;
    env._storage_read = this.storageRead;
    env._debug = this.debug;
    this.contract = contract;
  }

  debug = (ptr, len) => {
    let arr = new Uint8Array(this.memory.buffer);
    let str = '';

    for (let i = 0; i < len; i++) {
      str += String.fromCharCode(arr[ptr + i]);
    }
    console.log('DEBUG', str);
  }

  storageWrite = (keyPtr, valPtr) => {
    const key = readU8(keyPtr, this.memory.buffer, 32);
    const value = readU8(valPtr, this.memory.buffer, 32);

    this.contract.storeSet(key, value);
    return 0;
  }

  storageRead = (keyPtr, destPtr) => {
    const key = readU8(keyPtr, this.memory.buffer, 32);
    const value = this.contract.storeGet(key);

    if (!value) {
      return -1;
    }
    writeU8(destPtr, this.memory.buffer, value);
    return 0;
  }

  malloc (size) {
    let result = this.dynamicTopPtr;

    this.dynamicTopPtr += size;
    return result;
  }

  free () {}
  // TODO: inject gas counter
  gas = function (val) {
    this.gasCounter += val;
  };

  call (instance, args) {
    // call descriptor size
    let ptr = this.malloc(16);
    let dataView = new DataView(this.memory.buffer);

    var argPtr = false;

    if (args.length > 0) {
      argPtr = this.malloc(args.length);
      dataView.setInt32(ptr, argPtr, true);
      dataView.setInt32(ptr + 4, args.length, true);

      for (let i = 0; i < args.length; i++) {
        dataView.setInt8(argPtr + i, args[i], false);
      }
    } else {
      dataView.setInt32(ptr, 0, true);
      dataView.setInt32(ptr + 4, 0, true);
    }

        // zero result
    dataView.setInt32(ptr + 8, 0, true);
    dataView.setInt32(ptr + 12, 0, true);

    this.gasCounter = 0;
    instance.exports._call(ptr);

    let resultPtr = dataView.getInt32(ptr + 8, true);
    let resultLength = dataView.getInt32(ptr + 12, true);

    let free = this.free();

    let result = [];

    if (resultPtr !== 0) {
      for (let i = 0; i < resultLength; i++) {
        result.push(dataView.getUint8(resultPtr + i));
      }
    }

    argPtr && this.free(argPtr);
    resultPtr && this.free(resultPtr);
    this.free(ptr);

    return result;
  }
}

function readU8 (ptr, buffer, len) {
  const view = new DataView(buffer);
  const res = [];

  for (let i = 0; i < len; i++) {
    res.push(view.getUint8(ptr + i));
  }
  return res;
}

function writeU8 (ptr, buffer, value) {
  const view = new DataView(buffer);

  for (let i = 0; i < value.len; i++) {
    view.setUint8(ptr + i, value[i]);
  }
}