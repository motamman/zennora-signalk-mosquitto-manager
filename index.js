module.exports = function(app) {
  var plugin = {};
  var { spawn, exec } = require('child_process');
  var fs = require('fs');
  var path = require('path');

  plugin.id = "zennora-mosquitto";
  plugin.name = "Zennora Mosquitto Manager";
  plugin.description = "Monitor and manage Mosquitto MQTT broker including status, control, and configuration";

  var unsubscribes = [];
  var statusTimer;
  var brokerStatus = {
    running: false,
    pid: null,
    uptime: null,
    lastCheck: null
  };
  
  var schema = {
    type: "object",
    properties: {
      enabled: {
        type: "boolean",
        title: "Enable Plugin",
        default: true
      },
      monitorInterval: {
        type: "number",
        title: "Monitor Interval (seconds)",
        description: "How often to check broker status",
        default: 30,
        minimum: 5
      },
      serviceName: {
        type: "string",
        title: "Service Name",
        description: "Systemd service name for mosquitto",
        default: "mosquitto"
      },
      configPath: {
        type: "string",
        title: "Main Config Path",
        description: "Path to main mosquitto.conf file",
        default: "/etc/mosquitto/mosquitto.conf"
      },
      confDPath: {
        type: "string",
        title: "Config Directory",
        description: "Path to conf.d directory for additional configurations",
        default: "/etc/mosquitto/conf.d"
      },
      logPath: {
        type: "string",
        title: "Log File Path",
        description: "Path to mosquitto log file",
        default: "/var/log/mosquitto/mosquitto.log"
      },
      sourceLabel: {
        type: "string",
        title: "Source Label",
        description: "Source label for derived data",
        default: "zennora-mosquitto"
      },
      enableWebInterface: {
        type: "boolean",
        title: "Enable Web Interface",
        description: "Enable web interface for broker management",
        default: true
      },
      enableStatistics: {
        type: "boolean",
        title: "Enable Statistics",
        description: "Collect and publish broker statistics",
        default: true
      }
    }
  };

  plugin.schema = schema;

  plugin.start = function(options) {
    app.debug('Starting Zennora Mosquitto Manager plugin with options:', JSON.stringify(options));
    
    // Store configuration globally so registerWithRouter can access it
    plugin.config = {
      monitorInterval: (options.monitorInterval || 30) * 1000, // Convert to milliseconds
      serviceName: options.serviceName || "mosquitto",
      configPath: options.configPath || "/etc/mosquitto/mosquitto.conf",
      confDPath: options.confDPath || "/etc/mosquitto/conf.d",
      logPath: options.logPath || "/var/log/mosquitto/mosquitto.log",
      sourceLabel: options.sourceLabel || "zennora-mosquitto",
      enableWebInterface: options.enableWebInterface !== false,
      enableStatistics: options.enableStatistics !== false
    };

    app.debug('Plugin configuration:', JSON.stringify(plugin.config));

    // Function to create SignalK message
    function createSkMessage(path, value, timestamp, units, description) {
      var update = {
        context: 'vessels.self',
        updates: [{
          source: {
            label: plugin.config.sourceLabel,
            type: 'plugin'
          },
          timestamp: timestamp || new Date().toISOString(),
          values: [{
            path: path,
            value: value
          }]
        }]
      };

      // Add metadata if units or description provided
      if (units || description) {
        update.updates[0].meta = [{
          path: path,
          value: {}
        }];
        if (units) update.updates[0].meta[0].value.units = units;
        if (description) update.updates[0].meta[0].value.description = description;
      }
      
      return update;
    }

    // Function to check broker status
    function checkBrokerStatus() {
      var timestamp = new Date().toISOString();
      app.debug('Checking mosquitto broker status...');

      // Check systemd service status
      exec(`systemctl is-active ${plugin.config.serviceName}`, function(error, stdout, stderr) {
        var isActive = stdout.trim() === 'active';
        
        // Get detailed service info
        exec(`systemctl show ${plugin.config.serviceName} --property=MainPID,ActiveEnterTimestamp,LoadState,ActiveState,SubState`, function(error, stdout, stderr) {
          var serviceInfo = {};
          if (!error && stdout) {
            stdout.split('\n').forEach(line => {
              var [key, value] = line.split('=');
              if (key && value) {
                serviceInfo[key] = value;
              }
            });
          }

          var pid = serviceInfo.MainPID ? parseInt(serviceInfo.MainPID) : null;
          var startTime = serviceInfo.ActiveEnterTimestamp;
          var uptime = null;
          
          if (startTime && startTime !== '' && isActive) {
            var startDate = new Date(startTime);
            uptime = Math.floor((Date.now() - startDate.getTime()) / 1000);
          }

          brokerStatus = {
            running: isActive,
            pid: pid && pid > 0 ? pid : null,
            uptime: uptime,
            lastCheck: timestamp,
            loadState: serviceInfo.LoadState,
            activeState: serviceInfo.ActiveState,
            subState: serviceInfo.SubState
          };

          app.debug('Broker status updated:', JSON.stringify(brokerStatus));
          publishBrokerStatus(timestamp);

          // Get additional statistics if enabled
          if (plugin.config.enableStatistics && isActive) {
            getBrokerStatistics(timestamp);
          }
        });
      });
    }

    // Function to publish broker status
    function publishBrokerStatus(timestamp) {
      try {
        var messages = [
          createSkMessage("system.mqtt.broker.status.running", brokerStatus.running, timestamp, null, "Broker running status"),
          createSkMessage("system.mqtt.broker.status.lastCheck", brokerStatus.lastCheck, timestamp, null, "Last status check timestamp"),
          createSkMessage("system.mqtt.broker.status.loadState", brokerStatus.loadState, timestamp, null, "Service load state"),
          createSkMessage("system.mqtt.broker.status.activeState", brokerStatus.activeState, timestamp, null, "Service active state"),
          createSkMessage("system.mqtt.broker.status.subState", brokerStatus.subState, timestamp, null, "Service sub state")
        ];

        if (brokerStatus.pid) {
          messages.push(createSkMessage("system.mqtt.broker.status.pid", brokerStatus.pid, timestamp, null, "Broker process ID"));
        }

        if (brokerStatus.uptime !== null) {
          messages.push(createSkMessage("system.mqtt.broker.status.uptime", brokerStatus.uptime, timestamp, 's', "Broker uptime in seconds"));
        }

        // Emit all messages
        messages.forEach(function(message) {
          if (message) {
            app.handleMessage(plugin.id, message);
          }
        });

        // Console summary
        var statusText = brokerStatus.running ? 'Running' : 'Stopped';
        var pidText = brokerStatus.pid ? ` (PID: ${brokerStatus.pid})` : '';
        var uptimeText = brokerStatus.uptime ? ` Uptime: ${Math.floor(brokerStatus.uptime/3600)}h ${Math.floor((brokerStatus.uptime%3600)/60)}m` : '';
        
        console.log(`[${plugin.id}] Mosquitto: ${statusText}${pidText}${uptimeText}`);

      } catch (error) {
        app.error('Error publishing broker status:', error.message);
      }
    }

    // Function to get broker statistics
    function getBrokerStatistics(timestamp) {
      // Get process stats if PID is available
      if (brokerStatus.pid) {
        exec(`ps -p ${brokerStatus.pid} -o pid,pcpu,pmem,vsz,rss --no-headers`, function(error, stdout, stderr) {
          if (!error && stdout) {
            var stats = stdout.trim().split(/\s+/);
            if (stats.length >= 5) {
              var messages = [
                createSkMessage("system.mqtt.broker.performance.cpu", parseFloat(stats[1]) / 100, timestamp, 'ratio', "CPU usage ratio"),
                createSkMessage("system.mqtt.broker.performance.memory", parseFloat(stats[2]) / 100, timestamp, 'ratio', "Memory usage ratio"),
                createSkMessage("system.mqtt.broker.performance.memoryVSZ", parseInt(stats[3]) / 1024, timestamp, 'MB', "Virtual memory size"),
                createSkMessage("system.mqtt.broker.performance.memoryRSS", parseInt(stats[4]) / 1024, timestamp, 'MB', "Resident memory size")
              ];

              messages.forEach(function(message) {
                if (message && !isNaN(message.updates[0].values[0].value)) {
                  app.handleMessage(plugin.id, message);
                }
              });
            }
          }
        });

        // Get network connections count
        exec(`ss -tln | grep :1883 | wc -l`, function(error, stdout, stderr) {
          if (!error && stdout) {
            var connections = parseInt(stdout.trim());
            if (!isNaN(connections)) {
              var message = createSkMessage("system.mqtt.broker.connections.count", connections, timestamp, null, "Number of MQTT connections");
              app.handleMessage(plugin.id, message);
            }
          }
        });
      }

      // Check log file size and recent errors
      if (fs.existsSync(plugin.config.logPath)) {
        fs.stat(plugin.config.logPath, function(error, stats) {
          if (!error) {
            var message = createSkMessage("system.mqtt.broker.log.size", stats.size / (1024 * 1024), timestamp, 'MB', "Log file size");
            app.handleMessage(plugin.id, message);
          }
        });
      }
    }

    // Function to control broker (start/stop/restart)
    function controlBroker(action, callback) {
      app.debug(`Attempting to ${action} mosquitto broker...`);
      
      var command = `systemctl ${action} ${plugin.config.serviceName}`;
      exec(command, function(error, stdout, stderr) {
        if (error) {
          app.error(`Failed to ${action} broker:`, error.message);
          if (callback) callback(error, null);
        } else {
          app.debug(`Successfully ${action}ed broker`);
          // Wait a moment then check status
          setTimeout(checkBrokerStatus, 2000);
          if (callback) callback(null, `Broker ${action}ed successfully`);
        }
      });
    }

    app.debug('Mosquitto management endpoints will be registered via registerWithRouter');

    // Start monitoring
    app.debug(`Starting broker monitoring every ${plugin.config.monitorInterval/1000} seconds`);
    
    // Initial status check
    checkBrokerStatus();
    
    // Set up recurring monitoring
    statusTimer = setInterval(checkBrokerStatus, plugin.config.monitorInterval);
    unsubscribes.push(() => clearInterval(statusTimer));

    app.debug(`Mosquitto manager started`);
  };

  // Helper functions for configuration management
  function listConfDFiles() {
    try {
      if (fs.existsSync(plugin.config.confDPath)) {
        var files = fs.readdirSync(plugin.config.confDPath)
          .filter(file => file.endsWith('.conf'))
          .map(file => {
            var filePath = path.join(plugin.config.confDPath, file);
            var stats = fs.statSync(filePath);
            return {
              name: file,
              path: filePath,
              size: stats.size,
              modified: stats.mtime.toISOString()
            };
          });
        return files;
      }
      return [];
    } catch (error) {
      app.error('Error listing conf.d files:', error.message);
      return [];
    }
  }

  function readConfigFile(fileName) {
    try {
      var filePath = path.join(plugin.config.confDPath, fileName);
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf8');
      }
      return null;
    } catch (error) {
      app.error('Error reading config file:', error.message);
      return null;
    }
  }

  function writeConfigFile(fileName, content, callback) {
    try {
      var filePath = path.join(plugin.config.confDPath, fileName);
      
      // Try to backup existing file if it exists (skip if permission denied)
      if (fs.existsSync(filePath)) {
        try {
          var backupPath = filePath + '.backup.' + Date.now();
          fs.copyFileSync(filePath, backupPath);
          app.debug(`Backed up existing config to: ${backupPath}`);
        } catch (backupError) {
          app.debug(`Could not create backup (${backupError.message}), proceeding without backup`);
        }
      }

      fs.writeFileSync(filePath, content, 'utf8');
      app.debug(`Configuration written to: ${filePath}`);
      
      if (callback) callback(null, 'Configuration saved successfully');
    } catch (error) {
      app.error('Error writing config file:', error.message);
      if (callback) callback(error, null);
    }
  }

  // Plugin webapp routes
  plugin.registerWithRouter = function(router) {
    const express = require('express');
    
    app.debug('registerWithRouter called for mosquitto manager');
    
    // Test route to debug routing
    router.get('/test', (req, res) => {
      res.json({ message: 'Mosquitto test route works!' });
    });
    
    // API endpoints (BEFORE static files)
    router.get('/api/status', (req, res) => {
      res.json({
        status: {
          ...brokerStatus,
          serviceName: plugin.config?.serviceName || 'mosquitto'
        },
        config: {
          serviceName: plugin.config?.serviceName || 'mosquitto',
          configPath: plugin.config?.configPath,
          confDPath: plugin.config?.confDPath
        }
      });
    });

    // Control endpoints (start/stop/restart)
    router.post('/api/control/:action', (req, res) => {
      var action = req.params.action;
      if (['start', 'stop', 'restart', 'reload'].includes(action)) {
        controlBroker(action, (error, result) => {
          if (error) {
            res.status(500).json({ error: error.message });
          } else {
            res.json({ message: result });
          }
        });
      } else {
        res.status(400).json({ error: 'Invalid action. Use start, stop, restart, or reload.' });
      }
    });

    // Configuration endpoints
    router.get('/api/config', (req, res) => {
      var files = listConfDFiles();
      res.json({ files: files });
    });

    router.get('/api/config/:filename', (req, res) => {
      var fileName = req.params.filename;
      var content = readConfigFile(fileName);
      if (content !== null) {
        res.json({ fileName: fileName, content: content });
      } else {
        res.status(404).json({ error: 'File not found' });
      }
    });

    router.post('/api/config/:filename', (req, res) => {
      var fileName = req.params.filename;
      var content = req.body.content;
      
      if (!content) {
        res.status(400).json({ error: 'Content is required' });
        return;
      }

      writeConfigFile(fileName, content, (error, result) => {
        if (error) {
          res.status(500).json({ error: error.message });
        } else {
          res.json({ message: result });
        }
      });
    });

    // Serve static files AFTER API routes
    const publicPath = path.join(__dirname, 'public');
    if (fs.existsSync(publicPath)) {
      router.use(express.static(publicPath));
      app.debug('Static files served from:', publicPath);
    }

    app.debug('Mosquitto management web routes registered');
  };

  plugin.stop = function() {
    app.debug('Stopping Zennora Mosquitto Manager plugin');
    
    // Clear timers
    if (statusTimer) {
      clearInterval(statusTimer);
      statusTimer = null;
    }
    
    // Unsubscribe from all subscriptions
    unsubscribes.forEach(f => f());
    unsubscribes = [];
    
    app.debug('Mosquitto manager stopped');
  };

  return plugin;
};