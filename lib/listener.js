const ssh2 = require('ssh2');
const SFTPStream = require('ssh2-streams').SFTPStream;
const fs = require('fs');
const path = require('path');
const OPEN_MODE = ssh2.SFTP_OPEN_MODE;
const STATUS_CODE = ssh2.SFTP_STATUS_CODE;
const hashPwd = require('./passwordHasher');
const fse = require('fs-extra');
const { formatName, formatAttrs } = require('./format');
const { makePermissionChecker } = require('./permission');
const { createWatcher } = require('./ipWatcher');
const { resolvePath, joinPath } = require('./util');
const uuid = require('uuid');
const fsp = fs.promises;

const AUTH_METHODS = [
  'password'
  // 'none',
  // 'publickey',
  // 'keyboard-interactive'
];

function makeListener(config, ctx) {
  const onlineUsers = new Set();
  const userCounts = {
  };
  const { logger, server } = ctx;
  let ipWatcher;
  if (config.ttlEnable !== false) {
    ipWatcher = config.ipLockTimes === 0 ? () => true : createWatcher(config.ipLockTimes, config.ipLockSpan, config.ipLockTTL);
  }

  const clients = new Set();

  const listener = function(client, info) {
    clients.add(client);
    // 当前登录用户
    let user;
    logger.info(`客户端连接，连接客户端IP为：${info.ip}！`);
    client.on('authentication', function (ctx) {
      try {
        const matchedUser = config.users.find(u => u.username.toUpperCase() === ctx.username.toUpperCase());
        if (!matchedUser) {
          logger.info(`登录失败！未找到用户名为${ctx.username}的用户，连接客户端IP为：${info.ip}！。`);
          return ctx.reject(AUTH_METHODS);
        }

        // 用户已禁用
        if (matchedUser.disable === true) {
          logger.info(`用户：${ctx.username} 已禁用，登录失败！`);
          return ctx.reject(AUTH_METHODS);
        }
        switch (ctx.method) {
          case 'password':
            if (ipWatcher && !ipWatcher(info.ip)) {
              logger.warn(`用户:${ctx.username}，IP:${info.ip}因连接次数过多被锁定，已拒绝连接。`);
              return ctx.reject(AUTH_METHODS);
            }
            const password = hashPwd(ctx.password);
            if (password.length !== matchedUser.password.length
              || password !== matchedUser.password) {
              logger.warn(`用户${ctx.username}密码错误，已拒绝连接，连接客户端IP为：${info.ip}！。`);
              return ctx.reject(AUTH_METHODS);
            }
            break;
          // case 'none':
          //   ctx.reject('retry');
          //   break;
          default:
            logger.info(`用户${ctx.username}使用不支持的方式登录，已拒绝，连接客户端IP为：${info.ip}！。`);
            return ctx.reject(AUTH_METHODS);
        }
        const userConnections = userCounts[matchedUser.username] || 0;
        if (matchedUser.maxConnections && userConnections >= matchedUser.maxConnections) {
          logger.error(`用户${ctx.username}超出最大连接数${matchedUser.maxConnections}，已拒绝连接，连接客户端IP为：${info.ip}！。`);
          return ctx.reject(AUTH_METHODS);
        }
        let rootDir;
        if (matchedUser.rootDir) {
          rootDir = path.resolve(matchedUser.rootDir);
        } else {
          rootDir = path.resolve(config.dataDir, matchedUser.username);
        }
        // 登录用户名
        user = {
          sessionId: uuid.v4(),
          username: matchedUser.username,
          hasPermission: makePermissionChecker(matchedUser.permission),
          loginAt: Date.now(),
          released: false,
          client,
          ip: info.ip,
          // 用户根目录
          rootDir,
          // 打开的资源，包括文件和目录
          openeds: Object.create(null),
          // 路径解释器
          resolve: (virtualPath) => {
            const localPath = path.resolve(path.join(rootDir, virtualPath));
            if (!localPath.startsWith(rootDir)) {
              logger.warn(`系统正遭到越界非法攻击！用户：${user.username}，ip: ${info.ip}`);
              throw new Error('非法攻击！');
            }
            return localPath;
          },
          async release() {
            if (this.released) return;
            this.released = true;
            // 强制释放资源
            for (const opened of Object.values(this.openeds)) {
              if (opened.type === 'file') {
                await opened.handle.close();
              }
            }
            delete this.openeds;
            userCounts[user.username]--;
            // 移除在线用户
            onlineUsers.delete(this);
          }
        };
        Object.defineProperty(client, 'user', {
          get() {
            return user;
          }
        });
        userCounts[user.username] = userConnections + 1;
        onlineUsers.add(user);
        ctx.accept();
      } catch (error) {
        logger.error(`在身份验证时遇到错误：${error}`);
        ctx.reject(AUTH_METHODS);
      }
    }).on('ready', function () {
      logger.info(`用户${user.username}登录成功，客户端IP地址为：${user.ip}！`);
      let handlerCount = 0;
      client.on('session', async function (accept, reject) {
        await fse.ensureDir(user.rootDir);
        logger.info(`会话创建成功！用户：${user.username}，主目录：${user.rootDir}`);
        const session = accept();
        session.on('sftp', function (accept, reject) {
          // `sftpStream` is an `SFTPStream` instance in server mode
          // see: https://github.com/mscdex/ssh2-streams/blob/master/SFTPStream.md
          const sftpStream = accept();
          sftpStream.on('REALPATH', async function (reqid, relativePath) {
            try {
              // logger.debug(`用户 ${user.username} REALPATH ${relativePath}`);
              let virtualPath = resolvePath(relativePath);
              const localPath = user.resolve(virtualPath);
              const stats = await fsp.stat(localPath);
              return sftpStream.name(reqid, [
                formatName(virtualPath, stats, user, true)
              ]);
            } catch (error) {
              logger.error(`用户 ${user.username} REALPATH ${relativePath} 时遇到错误：\n${error}`);
              return sftpStream.status(reqid, STATUS_CODE.NO_SUCH_FILE);
            }
          }).on('STAT', async function (reqid, virtualPath) {
            // logger.debug(`用户 ${user.username} stat ${filename}`);
            try {
              const localPath = user.resolve(virtualPath);
              const stats = await fsp.stat(localPath);
              sftpStream.attrs(reqid, formatAttrs(stats));
            } catch (error) {
              logger.error(`用户 ${user.username} STAT ${virtualPath} 时发生错误：${error}`);
              sftpStream.status(reqid, STATUS_CODE.FAILURE, error.message);
            }
          }).on('LSTAT', async function (reqid, virtualPath) {
            // logger.debug(`用户 ${user.username} LSTAT ${filename}`);
            try {
              const localPath = user.resolve(virtualPath);
              const stats = await fsp.lstat(localPath);
              sftpStream.attrs(reqid, formatAttrs(stats));
            } catch (error) {
              logger.error(`用户 ${user.username} LSTAT ${virtualPath} 时发生错误：${error}`);
              sftpStream.status(reqid, STATUS_CODE.FAILURE);
            }
          }).on('FSTAT', async function (reqid, handle) {
            let opened;
            if (handle.length !== 4 || !(opened = user.openeds[handle.readUInt32BE(0, true)])) {
              return sftpStream.status(reqid, STATUS_CODE.FAILURE);
            }
            if (opened.type !== 'file') {
              return sftpStream.status(reqid, STATUS_CODE.FAILURE, '无效的文件句柄！');
            }
            try {
              // logger.debug(`用户 ${user.username} FSTAT ${opened}`);
              const stats = await opened.handle.stat();
              sftpStream.attrs(reqid, formatAttrs(stats));
            } catch (error) {
              logger.error(`用户 ${user.username} FSTAT ${opened.localPath} 时发生错误：${error}`);
              sftpStream.status(reqid, STATUS_CODE.FAILURE, error.message);
            }
          }).on('OPEN', async function (reqid, virtualPath, flags, attrs) {
            // logger.debug(`用户 ${user.username} OPEN ${filename}`);
            let opened;
            try {
              const localPath = user.resolve(virtualPath);
              // 权限检查
              if (!user.hasPermission(virtualPath, 'file', flags)) {
                return sftpStream.status(reqid, STATUS_CODE.PERMISSION_DENIED);
              }
              // const flagStr = SFTPStream.flagsToString(flags);
              // if (!flagStr) {
              if (!fs.existsSync(localPath)) {
                opened = await fsp.open(localPath, 'as+');
              } else {
                opened = await fsp.open(localPath, 'r');
              }
              // } else {
              //   opened = await fsp.open(localPath, flagStr);
              // }
              // opened = fsp.open(localPath, '', flags);
              handlerCount++;
              user.openeds[handlerCount] = {
                type: 'file',
                // 虚拟路径
                virtualPath,
                // 本地路径
                localPath,
                handle: opened,
                stats: await opened.stat()
              };
              const handle = Buffer.alloc(4);
              handle.writeUInt32BE(handlerCount, 0);
              logger.info(`用户 ${user.username} OPEN ${virtualPath}`);
              return sftpStream.handle(reqid, handle);
            } catch (error) {
              logger.error(`用户 ${user.username} OPEN ${virtualPath} 时发生错误：${error}`);
              if (opened) {
                try {
                  await opened.close();
                  // logger.debug(`对用户 ${user.username} OPEN ${filename} 时的异常处理：关闭文件句柄`);
                } catch (ex) {
                  logger.warn(`对用户 ${user.username} OPEN ${virtualPath} 时的异常处理，发生错误：${ex}`);
                }
              }
              return sftpStream.status(reqid, STATUS_CODE.FAILURE, error.message);
            }
          }).on('WRITE', async function (reqid, handle, offset, data) {
            let opened;
            if (handle.length !== 4 || !(opened = user.openeds[handle.readUInt32BE(0, true)])) {
              return sftpStream.status(reqid, STATUS_CODE.FAILURE);
            }
            // // 如果流不存在
            // if (!opened.wstream) {
            //   opened.wstream = fs.createWriteStream(opened.localPath);
            // }
            try {
              // logger.debug(`用户 ${user.username} WRITE ${opened.virtualPath}`);
              // opened.wstream.write(data);
              opened.handle.write(data, 0, Buffer.byteLength(data), offset);
              return sftpStream.status(reqid, STATUS_CODE.OK);
            } catch (error) {
              logger.error(`用户 ${user.username} WRITE ${opened.virtualPath} 时发生错误：${error}`);
              sftpStream.status(reqid, STATUS_CODE.FAILURE);
            }
          }).on('READ', async function (reqid, handle, offset, length) {
            try {
              let opened;
              if (handle.length !== 4 || !(opened = user.openeds[handle.readUInt32BE(0, true)])) {
                return sftpStream.status(reqid, STATUS_CODE.FAILURE);
              }
              // logger.debug(`用户 ${user.username} READ ${opened.virtualPath} LENGTH ${length}`);
              if (offset >= opened.stats.size) {
                return sftpStream.status(reqid, STATUS_CODE.EOF);
              }
              const dataSize = Math.min(length, opened.stats.size - offset);
              const data = Buffer.alloc(dataSize);
              await opened.handle.read(data, 0, dataSize, offset);
              sftpStream.data(reqid, data);
            } catch (error) {
              switch (error.code) {
                case 'ERR_OUT_OF_RANGE':
                  return sftpStream.status(reqid, STATUS_CODE.EOF);
                default:
                  return sftpStream.status(reqid, STATUS_CODE.FAILURE);
              }
            }
          }).on('CLOSE', async function (reqid, handle) {
            try {
              let opened, handleNum;
              if (handle.length !== 4 || !(opened = user.openeds[handleNum = handle.readUInt32BE(0, true)])) {
                return sftpStream.status(reqid, STATUS_CODE.FAILURE);
              }
              // 关闭文件
              if (opened.type === 'file') {
                await opened.handle.close();
              }
              // if (opened.wstream) {
              //   opened.wstream.end();
              //   opened.wstream.destroy();
              // }
              delete user.openeds[handleNum];
              handlerCount--;
              sftpStream.status(reqid, STATUS_CODE.OK);
              logger.info(`用户 ${user.username} CLOSE ${opened.type} ${opened.virtualPath}`);
            } catch (error) {
              logger.error(`用户 ${user.username} CLOSE 时遇到错误：${error}`);
              sftpStream.status(reqid, STATUS_CODE.FAILURE);
            }
          }).on('OPENDIR', async function (reqid, virtualPath) {
            // 权限检查
            if (!user.hasPermission(virtualPath, 'dir', OPEN_MODE.READ)) {
              return sftpStream.status(reqid, STATUS_CODE.PERMISSION_DENIED);
            }
            // logger.debug(`用户 ${user.username} OPENDIR ${dir}`);
            try {
              const localPath = user.resolve(virtualPath);
              const stats = await fsp.stat(localPath);
              if (!stats.isDirectory()) {
                return sftpStream.status(reqid, STATUS_CODE.FAILURE, '该路径不是目录');
              }
              handlerCount++;
              const list = (await fsp.readdir(localPath)).map(file => {
                const filePath = path.join(localPath, file);
                return {
                  filename: joinPath(virtualPath, file),
                  stats: fs.statSync(filePath)
                };
              }).filter(item => item.stats.isDirectory() || item.stats.isFile())
                .map(item => formatName(item.filename, item.stats, user));

              user.openeds[handlerCount] = {
                type: 'dir',
                virtualPath,
                localPath,
                list
              };
              const handle = Buffer.alloc(4);
              handle.writeUInt32BE(handlerCount, 0);
              logger.info(`用户 ${user.username}(${user.sessionId}) OPENDIR ${virtualPath}`);
              sftpStream.handle(reqid, handle);
            } catch (error) {
              logger.error(`用户 ${user.username} opendir ${virtualPath} 时发生错误：${error}`);
              return sftpStream.status(reqid, STATUS_CODE.FAILURE, error.message);
            }
          }).on('READDIR', function (reqid, handle) {
            let opened;
            if (handle.length !== 4 || !(opened = user.openeds[handle.readUInt32BE(0, true)])) {
              return sftpStream.status(reqid, STATUS_CODE.FAILURE);
            }
            try {
              logger.info(`用户 REQID: ${reqid} ${user.username}(${user.sessionId}) READDIR ${opened.virtualPath}`);
              if (opened.list.length === 0) {
                return sftpStream.status(reqid, STATUS_CODE.EOF);
              }
              const filelist = opened.list.splice(0, Math.min(100, opened.list.length));
              // const returnList = [];
              // for (const file of filelist) {
              //   const localPath = path.join(opened.localPath, file);
              //   let virtualPath = joinPath(opened.virtualPath, file);
              //   const stats = await fsp.stat(localPath);
              //   const nameInfo = formatName(virtualPath, stats, user);
              //   if (nameInfo) {
              //     returnList.push(nameInfo);
              //   }
              // }
              return sftpStream.name(reqid, filelist);
            } catch (error) {
              logger.error(`用户 ${user.username} READDIR ${opened.virtualPath} 时遇到错误：\n${error.message}`);
              return sftpStream.status(reqid, STATUS_CODE.FAILURE);
            }
          }).on('REMOVE', async function (reqid, virtualPath) {
            // 权限检查
            if (!user.hasPermission(virtualPath, 'file', OPEN_MODE.EXCL)) {
              logger.warn(`用户 ${user.username} REMOVE ${virtualPath} 时权限不足。`);
              return sftpStream.status(reqid, STATUS_CODE.PERMISSION_DENIED);
            }
            const localPath = user.resolve(virtualPath);
            try {
              logger.info(`用户 ${user.username} REMOVE ${virtualPath}`);
              await fsp.unlink(localPath);
              sftpStream.status(reqid, STATUS_CODE.OK);
            } catch (error) {
              logger.error(`用户 ${user.username} REMOVE ${virtualPath} 时遇到错误：\n${error}`);
              return sftpStream.status(reqid, STATUS_CODE.FAILURE);
            }
          }).on('MKDIR', async function (reqid, virtualPath) {
            // 权限检查
            if (!user.hasPermission(virtualPath, 'dir', OPEN_MODE.CREAT)) {
              logger.warn(`用户 ${user.username} MKDIR ${virtualPath} 时权限不足。`);
              return sftpStream.status(reqid, STATUS_CODE.PERMISSION_DENIED);
            }
            const localPath = user.resolve(virtualPath);
            try {
              logger.info(`用户 ${user.username} MKDIR ${virtualPath}`);
              await fsp.mkdir(localPath);
              sftpStream.status(reqid, STATUS_CODE.OK);
            } catch (error) {
              logger.error(`用户 ${user.username} MKDIR ${virtualPath} 时遇到错误：\n${error}`);
              return sftpStream.status(reqid, STATUS_CODE.FAILURE);
            }
          }).on('RENAME', async function (reqid, oldPath, newPath) {
            // 权限检查
            const oldLocalPath = user.resolve(oldPath);
            let newLocalPath = user.resolve(newPath);
            const stats = await fsp.stat(oldLocalPath);
            const pathType = stats.isDirectory() ? 'dir' : 'file';
            if (!user.hasPermission(oldPath, pathType, OPEN_MODE.EXCL) ||
              !user.hasPermission(newPath, pathType, OPEN_MODE.CREAT)) {
              logger.warn(`用户 ${user.username} RENAME ${oldPath} 为 ${newPath} 时权限不足。`);
            }

            try {
              logger.info(`用户 ${user.username} RENAME ${oldPath} 为 ${newPath}。`);
              if (!fs.existsSync(oldLocalPath)) {
                return sftpStream.status(reqid, STATUS_CODE.NO_SUCH_FILE);
              }
              if (fs.existsSync(newLocalPath)) {
                const oldStats = await fsp.stat(oldLocalPath);
                const newStats = await fsp.stat(newLocalPath);
                if (newStats.isDirectory() && oldStats.isFile()) {
                  newLocalPath = path.join(newLocalPath, path.basename(oldPath));
                } else {
                  return sftpStream.status(reqid, STATUS_CODE.FAILURE, 'The new path is existing.');
                }
              }
              // await fse.ensureDir(path.dirname(newLocalPath));
              // await fse.move(oldLocalPath, newLocalPath, { overwrite: false });
              await fsp.rename(oldLocalPath, newLocalPath);
              sftpStream.status(reqid, STATUS_CODE.OK);
            } catch (error) {
              logger.error(`用户 ${user.username} RENAME ${oldPath} 为 ${newPath} 时遇到错误：\n${error}`);
              return sftpStream.status(reqid, STATUS_CODE.FAILURE);
            }
          }).on('RMDIR', async function (reqid, virtualPath) {
            // 权限检查
            if (!user.hasPermission(virtualPath, 'dir', OPEN_MODE.EXCL)) {
              logger.warn(`用户 ${user.username} RMDIR ${virtualPath} 时权限不足。`);
              return sftpStream.status(reqid, STATUS_CODE.PERMISSION_DENIED);
            }
            const localPath = user.resolve(virtualPath);
            try {
              logger.info(`用户 ${user.username} RMDIR ${virtualPath}`);
              await fsp.rmdir(localPath);
              sftpStream.status(reqid, STATUS_CODE.OK);
            } catch (error) {
              logger.error(`用户 ${user.username} RMDIR ${virtualPath} 时遇到错误：\n${error}`);
              return sftpStream.status(reqid, STATUS_CODE.FAILURE);
            }
          }).on('READLINK', async function (reqid, virtualPath) {
            return sftpStream.status(reqid, STATUS_CODE.OP_UNSUPPORTED);
          }).on('SYMLINK', async function (reqid, linkPath, targetPath) {
            return sftpStream.status(reqid, STATUS_CODE.OP_UNSUPPORTED);
          }).on('SETSTAT', async (reqid, virtualPath, attrs) => {
            // 权限检查
            const localPath = user.resolve(virtualPath);
            if (attrs.permissions) {
              return sftpStream.status(reqid, STATUS_CODE.PERMISSION_DENIED);
            }
            try {
              logger.info(`用户 ${user.username} SETSTAT ${virtualPath}`);
              if (attrs && attrs.utime || attrs.atime) {
                await fsp.utimes(localPath, attrs.atime, attrs.utime);
              }
              return sftpStream.status(reqid, STATUS_CODE.OK);
            } catch (error) {
              logger.error(`用户 ${user.username} SETSTAT ${virtualPath} 时遇到错误：\n${error}`);
              return sftpStream.status(reqid, STATUS_CODE.FAILURE);
            }
          }).on('CHMOD', async function (reqid, virtualPath) {
            return sftpStream.status(reqid, STATUS_CODE.PERMISSION_DENIED);
          }).on('CHOWN', async function (reqid, virtualPath) {
            return sftpStream.status(reqid, STATUS_CODE.PERMISSION_DENIED);
          });
        });
      });
    }).on('end', async function () {
      logger.info(`客户端退出连接，IP：${info.ip}。`);
      if (user) {
        await user.release();
      }
      clients.delete(client);
    })
    .on('error', async function (error) {
      if (error.code === 'ECONNRESET') {
        logger.info(`客户端断开连接，IP：${info.ip}。`);
      } else {
        logger.error(`连接出现异常：${error}`);
      }
    }).on('close', async function () {
      clients.delete(client);
      logger.info(`客户端连接关闭，IP：${info.ip}。`);
      if (user) {
        await user.release();
      }
    });
  };

  listener.reconfigure = function(newConfig) {
    logger.info('重新加载配置');
    config = newConfig;
  };

  listener.closeAll = function() {
    logger.info('正在关闭所有客户端连接！');
    for (const client of clients) {
      client.end();
    }
  };

  return listener;
}

module.exports = {
  makeListener
};
