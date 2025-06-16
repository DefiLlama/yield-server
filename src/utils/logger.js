'use strict'
const winston = require('winston');
const { OpenTelemetryTransportV3 } = require('@opentelemetry/winston-transport');

const isDev = process.env.NODE_ENV === 'development'

module.exports = winston.createLogger({
    level: isDev ? 'debug' : 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({
            stack: true
        }),
        winston.format.metadata(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new OpenTelemetryTransportV3(),
    ],
})
