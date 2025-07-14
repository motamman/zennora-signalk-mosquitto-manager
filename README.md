# Zennora Mosquitto Manager Plugin

**Version 0.5.0-alpha.1**

A comprehensive SignalK plugin for monitoring and managing Mosquitto MQTT brokers. This plugin provides real-time broker status monitoring, service control capabilities, and configuration file management through both SignalK data paths and a web-based management interface.

## Description

This plugin monitors a Mosquitto MQTT broker running on the same system and provides:

- Real-time broker status and performance monitoring
- Service control (start, stop, restart, reload)
- Configuration file management in conf.d directory
- Comprehensive metrics publishing to SignalK
- Web-based management interface
- Statistics collection and trending

## Features

- **Real-time Monitoring**: Continuous broker status and performance tracking
- **Service Control**: Start, stop, restart, and reload broker via API
- **Configuration Management**: Edit and manage conf.d configuration files
- **Performance Metrics**: CPU, memory, connections, and log monitoring
- **Web Interface**: Browser-based management and monitoring
- **SignalK Integration**: All metrics published to `system.mqtt.broker.*` paths
- **Error Handling**: Robust error handling and logging

## Installation

### Prerequisites

1. **Mosquitto Broker**: Must be installed and managed by systemd
2. **Permissions**: SignalK user needs sudo access for systemctl commands
3. **File Access**: Read/write access to mosquitto configuration files

```bash
# Ensure mosquitto is installed
sudo apt install mosquitto mosquitto-clients

# Give signalk user systemctl access (add to sudoers)
sudo visudo
# Add: signalk ALL=(ALL) NOPASSWD: /bin/systemctl start mosquitto, /bin/systemctl stop mosquitto, /bin/systemctl restart mosquitto, /bin/systemctl reload mosquitto, /bin/systemctl is-active mosquitto, /bin/systemctl show mosquitto
```

### Plugin NPM Installation 
```bash
cd ~/.signalk/node_modules
npm install motamman/zennora-mosquitto-manager
sudo systemctl restart signalk
```

## Configuration

Navigate to **SignalK Admin → Server → Plugin Config → Zennora Mosquitto Manager**

### Configuration Options

- **Enable Plugin**: Activate/deactivate the plugin
- **Monitor Interval**: How often to check broker status in seconds (default: 30)
- **Service Name**: Systemd service name for mosquitto (default: "mosquitto")
- **Main Config Path**: Path to main mosquitto.conf file
- **Config Directory**: Path to conf.d directory for additional configurations
- **Log File Path**: Path to mosquitto log file
- **Source Label**: Identifier for derived data (default: "zennora-mosquitto")
- **Enable Web Interface**: Enable web interface for broker management (default: true)
- **Enable Statistics**: Collect and publish broker statistics (default: true)

### Example Configuration
```json
{
  "enabled": true,
  "monitorInterval": 30,
  "serviceName": "mosquitto",
  "configPath": "/etc/mosquitto/mosquitto.conf",
  "confDPath": "/etc/mosquitto/conf.d",
  "logPath": "/var/log/mosquitto/mosquitto.log",
  "sourceLabel": "zennora-mosquitto",
  "enableWebInterface": true,
  "enableStatistics": true
}
```

## Data Output

### Broker Status
- `system.mqtt.broker.status.running` - Broker running status (boolean)
- `system.mqtt.broker.status.pid` - Broker process ID
- `system.mqtt.broker.status.uptime` - Broker uptime (seconds)
- `system.mqtt.broker.status.lastCheck` - Last status check timestamp
- `system.mqtt.broker.status.loadState` - Service load state
- `system.mqtt.broker.status.activeState` - Service active state
- `system.mqtt.broker.status.subState` - Service sub state

