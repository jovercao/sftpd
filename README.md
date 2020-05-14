# SFTPD

> Sftpd is the sftp server by nodejs, with permission virtual path.

[中文文档](./README_cn.md)

## Configuration

Cofigure file is 3 parts：

1. App configuration，it's store at the executable file path, filename: `app.config.json`.
2. User configuration, it's store at user home dir, filename: `.sftpd.json`.
3. Workspace configuration, it's store at cwd, filename: `.sftpd.json`.

The configuration load order： App configuration -> User configuration -> Workspace configuration，The post-loaded configuration overrides the previously loaded configuration.

**Settings:**

```json
# example/app.config.json

{
  // The host cert file，the ${appRoot} variable is dir of then executable file。
  "hostKeyFile": "${appRoot}/host_rsa",
  // default data dir, user root dir on that "dataDir/username"
  "dataDir": "${appRoot}/datas",
  // Greetings message
  "greeting": "Good luck!",
  // banner message
  "banner": "Wellcome to SFTP test server.",
  "ident": "sftp server by jover",
  // use debug mode
  "debug": true,
  // The maximum of connections for server
  "maxConnections": 1000,
  // user list
  "users": [
    {
      "username": "test1",
      // Password, encryption by hmac-sha256，and format with base64 encoding.
      "password": "4Dp32BhmHO533HGr5Pp3wFuZT216jc5hGLjxGGV+BOw=",
      // User root dir, the location of virtual path "/"
      "rootDir": "${appRoot}/datas/testUser",
      // The maximum of connections on for user
      "maxConnections": 1,
      "permission": {
        "MKDIR": true,
        "RMDIR": true,
        // read file
        "READ": true,
        // write file
        "WRITE": true,
        // Remove file
        "REMOVE": true,
        // Create file
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
  // server listen port
  "port": "22",
  // Is enable ttl，default value false
  "ttlEnable": false,
  // lock
  "ipLockTimes": 5,
  // If connections count is over ipLockTimes in ipLockSpan by same ip, the ip will be locked.
  "ipLockSpan": 300,
  // If not locked, the connections cout will be clean after ipLockTTL seconds.
  "ipLockTTL": 30,

  // log4js configrations see：`https://github.com/log4js-node/log4js-node`
  // "log": {...}
}
```

## Developement

```shell
npm install
npm run example
```

## Command

Pls look for help：

```shell
sftpd -h
```

## Thanks

sftpd is base by [ssh2](https://github.com/mscdex/ssh2), thanks mscdex。
