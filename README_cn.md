# SFTP 服务器

## 配置文件说明

配置文件分成以下3个：

1. 应用配置，存放于应用程序目录下的`app.config.json`文件内。
2. 用户配置，存放于用户主目录下的`.sftpd.json`文件。
3. 工作目录配置，存放于当前工作目录`cwd`文件夹下的`.sftpd.json`文件内。

配置的加载顺序： 应用配置 -> 用户配置 -> 工作目录配置，后加载的配置是覆盖之前加载的配置项。

## 配置属性说明

```json
# example/app.config.json

{
  // 应用程序主机证书文件，${appRoot}表示应用程序要目录，即二进制文件所在目录。
  "hostKeyFile": "${appRoot}/host_rsa",
  // 默认数据目录，当未指定用户rootDir时，会将用户rootDir指向 dataDir/username 下
  "dataDir": "${appRoot}/datas",
  // 登录语
  "greeting": "Good luck!",
  // 欢迎语
  "banner": "Wellcome to SFTP test server.",
  // 标记
  "ident": "sftp server by jover",
  // 是否启用调试模式，默认为false
  "debug": true,
  // SFTP服务最大连接数
  "maxConnections": 1000,
  // 用户列表
  "users": [
    {
      // 用户名
      "username": "test1",
      // 密码，使用hmac-sha256加密，并以base64存储
      "password": "4Dp32BhmHO533HGr5Pp3wFuZT216jc5hGLjxGGV+BOw=",
      // 用户主目录，用户的所有访问将被限定在该目录内，亦是虚拟路径的根目录。
      "rootDir": "${appRoot}/datas/testUser",
      // 用户的最大连接数
      "maxConnections": 1,
      // 用户权限（默认拥有所有权限）
      "permission": {
        // 创建文件夹权限
        "MKDIR": true,
        // 删除文件夹权限
        "RMDIR": true,
        // 读取文件权限
        "READ": true,
        // 写入文件权限
        "WRITE": true,
        // 删除文件权限
        "REMOVE": true,
        // 创建文件权限
        "CREATE": true
      }
    },
    {
      "username": "test2",
      "password": "4Dp32BhmHO533HGr5Pp3wFuZT216jc5hGLjxGGV+BOw=",
      "permission": {
        "MKDIR": true,
        "RMDIR": true,
        "READ": true,
        "WRITE": true,
        "REMOVE": true,
        "CREATE": true
      }
    }
  ],
  // 服务监听端口号，默认为22
  "port": "22",
  // 是否启用TTL，默认为false
  "ttlEnable": false,
  // TTL时间内同ip连接锁定次数，默认为5次
  "ipLockTimes": 5,
  // ip锁定时长(s)，默认锁定时间5分钟
  "ipLockSpan": 300,
  // 合法连接数清零时长 默认30s
  "ipLockTTL": 30,

  // log4js配置，请参考：`https://github.com/log4js-node/log4js-node`
  // "log": {...}
}
```

## 命令说明

请通过以下命令查看帮助：

```shell
sftpd -h
```

## 感谢

sftpd 基于 [ssh2](https://github.com/mscdex/ssh2) 开发，感谢 mscdex 的无私奉献。
