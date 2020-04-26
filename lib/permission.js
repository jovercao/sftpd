const OPEN_MODE = require('ssh2').SFTP_OPEN_MODE;

function makePermissionChecker(permission) {
  // 默认权限的
  const normalPermission = Object.assign({ MKDIR: true, RMDIR: true, READ: true, WRITE: true, REMOVE: true, CREATE: true }, permission);

  /**
   * 判断用户是否有该路径的访问权限
   * @param {*} virtualPath 访问的虚拟路径
   * @param {*} pathType 路径类型，file / dir
   * @param {*} flags 访问方式flag
   * @returns {boolean} 返回是否拥有权限
   */
  return function hasPermission(virtualPath, pathType, flags) {
    const hasRead = flags & OPEN_MODE.READ;
    const hasWrite = flags & OPEN_MODE.WRITE || flags & OPEN_MODE.APPEND || flags & OPEN_MODE.EXCL || flags & OPEN_MODE.TRUNC;
    let result = true;
    if (pathType === 'file') {
      if (flags & OPEN_MODE.CREAT) {
        result = result && normalPermission['CREATE'];
      }
      if (flags & OPEN_MODE.EXCL) {
        result = result && normalPermission['REMOVE'];
      }
      if (hasWrite) {
        result = result && normalPermission['WRITE'];
      }
      if (hasRead) {
        result = result && normalPermission['READ'];
      }
    } else if (pathType === 'dir') {
      // 文件夹权限
      if (flags & OPEN_MODE.CREAT) {
        result = result && normalPermission['MKDIR'];
      }
      if (flags & OPEN_MODE.EXCL) {
        result = result && normalPermission['RMDIR'];
      }
      if (hasRead) {
        result = result && normalPermission['READ'];
      }
      if (hasWrite) {
        result = result && normalPermission['WRITE'];
      }
    } else {
      throw new Error('不支持的文件类型！');
    }
    return result;
  };
}

module.exports = {
  makePermissionChecker
};
