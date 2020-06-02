const program = require('commander');
const hash = require('../lib/passwordHasher');
const hot = require('../lib/hot');

let server;

function start() {
  const { createServer } = require('../lib/server');
  const { config } = require('../lib/config');
  server = createServer(config);
  hot.start(server);
}

program.action(function() {
  start();
});

program.command('start').description('启动服务').action(function() {
  start();
});

program.command('stop').description('停止服务').action(function() {
  hot.commands.stop();
});

program.command('reconfigure').description('重新加载配置文件').action(function (pwd) {
  hot.commands.reconfigure();
});

program.command('pwd <pwd>').description('哈希密码并输出密码密文').action(function(pwd) {
  console.log(hash(pwd));
});

program.parse(process.argv);

