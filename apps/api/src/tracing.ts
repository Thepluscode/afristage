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
// Longer than a healthy flush, shorter than any platform's SIGKILL grace period
// (Railway and Docker both allow ~10s), so a wedged exporter still lets the
// process exit on its own terms.
const SHUTDOWN_FLUSH_MS = 3000;

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
  // Flush the last few seconds of spans on shutdown — exactly the window a bad
  // release shows up in.
  //
  // The explicit exit is load-bearing. Registering ANY SIGTERM listener
  // overrides Node's default "terminate on SIGTERM", so this handler now owns
  // the exit: without it the process ignores SIGTERM completely and the
  // platform has to SIGKILL it after its grace period, stalling every deploy
  // and cutting in-flight requests. Verified by reproduction, not assumed.
  //
  // This is safe only because nothing else in this API listens for SIGTERM and
  // enableShutdownHooks() is not used. If either changes, this must become a
  // coordinated shutdown instead of an exit.
  process.once('SIGTERM', () => {
    const exit = () => process.exit(0);
    // An unreachable collector must not hold the process open either.
    setTimeout(exit, SHUTDOWN_FLUSH_MS).unref();
    void sdk.shutdown().finally(exit);
  });
  return true;
}

// Started on import, not from bootstrap(): the instrumentations patch `http`,
// `express` and `ioredis` by wrapping their exports, which only works if this
// runs before those modules are first required. main.ts imports this first.
startTracing();