### Performance Metrics
- `system.mqtt.broker.performance.cpu` - CPU usage percentage
- `system.mqtt.broker.performance.memory` - Memory usage percentage
- `system.mqtt.broker.performance.memoryVSZ` - Virtual memory size (KB)
- `system.mqtt.broker.performance.memoryRSS` - Resident memory size (KB)

### Connection Information
- `system.mqtt.broker.connections.count` - Number of active MQTT connections

### Log Information
- `system.mqtt.broker.log.size` - Log file size (bytes)

### Example SignalK Data Structure
```json
{
  "system": {
    "mqtt": {
      "broker": {
        "status": {
          "running": true,
          "pid": 12345,
          "uptime": 86400,
          "lastCheck": "2025-07-10T14:30:00.000Z",
          "loadState": "loaded",
          "activeState": "active",
          "subState": "running"
        },
        "performance": {
          "cpu": 2.5,
          "memory": 1.2,
          "memoryVSZ": 45678,
          "memoryRSS": 12345
        },
        "connections": {
          "count": 5
        },
        "log": {
          "size": 1048576
        }
      }
    }
  }
}
```

## Web Interface

Access the plugin web interface at:
- **https://your-signalk-server:3443/plugins/zennora-mosquitto-manager/**

### Management Features

- **Real-time Status Dashboard**: Live broker status and metrics
- **Service Controls**: Start, stop, restart, reload buttons
- **Configuration Editor**: Edit conf.d files with syntax highlighting
- **Log Viewer**: View recent log entries and errors
- **Performance Charts**: Historical performance trending

### API Endpoints

The plugin provides REST API endpoints for integration:

#### Status and Control
- `GET /plugins/zennora-mosquitto/api/status` - Get broker status
- `POST /plugins/zennora-mosquitto/api/control/start` - Start broker
- `POST /plugins/zennora-mosquitto/api/control/stop` - Stop broker
- `POST /plugins/zennora-mosquitto/api/control/restart` - Restart broker
- `POST /plugins/zennora-mosquitto/api/control/reload` - Reload broker config

#### Configuration Management
- `GET /plugins/zennora-mosquitto/api/config` - List conf.d files
- `GET /plugins/zennora-mosquitto/api/config/:filename` - Read config file
- `POST /plugins/zennora-mosquitto/api/config/:filename` - Write config file

### Example API Usage

```bash
# Check broker status
curl -k "https://signalk-server:3443/plugins/zennora-mosquitto/api/status"

# Restart broker
curl -k -X POST "https://signalk-server:3443/plugins/zennora-mosquitto/api/control/restart"

# List configuration files
curl -k "https://signalk-server:3443/plugins/zennora-mosquitto/api/config"

# Read a configuration file
curl -k "https://signalk-server:3443/plugins/zennora-mosquitto/api/config/bridge.conf"

# Update a configuration file
curl -k -X POST "https://signalk-server:3443/plugins/zennora-mosquitto/api/config/bridge.conf" \
  -H "Content-Type: application/json" \
  -d '{"content":"# Updated bridge configuration\nconnection mybridge\naddress remote.broker.com:1883"}'
```

## Performance

- **CPU Impact**: Minimal - periodic status checks only
- **Memory Usage**: Low - simple monitoring operations
- **Network Impact**: None - local system monitoring only
- **Disk I/O**: Low - occasional log file reads and config updates

## Troubleshooting

### Permission Issues

1. **Systemctl Access**: Ensure SignalK user can control mosquitto service
2. **File Permissions**: Check read/write access to config and log files
3. **Sudo Configuration**: Verify sudoers file includes necessary commands

### Service Control Failures

1. **Check Service Status**: Verify mosquitto service exists and is configured
2. **Review Logs**: Check SignalK logs for specific error messages
3. **Test Manually**: Try systemctl commands manually as signalk user
4. **Service Dependencies**: Ensure all mosquitto dependencies are met

### Configuration Management Issues

