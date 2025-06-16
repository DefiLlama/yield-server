'use strict'
const process = require('process');
const logsAPI = require('@opentelemetry/api-logs');
const winston = require('winston');
const { LoggerProvider, SimpleLogRecordProcessor } = require('@opentelemetry/sdk-logs');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
const { OpenTelemetryTransportV3 } = require('@opentelemetry/winston-transport');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');

if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    throw new Error('OTEL_EXPORTER_OTLP_ENDPOINT is not set');
}

// Initialize the Logger provider
const loggerProvider = new LoggerProvider({
    resource: resourceFromAttributes({
        [ATTR_SERVICE_VERSION]: process.env.OTEL_SERVICE_VERSION,
        [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'yield-server',
    }),
    processors: [
        new SimpleLogRecordProcessor(new OTLPLogExporter({
            url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/logs`,
            headers: {
                'Content-Type': 'application/json',
            },
        })),
    ],
})

// Set the global logger provider
logsAPI.logs.setGlobalLoggerProvider(loggerProvider)

const isDev = process.env.NODE_ENV === 'development'

module.exports.logger = winston.createLogger({
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
