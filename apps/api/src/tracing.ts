import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { NodeSDK } from '@opentelemetry/sdk-node';

// Tracing is OFF unless OTEL_EXPORTER_OTLP_ENDPOINT names a collector. An SDK
// exporting to nowhere costs CPU and buffers spans for a backend that will
// never read them, so absence of config means absence of tracing — not a
// default endpoint someone has to discover and turn off.
//
// The instrumentation list is explicit rather than auto-instrumentations-node:
// that meta-package pulls in every exporter (gRPC, protobuf, Prometheus) and
// with it ~150 packages this API does not use. These three cover the hops that
// exist here — inbound/outbound HTTP, Express routing, Redis.
export function startTracing(): boolean {
  const url = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!url) return false;

  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME || 'afristage-api',
    traceExporter: new OTLPTraceExporter({ url: `${url.replace(/\/$/, '')}/v1/traces` }),
    instrumentations: [
      // The health probe fires every few seconds and would otherwise be most of
      // the trace volume — and the bill — while telling nobody anything.
      new HttpInstrumentation({ ignoreIncomingRequestHook: (req) => req.url?.startsWith('/api/health') ?? false }),
      new ExpressInstrumentation(),
      new IORedisInstrumentation()
    ]
  });
  sdk.start();
  // Without this the last few seconds of spans are lost on every deploy —
  // exactly the window a bad release shows up in.
  process.once('SIGTERM', () => void sdk.shutdown());
  return true;
}

// Started on import, not from bootstrap(): the instrumentations patch `http`,
// `express` and `ioredis` by wrapping their exports, which only works if this
// runs before those modules are first required. main.ts imports this first.
startTracing();
