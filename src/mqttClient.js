const mqtt = require('mqtt');
const { config } = require('./config');

function createMqttClient(store, io) {
  const client = mqtt.connect(config.mqttBrokerUrl, {
    username: config.mqttUsername,
    password: config.mqttPassword,
    clientId: `node-server-${Math.random().toString(16).slice(2, 8)}`,
    reconnectPeriod: 5000,
    clean: true
  });

  client.on('connect', () => {
    console.log(`[MQTT] Connected to ${config.mqttBrokerUrl}`);
    client.subscribe(config.mqttTopic, (error) => {
      if (error) {
        console.error('[MQTT] Subscription error:', error.message);
      } else {
        console.log(`[MQTT] Subscribed to ${config.mqttTopic}`);
      }
    });
  });

  client.on('reconnect', () => console.log('[MQTT] Reconnecting...'));
  client.on('close', () => console.warn('[MQTT] Connection closed.'));
  client.on('offline', () => console.warn('[MQTT] Client offline.'));

  client.on('error', (error) => {
    console.error('[MQTT] Error:', error.message);
  });

  client.on('message', (topic, payload) => {
    console.log(`[MQTT] Message on ${topic}: ${payload.toString()}`);

    if (topic !== config.mqttTopic) {
      return;
    }

    const normalizedMessage = store.parseIncomingPayload(payload);
    if (!normalizedMessage) {
      console.warn(`[MQTT] Ignoring malformed payload: ${payload.toString()}`);
      return;
    }

    const event = store.recordEvent(normalizedMessage);
    if (!event) {
      return;
    }

    console.log(`[MQTT] Recorded ${event.event} for ${event.uid} at ${event.timestamp}`);

    io.emit('activeCard', store.getActiveCard());
    io.emit('cards', store.getCardsWithStatus());
    io.emit('events', store.getRecentEvents(20));
  });

  return client;
}

module.exports = { createMqttClient };