1. **Path Configuration**: Verify conf.d path exists and is writable
2. **File Permissions**: Check ownership and permissions on config files
3. **Syntax Validation**: Ensure configuration files have valid syntax
4. **Backup Recovery**: Use automatic backups if config changes fail

### No Monitoring Data

1. **Plugin Status**: Ensure plugin is enabled and running
2. **Service Detection**: Check if systemctl commands work correctly
3. **Path Configuration**: Verify service name and paths are correct
4. **Log Locations**: Ensure log file path is correct and accessible

## Integration

### Node-RED
Access broker data in Node-RED flows:
```
system.mqtt.broker.status.running
system.mqtt.broker.performance.cpu
system.mqtt.broker.connections.count
```

### Grafana
Query broker metrics via SignalK APIs for visualization:
- Broker uptime and availability trending
- Performance monitoring dashboards
- Connection count analysis
- Service health alerting

### Alerts
Set up alerts based on:
- Broker service failures
- High CPU or memory usage
- Connection count thresholds
- Log file size limits

## Use Cases

### Marine System Monitoring
- Monitor MQTT broker health for critical marine data flows
- Ensure continuous connectivity for navigation and monitoring systems
- Track performance during heavy data collection periods

### Remote Management
- Restart broker remotely when connection issues occur
- Update configurations for new devices or data streams
- Monitor broker performance from shore-based operations

### Configuration Management
- Maintain bridge configurations for shore connections
- Manage authentication and security settings
- Deploy configuration updates across fleet vessels

### Performance Optimization
- Monitor resource usage to optimize broker configuration
- Track connection patterns to plan capacity
- Identify performance bottlenecks in data flows

## Security Considerations

### File Access
- Configuration files may contain sensitive information
- Ensure proper file permissions and backup security
- Consider encryption for sensitive bridge configurations

**⚠️ SECURITY WARNING - TEMPORARY SOLUTION:**
The current implementation requires adding the SignalK user to the mosquitto group and granting group write permissions to `/etc/mosquitto/conf.d/`:
```bash
sudo usermod -a -G mosquitto <signalk-user>
sudo chown -R :mosquitto /etc/mosquitto/conf.d/
sudo chmod g+w /etc/mosquitto/conf.d/
```
**This is a brutal solution that grants broader filesystem access than necessary. A better approach would be:**
- Use a separate configuration directory owned by SignalK
- Implement a secure configuration API that doesn't require direct filesystem access
- Use systemd configuration drop-ins or other containerized approaches
- **TODO: Implement a more secure configuration management system**

### Service Control
- Broker control requires elevated privileges
- Limit sudo access to specific commands only
- Monitor control operations for unauthorized changes

### Web Interface
- Uses SignalK authentication for secure access
- API endpoints require valid SignalK session
- Consider additional authentication for production systems

## Development

### Plugin Structure
```
zennora-mosquitto/
├── index.js          # Main plugin logic
├── package.json      # Plugin metadata
└── README.md         # This documentation
```

### Key Functions
- **Monitoring**: Systemctl status checks and process monitoring
- **Control**: Service start/stop/restart operations
- **Configuration**: File reading/writing with backup support
- **API**: REST endpoints for web interface integration

### Configuration File Management
- Automatic backup before changes
- Syntax validation for configuration files
- Support for multiple configuration files in conf.d
- Rollback capability for failed configurations

## Migration from Manual Management

If currently managing mosquitto manually:

1. **Verify Service Setup**: Ensure mosquitto runs as systemd service
2. **Configure Permissions**: Set up sudo access for SignalK user
3. **Install Plugin**: Follow installation instructions above
4. **Test Operations**: Verify all control operations work correctly
5. **Update Monitoring**: Integrate broker metrics into existing dashboards

## License

MIT License - See [LICENSE](../LICENSE) file for details.

## Support

For issues and feature requests:
- **Plugin Issues**: Report via GitHub issues
- **SignalK Integration**: Check SignalK documentation
- **Mosquitto Issues**: Consult Mosquitto documentation