'use strict'
const process = require('process');
const { logs } = require('@opentelemetry/api-logs');
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { LoggerProvider, SimpleLogRecordProcessor, BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');


if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  throw new Error('OTEL_EXPORTER_OTLP_ENDPOINT is not set');
}


const resource = resourceFromAttributes({
  [ATTR_SERVICE_VERSION]: process.env.OTEL_SERVICE_VERSION,
  [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'yield-server',
})

const logExporter = new OTLPLogExporter({
  url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/logs`,
  headers: {
    'Content-Type': 'application/json',
  }
});

const logProcessors = [
  new BatchLogRecordProcessor(logExporter),
  new SimpleLogRecordProcessor(logExporter),
]

const sdk = new NodeSDK({
  resource,
  autoDetectResources: true,
  traceExporter: new OTLPTraceExporter({
    url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
  }),
  logRecordProcessors: logProcessors,
  instrumentations: [getNodeAutoInstrumentations()],
});


const loggerProvider = new LoggerProvider({
  resource,
  processors: logProcessors,
})

// Set the global logger provider
logs.setGlobalLoggerProvider(loggerProvider)

sdk.start();

const logger = loggerProvider.getLogger()

process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => console.log('Tracing terminated'))
    .catch((error) => console.log('Error terminating tracing', error))
    .finally(() => process.exit(0))
});