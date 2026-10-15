












const mqtt = require('mqtt');
const { config } = require('../config');
const router = require('./router');

const state = { connected: false, broker: '', subscription: '', lastMessageAt: null };

function brokerHost() {
  try {
    return new URL(config.mqtt.brokerUrl).host;
  } catch (err) {
    return config.mqtt.brokerUrl;
  }
}

function getState() {
  return { ...state };
}

function createMqttClient() {
  state.broker = brokerHost();

  const client = mqtt.connect(config.mqtt.brokerUrl, {
    username: config.mqtt.username,
    password: config.mqtt.password,
    clientId: `mvuvi-iot-server-${Math.random().toString(16).slice(2, 8)}`,
    reconnectPeriod: 5000, // reconnects automatically
    clean: true
  });

  const filter = `${config.mqtt.baseTopic}/#`;

  client.on('connect', () => {
    state.connected = true;
    console.log(`[MQTT] Connected to ${state.broker}`);
    client.subscribe(filter, { qos: 1 }, (err, granted) => {
      if (err || !granted || granted.some((g) => g.qos === 128)) {
        console.error(`[MQTT] Subscription to ${filter} was refused. Check the credential's permissions.`);
        return;
      }
      state.subscription = filter;
      console.log(`[MQTT] Subscribed to ${filter}`);
    });
  });

  client.on('reconnect', () => console.log('[MQTT] Reconnecting...'));
  client.on('close', () => {
    state.connected = false;
    console.warn('[MQTT] Connection closed.');
  });
  client.on('error', (err) => console.error('[MQTT] Error:', err.message));

  client.on('message', (topic, payload) => {
    state.lastMessageAt = new Date().toISOString();
    router.route(topic, payload).catch((err) => console.error('[MQTT] Handler error:', err.message));
  });

  return client;
}

module.exports = { createMqttClient, getState };
