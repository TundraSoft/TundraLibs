# Slogger

A simple logging utility built on top of syslog

It supports multiple handlers:

- [x] **BlackholeHandler** - Ignores all logs
- [x] **ConsoleHandler** - Logs to console. If console is cleared all logs are
      lost
- [x] **CustomHandler** - Supports custom callback
- [x] **FileHandler** - Logs to a log file. Supports log rotation
- [x] **POSTHandler** - Sends/streams log to a HTTP Post endpoint
- [x] **SyslogHandler** - Sends log messages to a remote syslog endpoint (UDP
      endpoint)

## Usage

## TODO

- [ ] Event driven approach to handle logs
- [ ] TCP and Unix socket support for Syslog Handler
- [ ] Session tracking
