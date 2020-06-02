const net = require('net');
const path = require('path');
const configMgr = require('./config');

const IPC_PATH = path.join('\\\\?\\pipe\\', process.cwd(), 'sftpd');

let ipcServer;

function start(server) {
  ipcServer = net.createServer(function (conn) {
    conn.on('data', async function (data) {
      const msg = data.toString();
      const [cmd, argsTxt] = msg.split(':');
      const args = argsTxt ? argsTxt.split(',') : [];
      switch (cmd) {
        case 'reconfigure':
          const newConfig = configMgr.reload();
          server.listener.reconfigure(newConfig);
          conn.write('INFO: 配置文件已经重新加载。');
          break;
        case 'stop':
          await server.stop();
          await stop();
          conn.write('INFO: 服务已停止。');
          break;
        default:
          conn.write('ERROR: 不支持的命令！');
      }
    });
  });
  return ipcServer.listen(IPC_PATH);
}

function stop() {
  return ipcServer.close();
}

function sendCommand(command, ...args) {
  return new Promise((resolve, reject) => {
    const client = net.connect(IPC_PATH, function() {
      let msg = command;
      if (args && args.length > 0) {
        msg += ':' + args.join(', ');
      }

      client.write(msg, function (error) {
        if (error) {
          return reject(error);
        }
      });
    });
    client.once('data', function (data) {
      const msg = data.toString();
      resolve(msg);
      console.log(msg);
      client.end(() => {
        client.destroy();
      });
    });
    client.on('error', function(error) {
      throw new Error('服务尚未启动或其它错误！' + error);
    });
  });
}


const commands = {
  /**
   * 重新加载配置
   * @returns {Promise} 返回Promise
   */
  reconfigure() {
    console.warn('WARN: 热更新配置仅可更新用户信息等，不可更新服务器设置！');
    return sendCommand('reconfigure');
  },
  /**
  * 停止服务
  * @returns {Promise} 返回Promise
  */
  stop() {
    return sendCommand('stop', '30');
  }
};

module.exports = {
  start,
  commands
};
