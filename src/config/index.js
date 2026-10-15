


require('dotenv').config();

const bool = (value, fallback = false) =>
  value === undefined || value === '' ? fallback : ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());

const num = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const baseTopic = (process.env.MQTT_TOPIC || 'mvuviGo').replace(/\/+$/, '');

const config = {
  port: num(process.env.PORT, 3000),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  mqtt: {
    brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com',
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    baseTopic,
    topics: {
      rfid: baseTopic,                  // check-in / check-out / scan events (existing topic)
      location: `${baseTopic}/location`, // GPS positions
      sos: `${baseTopic}/sos`,           // SOS alerts
      status: `${baseTopic}/status`      // station heartbeat
    }
  },
  station: {
    deviceId: process.env.STATION_DEVICE_ID || 'esp32-rfid-1',
    offlineAfterSeconds: num(process.env.STATION_OFFLINE_AFTER_SECONDS, 90)
  },
  db: {
    url: process.env.DATABASE_URL || '',
    ssl: bool(process.env.DB_SSL, false)
  },
  auth: {
    enabled: bool(process.env.AUTH_ENABLED, false),
    secret: process.env.JWT_SECRET_KEY || '',
    algorithm: process.env.JWT_ALGORITHM || 'HS256'
  },
  sos: { dedupeSeconds: num(process.env.SOS_DEDUPE_SECONDS, 60) },
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL || '',
  defaultOperatorId: process.env.DEFAULT_OPERATOR_ID || ''
};

module.exports = { config };
