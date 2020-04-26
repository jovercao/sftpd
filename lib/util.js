const os = require('os');

const isWin32 = os.platform() === 'win32';

function joinPath(...nodes) {
  let aPath = path.join(...nodes);
  if (isWin32) {
    aPath = aPath.replace(/\\/g, '/');
  }
  return aPath;
}

function resolvePath(relativePath) {
  let virtualPath = path.resolve('/', relativePath);
  if (isWin32) {
    // windows平台中的代码盘符长度
    const win32PatterLen = process.cwd().split(path.sep)[0].length;
    virtualPath = virtualPath.substr(win32PatterLen).replace(/\\/g, '/');
  }
  return virtualPath;
}

module.exports = {
  joinPath,
  resolvePath
};
