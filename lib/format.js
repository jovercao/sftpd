const { constants } = require('fs');
const { hasPermission } = require('./permission');
const OPEN_MODE = require('ssh2').SFTP_OPEN_MODE;
const path = require('path');
const moment = require('moment');

function formatAttrs(stats) {
  return {
    mode: stats.mode, //, stats.isFile() ? '0600' : (0o600 | constants.S_IFDIR),
    atime: stats.atimeMs / 1000,
    mtime: stats.mtimeMs / 1000,
    size: stats.size,
    uid: 0,
    gid: 0
  }
}

function formatName(virtualPath, stats, user, fullpath = false) {
  let typeFlag;
  if (stats.isDirectory()) {
      typeFlag = 'd'
        + (user.hasPermission(virtualPath, 'dir', OPEN_MODE.READ) ? 'r' : '-')
        + (user.hasPermission(virtualPath, 'dir', OPEN_MODE.WRITE) ? 'w' : '-');
  } else if (stats.isFile()) {
      typeFlag = '-'
        + (user.hasPermission(virtualPath, 'file', OPEN_MODE.READ) ? 'r' : '-')
        + (user.hasPermission(virtualPath, 'file', OPEN_MODE.WRITE) ? 'w' : '-');
  } else {
      logger.debug('未知文件类型', stats);
      return null;
  }
  typeFlag += '-------';
  const basename = path.basename(virtualPath);
  return {
    filename: fullpath ? virtualPath : basename,
    longname: `${typeFlag} ${stats.nlink} ${user.username} ${user.group || user.username} ${stats.size} ${moment(stats.mtime).format('MMM D H:mm')} ${basename}`,
    attrs: formatAttrs(stats)
  };
}

module.exports = {
  formatAttrs,
  formatName
};
