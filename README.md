# The issue

haproxy/haproxy#74

The HAProxy doesn't respect the `hold valid 1s` setting, so after the `docker-compose scale app=10`, the reverse proxy will not redirect the traffic to the other `app` service, only to the original resolved IP address.

# Setup

Here is a Docker Compose project to reproduce the issue.

3 services are defined in the `docker-compose.yml`.

```yaml
version: '2'
services:
    haproxy:
        image: haproxy:latest
        volumes:
            - ./haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg
        ports:
            - "80:80"
        depends_on:
            - app
            - syslog
    app:
        image: node:latest
        volumes:
            - ./index.js:/app/index.js
        command: node /app/index.js
    syslog:
        image: bobrik/syslog-ng:latest
        volumes:
            - ./log:/var/log/syslog-ng
```

`haproxy` is an HAProxy server as a reverse proxy server. The `haproxy.cfg` is the following:

```python
global
    log syslog daemon

defaults
    timeout connect 5000ms
    timeout client 50000ms
    timeout server 50000ms

resolvers docker_dns
    nameserver dns "127.0.0.11:53"
    timeout retry   1s
    hold valid 1s

listen tcp_proxy
    mode tcp
    bind :80
    option tcplog
    log global
    server app app:8000 check resolvers docker_dns resolve-prefer ipv4
```

`app` is just a simple node.js web service which return the client IP and the IP and hostname of current, so it will be easy to know which server served the request.

# Reproduce the problem

Start up the stack.

```bash
$ docker-compose up -d
Creating network "haproxyissue74_default" with the default driver
Creating haproxyissue74_app_1
Creating haproxyissue74_syslog_1
Creating haproxyissue74_haproxy_1
```

Scale the `app` to `10`.

```bash
$ docker-compose scale app=10
Creating and starting haproxyissue74_app_2 ... done
Creating and starting haproxyissue74_app_3 ... done
Creating and starting haproxyissue74_app_4 ... done
Creating and starting haproxyissue74_app_5 ... done
Creating and starting haproxyissue74_app_6 ... done
Creating and starting haproxyissue74_app_7 ... done
Creating and starting haproxyissue74_app_8 ... done
Creating and starting haproxyissue74_app_9 ... done
Creating and starting haproxyissue74_app_10 ... done
```

And check load balance result.

```bash
$ curl http://localhost/
::ffff:172.30.0.4	 → 	 7d10f99e3d60 @ [172.30.0.2]%
$ curl http://localhost/
::ffff:172.30.0.4	 → 	 7d10f99e3d60 @ [172.30.0.2]%
$ curl http://localhost/
::ffff:172.30.0.4	 → 	 7d10f99e3d60 @ [172.30.0.2]%
$ curl http://localhost/
::ffff:172.30.0.4	 → 	 7d10f99e3d60 @ [172.30.0.2]%
$
```

If the `hold valid 1s` works, HAProxy should resolve the `app` ip address in different, however, it looks like doesn't work.

To verify the DNS resolution's randomness, we can query the `app` DNS within `haproxy` container.

Enter the container

```bash
$ docker-compose exec haproxy bash
root@a2243d2c5e7c:/#
```

Install `dnsutils` for `nslookup` and `dig` command.

```bash
root@a2243d2c5e7c:/# apt-get update && apt-get install -y dnsutils
Get:1 http://security.debian.org jessie/updates InRelease [63.1 kB]
Get:2 http://security.debian.org jessie/updates/main amd64 Packages [366 kB]
...
Setting up rename (0.20-3) ...
update-alternatives: using /usr/bin/file-rename to provide /usr/bin/rename (rename) in auto mode
Setting up xml-core (0.13+nmu2) ...
Processing triggers for libc-bin (2.19-18+deb8u4) ...
Processing triggers for sgml-base (1.26+nmu4) ...
root@a2243d2c5e7c:/#
```

And then, we can use `dig` command to check the DNS query result.

```bash
root@a2243d2c5e7c:/# dig app | grep app
; <<>> DiG 9.9.5-9+deb8u6-Debian <<>> app
;app.				IN	A
app.			600	IN	A	172.30.0.5
app.			600	IN	A	172.30.0.9
app.			600	IN	A	172.30.0.7
app.			600	IN	A	172.30.0.12
app.			600	IN	A	172.30.0.2
app.			600	IN	A	172.30.0.11
app.			600	IN	A	172.30.0.8
app.			600	IN	A	172.30.0.10
app.			600	IN	A	172.30.0.13
app.			600	IN	A	172.30.0.6
root@a2243d2c5e7c:/# dig app | grep app
; <<>> DiG 9.9.5-9+deb8u6-Debian <<>> app
;app.				IN	A
app.			600	IN	A	172.30.0.6
app.			600	IN	A	172.30.0.10
app.			600	IN	A	172.30.0.13
app.			600	IN	A	172.30.0.11
app.			600	IN	A	172.30.0.7
app.			600	IN	A	172.30.0.2
app.			600	IN	A	172.30.0.5
app.			600	IN	A	172.30.0.9
app.			600	IN	A	172.30.0.12
app.			600	IN	A	172.30.0.8
root@a2243d2c5e7c:/# dig app | grep app
; <<>> DiG 9.9.5-9+deb8u6-Debian <<>> app
;app.				IN	A
app.			600	IN	A	172.30.0.13
app.			600	IN	A	172.30.0.11
app.			600	IN	A	172.30.0.8
app.			600	IN	A	172.30.0.12
app.			600	IN	A	172.30.0.5
app.			600	IN	A	172.30.0.6
app.			600	IN	A	172.30.0.7
app.			600	IN	A	172.30.0.9
app.			600	IN	A	172.30.0.2
app.			600	IN	A	172.30.0.10
root@a2243d2c5e7c:/#

```

As shown above, DNS will return the records in random order, so the first one is different every time.
